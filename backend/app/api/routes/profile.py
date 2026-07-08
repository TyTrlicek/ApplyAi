from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.db.repository import get_profile, upsert_profile
from app.db.session import get_session

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileBody(BaseModel):
    model_config = {"extra": "allow"}

    data: dict[str, Any]


@router.get("/")
def read_profile():
    with get_session() as session:
        return get_profile(session)


@router.put("/")
def write_profile(body: ProfileBody):
    with get_session() as session:
        return upsert_profile(session, body.data)
