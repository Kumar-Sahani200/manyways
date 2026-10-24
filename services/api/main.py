"""Owner-scoped HTTP API. Run with: python -m uvicorn services.api.main:app."""
import io
import os
import re
import zipfile
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from .auth import owner
from .db import database, indexes, now, public
from .models import (
    ExportRequest, Goal, Node, ProjectCreate, ProjectEdit, RunCreate,
    new_id, validate_tree,
)
from .provider import ProviderError, check_config


@asynccontextmanager
async def lifespan(app):
    if os.getenv("MONGODB_URI"):
        indexes(database())
    yield


app = FastAPI(title="ManyWays Story API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x for x in os.getenv("API_ALLOWED_ORIGINS", "").split(",") if x],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(PyMongoError)
async def mongo_error(request, exc):
    # Driver errors can contain connection details. Never echo them.
    return JSONResponse(status_code=503, content={"detail": "Database unavailable. Please retry shortly."})


@app.get("/health")
def health():
    return {"status": "ok", "service": "manyways-api"}


@app.get("/v1/ready")
def ready(user=Depends(owner)):
    database().command("ping")
    try:
        check_config()
    except ProviderError as exc:
        raise HTTPException(503, str(exc)) from None
    return {"status": "ready"}


def project_for(db, project_id, user):
    project = db.projects.find_one({"id": project_id, "owner": user})
    if not project:
        raise HTTPException(404, "Project not found.")
    return project


@app.get("/v1/projects")
def projects(user=Depends(owner), db=Depends(database)):
    return [public(p) for p in db.projects.find(
        {"owner": user}, {"id": 1, "title": 1, "version": 1, "createdAt": 1, "updatedAt": 1},
    ).sort("updatedAt", -1).limit(100)]


@app.post("/v1/projects", status_code=201)
def create_project(body: ProjectCreate, user=Depends(owner), db=Depends(database)):
    if db.projects.count_documents({"owner": user}, limit=100) >= 100:
        raise HTTPException(422, "Project limit reached (100). Delete an unused project first.")
    record = {
        "id": new_id(), "owner": user, "title": body.title, "version": 1,
        "nodes": [Node(id=new_id(), title="Opening").model_dump()],
        "goal": Goal().model_dump(), "createdAt": now(), "updatedAt": now(),
    }
    db.projects.insert_one(record)
    return public(record)


@app.get("/v1/projects/{project_id}")
def get_project(project_id: str, user=Depends(owner), db=Depends(database)):
    return public(project_for(db, project_id, user))


@app.put("/v1/projects/{project_id}")
def save_project(project_id: str, body: ProjectEdit, user=Depends(owner), db=Depends(database)):
    project_for(db, project_id, user)
    changes = body.model_dump(exclude={"version"})
    changes["updatedAt"] = now()
    updated = db.projects.find_one_and_update(
        {"id": project_id, "owner": user, "version": body.version},
        {"$set": changes, "$inc": {"version": 1}}, return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(409, "This project changed in another session. Reload before saving; your edits have not been overwritten.")
    return public(updated)


@app.delete("/v1/projects/{project_id}", status_code=204)
def delete_project(project_id: str, user=Depends(owner), db=Depends(database)):
    project_for(db, project_id, user)
    db.runs.update_many(
        {"projectId": project_id, "owner": user, "active": True},
        {"$set": {"status": "cancelled", "active": False, "updatedAt": now()}},
    )
    db.projects.delete_one({"id": project_id, "owner": user})
    db.runs.delete_many({"projectId": project_id, "owner": user})
    return Response(status_code=204)


@app.post("/v1/projects/{project_id}/export")
def export_project(project_id: str, body: ExportRequest, user=Depends(owner), db=Depends(database)):
    project = project_for(db, project_id, user)
    paths = {p["id"]: p for p in validate_tree([Node.model_validate(n) for n in project["nodes"]])}
    ids = list(dict.fromkeys(body.branchIds))
    if any(i not in paths for i in ids):
        raise HTTPException(422, "Select completed story paths with end nodes.")
    if len(ids) == 1:
        return Response(paths[ids[0]]["text"], media_type="text/plain; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="manyways-story.txt"'})
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, path_id in enumerate(ids):
            path = paths[path_id]
            safe = re.sub(r"[^a-zA-Z0-9_-]", "-", path["title"])[:60].strip("-") or "story"
            archive.writestr(f"{index + 1:02d}-{safe}.txt", path["text"])
    return Response(buffer.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="manyways-stories.zip"'})


@app.get("/v1/projects/{project_id}/runs")
def list_runs(project_id: str, user=Depends(owner), db=Depends(database)):
    project_for(db, project_id, user)
    return [public(r) for r in db.runs.find(
        {"projectId": project_id, "owner": user},
        {key: 1 for key in ["id", "kind", "status", "progress", "total", "stage", "error",
                            "projectVersion", "personaCount", "createdAt", "updatedAt"]},
    ).sort("createdAt", -1).limit(30)]


@app.post("/v1/projects/{project_id}/runs", status_code=202)
def start_run(project_id: str, body: RunCreate, user=Depends(owner), db=Depends(database)):
    project = project_for(db, project_id, user)
    if project["version"] != body.expectedVersion:
        raise HTTPException(409, "Save/reload the latest project before starting a run.")
    if not project["goal"]["description"].strip():
        raise HTTPException(422, "Save a goal before running agents.")
    paths = validate_tree([Node.model_validate(n) for n in project["nodes"]])
    if body.kind == "evaluate":
        ids = set(body.branchIds)
        if len(ids) < 2 or len(ids) != len(body.branchIds) or not ids.issubset({p["id"] for p in paths}):
            raise HTTPException(422, "Select 2–12 distinct complete paths.")
        paths = [p for p in paths if p["id"] in ids]
    elif (len(body.sourceText.strip()) < 20 or len(body.sourceText.encode("utf-8")) > 100 * 1024
          or any(ord(c) < 32 and c not in "\r\n\t" for c in body.sourceText)):
        raise HTTPException(422, "Upload plain UTF-8 text up to 100 KB with at least 20 characters, without binary control characters.")
    try:
        check_config()
    except ProviderError as exc:
        raise HTTPException(503, str(exc)) from None
    # Per-owner daily budget prevents an accidental click loop from launching unbounded paid work.
    from datetime import timedelta
    if db.runs.count_documents({"owner": user, "createdAt": {"$gte": now() - timedelta(days=1)}}, limit=20) >= 20:
        raise HTTPException(429, "Daily run limit reached (20). Try again tomorrow.")
    run = {
        "id": new_id(), "owner": user, "projectId": project_id,
        "kind": body.kind, "status": "queued", "active": True, "stage": "Waiting for worker",
        "projectVersion": project["version"],
        "snapshot": {"goal": project["goal"], "nodes": project["nodes"], "paths": paths},
        "sourceText": body.sourceText if body.kind == "generate" else "",
        "personaCount": body.personaCount, "personas": [], "evaluations": [], "failures": [],
        "ranking": None, "generatedNodes": [], "progress": 0,
        "total": body.personaCount * len(paths) if body.kind == "evaluate" else 1,
        "error": None, "attempts": 0, "createdAt": now(), "updatedAt": now(),
    }
    try:
        db.runs.insert_one(run)
    except DuplicateKeyError:
        raise HTTPException(409, "This project already has an active run.") from None
    return public(run)


def run_for(db, run_id, user):
    record = db.runs.find_one({"id": run_id, "owner": user})
    if not record:
        raise HTTPException(404, "Run not found.")
    return record


@app.get("/v1/runs/{run_id}")
def get_run(run_id: str, user=Depends(owner), db=Depends(database)):
    return public(run_for(db, run_id, user))


@app.post("/v1/runs/{run_id}/cancel")
def cancel_run(run_id: str, user=Depends(owner), db=Depends(database)):
    run_for(db, run_id, user)
    db.runs.update_one(
        {"id": run_id, "owner": user, "active": True},
        {"$set": {"status": "cancelled", "active": False, "stage": "Cancelled", "updatedAt": now()}},
    )
    return public(run_for(db, run_id, user))


@app.post("/v1/runs/{run_id}/apply")
def apply_generated(run_id: str, user=Depends(owner), db=Depends(database)):
    run = run_for(db, run_id, user)
    if run["kind"] != "generate" or run["status"] != "completed":
        raise HTTPException(422, "Only completed generation runs can be applied.")
    nodes = [Node.model_validate(n) for n in run["generatedNodes"]]
    validate_tree(nodes)
    updated = db.projects.find_one_and_update(
        {"id": run["projectId"], "owner": user, "version": run["projectVersion"]},
        {"$set": {"nodes": [n.model_dump() for n in nodes], "updatedAt": now()}, "$inc": {"version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(409, "The project has changed since generation. Your current work was preserved.")
    return public(updated)
