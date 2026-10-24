"""Separate always-running worker: bounded jobs, renewable leases and fencing."""
import logging
import os
import signal
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

from pymongo import ReturnDocument

from .pipeline import Context, Stopped, execute
from .store import database, indexes, now

log = logging.getLogger("manyways.worker")
stop = threading.Event()


def claim(db):
    token = uuid4().hex
    return db.runs.find_one_and_update(
        {"cancel_requested": False, "$or": [
            {"status": "queued"}, {"status": "running", "lease_until": {"$lt": now()}},
        ]},
        {"$set": {"status": "running", "lease_token": token,
                  "lease_until": now() + timedelta(seconds=180), "updated_at": now()},
         "$inc": {"worker_attempts": 1}},
        sort=[("created_at", 1)], return_document=ReturnDocument.AFTER,
    )


def process(db, run, provider=None):
    ctx = Context(db, run["_id"], run["lease_token"], provider)
    done = threading.Event()
    started = time.monotonic()
    budget = min(max(int(os.environ.get("JOB_TIMEOUT_SECONDS", "3600")), 120), 14400)

    def heartbeat():
        while not done.wait(15):
            if time.monotonic() - started > budget:
                db.runs.update_one(ctx.query(), {"$set": {"cancel_requested": True, "error": "Job time budget exceeded."}})
                return
            db.runs.update_one(ctx.query(), {"$set": {"lease_until": now() + timedelta(seconds=180)}})

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    status, error = "failed", ""
    try:
        if run.get("worker_attempts", 0) > 3:
            raise RuntimeError("Worker restart limit exceeded.")
        execute(ctx)
        latest = ctx.check()
        status = "completed" if latest["kind"] == "generation" or latest.get("rankings") else "partial"
    except Stopped:
        status = "cancelled"
    except Exception as exc:
        # Never write raw provider/driver exceptions or secrets to logs.
        error = f"Job failed ({type(exc).__name__}). Saved completed cells remain available."
        log.warning("job_failed kind=%s error_type=%s", run["kind"], type(exc).__name__)
    finally:
        done.set()
        thread.join(timeout=2)
        values = {"status": status, "updated_at": now(), "finished_at": now()}
        if error:
            values["error"] = error
        # Cancellation wins a race with the last provider call.
        if db.runs.find_one({**ctx.query(), "cancel_requested": True}):
            values["status"] = "cancelled"
        db.runs.update_one(ctx.query(), {"$set": values,
                                       "$unset": {"active_key": "", "lease_token": "", "lease_until": ""}})


def main():
    logging.basicConfig(level=logging.INFO)
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    db = database()
    indexes(db)
    concurrency = min(max(int(os.environ.get("WORKER_CONCURRENCY", "1")), 1), 4)
    log.info("worker_ready concurrency=%s", concurrency)
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        active = set()
        while not stop.is_set():
            active = {f for f in active if not f.done()}
            # A cancelled orphan must not hold the project's active lock forever.
            db.runs.update_many(
                {"status": "running", "cancel_requested": True, "lease_until": {"$lt": now()}},
                {"$set": {"status": "cancelled"}, "$unset": {"active_key": "", "lease_token": "", "lease_until": ""}},
            )
            if len(active) < concurrency:
                run = claim(db)
                if run:
                    active.add(pool.submit(process, db, run))
                    continue
            stop.wait(1)


if __name__ == "__main__":
    main()
