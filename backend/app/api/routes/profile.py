from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.db.repository import get_profile, upsert_profile
from app.db.session import get_session
from app.profile_autofill import build_autofill_profile

router = APIRouter(prefix="/profile", tags=["profile"])

UPLOAD_DIR = Path.home() / ".applyai" / "uploads"
_ALLOWED_EXTENSIONS = {".pdf", ".docx"}
_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


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


@router.get("/autofill")
def read_autofill_profile():
    """Flattened, fill-ready projection of the MAP for the autofill extension."""
    with get_session() as session:
        profile = get_profile(session)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile is empty — fill it in first")
    return build_autofill_profile(profile)


@router.get("/resume.file")
def download_default_resume():
    """The uploaded default resume, streamed for the autofill file-upload step."""
    with get_session() as session:
        profile = get_profile(session)
    resume_file = (profile or {}).get("resumeFile") or {}
    path = Path(resume_file.get("path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="No default resume uploaded — add one on the Profile page")
    ext = path.suffix.lower()
    return FileResponse(
        path,
        media_type=_CONTENT_TYPES.get(ext, "application/octet-stream"),
        filename=resume_file.get("filename") or path.name,
    )


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
