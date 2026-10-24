import os
from functools import lru_cache

import jwt
from fastapi import Header, HTTPException

from .config import allowed_origins, clerk_issuer


@lru_cache
def jwks():
    return jwt.PyJWKClient(clerk_issuer() + "/.well-known/jwks.json", timeout=8, cache_jwk_set=True)


def verify_token(token, signing_key=None):
    try:
        key = signing_key or jwks().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"], issuer=clerk_issuer(),
            audience=os.environ.get("CLERK_JWT_AUDIENCE", "manyways-api"),
            options={"require": ["exp", "iat", "sub", "iss", "aud"]}, leeway=5,
        )
        if not isinstance(claims["sub"], str) or not claims["sub"]:
            raise ValueError("Missing owner")
        # Custom API templates may omit azp; if present it must match a trusted frontend.
        if claims.get("azp") is not None and claims["azp"] not in allowed_origins():
            raise ValueError("Invalid authorized party")
        return claims["sub"]
    except Exception as exc:
        raise HTTPException(401, "Invalid or expired session.") from exc


def owner(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue.")
    return verify_token(authorization[7:])
