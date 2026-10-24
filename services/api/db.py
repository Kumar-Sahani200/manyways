import os
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import HTTPException
from pymongo import MongoClient


def now():
    return datetime.now(timezone.utc)


@lru_cache
def database():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise HTTPException(503, "MongoDB is not configured. Add MONGODB_URI securely.")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    return client[os.getenv("MONGODB_DATABASE", "manyways")]


def indexes(db):
    db.projects.create_index([("owner", 1), ("updatedAt", -1)])
    db.runs.create_index([("owner", 1), ("projectId", 1), ("createdAt", -1)])
    db.runs.create_index([("status", 1), ("leaseUntil", 1)])
    db.runs.create_index(
        [("owner", 1), ("projectId", 1)], unique=True,
        partialFilterExpression={"active": True}, name="one_active_run_per_project",
    )


def public(record):
    if record is None:
        raise HTTPException(404, "Not found.")
    return {k: v for k, v in record.items() if k not in {"_id", "owner", "workerId", "leaseUntil", "active",
                                                       "request_key", "active_key"}}
