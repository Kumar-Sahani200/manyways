"""Deterministic contract tests. Mongo/provider doubles exist only in tests."""
import io
import json
import zipfile
from datetime import timedelta
from types import SimpleNamespace

import jwt
import mongomock
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from services.api import auth as auth_module
from services.api import main, provider
from services.api.db import database, indexes, now
from services.api.models import Goal, Node, ProjectEdit, validate_tree
from services.api.worker import claim, execute


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    db = mongomock.MongoClient(tz_aware=True).manyways
    indexes(db)
    main.app.dependency_overrides[database] = lambda: db
    main.app.dependency_overrides[main.owner] = lambda: "writer-a"
    monkeypatch.setattr(main, "check_config", lambda: None)
    with TestClient(main.app) as client:
        yield client, db
    main.app.dependency_overrides.clear()


def story(project):
    root = project["nodes"][0]["id"]
    return [
        {"id": root, "parentId": None, "title": "Opening", "text": "A door opens.", "kind": "section"},
        {"id": "left", "parentId": root, "title": "Enter", "text": "She steps inside.", "kind": "section"},
        {"id": "right", "parentId": root, "title": "Leave", "text": "She walks away.", "kind": "section"},
        {"id": "end-left", "parentId": "left", "title": "Inside", "text": "", "kind": "end"},
        {"id": "end-right", "parentId": "right", "title": "Outside", "text": "", "kind": "end"},
    ]


def saved(client):
    project = client.post("/v1/projects", json={"title": "Two futures"}).json()
    response = client.put(f"/v1/projects/{project['id']}", json={
        "title": project["title"], "version": 1, "nodes": story(project),
        "goal": {"description": "Leave a reader feeling curious", "audience": "Mystery readers"},
    })
    assert response.status_code == 200, response.text
    return response.json()


def start(client, project):
    result = client.post(f"/v1/projects/{project['id']}/runs", json={
        "kind": "evaluate", "expectedVersion": project["version"], "personaCount": 10,
        "branchIds": ["end-left", "end-right"],
    })
    assert result.status_code == 202, result.text
    return result.json()


def test_tree_paths_and_invalid_structures():
    nodes = story({"nodes": [{"id": "root"}]})
    paths = validate_tree([Node(**n) for n in nodes])
    assert paths[0]["text"] == "A door opens.\n\nShe steps inside."
    assert paths[1]["text"] == "A door opens.\n\nShe walks away."
    for mutate in ["cycle", "missing-parent", "duplicate", "end-parent", "empty"]:
        bad = json.loads(json.dumps(nodes))
        if mutate == "cycle":
            bad[1]["parentId"] = "right"
            bad[2]["parentId"] = "left"
        elif mutate == "missing-parent":
            bad[1]["parentId"] = "absent"
        elif mutate == "duplicate":
            bad[1]["id"] = "root"
        elif mutate == "end-parent":
            bad[1]["parentId"] = "end-right"
        else:
            bad[0]["text"] = ""
        with pytest.raises(ValueError):
            validate_tree([Node(**n) for n in bad])
    with pytest.raises(ValidationError):
        Goal(ageMin=50, ageMax=20)


def test_crud_conflict_owner_isolation_and_exports(setup):
    client, db = setup
    project = saved(client)
    path = f"/v1/projects/{project['id']}"
    assert client.put(path, json={k: project[k] for k in ["title", "nodes", "goal"]} | {"version": 1}).status_code == 409
    single = client.post(path + "/export", json={"branchIds": ["end-left"]})
    assert single.text == "A door opens.\n\nShe steps inside."
    zipped = client.post(path + "/export", json={"branchIds": ["end-left", "end-right"]})
    with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
        assert len(archive.namelist()) == 2
        assert "She walks away." in archive.read(archive.namelist()[1]).decode()
    assert client.post(path + "/export", json={"branchIds": ["left"]}).status_code == 422
    main.app.dependency_overrides[main.owner] = lambda: "writer-b"
    assert client.get(path).status_code == 404
    assert client.get("/v1/projects").json() == []
    assert client.delete(path).status_code == 404
    assert client.post(path + "/export", json={"branchIds": ["end-left"]}).status_code == 404
    main.app.dependency_overrides[main.owner] = lambda: "writer-a"
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404


def fake_call(role, action, inputs, schema):
    if action == "generate_personas":
        output = {"personas": [{
            "id": f"reader-{i}", "name": f"Reader {i}", "readingStyle": f"Distinct reading style {i}",
            "motivation": "Find a good mystery", "skepticism": "Question convenience",
            "attention": "Read carefully", "preferences": ["Mystery"],
        } for i in range(inputs["count"])]}
    elif action == "evaluate_story":
        output = {
            "personaId": inputs["persona"]["id"], "branchId": inputs["branch"]["id"],
            "reaction": "The opening makes me curious.", "emotionalTrajectory": ["Curious", "Concerned"],
            "dropOffPoints": [], "comprehension": 8, "credibility": 7, "memorability": 8, "goalFit": 9,
            "evidence": [{"quote": "A door opens.", "interpretation": "An invitation into uncertainty."}],
            "objections": ["I need more stakes."], "revisions": ["Show what she might lose."],
        }
    elif action == "rank_stories":
        output = {
            "rankings": [{
                "branchId": p["id"], "rank": i + 1, "score": 9 - i,
                "rationale": "Curiosity matters most to this stated goal.", "strengths": ["Intrigue"],
                "risks": ["Missing stakes"], "suggestedEdits": ["Add a consequence"],
            } for i, p in enumerate(inputs["branches"])],
            "disagreement": "Readers disagree on ambiguity.", "uncertainty": "This is simulated, not an audience survey.",
        }
    elif action == "branch_story":
        output = {"nodes": story({"nodes": [{"id": "generated-root"}]})}
    else:
        raise AssertionError(action)
    return schema.model_validate(output).model_dump()


def test_full_matrix_snapshots_ranking_and_duplicate_protection(setup):
    client, db = setup
    project = saved(client)
    run = start(client, project)
    assert client.post(f"/v1/projects/{project['id']}/runs", json={
        "kind": "evaluate", "expectedVersion": 2, "branchIds": ["end-left", "end-right"],
    }).status_code == 409
    claimed = claim(db, "worker-a")
    assert claim(db, "worker-b") is None
    execute(db, claimed, "worker-a", fake_call)
    result = client.get(f"/v1/runs/{run['id']}").json()
    assert result["status"] == "completed"
    assert result["progress"] == result["total"] == 20
    assert len(result["personas"]) == 10
    assert len({(e["personaId"], e["branchId"]) for e in result["evaluations"]}) == 20
    assert len(result["ranking"]["rankings"]) == 2
    assert result["snapshot"]["goal"]["description"] == project["goal"]["description"]
    main.app.dependency_overrides[main.owner] = lambda: "writer-b"
    assert client.get(f"/v1/runs/{run['id']}").status_code == 404
    assert client.post(f"/v1/runs/{run['id']}/cancel").status_code == 404


def test_partial_failures_no_final_ranking(setup):
    client, db = setup
    run = start(client, saved(client))
    def failing(role, action, inputs, schema):
        if action == "evaluate_story" and inputs["persona"]["id"] == "reader-0":
            raise provider.ProviderError("Simulated test failure.")
        assert action != "rank_stories"
        return fake_call(role, action, inputs, schema)
    execute(db, claim(db, "worker"), "worker", failing)
    result = client.get(f"/v1/runs/{run['id']}").json()
    assert result["status"] == "partial"
    assert result["progress"] == 18 and result["ranking"] is None
    assert len(result["failures"]) == 2


def test_cancel_and_expired_lease_recovery(setup):
    client, db = setup
    run = start(client, saved(client))
    first = claim(db, "first")
    db.runs.update_one({"id": run["id"]}, {"$set": {"leaseUntil": now() - timedelta(seconds=5)}})
    second = claim(db, "second")
    assert second["attempts"] == 2
    execute(db, first, "first", fake_call)
    assert db.runs.find_one({"id": run["id"]})["workerId"] == "second"
    assert client.post(f"/v1/runs/{run['id']}/cancel").json()["status"] == "cancelled"
    execute(db, second, "second", fake_call)
    assert client.get(f"/v1/runs/{run['id']}").json()["status"] == "cancelled"


def test_generate_apply_preserves_concurrent_edits(setup):
    client, db = setup
    project = saved(client)
    run = client.post(f"/v1/projects/{project['id']}/runs", json={
        "kind": "generate", "expectedVersion": 2, "sourceText": "A long enough source story about a mysterious door.",
    }).json()
    execute(db, claim(db, "worker"), "worker", fake_call)
    assert client.post(f"/v1/runs/{run['id']}/apply").json()["version"] == 3
    assert client.post(f"/v1/runs/{run['id']}/apply").status_code == 409
    assert client.get(f"/v1/projects/{project['id']}").json()["nodes"][0]["id"] == "generated-root"


def test_invalid_run_requests(setup):
    client, db = setup
    project = saved(client)
    endpoint = f"/v1/projects/{project['id']}/runs"
    for body in [
        {"kind": "evaluate", "expectedVersion": 1, "branchIds": ["end-left", "end-right"]},
        {"kind": "evaluate", "expectedVersion": 2, "branchIds": ["left", "right"]},
        {"kind": "evaluate", "expectedVersion": 2, "branchIds": ["end-left", "end-left"]},
        {"kind": "generate", "expectedVersion": 2, "sourceText": "\x00" * 30},
    ]:
        assert client.post(endpoint, json=body).status_code in {409, 422}


def test_auth_signature_issuer_party_and_expiry(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("CLERK_ISSUER_URL", "https://clerk.example")
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "https://app.manyways.si")
    monkeypatch.setattr(auth_module, "key_client", lambda issuer: SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=private.public_key())))
    base = {"sub": "writer", "iss": "https://clerk.example",
            "azp": "https://app.manyways.si", "iat": now(), "exp": now() + timedelta(minutes=5)}
    def token(claims):
        return "Bearer " + jwt.encode(claims, private, algorithm="RS256")
    assert auth_module.owner(token(base)) == "writer"
    for changes in [{"iss": "https://evil.example"}, {"azp": "https://evil.example"},
                    {"exp": now() - timedelta(minutes=1)}, {"sub": ""}]:
        with pytest.raises(HTTPException) as error:
            auth_module.owner(token(base | changes))
        assert error.value.status_code == 401
    with pytest.raises(HTTPException):
        auth_module.owner(None)
    monkeypatch.setenv("CLERK_JWT_AUDIENCE", "manyways")
    with pytest.raises(HTTPException):
        auth_module.owner(token(base))
    assert auth_module.owner(token(base | {"aud": "manyways"})) == "writer"


def test_provider_schema_failure_not_silently_replaced(monkeypatch):
    monkeypatch.setattr(provider, "check_config", lambda: None)
    for key in ["AGENTICORG_API_KEY", "AGENTICORG_BASE_URL", "AGENTICORG_COMPANY_ID",
                "AGENTICORG_BRANCH_AGENT_ID"]:
        monkeypatch.setenv(key, "test-only")
    class Client:
        def __init__(self, **kwargs):
            self.agents = SimpleNamespace(run=lambda *a, **kw: SimpleNamespace(status="completed", output={"invalid": True}))
        def __enter__(self): return self
        def __exit__(self, *args): pass
    monkeypatch.setattr(provider, "AgenticOrg", Client)
    from services.api.models import GeneratedTree
    with pytest.raises(provider.ProviderError, match="invalid structured output"):
        provider.structured("branch", "branch_story", {}, GeneratedTree)


def test_invented_evidence_rejected(setup):
    client, db = setup
    run = start(client, saved(client))
    def invented(role, action, inputs, schema):
        result = fake_call(role, action, inputs, schema)
        if action == "evaluate_story":
            result["evidence"][0]["quote"] = "A quotation absent from this story."
        return result
    execute(db, claim(db, "worker"), "worker", invented)
    result = client.get(f"/v1/runs/{run['id']}").json()
    assert result["status"] == "partial" and result["progress"] == 0
    assert result["ranking"] is None


def test_discovery_configuration_does_not_require_agent_ids(monkeypatch):
    monkeypatch.setenv("AGENTICORG_API_KEY", "test-only")
    monkeypatch.setenv("AGENTICORG_BASE_URL", "https://provider.example")
    for key in ["AGENTICORG_COMPANY_ID", *provider.AGENT_SETTINGS.values()]:
        monkeypatch.delenv(key, raising=False)
    provider.check_config(for_execution=False)
    with pytest.raises(provider.ProviderError, match="AGENTICORG_COMPANY_ID"):
        provider.check_config()
