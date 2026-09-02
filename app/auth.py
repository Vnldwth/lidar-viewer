import base64
import hashlib
import secrets
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.config import (
    ADMIN_EMAILS, ADMIN_GROUPS, OIDC_CLIENT_ID, OIDC_ISSUER,
    OIDC_REDIRECT_URI, OIDC_SCOPES,
)
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

_oidc_config = None
_jwks = None


async def _get_oidc_config():
    global _oidc_config
    if _oidc_config is None:
        issuer = OIDC_ISSUER.rstrip("/")
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{issuer}/.well-known/openid-configuration")
            resp.raise_for_status()
            _oidc_config = resp.json()
    return _oidc_config


async def _get_jwks():
    global _jwks
    if _jwks is None:
        config = await _get_oidc_config()
        async with httpx.AsyncClient() as client:
            resp = await client.get(config["jwks_uri"])
            resp.raise_for_status()
            _jwks = resp.json()
    return _jwks


def _generate_pkce():
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _is_admin(email: str, groups: list) -> bool:
    if email in ADMIN_EMAILS:
        return True
    return any(g in ADMIN_GROUPS for g in (groups or []))


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db),
):
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def require_user(
    request: Request, db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(
    request: Request, db: AsyncSession = Depends(get_db),
):
    user = await require_user(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/login")
async def login(request: Request):
    config = await _get_oidc_config()
    verifier, challenge = _generate_pkce()
    state = secrets.token_urlsafe(32)
    request.session["pkce_verifier"] = verifier
    request.session["oauth_state"] = state

    params = {
        "client_id": OIDC_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": OIDC_REDIRECT_URI,
        "scope": OIDC_SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    auth_url = config["authorization_endpoint"]
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"{auth_url}?{qs}")


@router.get("/callback")
async def callback(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    if state != request.session.get("oauth_state"):
        raise HTTPException(status_code=400, detail="Invalid state")

    config = await _get_oidc_config()
    verifier = request.session.pop("pkce_verifier", "")
    request.session.pop("oauth_state", None)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            config["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "client_id": OIDC_CLIENT_ID,
                "code": code,
                "redirect_uri": OIDC_REDIRECT_URI,
                "code_verifier": verifier,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Token exchange failed")

    tokens = resp.json()
    id_token = tokens["id_token"]

    jwks = await _get_jwks()
    try:
        header = jwt.get_unverified_header(id_token)
        key = next(
            (k for k in jwks.get("keys", []) if k["kid"] == header.get("kid")),
            None,
        )
        if not key:
            raise HTTPException(status_code=400, detail="No matching signing key")

        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=OIDC_CLIENT_ID,
            options={"verify_iss": False},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=400, detail=f"Token validation failed: {exc}",
        )

    sub = claims["sub"]
    email = claims.get("email", "")
    name = claims.get("name", claims.get("preferred_username", ""))
    groups = claims.get("groups", [])

    result = await db.execute(select(User).where(User.id == sub))
    user = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if user:
        user.email = email
        user.name = name
        user.groups = groups
        user.is_admin = _is_admin(email, groups)
        user.last_login = now
    else:
        user = User(
            id=sub,
            email=email,
            name=name,
            groups=groups,
            is_admin=_is_admin(email, groups),
            created_at=now,
            last_login=now,
        )
        db.add(user)

    await db.commit()
    request.session["user_id"] = sub

    next_url = request.session.pop("next_url", "/")
    return RedirectResponse(next_url)


@router.get("/me")
async def me(user=Depends(get_current_user)):
    if not user:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_admin": user.is_admin,
        "groups": user.groups or [],
    }


@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/")
