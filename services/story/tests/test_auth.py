import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from services.story.auth import verify_token
from services.story.config import clerk_issuer


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.setenv("CLERK_ISSUER", "https://test.clerk.accounts.dev")
    monkeypatch.setenv("CLERK_JWT_AUDIENCE", "manyways-api")
    monkeypatch.setenv("APP_ORIGINS", "https://app.example.test")
    clerk_issuer.cache_clear()
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    yield private, private.public_key()
    clerk_issuer.cache_clear()


def claims():
    return {"sub": "owner-a", "iss": "https://test.clerk.accounts.dev",
            "aud": "manyways-api", "iat": int(time.time()), "exp": int(time.time()) + 120,
            "azp": "https://app.example.test"}


def test_valid_jwt(keys):
    private, public = keys
    assert verify_token(jwt.encode(claims(), private, algorithm="RS256"), public) == "owner-a"


@pytest.mark.parametrize("change", [
    {"aud": "other-app"}, {"iss": "https://evil.test"},
    {"exp": int(time.time()) - 60}, {"azp": "https://evil.test"}, {"sub": ""},
])
def test_refuse_wrong_claims(keys, change):
    private, public = keys
    with pytest.raises(HTTPException) as e:
        verify_token(jwt.encode({**claims(), **change}, private, algorithm="RS256"), public)
    assert e.value.status_code == 401


def test_signature_and_algorithm(keys):
    private, public = keys
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    for token in [jwt.encode(claims(), other, algorithm="RS256"),
                  jwt.encode(claims(), "test-only-signing-secret" * 2, algorithm="HS256")]:
        with pytest.raises(HTTPException):
            verify_token(token, public)


def test_required_expiry_and_audience(keys):
    private, public = keys
    for missing in ["exp", "aud", "sub"]:
        data = claims()
        del data[missing]
        with pytest.raises(HTTPException):
            verify_token(jwt.encode(data, private, algorithm="RS256"), public)
