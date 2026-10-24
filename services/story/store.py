import os
from datetime import datetime, timezone
from functools import lru_cache

from pymongo import ASCENDING, MongoClient


def now():
    return datetime.now(timezone.utc)


@lru_cache
def database():
    client = MongoClient(
        os.environ["MONGODB_URI"], serverSelectionTimeoutMS=10000,
        connectTimeoutMS=10000, socketTimeoutMS=20000, tz_aware=True,
    )
    return client[os.environ.get("MONGODB_DATABASE", "manyways")]


def indexes(db):
    db.projects.create_index([("owner_id", ASCENDING), ("updated_at", ASCENDING)])
    db.runs.create_index([("owner_id", ASCENDING), ("project_id", ASCENDING), ("created_at", ASCENDING)])
    db.runs.create_index("request_key", unique=True)
    db.runs.create_index("active_key", unique=True, sparse=True)
    db.runs.create_index([("status", ASCENDING), ("lease_until", ASCENDING)])
    db.evaluations.create_index(
        [("run_id", ASCENDING), ("branch_id", ASCENDING), ("persona_id", ASCENDING)], unique=True,
    )


def public(document):
    if document is None:
        return None
    return {("id" if key == "_id" else key): value for key, value in document.items()
            if key not in {"owner_id", "active_key", "request_key", "lease_token", "lease_until"}}
