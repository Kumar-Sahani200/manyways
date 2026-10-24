import base64
import os
from functools import lru_cache
from urllib.parse import urlparse


@lru_cache
def clerk_issuer():
    issuer = os.environ.get("CLERK_ISSUER", "").rstrip("/")
    if not issuer:
        # Decode only inside the service; never expose or log environment values.
        key = os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")
        try:
            encoded = key.split("_", 2)[2]
            hostname = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
            issuer = "https://" + hostname
        except Exception as exc:
            raise RuntimeError("Configure CLERK_ISSUER for the external Clerk instance.") from exc
    parsed = urlparse(issuer)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/"):
        raise RuntimeError("CLERK_ISSUER must be an HTTPS origin.")
    return issuer


def allowed_origins():
    configured = os.environ.get("APP_ORIGINS", "")
    if configured:
        return [v.strip().rstrip("/") for v in configured.split(",") if v.strip()]
    return ["http://127.0.0.1:5000", "http://localhost:5000"] + (
        ["https://" + os.environ["REPLIT_DEV_DOMAIN"]] if os.environ.get("REPLIT_DEV_DOMAIN") else []
    )
