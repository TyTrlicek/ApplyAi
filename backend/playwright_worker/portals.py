"""Portal detection — no DB imports, safe to import in tests."""

from __future__ import annotations


def detect_portal(url: str | None) -> str:
    if not url:
        return "unsupported"
    u = url.lower()
    if "linkedin.com" in u:
        return "linkedin"
    if "myworkdayjobs.com" in u or "workday.com" in u:
        return "workday"
    if "boards.greenhouse.io" in u or "greenhouse.io" in u:
        return "greenhouse"
    if "jobs.lever.co" in u or "lever.co" in u:
        return "lever"
    return "unsupported"
