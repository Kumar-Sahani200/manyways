"""Opt-in live-provider verification; uses an isolated Atlas database and removes its records."""
from uuid import uuid4

from .domain import GeneratedTree, Goal, RUBRIC, assemble_paths
from .provider import CreativeProvider
from .store import database, indexes, now
from .worker import process


def main():
    db = database().client["manyways_verification"]
    indexes(db)
    run_id = "smoke-" + uuid4().hex
    try:
        provider = CreativeProvider()
        goal = Goal(outcome="Leave a hopeful impression", audience="Adult readers of short fiction",
                    tone="Quiet, hopeful", constraints="No violence. Keep the story under 200 words.")
        tree = provider.generate(
            GeneratedTree,
            "Write a tiny story about a lighthouse with a shared opening and two different complete "
            "endings. Exactly three nodes, root and two end children, under 200 words total.",
            {"source": "A keeper sees the lamp light itself after years of darkness.", "goal": goal.model_dump()},
        )
        print("Live Groq/LangChain generation: valid tree with", len(tree.nodes), "nodes", flush=True)
        paths = assemble_paths(tree.nodes, True)
        assert len(paths) >= 2 and all(len(p["node_ids"]) >= 2 for p in paths)
        db.runs.insert_one({
            "_id": run_id, "owner_id": "verification-only", "project_id": run_id,
            "active_key": run_id, "request_key": run_id, "status": "queued",
            "kind": "evaluation", "created_at": now(), "cancel_requested": False,
            "worker_attempts": 0, "personas": [], "rankings": None,
            "snapshot": {"nodes": [n.model_dump() for n in tree.nodes], "branches": paths,
                         "goal": goal.model_dump(), "persona_count": 10, "rubric": RUBRIC,
                         "model": provider.model_name},
        })
        # Claim this specific verification run; no other database's work is touched.
        from datetime import timedelta
        token = uuid4().hex
        db.runs.update_one({"_id": run_id}, {"$set": {
            "status": "running", "lease_token": token, "lease_until": now() + timedelta(seconds=180),
            "worker_attempts": 1,
        }})
        process(db, db.runs.find_one({"_id": run_id}), provider)
        result = db.runs.find_one({"_id": run_id})
        print("Live LangGraph worker status:", result["status"], flush=True)
        print("Personas:", len(result.get("personas", [])), "progress:", result.get("progress"), flush=True)
        print("Optional AgenticOrg status:", result.get("advisory", {}).get("status"), flush=True)
        if result.get("error"):
            print("Job error:", result["error"], flush=True)
        assert result["status"] == "completed", "Live evaluation/ranking did not complete."
        assert len(result["rankings"]["items"]) == len(paths)
        print("Live provider smoke: passed, full matrix and grounded rankings persisted in Atlas.", flush=True)
    finally:
        db.evaluations.delete_many({"run_id": run_id})
        db.runs.delete_one({"_id": run_id})


if __name__ == "__main__":
    main()
