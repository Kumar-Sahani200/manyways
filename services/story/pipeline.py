"""LangGraph workflow; MongoDB checkpoints make every stage restart-safe."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from .domain import Ensemble, Evaluation, GeneratedTree, Rankings, validate_matrix, validate_rankings
from .provider import CreativeProvider, ProviderFailure, agenticorg_advice
from .store import now


class Stopped(RuntimeError):
    pass


class Context:
    def __init__(self, db, run_id, token, provider=None):
        self.db, self.run_id, self.token = db, run_id, token
        self.provider = provider

    def query(self):
        return {"_id": self.run_id, "lease_token": self.token, "status": "running"}

    def check(self):
        run = self.db.runs.find_one(self.query())
        if not run or run.get("cancel_requested"):
            raise Stopped("Job cancelled or worker lease replaced.")
        return run

    def save(self, **values):
        self.check()
        if self.db.runs.update_one(self.query(), {"$set": {**values, "updated_at": now()}}).matched_count != 1:
            raise Stopped("Worker lease replaced.")

    def model(self):
        if self.provider is None:
            self.provider = CreativeProvider(self.check()["snapshot"]["model"])
        return self.provider

    def generate_tree(self, state):
        run = self.check()
        if run.get("generated_nodes"):
            return {}
        result = self.model().generate(
            GeneratedTree,
            "Create an editable branching story from the source and goal. Preserve a shared root, "
            "write 2–4 genuinely different complete endings, connect every node, no children under "
            "end nodes. Maximum 40 nodes, 8 levels, 12 complete paths, total 80,000 characters. "
            "Use short unique ASCII IDs. Keep source voice and constraints; no empty content.",
            {"source": run["snapshot"]["source_text"], "goal": run["snapshot"]["goal"]},
            self.check,
        )
        self.save(generated_nodes=[n.model_dump() for n in result.nodes],
                  progress={"total": 1, "succeeded": 1, "failed": 0})
        return {}

    def personas(self, state):
        run = self.check()
        if run.get("personas"):
            return {}
        count = run["snapshot"]["persona_count"]
        result = self.model().generate(
            Ensemble,
            f"Generate exactly {count} distinct fictional personas tailored to the goal. "
            "Vary reading styles, motivations, genre preferences, attention, skepticism, and "
            "accessibility needs. Demographics are optional targeting context, not explanations "
            "of behavior. Explain each persona's connection to the goal. No stereotypes.",
            {"goal": run["snapshot"]["goal"]}, self.check,
        )
        if len(result.personas) != count:
            raise ProviderFailure("Provider returned the wrong persona count.")
        self.save(personas=[p.model_dump() for p in result.personas])
        return {}

    def evaluate_one(self, branch, persona, snapshot):
        self.check()
        key = {"run_id": self.run_id, "branch_id": branch["id"], "persona_id": persona["id"]}
        existing = self.db.evaluations.find_one(key)
        if existing:
            return
        try:
            result = self.model().generate(
                Evaluation,
                "React in character to the FULL assembled story. Include an emotional trajectory, "
                "specific attention/drop-off points, comprehension, credibility, memorability, goal "
                "fit, objections and actionable revisions. Every evidence.quote must be a verbatim "
                "substring of the story. Apply the frozen shared rubric without changing anchors.",
                {"goal": snapshot["goal"], "rubric": snapshot["rubric"],
                 "persona": persona, "branch": branch}, self.check,
            )
            if any(e.quote not in branch["text"] for e in result.evidence):
                raise ProviderFailure("Evaluation evidence was not present in the branch.")
            cell = {**key, **result.model_dump(), "status": "completed"}
        except ProviderFailure as exc:
            cell = {**key, "status": "failed", "error": str(exc)}
        self.check()
        self.db.evaluations.update_one(key, {"$setOnInsert": cell}, upsert=True)
        self.sync_progress(snapshot)

    def sync_progress(self, snapshot):
        cells = list(self.db.evaluations.find({"run_id": self.run_id}, {"_id": 0, "run_id": 0}))
        # Atomic counts avoid a slower concurrent task overwriting progress with older counts.
        # Browser also receives the authoritative full matrix when it polls.
        self.save(progress={
            "total": len(snapshot["branches"]) * snapshot["persona_count"],
            "succeeded": sum(c["status"] == "completed" for c in cells),
            "failed": sum(c["status"] == "failed" for c in cells),
        })

    def evaluations(self, state):
        run = self.check()
        snapshot = run["snapshot"]
        # Bound provider fan-out independently of the number of branches/personas.
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.evaluate_one, b, p, snapshot)
                       for b in snapshot["branches"] for p in run["personas"]]
            for future in as_completed(futures):
                future.result()
        self.sync_progress(snapshot)
        return {}

    def advisory(self, state):
        run = self.check()
        if "advisory" in run:
            if run["advisory"]["status"] == "attempting":
                self.save(advisory={"status": "unknown", "message": "Worker interrupted during optional call; not retried to avoid duplicates."})
            return {}
        # Persist before sending: at-most-once attempt, including across crashes.
        claim = self.db.runs.update_one(
            {**self.query(), "advisory": {"$exists": False}},
            {"$set": {"advisory": {"status": "attempting", "message": "Requesting optional advice."}}},
        )
        if claim.modified_count != 1:
            return {}
        cells = list(self.db.evaluations.find({"run_id": self.run_id}, {"_id": 0, "run_id": 0}))
        advice = agenticorg_advice({
            "goal": run["snapshot"]["goal"], "branches": run["snapshot"]["branches"],
            "personas": run["personas"], "evaluations": cells,
        })
        self.save(advisory=advice)
        return {}

    def rankings(self, state):
        run = self.check()
        if run.get("rankings"):
            return {}
        cells = list(self.db.evaluations.find({"run_id": self.run_id}, {"_id": 0, "run_id": 0}))
        snapshot = run["snapshot"]
        try:
            validate_matrix(snapshot["branches"], run["personas"], cells)
        except ValueError:
            self.save(error="Some persona evaluations failed. This partial matrix has no final ranking.")
            return {}
        result = self.model().generate(
            Rankings,
            "Act as the ranking orchestrator. Compare every branch using the entire persona matrix "
            "and frozen goal. Rank every branch exactly once using its exact branch ID; rank 1 is "
            "best supported goal fit, not a performance prediction. Explain strengths, risks, "
            "audience disagreements, uncertainty and suggested next edits. Optional AgenticOrg "
            "advice is non-authoritative and must never replace matrix evidence.",
            {"goal": snapshot["goal"], "branches": snapshot["branches"], "rubric": snapshot["rubric"],
             "personas": run["personas"], "evaluations": cells,
             "optional_advisory": run.get("advisory")}, self.check,
        )
        validate_rankings(result, snapshot["branches"])
        self.save(rankings=result.model_dump())
        return {}


class State(TypedDict):
    run_id: str


def execute(ctx):
    run = ctx.check()
    graph = StateGraph(State)
    if run["kind"] == "generation":
        graph.add_node("generate", ctx.generate_tree)
        graph.add_edge(START, "generate")
        graph.add_edge("generate", END)
    else:
        for name in ("personas", "evaluations", "advisory", "rankings"):
            graph.add_node(name, getattr(ctx, name))
        graph.add_edge(START, "personas")
        graph.add_edge("personas", "evaluations")
        graph.add_edge("evaluations", "advisory")
        graph.add_edge("advisory", "rankings")
        graph.add_edge("rankings", END)
    # Each node checkpoints its result in MongoDB. A replacement worker restarts
    # the graph and skips already persisted stages/cells rather than losing work.
    graph.compile().invoke({"run_id": ctx.run_id})
