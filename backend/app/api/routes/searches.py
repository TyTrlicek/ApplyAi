"""Search profile CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import SearchProfileCreate, SearchProfileOut
from app.db.models import SearchProfile
from app.db.session import get_session

router = APIRouter(prefix="/searches", tags=["searches"])


def _db():
    with get_session() as session:
        yield session


@router.get("/", response_model=list[SearchProfileOut])
def list_profiles(session: Session = Depends(_db)):
    return session.scalars(select(SearchProfile).order_by(SearchProfile.id)).all()


@router.post("/", response_model=SearchProfileOut, status_code=201)
def create_profile(body: SearchProfileCreate, session: Session = Depends(_db)):
    profile = SearchProfile(**body.model_dump())
    session.add(profile)
    session.flush()
    return profile


@router.patch("/{profile_id}/toggle", response_model=SearchProfileOut)
def toggle_profile(profile_id: int, session: Session = Depends(_db)):
    profile = session.get(SearchProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.active = not profile.active
    session.flush()
    return profile


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: int, session: Session = Depends(_db)):
    profile = session.get(SearchProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    session.delete(profile)
