"""Supabase-backed Billy identity and tenant authorization.

A browser login is not an API security boundary. Each document operation verifies
the Supabase access token and current active organization membership server-side.
"""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request

ALLOWED_ORIGINS = {
    "https://razvanjuncu.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}


@dataclass(frozen=True)
class Principal:
    user_id: str
    organization_id: str
    role: str


def supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
    parsed = urlparse(url)
    if not url or not key or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=503, detail="Billy team identity service is not configured.")
    # Force the well-defined project host, not an arbitrary URL supplied by a browser.
    if not parsed.hostname.endswith(".supabase.co") or parsed.path or parsed.query or parsed.fragment:
        raise HTTPException(status_code=503, detail="Invalid Billy Supabase project URL.")
    return url, key


async def require_member(request: Request) -> Principal:
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin not permitted.")
    url, public_key = supabase_config()
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer ") or len(authorization) > 5000:
        raise HTTPException(status_code=401, detail="Sign in to Billy first.")
    bearer = authorization.removeprefix("Bearer ").strip()
    if not bearer:
        raise HTTPException(status_code=401, detail="Missing account session.")
    raw_org = request.headers.get("x-billy-organization", "")
    try:
        organization = str(uuid.UUID(raw_org))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Select an approved company team first.") from None
    headers = {"apikey": public_key, "Authorization": "Bearer " + bearer}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0)) as client:
            who = await client.get(url + "/auth/v1/user", headers=headers)
            if who.status_code != 200:
                raise HTTPException(status_code=401, detail="Session invalid or expired. Log in again.")
            details = who.json()
            try:
                uid = str(uuid.UUID(details["id"]))
            except (KeyError, TypeError, ValueError):
                raise HTTPException(status_code=401, detail="Invalid account identity.") from None
            if not details.get("email_confirmed_at"):
                raise HTTPException(status_code=403, detail="Confirm your email before accessing company documents.")
            member = await client.get(url + "/rest/v1/organization_memberships",
                params={"select": "organization_id,role", "user_id": "eq." + uid,
                        "organization_id": "eq." + organization, "limit": 1},
                headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Team identity service unavailable.") from None
    if member.status_code != 200:
        raise HTTPException(status_code=503, detail="Team membership verification failed.")
    rows = member.json()
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=403, detail="You are not approved for this team.")
    role = rows[0].get("role")
    if role not in {"owner", "reviewer", "operator"}:
        raise HTTPException(status_code=403, detail="No team access granted.")
    return Principal(user_id=uid, organization_id=organization, role=role)
