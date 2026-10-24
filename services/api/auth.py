"""Clerk verification; no development bypass or user identity from request bodies."""
import os
from functools import lru_cache

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient


@lru_cache
def key_client(issuer):
    return PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True, timeout=10)


def owner(authorization: str | None = Header(default=None)):
    issuer = os.getenv("CLERK_ISSUER_URL", "").rstrip("/")
    parties = [x.strip() for x in os.getenv("CLERK_AUTHORIZED_PARTIES", "").split(",") if x.strip()]
    if not issuer or not issuer.startswith("https://") or not parties:
        raise HTTPException(503, "Clerk token verification is not configured.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue.")
    token = authorization[7:]
    try:
        signing_key = key_client(issuer).get_signing_key_from_jwt(token)
        audience = os.getenv("CLERK_JWT_AUDIENCE")
        claims = jwt.decode(
            token, signing_key.key, algorithms=["RS256"], issuer=issuer,
            audience=audience or None,
            options={"require": ["exp", "iat", "sub", "iss"], "verify_aud": bool(audience)},
            leeway=5,
        )
        if claims.get("azp") not in parties or not claims.get("sub"):
            raise jwt.InvalidTokenError("Unauthorized party.")
        return claims["sub"]
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(401, "Your session is invalid or expired.") from None
