from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.db.repository import get_profile, upsert_profile
from app.db.session import get_session

router = APIRouter(prefix="/profile", tags=["profile"])

UPLOAD_DIR = Path.home() / ".applyai" / "uploads"
_ALLOWED_EXTENSIONS = {".pdf", ".docx"}


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


@router.post("/resume")
def upload_resume(file: UploadFile = File(...)):
    """Store the default resume used by every application unless a job is
    explicitly tailored with AI (see Job.resume_source in app/db/models.py)."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Resume must be a .pdf or .docx file")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / f"resume{ext}"

    # Remove a previously uploaded resume of a different extension so there's
    # never more than one ambiguous "current" resume file on disk.
    for other in UPLOAD_DIR.glob("resume.*"):
        other.unlink(missing_ok=True)

    dest.write_bytes(file.file.read())

    with get_session() as session:
        data = get_profile(session)
        data["resumeFile"] = {
            "filename": file.filename,
            "path": str(dest),
            "uploadedAt": datetime.now(timezone.utc).isoformat(),
        }
        return upsert_profile(session, data)
