from datetime import timedelta

import mongomock
import pytest

from services.story.domain import Ensemble, Evaluation, GeneratedTree, Rankings
from services.story.pipeline import Context, Stopped
from services.story.provider import CreativeProvider, ProviderFailure
from services.story.store import indexes, now
from services.story.worker import claim, process


def persona(i):
    return {"id": f"p{i}", "name": f"Reader {i}", **{k: f"{k} {i}" for k in [
        "reading_style", "motivations", "genre_preferences", "attention_pattern",
        "skepticism", "accessibility_needs", "goal_connection"]}}


class FakeProvider:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def generate(self, schema, instruction, data, check):
        check()
        self.calls.append(schema.__name__)
        if schema is Ensemble:
            return Ensemble(personas=[persona(i) for i in range(10)])
        if schema is Evaluation:
            if self.fail and data["persona"]["id"] == "p3":
                raise ProviderFailure("Synthetic failure")
            return Evaluation(reaction="In character", emotional_trajectory=["Curious to relieved"],
                              attention_points=["Opening keeps attention"], comprehension=4,
                              credibility=4, memorability=3, goal_fit=4,
                              evidence=[{"quote": "Shared opening.", "explanation": "Specific opening"}],
                              objections=["Too brief"], revisions=["Add a detail"])
        if schema is Rankings:
            assert len(data["evaluations"]) == 10
            return Rankings(items=[{"branch_id": "a", "rank": 1, "rationale": "Fits goal",
                                    "strengths": ["Clear"], "risks": ["Short"], "suggested_edits": ["Expand"]}],
                            audience_disagreement="Some prefer detail", uncertainty="Synthetic judgments",
                            suggested_next_edits=["Try a longer ending"])
        raise AssertionError(schema)


def setup_run():
    db = mongomock.MongoClient(tz_aware=True).manyways
    indexes(db)
    db.runs.insert_one({"_id": "run", "owner_id": "a", "project_id": "project",
                        "active_key": "project", "request_key": "request", "status": "queued",
                        "created_at": now(), "cancel_requested": False, "worker_attempts": 0,
                        "kind": "evaluation", "personas": [], "rankings": None,
                        "snapshot": {"model": "test", "persona_count": 10, "goal": {"outcome": "resonate"},
                                     "rubric": "Common scales", "branches": [{"id": "a", "text": "Shared opening."}]}})
    return db


@pytest.mark.parametrize("fail,expected", [(False, "completed"), (True, "partial")])
def test_full_matrix_and_partial_failures(monkeypatch, fail, expected):
    db = setup_run()
    advice_calls = []
    monkeypatch.setattr("services.story.pipeline.agenticorg_advice", lambda d: advice_calls.append(d) or {"status": "hitl_triggered"})
    fake = FakeProvider(fail)
    process(db, claim(db), fake)
    result = db.runs.find_one({"_id": "run"})
    assert result["status"] == expected
    assert result["advisory"]["status"] == "hitl_triggered"
    assert len(advice_calls) == 1 and db.evaluations.count_documents({"run_id": "run"}) == 10
    assert (result.get("rankings") is not None) == (not fail)
    assert ("Rankings" in fake.calls) == (not fail)
    assert "active_key" not in result


def test_recovery_fences_old_worker_and_keeps_cells(monkeypatch):
    db = setup_run()
    run = claim(db)
    assert claim(db) is None
    ctx = Context(db, "run", run["lease_token"], FakeProvider())
    ctx.personas({})
    ctx.evaluate_one({"id": "a", "text": "Shared opening."}, persona(0), run["snapshot"])
    db.runs.update_one({"_id": "run"}, {"$set": {"lease_until": now() - timedelta(seconds=1)}})
    resumed = claim(db)
    with pytest.raises(Stopped):
        ctx.save(error="stale writer")
    monkeypatch.setattr("services.story.pipeline.agenticorg_advice", lambda d: {"status": "failed"})
    fake = FakeProvider()
    process(db, resumed, fake)
    assert fake.calls.count("Evaluation") == 9
    assert fake.calls.count("Ensemble") == 0
    assert db.runs.find_one({"_id": "run"})["status"] == "completed"


def test_advisory_never_retried_after_uncertain_attempt(monkeypatch):
    db = setup_run()
    run = claim(db)
    ctx = Context(db, "run", run["lease_token"], FakeProvider())
    db.runs.update_one({"_id": "run"}, {"$set": {"advisory": {"status": "attempting"}}})
    monkeypatch.setattr("services.story.pipeline.agenticorg_advice", lambda d: pytest.fail("Must not retry"))
    ctx.advisory({})
    assert ctx.check()["advisory"]["status"] == "unknown"


def test_cancellation_stops_without_provider_calls():
    db = setup_run()
    run = claim(db)
    db.runs.update_one({"_id": "run"}, {"$set": {"cancel_requested": True}})
    fake = FakeProvider()
    process(db, run, fake)
    assert db.runs.find_one({"_id": "run"})["status"] == "cancelled"
    assert fake.calls == []


def test_schema_retries_are_bounded(monkeypatch):
    class Invalid:
        def __init__(self):
            self.calls = 0

        def with_structured_output(self, *a, **kw):
            return self

        def invoke(self, *a, **kw):
            self.calls += 1
            raise ValueError("Synthetic invalid schema")

    monkeypatch.setattr("services.story.provider.time.sleep", lambda _: None)
    provider = object.__new__(CreativeProvider)
    provider.model = Invalid()
    with pytest.raises(ProviderFailure):
        provider.generate(GeneratedTree, "test", {}, lambda: None)
    assert provider.model.calls == 3


@pytest.mark.parametrize("status,attempts", [(429, 3), (503, 3), (401, 1)])
def test_network_retries_and_auth_failure_are_bounded(monkeypatch, status, attempts):
    class Failure(Exception):
        status_code = status

    class Model:
        calls = 0

        def with_structured_output(self, *a, **kw):
            return self

        def invoke(self, *a, **kw):
            self.calls += 1
            raise Failure("Do not leak provider response bodies.")

    monkeypatch.setattr("services.story.provider.time.sleep", lambda _: None)
    provider = object.__new__(CreativeProvider)
    provider.model = Model()
    with pytest.raises(ProviderFailure) as error:
        provider.generate(GeneratedTree, "test", {})
    assert provider.model.calls == attempts
    assert "Do not leak" not in str(error.value)


def test_agenticorg_pending_output_and_cleanup_never_block(monkeypatch):
    from types import SimpleNamespace
    from services.story.provider import agenticorg_advice

    calls = []

    class Client:
        def __init__(self, **kw):
            self.agents = self

        def run(self, agent, **kwargs):
            calls.append((agent, kwargs))
            return SimpleNamespace(status="hitl_triggered", output={"unapproved": True}, run_id="synthetic")

        def close(self):
            raise RuntimeError("cleanup problem")

    monkeypatch.setenv("AGENTICORG_API_KEY", "test-only-not-a-key")
    monkeypatch.setenv("AGENTICORG_AGENT_ID", "test-agent")
    monkeypatch.setattr("services.story.provider.AgenticOrg", Client)
    result = agenticorg_advice({"branches": [], "evaluations": []})
    assert len(calls) == 1
    assert calls[0][1]["action"] == "process"
    assert result["status"] == "hitl_triggered"
    assert "output" not in result
