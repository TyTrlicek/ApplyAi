"""Flatten the Master Applicant Profile (MAP) into a fill-ready shape.

The autofill content script consumes this instead of reimplementing MAP-shape
knowledge in JS. All the derivation logic (name splitting, years of experience,
city/state parsing) lives here so there's one source of truth.

Ty is a US citizen and needs no visa sponsorship — those answers are constant.
"""

from __future__ import annotations

import re
from datetime import date, datetime


def _parse_month(s: str) -> date | None:
    s = (s or "").strip()
    for fmt in ("%B %Y", "%b %Y", "%Y-%m", "%Y-%m-%d", "%Y", "%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _years_of_experience(experience: list[dict]) -> int:
    total_months = 0
    today = date.today()
    for exp in experience:
        start = _parse_month(exp.get("start") or "")
        end_str = (exp.get("end") or "").strip()
        end = _parse_month(end_str) if end_str else today
        if start and end and end >= start:
            total_months += (end.year - start.year) * 12 + (end.month - start.month)
    return max(1, total_months // 12)


def _split_name(full: str) -> tuple[str, str]:
    parts = (full or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[-1]


def _split_location(loc: str) -> tuple[str, str]:
    """'Dallas, TX' -> ('Dallas', 'TX'). Strips trailing notes like
    ' — Open to Relocation' or ' (Remote)'. Missing state -> ('', '')."""
    loc = (loc or "").strip()
    # Drop a trailing free-text note: " - x", " — x", " (x)".
    loc = re.split(r"\s+[—–-]\s+|\s*\(", loc)[0].strip()
    if "," in loc:
        city, _, rest = loc.partition(",")
        state = rest.strip().split(",")[0].strip()
        return city.strip(), state
    return loc, ""


def build_autofill_profile(profile: dict) -> dict:
    """MAP dict -> flat dict the content script fills forms from."""
    personal = profile.get("personal", {}) or {}
    experience = profile.get("experience", []) or []
    education = profile.get("education", {}) or {}
    resume_file = profile.get("resumeFile") or {}

    full_name = personal.get("name", "") or ""
    first, last = _split_name(full_name)
    city, state = _split_location(personal.get("location", ""))
    clean_location = ", ".join(p for p in (city, state) if p) or (personal.get("location", "") or "")

    current = experience[0] if experience else {}

    return {
        "firstName": first,
        "lastName": last,
        "fullName": full_name,
        "email": personal.get("email", "") or "",
        "phone": personal.get("phone", "") or "",
        "location": clean_location,
        "city": city,
        "state": state,
        "country": personal.get("country", "") or "United States",
        "zip": personal.get("zip", "") or "",
        "street": personal.get("street", "") or "",
        "linkedin": personal.get("linkedin", "") or "",
        "github": personal.get("github", "") or "",
        "website": personal.get("website", "") or personal.get("github", "") or "",
        # Constant for this user.
        "workAuthorized": True,
        "needsSponsorship": False,
        "requiresSponsorship": False,
        "usCitizen": True,
        "yearsExperience": str(_years_of_experience(experience)),
        "currentEmployer": current.get("company", "") or "",
        "currentTitle": current.get("title", "") or "",
        "school": education.get("school", "") or "",
        "degree": education.get("degree", "") or "",
        "fieldOfStudy": education.get("field", "") or "",
        "graduation": education.get("graduation", "") or "",
        "gpa": education.get("gpa", "") or "",
        "resumeFilename": resume_file.get("filename") or "",
        "hasResume": bool(resume_file.get("path")),
    }
