from __future__ import annotations

import io
import json
import logging
import re
from datetime import date
from pathlib import Path

import anthropic
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.config import ANTHROPIC_API_KEY
from app.db.models import Job
from app.db.repository import get_profile
from app.db.session import get_session
from app.docx_render import build_cover_letter_docx, build_resume_docx
from app.page_fit import USABLE_H, estimate_height, libreoffice_page_count, trim_to_one_page

router = APIRouter(prefix="/jobs", tags=["generate"])

logger = logging.getLogger("applyai.generate")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     [generate] %(message)s"))
    logger.addHandler(_handler)
    logger.propagate = False

MODEL = "claude-opus-4-8"
# Cheap model for the "tighten to fit one page" cleanup pass (rewrites bullets more
# concisely when the Opus draft overflows — smarter than blindly deleting a bullet).
TIGHTEN_MODEL = "claude-haiku-4-5-20251001"

# ── Token/cost guards ────────────────────────────────────────────────────────
# Output is hard-capped by max_tokens on each call (adaptive thinking counts
# against it, so a single generation can't exceed these). Input is bounded by
# truncating oversized job descriptions.
# Adaptive thinking counts against max_tokens, so this must cover thinking + the full
# resume JSON. 4096 truncated the JSON mid-structure on fuller resumes; 8192 is safe.
RESUME_MAX_TOKENS = 8192
COVER_LETTER_MAX_TOKENS = 3072
MAX_DESCRIPTION_CHARS = 12000  # ~3k tokens; keeps input cost bounded per job

# Opus 4.8 pricing per 1M tokens (for the usage log only)
_INPUT_PRICE = 5.0 / 1_000_000
_OUTPUT_PRICE = 25.0 / 1_000_000

_GUIDE_PATH = Path(__file__).parents[4] / "docs" / "RESUME_GUIDE.md"
RESUME_GUIDE = _GUIDE_PATH.read_text() if _GUIDE_PATH.exists() else ""

_RESUME_INSTRUCTIONS = """
Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "name": "applicant full name",
  "contact": {
    "email": "...",
    "phone": "...",
    "location": "...",
    "linkedin": "...",
    "github": "..."
  },
  "education": [
    {
      "school": "...",
      "location": "city, state",
      "degree": "...",
      "field": "...",
      "graduation": "...",
      "gpa": "omit this field entirely if GPA rule says no",
      "coursework": "omit this field if not relevant to this role"
    }
  ],
  "skills": [
    {"category": "Languages", "items": "comma, separated, list"},
    {"category": "Frameworks", "items": "..."},
    {"category": "Tools & Cloud", "items": "..."}
  ],
  "experience": [
    {
      "company": "Tyler Technologies",
      "title": "...",
      "start": "...",
      "end": "...",
      "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"]
    },
    {
      "company": "SportsFrames",
      "title": "...",
      "start": "...",
      "end": "...",
      "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"]
    }
  ],
  "projects": [
    {
      "name": "...",
      "url": "...",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"]
    },
    {
      "name": "...",
      "url": "...",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"]
    }
  ]
}

RULES — follow exactly:
- FACTS: Never invent facts not in the profile. Do not include a summary field.

- FIXED STRUCTURE — non-negotiable, do not deviate:
    * Experience: exactly 2 entries, exactly in this order: Tyler Technologies first,
      SportsFrames second. No other companies. No extras.
    * Experience bullets: exactly 4 bullets per entry. No more, no fewer.
    * Projects: exactly 2 entries from the profile's standalone project list
      (projects not tied to a work employer). Pick the 2 most relevant to this role.
    * Project bullets: exactly 3 bullets per project. No more, no fewer.
    * Skills: exactly 3 categories (see SKILLS FORMAT). For AI/ML roles use 4.
    * Education: school + degree + GPA line (if applicable) + coursework line (if applicable).

- BULLET LENGTH: Every bullet must fit on ONE line — aim for 15–20 words. Never write a
  bullet that wraps to a second line. If the content needs more room, split into two bullets
  rather than making one long bullet. Tight, punchy, quantified.

- SKILLS FORMAT: Exactly 3 compact categories (4 for AI/ML roles). Each line must be
  ≤ 85 characters total (label + ": " + items). Count carefully. Drop least-relevant items
  if a line would exceed 85 chars. Use ONLY technologies from the applicant's profile tech
  stack — NEVER add technologies not in the profile even if the job asks for them.
  Standard groupings (reorder/relabel by role relevance):
    Languages:    Python, TypeScript, JavaScript, SQL, C#, Bash          [~55 chars]
    Frameworks:   FastAPI, Next.js, React, Node.js, Express, Tailwind CSS [~65 chars]
    Tools & Cloud: Docker, Git, PostgreSQL, Redis, Terraform, AWS CLI, Datadog [~74 chars]
  For AI/ML roles, add a 4th line:
    AI / Agents:  Anthropic Claude API, Temporal Workflows, PyTorch, scikit-learn

- TAILORING: Reorder items within each category and reorder categories to surface the most
  relevant skills first. Tailor bullet emphasis to match the role type (AIOps → Temporal/Claude;
  DevOps → Terraform/AWS/Docker; Full-stack → Next.js/FastAPI; ML → PyTorch/data).

- METRICS: Use only numbers already in the profile. Never invent or alter a metric.

- TENSE: Use present tense for any role whose end date is in the future relative to the
  "Current date" in the JOB block. Past tense for completed roles.

- GPA: Include only if GPA ≥ 3.5 AND role targets new grads or requests GPA. Omit the
  "gpa" field entirely otherwise.

- COURSEWORK: Include only when coursework directly strengthens fit for this role; omit otherwise."""

RESUME_SYSTEM = (
    RESUME_GUIDE
    + "\n\n---\n\nYou are an expert resume writer. Follow the guide above exactly. "
    + "Given the applicant profile and job description below, produce a tailored resume.\n"
    + _RESUME_INSTRUCTIONS
)

COVER_LETTER_SYSTEM = """You are an expert cover letter writer. Write a concise, tailored cover letter for the applicant.

Guidelines:
- 3 paragraphs: opening (why this role + company), middle (2-3 relevant experiences/skills), closing (call to action)
- Concise — aim for 250-300 words total
- Specific to this company and role, not generic
- Do not use hollow phrases like "I am excited to apply" or "I am a team player"
- Write in first person
- No salutation or sign-off — return just the body paragraphs as plain text"""


def _build_profile_block(profile: dict) -> str:
    lines = ["===== APPLICANT PROFILE ====="]

    personal = profile.get("personal", {})
    positioning = personal.get("positioningNotes", "")
    if positioning:
        lines += ["", "--- POSITIONING INSTRUCTIONS (follow these for every resume) ---", positioning]

    bio = profile.get("bio", "")
    if bio:
        lines += ["", "--- Background & Context ---", bio]
    if any(personal.values()):
        lines += ["", "--- Personal ---"]
        for k, v in personal.items():
            if v:
                lines.append(f"{k}: {v}")

    experience = profile.get("experience", [])
    if experience:
        lines += ["", "--- Work Experience ---"]
        for e in experience:
            lines.append(f"\n{e.get('title', '')} at {e.get('company', '')} ({e.get('start', '')} – {e.get('end', '') or 'Present'})")
            bullets = e.get("bullets", "")
            if bullets:
                lines.append("Bullets:\n" + bullets)
            ctx = e.get("context", "")
            if ctx:
                lines.append("Additional context: " + ctx)

    edu = profile.get("education", {})
    if any(edu.values()):
        lines += ["", "--- Education ---"]
        if edu.get("degree") or edu.get("field"):
            lines.append(f"{edu.get('degree', '')} in {edu.get('field', '')} — {edu.get('school', '')} ({edu.get('graduation', '')})")
        if edu.get("gpa"):
            lines.append(f"GPA: {edu['gpa']}")
        if edu.get("honors"):
            lines.append(f"Honors: {edu['honors']}")
        if edu.get("coursework"):
            lines.append(f"Relevant coursework: {edu['coursework']}")

    ts = profile.get("techStack", {})
    if any(ts.values()):
        lines += ["", "--- Tech Stack ---"]
        labels = {"languages": "Languages", "frameworks": "Frameworks & Libraries", "tools": "Tools & Platforms", "cloud": "Cloud & Infra", "other": "Other"}
        for k, label in labels.items():
            if ts.get(k):
                lines.append(f"{label}: {ts[k]}")

    projects = profile.get("projects", [])
    if projects:
        lines += ["", "--- Projects ---"]
        for p in projects:
            lines.append(f"\n{p.get('name', '')}{' — ' + p['url'] if p.get('url') else ''}")
            if p.get("description"):
                lines.append(p["description"])
            if p.get("context"):
                lines.append("Context: " + p["context"])

    certs = profile.get("certifications", [])
    if certs:
        lines += ["", "--- Certifications ---"]
        for c in certs:
            lines.append(f"{c.get('name', '')} — {c.get('issuer', '')} ({c.get('date', '')})")

    extras = profile.get("extracurriculars", [])
    if extras:
        lines += ["", "--- Extracurriculars & Leadership ---"]
        for e in extras:
            lines.append(f"{e.get('role', '')} at {e.get('org', '')} ({e.get('dates', '')}): {e.get('description', '')}")

    return "\n".join(lines)


def _client() -> anthropic.Anthropic:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _tighten_to_fit(resume: dict, over_by: float) -> dict:
    """Cheap Haiku pass: rewrite the resume slightly more concisely so it fits one
    page. Shortens bullet wording (same facts) and, only if needed, drops the single
    weakest bullet. Returns the tightened resume JSON. Raises on failure — the caller
    falls back to the deterministic trimmer, so this is a best-effort quality step."""
    system = (
        "You tighten resumes to fit exactly one page. The given resume JSON renders about "
        f"{int(over_by)} points too tall (~{max(1, round(over_by / 13))} line(s) over). Make it fit "
        "on ONE page by shortening bullet wording to be more concise — same facts, fewer words, keep "
        "the strongest phrasing and all metrics. Only if shortening is not enough, remove the single "
        "weakest bullet from the section that has the most. Do NOT remove whole sections, skills, or "
        "education. Keep the EXACT same JSON structure and keys. Return ONLY the JSON, no prose."
    )
    message = _client().messages.create(
        model=TIGHTEN_MODEL,
        max_tokens=RESUME_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": json.dumps(resume)}],
    )
    raw = next(b.text for b in message.content if b.type == "text").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)


def _fit_to_one_page(resume: dict, job_id: int) -> dict:
    """Ensure the resume fits one page.

    Pass 1 — font-metric estimator: if estimate overflows, try a cheap Haiku
    conciseness pass then fall back to the deterministic trimmer.

    Pass 2 — LibreOffice validation: render the docx with the actual renderer
    and count real pages. If it's still >1, trim harder. This catches cases where
    the estimator under-counts (e.g. Pages-style spacing differences) and gives an
    authoritative page count rather than a pixel heuristic."""
    height = estimate_height(resume)
    if height > USABLE_H:
        try:
            tightened = _tighten_to_fit(resume, height - USABLE_H)
            new_h = estimate_height(tightened)
            if new_h < height:
                resume = tightened
                logger.info("resume job=%s tightened %.0f->%.0fpt via Haiku", job_id, height, new_h)
        except Exception as e:
            logger.info("resume job=%s tighten pass skipped (%s)", job_id, e)
    resume, trimmed = trim_to_one_page(resume)
    logger.info("resume job=%s estimator height=%.0fpt trimmed=%s", job_id, estimate_height(resume), trimmed)

    # Pass 2: authoritative LibreOffice page-count check.
    docx_bytes = build_resume_docx(resume, {})
    pages = libreoffice_page_count(docx_bytes)
    if pages is None:
        logger.info("resume job=%s LibreOffice unavailable — skipping page-count validation", job_id)
    elif pages > 1:
        logger.warning("resume job=%s LibreOffice reports %d pages — trimming harder", job_id, pages)
        # Trim with a tighter target until LibreOffice confirms 1 page (max 3 attempts).
        from app.page_fit import PAGE_TARGET
        target = PAGE_TARGET - 20
        for attempt in range(3):
            resume, _ = trim_to_one_page(resume, target=target)
            docx_bytes = build_resume_docx(resume, {})
            pages = libreoffice_page_count(docx_bytes)
            logger.info("resume job=%s LO trim attempt %d target=%.0f pages=%s",
                        job_id, attempt + 1, target, pages)
            if pages == 1:
                break
            target -= 15
    else:
        logger.info("resume job=%s LibreOffice confirmed 1 page", job_id)

    return resume


def _cap_description(text: str | None) -> str:
    """Bound input cost: truncate oversized job descriptions."""
    text = text or ""
    if len(text) <= MAX_DESCRIPTION_CHARS:
        return text
    return text[:MAX_DESCRIPTION_CHARS] + "\n\n[...description truncated to bound token usage...]"


def _log_usage(kind: str, job_id: int, message: anthropic.types.Message) -> None:
    """Log token usage + estimated cost for one generation."""
    u = message.usage
    cost = u.input_tokens * _INPUT_PRICE + u.output_tokens * _OUTPUT_PRICE
    logger.info(
        "%s job=%s in=%d out=%d cache_read=%d cache_write=%d est=$%.4f",
        kind, job_id, u.input_tokens, u.output_tokens,
        getattr(u, "cache_read_input_tokens", 0) or 0,
        getattr(u, "cache_creation_input_tokens", 0) or 0,
        cost,
    )


@router.post("/{job_id}/resume")
def generate_resume(job_id: int, refresh: bool = Query(default=False)):
    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")

        if not refresh and job.cached_resume:
            return job.cached_resume

        profile = get_profile(session)
        job_data = {
            "title": job.title,
            "company": job.company.name if job.company else None,
            "location": job.location,
            "description": _cap_description(job.description),
        }

    if not profile:
        raise HTTPException(status_code=400, detail="Profile is empty — fill it in first")

    user_message = _build_profile_block(profile) + f"""

===== JOB =====
Current date: {date.today().isoformat()}
Title: {job_data['title']}
Company: {job_data['company']}
Location: {job_data['location']}
Description:
{job_data['description'] or 'No description provided.'}"""

    client = _client()
    with client.messages.stream(
        model=MODEL,
        max_tokens=RESUME_MAX_TOKENS,
        thinking={"type": "adaptive"},
        system=[{"type": "text", "text": RESUME_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        message = stream.get_final_message()

    _log_usage("resume", job_id, message)

    raw = next(b.text for b in message.content if b.type == "text").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        resume = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Claude returned invalid JSON: {e}")

    resume = _fit_to_one_page(resume, job_id)

    result = {"resume": resume, "job": job_data}

    with get_session() as session:
        job_row = session.scalar(select(Job).where(Job.id == job_id))
        if job_row is not None:
            job_row.cached_resume = result
            job_row.resume_source = "ai_generated"

    return result


@router.post("/{job_id}/cover-letter")
def generate_cover_letter(job_id: int, refresh: bool = Query(default=False)):
    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")

        if not refresh and job.cached_cover_letter:
            return job.cached_cover_letter

        profile = get_profile(session)
        job_data = {
            "title": job.title,
            "company": job.company.name if job.company else None,
            "location": job.location,
            "description": _cap_description(job.description),
        }

    if not profile:
        raise HTTPException(status_code=400, detail="Profile is empty — fill it in first")

    personal = profile.get("personal", {})

    user_message = _build_profile_block(profile) + f"""

===== JOB =====
Title: {job_data['title']}
Company: {job_data['company']}
Location: {job_data['location']}
Description:
{job_data['description'] or 'No description provided.'}"""

    client = _client()
    with client.messages.stream(
        model=MODEL,
        max_tokens=COVER_LETTER_MAX_TOKENS,
        thinking={"type": "adaptive"},
        system=[{"type": "text", "text": COVER_LETTER_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        message = stream.get_final_message()

    _log_usage("cover_letter", job_id, message)

    result = {
        "cover_letter": next(b.text for b in message.content if b.type == "text").strip(),
        "job": job_data,
        "applicant_name": personal.get("name", ""),
    }

    with get_session() as session:
        job_row = session.scalar(select(Job).where(Job.id == job_id))
        if job_row is not None:
            job_row.cached_cover_letter = result

    return result


FORM_ANSWERS_SYSTEM = """You are an expert job application assistant. Draft concise, specific answers to short-answer application questions for the applicant.

Guidelines:
- Answer each question in first person
- Use only facts from the applicant's profile — never invent details, metrics, or experiences
- Each answer should be 3–5 sentences, direct and specific
- Match the question's implied tone: behavioral (STAR-style), technical (concrete details), motivational (genuine interest)
- No hollow filler phrases ("I am passionate about...", "I am a team player", "I am excited to...")
- Return ONLY a JSON array of answer strings, one per question, in the same order as the input, no markdown, no explanation"""

FORM_ANSWERS_MAX_TOKENS = 4096


class FormAnswersRequest(BaseModel):
    questions: list[str]


@router.post("/{job_id}/form-answers")
def generate_form_answers(job_id: int, body: FormAnswersRequest):
    if not body.questions:
        raise HTTPException(status_code=400, detail="No questions provided")

    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")

        profile = get_profile(session)
        job_data = {
            "title": job.title,
            "company": job.company.name if job.company else None,
            "location": job.location,
            "description": _cap_description(job.description),
        }

    if not profile:
        raise HTTPException(status_code=400, detail="Profile is empty — fill it in first")

    questions_block = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(body.questions))

    user_message = _build_profile_block(profile) + f"""

===== JOB =====
Title: {job_data['title']}
Company: {job_data['company']}
Location: {job_data['location']}
Description:
{job_data['description'] or 'No description provided.'}

===== APPLICATION QUESTIONS =====
{questions_block}"""

    client = _client()
    message = client.messages.create(
        model=MODEL,
        max_tokens=FORM_ANSWERS_MAX_TOKENS,
        system=[{"type": "text", "text": FORM_ANSWERS_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_message}],
    )

    _log_usage("form_answers", job_id, message)

    raw = next(b.text for b in message.content if b.type == "text").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        answers = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Claude returned invalid JSON: {e}")

    if not isinstance(answers, list):
        raise HTTPException(status_code=500, detail="Claude returned unexpected response format")

    return {"answers": answers}


def _slug(value: str | None) -> str:
    """Filename-safe token: alphanumerics collapsed, spaces -> underscores."""
    if not value:
        return "Company"
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return cleaned or "Company"


def _docx_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/resume.docx")
def download_resume_docx(job_id: int):
    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        cached = job.cached_resume
        company = job.company.name if job.company else None

    if not cached or not cached.get("resume"):
        raise HTTPException(status_code=404, detail="Resume not generated yet")

    data = build_resume_docx(cached["resume"], cached.get("job"))
    filename = f"TylerTrlicek_Resume_{_slug(company)}.docx"
    return _docx_response(data, filename)


@router.get("/{job_id}/cover-letter.docx")
def download_cover_letter_docx(job_id: int):
    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        cached = job.cached_cover_letter
        company = job.company.name if job.company else None

    if not cached or not cached.get("cover_letter"):
        raise HTTPException(status_code=404, detail="Cover letter not generated yet")

    data = build_cover_letter_docx(cached)
    filename = f"TylerTrlicek_CoverLetter_{_slug(company)}.docx"
    return _docx_response(data, filename)
