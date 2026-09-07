"""Map form field label text to MAP profile values.

Returns a known string value for recognized fields, or None for unknown fields
(which go to the AI answer endpoint).
"""

from __future__ import annotations

import re
from datetime import date, datetime


def _parse_date(s: str) -> date | None:
    s = s.strip()
    for fmt in ("%B %Y", "%b %Y", "%Y-%m", "%Y-%m-%d", "%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _years_of_experience(experience: list[dict]) -> str:
    total_months = 0
    today = date.today()
    for exp in experience:
        start = _parse_date(exp.get("start") or "")
        end_str = exp.get("end") or ""
        end = _parse_date(end_str) if end_str.strip() else today
        if start and end and end >= start:
            total_months += (end.year - start.year) * 12 + (end.month - start.month)
    years = total_months // 12
    return str(max(1, years))


def _first_name(full_name: str) -> str:
    parts = full_name.strip().split()
    return parts[0] if parts else ""


def _last_name(full_name: str) -> str:
    parts = full_name.strip().split()
    return parts[-1] if len(parts) > 1 else ""


def _city(location: str) -> str:
    return location.split(",")[0].strip() if "," in location else location.strip()


def _digits_only(phone: str) -> str:
    return re.sub(r"[^\d+]", "", phone)


def get_known_value(label: str, profile: dict) -> str | None:
    """Return a MAP-derived value for a recognized field label, or None if unknown."""
    q = label.lower().strip()
    personal = profile.get("personal", {})
    experience = profile.get("experience", [])

    name = personal.get("name", "")
    email = personal.get("email", "")
    phone = personal.get("phone", "")
    location = personal.get("location", "")
    street = personal.get("street", "")
    zip_code = personal.get("zip", "")
    linkedin = personal.get("linkedin", "")
    github = personal.get("github", "")
    website = personal.get("website", "")

    # Name
    if re.search(r"\bfirst\s*name\b", q):
        return _first_name(name)
    if re.search(r"\blast\s*name\b", q):
        return _last_name(name)
    if re.search(r"\b(full[\s_-]?name|your[\s_-]?name|^name$)\b", q) and "last" not in q and "first" not in q:
        return name

    # Contact
    if re.search(r"\bemail\b", q):
        return email
    if re.search(r"\b(phone|mobile|telephone|tel|cell)\b", q):
        return _digits_only(phone)

    # Location
    if re.search(r"\b(zip|postal)\b", q):
        return zip_code
    if re.search(r"\baddress\b", q) and "email" not in q:
        return street
    if re.search(r"\b(city|location|where are you)\b", q):
        return _city(location)

    # Social
    if re.search(r"\blinkedin\b", q):
        return linkedin
    if re.search(r"\bgithub\b", q):
        return github
    if re.search(r"\b(website|portfolio|personal\s*url|personal\s*site)\b", q):
        return website or github

    # Current employer
    if re.search(r"\b(current\s+(company|employer)|most\s+recent\s+employer)\b", q):
        return experience[0].get("company", "") if experience else None

    # Experience
    if re.search(r"\b(years?\s+of\s+experience|years?\s+experience|how\s+many\s+years)\b", q):
        return _years_of_experience(experience)

    # Work auth / citizenship — Ty is a US citizen
    if re.search(r"\b(authorized|authorised|legally\s+authorized|right\s+to\s+work|work\s+auth|eligible\s+to\s+work)\b", q):
        return "Yes"
    if re.search(r"\b(us\s*citizen|united\s+states\s+citizen|american\s+citizen)\b", q):
        return "Yes"

    # Sponsorship — does not need it
    if re.search(r"\b(require\s+sponsor|need\s+sponsor|visa\s+sponsor|sponsorship|require\s+visa)\b", q):
        return "No"

    return None


def pick_select_option(label: str, options: list[str], profile: dict) -> str | None:
    """Given a dropdown label and its option texts, return the best matching option text."""
    value = get_known_value(label, profile)
    if not value:
        return None
    v_lower = value.lower()
    # Exact match first
    for opt in options:
        if opt.lower() == v_lower:
            return opt
    # Partial match
    for opt in options:
        if v_lower in opt.lower() or opt.lower() in v_lower:
            return opt
    return None
