"""Versioned owner-scoped FastAPI contract; interactive contract at /docs."""
import hashlib
import io
import json
import zipfile
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import DuplicateKeyError, PyMongoError

from .auth import owner
from .config import allowed_origins
from .domain import (
    CreateProject, ExportInput, Goal, Node, RUBRIC, RunInput, UpdateProject,
    assemble_paths, new_root, safe_filename,
)
from .store import database, indexes, now, public
import os


@asynccontextmanager
async def lifespan(app):
    indexes(database())
    yield


app = FastAPI(title="ManyWays Story API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins(),
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def bounded_body(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH"}:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1000000:
                return JSONResponse({"detail": "Request exceeds 1 MB."}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(PyMongoError)
async def database_error(request, exc):
    return JSONResponse({"detail": "Database temporarily unavailable. Retry shortly."}, status_code=503)


def project_for(db, project_id, user):
    project = db.projects.find_one({"_id": project_id, "owner_id": user})
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def run_for(db, run_id, user):
    run = db.runs.find_one({"_id": run_id, "owner_id": user})
    if run is None:
        raise HTTPException(404, "Run not found.")
    return run


def run_public(db, run, detail=True):
    item = public(run)
    if detail:
        item["evaluations"] = list(db.evaluations.find({"run_id": run["_id"]}, {"_id": 0, "run_id": 0}))
        if run["kind"] == "evaluation":
            cells = item["evaluations"]
            item["progress"] = {
                "total": len(run["snapshot"]["branches"]) * run["snapshot"]["persona_count"],
                "succeeded": sum(c["status"] == "completed" for c in cells),
                "failed": sum(c["status"] == "failed" for c in cells),
            }
    else:
        item.pop("snapshot", None)
        item.pop("generated_nodes", None)
        item.pop("rankings", None)
        item.pop("personas", None)
    return item


@app.get("/health")
def health():
    return {"status": "ok", "service": "manyways-api"}


@app.get("/v1/projects")
def projects(user=Depends(owner), db=Depends(database)):
    return [public(p) for p in db.projects.find({"owner_id": user}).sort("updated_at", -1).limit(200)]


@app.post("/v1/projects", status_code=201)
def create_project(data: CreateProject, user=Depends(owner), db=Depends(database)):
    if db.projects.count_documents({"owner_id": user}, limit=200) >= 200:
        raise HTTPException(409, "Project limit reached. Export and remove an older project.")
    document = {"_id": uuid4().hex, "owner_id": user, "title": data.title,
                "version": 1, "nodes": [new_root()], "goal": Goal().model_dump(),
                "created_at": now(), "updated_at": now()}
    db.projects.insert_one(document)
    return public(document)


@app.get("/v1/projects/{project_id}")
def get_project(project_id: str, user=Depends(owner), db=Depends(database)):
    return public(project_for(db, project_id, user))


@app.put("/v1/projects/{project_id}")
def update_project(project_id: str, data: UpdateProject, user=Depends(owner), db=Depends(database)):
    project_for(db, project_id, user)
    values = data.model_dump(exclude={"version"})
    result = db.projects.update_one(
        {"_id": project_id, "owner_id": user, "version": data.version},
        {"$set": {**values, "updated_at": now()}, "$inc": {"version": 1}},
    )
    if result.matched_count != 1:
        raise HTTPException(409, "A newer version exists. Reload the saved project before applying your changes.")
    return public(project_for(db, project_id, user))


@app.delete("/v1/projects/{project_id}", status_code=204)
def delete_project(project_id: str, user=Depends(owner), db=Depends(database)):
    project_for(db, project_id, user)
    if db.runs.find_one({"project_id": project_id, "owner_id": user, "active_key": {"$exists": True}}):
        raise HTTPException(409, "Cancel the active job and wait for it to stop before deleting this project.")
    # Remove project first so no new run can be started through a later request.
    db.projects.delete_one({"_id": project_id, "owner_id": user})
    ids = [r["_id"] for r in db.runs.find({"project_id": project_id, "owner_id": user}, {"_id": 1})]
    db.evaluations.delete_many({"run_id": {"$in": ids}})
    db.runs.delete_many({"project_id": project_id, "owner_id": user})
    return Response(status_code=204)


@app.post("/v1/projects/{project_id}/runs", status_code=202)
def start_run(project_id: str, data: RunInput, user=Depends(owner), db=Depends(database)):
    project = project_for(db, project_id, user)
    try:
        goal = Goal(**project["goal"])
        goal.ready()
        complete = assemble_paths([Node(**n) for n in project["nodes"]], True)
        selected = [p for p in complete if p["id"] in data.branch_ids]
        if data.kind == "evaluation":
            if len(selected) != len(data.branch_ids) or any(not p["text"].strip() for p in selected):
                raise ValueError("Only nonempty, explicitly ended branches can be evaluated.")
            if sum(len(p["text"]) for p in selected) > 100000:
                raise ValueError("Selected assembled stories exceed 100,000 characters. Evaluate fewer paths.")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    request_key = hashlib.sha256(f"{user}:{project_id}:{data.request_id}".encode()).hexdigest()
    previous = db.runs.find_one({"request_key": request_key, "owner_id": user})
    if previous:
        return run_public(db, previous)
    # Same saved content/selection cannot be submitted twice while queued/running.
    active = db.runs.find_one({"active_key": project_id, "owner_id": user})
    if active:
        raise HTTPException(409, "This project already has an active job. Reopen or cancel that job.")
    if db.runs.count_documents({"owner_id": user, "active_key": {"$exists": True}}) >= 3:
        raise HTTPException(429, "You already have three active jobs.")
    document = {
        "_id": uuid4().hex, "project_id": project_id, "owner_id": user, "kind": data.kind,
        "request_key": request_key, "active_key": project_id, "status": "queued",
        "created_at": now(), "updated_at": now(), "cancel_requested": False, "worker_attempts": 0,
        "error": "", "personas": [], "rankings": None, "generated_nodes": [],
        "progress": {"total": len(selected) * data.persona_count if data.kind == "evaluation" else 1,
                     "succeeded": 0, "failed": 0},
        "snapshot": {
            "project_version": project["version"], "title": project["title"],
            "nodes": project["nodes"], "goal": goal.model_dump(), "branches": selected,
            "persona_count": data.persona_count, "rubric": RUBRIC,
            "source_name": data.source_name, "source_text": data.source_text,
            "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
        },
    }
    try:
        db.runs.insert_one(document)
        # Deletion may have passed its active-job check before this insertion.
        if not db.projects.find_one({"_id": project_id, "owner_id": user}, {"_id": 1}):
            db.runs.delete_one({"_id": document["_id"], "owner_id": user})
            db.evaluations.delete_many({"run_id": document["_id"]})
            raise HTTPException(404, "Project not found.")
    except DuplicateKeyError:
        prior = db.runs.find_one({"request_key": request_key, "owner_id": user})
        if prior:
            return run_public(db, prior)
        raise HTTPException(409, "An active job already exists.") from None
    return run_public(db, document)


@app.get("/v1/projects/{project_id}/runs")
def list_runs(project_id: str, user=Depends(owner), db=Depends(database)):
    project_for(db, project_id, user)
    return [run_public(db, r, False) for r in db.runs.find(
        {"project_id": project_id, "owner_id": user}).sort("created_at", -1).limit(100)]


@app.get("/v1/runs/{run_id}")
def get_run(run_id: str, user=Depends(owner), db=Depends(database)):
    return run_public(db, run_for(db, run_id, user))


@app.post("/v1/runs/{run_id}/cancel")
def cancel_run(run_id: str, user=Depends(owner), db=Depends(database)):
    run = run_for(db, run_id, user)
    if run["status"] == "queued":
        db.runs.update_one({"_id": run_id, "owner_id": user, "status": "queued"},
                           {"$set": {"status": "cancelled", "cancel_requested": True},
                            "$unset": {"active_key": ""}})
    # If the worker claimed it concurrently, request cooperative cancellation instead.
    db.runs.update_one({"_id": run_id, "owner_id": user, "status": "running"},
                       {"$set": {"cancel_requested": True}})
    return run_public(db, run_for(db, run_id, user))


@app.post("/v1/projects/{project_id}/export")
def export(project_id: str, data: ExportInput, user=Depends(owner), db=Depends(database)):
    project = project_for(db, project_id, user)
    filename = safe_filename(project["title"])
    if data.format == "json":
        content = json.dumps(public(project), default=str, ensure_ascii=False, indent=2).encode()
        return Response(content, media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'})
    paths = assemble_paths([Node(**n) for n in project["nodes"]], True)
    selected = paths if data.branch_ids is None else [p for p in paths if p["id"] in data.branch_ids]
    if (not selected or (data.branch_ids is not None and (
            len(selected) != len(data.branch_ids) or len(set(data.branch_ids)) != len(data.branch_ids)))):
        raise HTTPException(422, "Choose one or more distinct complete branches.")

    def readable(path):
        return f'{project["title"]}\n{path["title"]}\n{"=" * 40}\n\n{path["text"]}\n'

    if len(selected) == 1:
        return Response(readable(selected[0]).encode("utf-8"), media_type="text/plain; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{filename}.txt"'})
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, path in enumerate(selected, 1):
            archive.writestr(f'{index:02d}-{safe_filename(path["title"])}.txt', readable(path))
    return Response(output.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{filename}.zip"'})
