"""Reliable one-page measurement for the rendered resume.

`docx_render` produces Word bytes but python-docx cannot tell us how many pages
that is — Word does the layout. Rather than guess with character counts (which
badly under-counts serif wrapping), we simulate Word's line-breaking using the
REAL Times New Roman glyph metrics via Pillow, mirroring the exact spacing
constants used in docx_render. That gives an accurate rendered height, so callers
can deterministically trim content until it fits on one page.

Keep the layout constants here in sync with docx_render.py.
"""

from __future__ import annotations

import copy
import os
import re
import subprocess
import tempfile

from PIL import ImageFont

# LibreOffice binary — the authoritative renderer for page-count validation.
# Falls back gracefully if not installed.
_SOFFICE_PATHS = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/local/bin/soffice",
    "/opt/homebrew/bin/soffice",
]
_SOFFICE = next((p for p in _SOFFICE_PATHS if os.path.exists(p)), None)


def libreoffice_page_count(docx_bytes: bytes) -> int | None:
    """Render docx via LibreOffice headless → PDF, return page count.

    Returns None when LibreOffice isn't installed (callers fall back to
    the font-metric estimator). Raises nothing — any error returns None."""
    if _SOFFICE is None:
        return None
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            docx_path = os.path.join(tmpdir, "resume.docx")
            with open(docx_path, "wb") as f:
                f.write(docx_bytes)
            subprocess.run(
                [_SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", tmpdir, docx_path],
                capture_output=True,
                timeout=45,
                check=True,
            )
            pdf_path = os.path.join(tmpdir, "resume.pdf")
            if not os.path.exists(pdf_path):
                return None
            with open(pdf_path, "rb") as f:
                pdf = f.read()
            # /Type /Page entries (leaf nodes only — exclude /Pages parent nodes)
            count = len(re.findall(rb"/Type\s*/Page[^s]", pdf))
            return max(count, 1)
    except Exception:
        return None

_TNR = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
_TNR_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"

# Letter page, 0.75" margins.
USABLE_W = 504.0          # 7.0in usable text width (pt)
USABLE_H = 684.0          # 9.5in usable text height (pt)
BULLET_W = 492.0          # List Bullet: no explicit hanging indent; 492pt calibrated via qlmanage
PAGE_TARGET = 670.0       # trim target: fill the page, keep a small safety margin under USABLE_H

# Word renders Times New Roman single-spaced at ~1.15em; our line_spacing=1.04.
_LH = 1.15
_SPACING = 1.04

_cache: dict[tuple[float, bool], ImageFont.FreeTypeFont] = {}


def _font(size: float, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (round(size), bold)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(_TNR_BOLD if bold else _TNR, round(size))
    return _cache[key]


def _wrap_lines(text: str, size: float, width: float, bold: bool = False) -> int:
    """Greedy word-wrap using real glyph widths; returns the line count."""
    words = str(text or "").split()
    if not words:
        return 1
    f = _font(size, bold)
    lines, cur = 1, ""
    for w in words:
        trial = w if not cur else f"{cur} {w}"
        if f.getlength(trial) <= width:
            cur = trial
        else:
            lines += 1
            cur = w
    return lines


def _line_h(size: float, spacing: float = _SPACING) -> float:
    return size * _LH * spacing


def _contact_line(contact: dict) -> str:
    parts = [contact.get(k) for k in ("email", "phone", "location", "linkedin", "github")]
    return " | ".join(p for p in parts if p)


def estimate_height(resume: dict, spacing: float = _SPACING) -> float:
    """Estimated rendered height (pt) of the resume as docx_render lays it out.

    `spacing` is the line-spacing multiple (Word applies it to text-line height only;
    the fixed paragraph gaps below do not scale). Height is linear in `spacing`, which
    is what lets line_spacing_to_fill() solve exactly for a full page."""
    def lh(size: float) -> float:
        return _line_h(size, spacing)

    total = 0.0

    # Header: name (22 bold) + contact (9)
    total += lh(22) + 2
    total += _wrap_lines(_contact_line(resume.get("contact", {}) or {}), 9, USABLE_W) * lh(9) + 6

    def heading() -> float:
        # space_before 8 + heading line (12) + space_after 2 + border
        return 8 + lh(12) + 2 + 1

    # Education
    education = resume.get("education") or []
    if education:
        total += heading()
        for ed in education:
            total += lh(11)                # school / location
            total += lh(11)                # degree / graduation
            if ed.get("gpa"):
                total += lh(10)
            if ed.get("coursework"):
                total += _wrap_lines(f"Relevant Coursework: {ed['coursework']}", 10, USABLE_W) * lh(10) + 2

    # Technical Skills
    skills = resume.get("skills") or []
    if skills:
        total += heading()
        for s in skills:
            line = f"{s.get('category','')}: {s.get('items','')}" if isinstance(s, dict) else s
            total += _wrap_lines(line, 11, USABLE_W) * lh(11) + 1

    # Experience
    experience = resume.get("experience") or []
    if experience:
        total += heading()
        for e in experience:
            total += 3 + lh(11)            # entry head (space_before 3)
            for b in e.get("bullets", []) or []:
                total += _wrap_lines(b, 11, BULLET_W) * lh(11)

    # Projects
    projects = resume.get("projects") or []
    if projects:
        total += heading()
        for p in projects:
            total += 3 + lh(11)
            for b in p.get("bullets", []) or []:
                total += _wrap_lines(b, 11, BULLET_W) * lh(11)
            if not (p.get("bullets") or []) and p.get("description"):
                total += _wrap_lines(p["description"], 11, USABLE_W) * lh(11) + 2

    return total


def line_spacing_to_fill(resume: dict, target: float, base: float = _SPACING, max_ls: float = 1.5) -> float:
    """Solve for the line spacing that makes the content fill `target` height. Height is
    linear in spacing, so interpolate exactly between base and max. Capped at max_ls so a
    very sparse resume never looks double-spaced (small bottom margin then, not overflow)."""
    h_base = estimate_height(resume, base)
    if h_base >= target:
        return base
    h_max = estimate_height(resume, max_ls)
    if h_max <= target:
        return max_ls
    return base + (target - h_base) * (max_ls - base) / (h_max - h_base)


def wrapping_skill_lines(resume: dict) -> list[str]:
    """Skill category lines that would wrap to a 2nd line (should be single-line)."""
    out = []
    for s in resume.get("skills") or []:
        if not isinstance(s, dict):
            continue
        line = f"{s.get('category','')}: {s.get('items','')}"
        if _wrap_lines(line, 11, USABLE_W) > 1:
            out.append(line)
    return out


def fits_one_page(resume: dict, target: float = PAGE_TARGET) -> bool:
    return estimate_height(resume) <= target


def trim_to_one_page(resume: dict, target: float = PAGE_TARGET) -> tuple[dict, bool]:
    """Deterministically remove the lowest-value content until the resume fits on
    one page. Guarantees the result is <= target when enough is trimmable. Returns
    (possibly-trimmed copy, was_trimmed). Trim order: coursework -> weakest bullets
    (respecting per-section minimums) -> drop the last project."""
    r = copy.deepcopy(resume)
    if estimate_height(r) <= target:
        return r, False

    # 1. Drop coursework (lowest value).
    for ed in r.get("education", []) or []:
        if ed.get("coursework") and estimate_height(r) > target:
            ed.pop("coursework", None)

    # 2. Remove the last bullet from whichever section has the most bullets above
    #    its minimum, until it fits. Experience keeps >=3, projects keep >=2.
    def trimmable() -> list[list]:
        secs = []
        for e in r.get("experience", []) or []:
            b = e.get("bullets") or []
            if len(b) > 3:
                secs.append(b)
        for p in r.get("projects", []) or []:
            b = p.get("bullets") or []
            if len(b) > 2:
                secs.append(b)
        return secs

    while estimate_height(r) > target:
        secs = trimmable()
        if not secs:
            break
        max(secs, key=len).pop()

    # 3. Still over? Drop trailing projects (keep at least one).
    projects = r.get("projects") or []
    while estimate_height(r) > target and len(projects) > 1:
        projects.pop()

    return r, True
