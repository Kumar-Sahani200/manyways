import io
import zipfile

import mongomock
import pytest
from fastapi.testclient import TestClient

from services.story.api import app
from services.story.auth import owner
from services.story.store import database, indexes


@pytest.fixture
def api():
    db = mongomock.MongoClient(tz_aware=True).manyways
    indexes(db)
    who = {"id": "owner-a"}
    app.dependency_overrides[database] = lambda: db
    app.dependency_overrides[owner] = lambda: who["id"]
    client = TestClient(app)
    yield client, db, who
    app.dependency_overrides.clear()


def create_ready(client):
    p = client.post("/v1/projects", json={"title": "A story"}).json()
    p["nodes"] = [
        {"id": "root", "parent_id": None, "title": "Root", "text": "Shared opening.", "is_end": False},
        *[{"id": x, "parent_id": "root", "title": "../Same title", "text": f"Ending {x}.", "is_end": True} for x in ["a", "b"]],
    ]
    p["goal"].update(outcome="Resonate", audience="Fiction readers", tone="Hopeful", constraints="None")
    update = {k: p[k] for k in ["title", "version", "nodes", "goal"]}
    return client.put(f'/v1/projects/{p["id"]}', json=update).json()


def test_concurrent_deletion_cannot_leave_orphan_job(api, monkeypatch):
    client, db, who = api
    p = create_ready(client)
    insert = db.runs.insert_one

    def racing_insert(document):
        db.projects.delete_one({"_id": p["id"]})
        return insert(document)

    monkeypatch.setattr(db.runs, "insert_one", racing_insert)
    response = client.post(f'/v1/projects/{p["id"]}/runs', json={
        "kind": "evaluation", "request_id": "raced", "branch_ids": ["a"],
    })
    assert response.status_code == 404
    assert db.runs.count_documents({}) == 0


def test_owner_isolation_all_routes(api):
    client, db, who = api
    p = create_ready(client)
    run = client.post(f'/v1/projects/{p["id"]}/runs', json={
        "kind": "evaluation", "request_id": "first", "branch_ids": ["a"]}).json()
    who["id"] = "owner-b"
    assert client.get("/v1/projects").json() == []
    for method, path, body in [
        ("GET", f'/v1/projects/{p["id"]}', None),
        ("DELETE", f'/v1/projects/{p["id"]}', None),
        ("GET", f'/v1/projects/{p["id"]}/runs', None),
        ("GET", f'/v1/runs/{run["id"]}', None),
        ("POST", f'/v1/runs/{run["id"]}/cancel', {}),
        ("POST", f'/v1/projects/{p["id"]}/export', {"branch_ids": ["a"]}),
        ("POST", f'/v1/projects/{p["id"]}/runs', {"kind": "evaluation", "request_id": "stolen", "branch_ids": ["a"]}),
        ("PUT", f'/v1/projects/{p["id"]}', {k: p[k] for k in ["title", "version", "nodes", "goal"]}),
    ]:
        assert client.request(method, path, json=body).status_code == 404


def test_conflicts_snapshots_duplicates_cancel(api):
    client, db, _ = api
    p = create_ready(client)
    body = {"kind": "evaluation", "request_id": "first", "branch_ids": ["a"]}
    run = client.post(f'/v1/projects/{p["id"]}/runs', json=body).json()
    assert client.post(f'/v1/projects/{p["id"]}/runs', json=body).json()["id"] == run["id"]
    assert client.post(f'/v1/projects/{p["id"]}/runs', json={**body, "request_id": "second"}).status_code == 409
    update = {k: p[k] for k in ["title", "version", "nodes", "goal"]}
    update["nodes"][0]["text"] = "Changed manually."
    assert client.put(f'/v1/projects/{p["id"]}', json=update).status_code == 200
    assert client.put(f'/v1/projects/{p["id"]}', json=update).status_code == 409
    snapshot = client.get(f'/v1/runs/{run["id"]}').json()["snapshot"]
    assert snapshot["branches"][0]["text"].startswith("Shared opening.")
    assert client.delete(f'/v1/projects/{p["id"]}').status_code == 409
    assert client.post(f'/v1/runs/{run["id"]}/cancel').json()["status"] == "cancelled"
    assert client.delete(f'/v1/projects/{p["id"]}').status_code == 204


def test_exports_preserve_selection_and_safe_names(api):
    client, _, _ = api
    p = create_ready(client)
    url = f'/v1/projects/{p["id"]}/export'
    one = client.post(url, json={"branch_ids": ["b"]})
    assert one.status_code == 200 and "Shared opening." in one.text and "Ending b." in one.text
    assert "Ending a." not in one.text
    many = client.post(url, json={"branch_ids": ["a", "b"]})
    archive = zipfile.ZipFile(io.BytesIO(many.content))
    assert len(archive.namelist()) == 2 and all("/" not in n for n in archive.namelist())
    for entry in archive.namelist():
        assert "Shared opening." in archive.read(entry).decode()
    assert client.post(url, json={"branch_ids": []}).status_code == 422
    assert client.post(url, json={"branch_ids": ["missing"]}).status_code == 422
    assert client.post(url, json={"branch_ids": ["a", "a"]}).status_code == 422
    assert client.post(url, json={"format": "json"}).json()["id"] == p["id"]
    assert client.post(url, json={}).headers["content-type"] == "application/zip"


def test_auth_is_not_optional_and_body_limit(api):
    client, _, _ = api
    del app.dependency_overrides[owner]
    assert client.get("/v1/projects").status_code == 401
    assert client.post("/v1/projects", content="x" * 1000001).status_code == 413
