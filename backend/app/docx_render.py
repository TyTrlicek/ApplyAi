"""Render resume / cover-letter JSON into ATS-optimal .docx bytes.

Styled after the "Jake's Resume" LaTeX template (the FAANG-standard single-column
serif layout): Times New Roman body, 0.75" margins, small horizontal rule under each
uppercase section heading, name large + bold + centered. Single column, no tables or
graphics (ATS-safe). Section order for a new grad: Education -> Technical Skills ->
Experience -> Projects.
"""

from __future__ import annotations

import io
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

from app.page_fit import USABLE_H

BODY_FONT = "Times New Roman"
BODY_SIZE = Pt(11)
NAME_SIZE = Pt(22)
HEADING_SIZE = Pt(12)
MARGIN = 0.75  # inches


def _new_document() -> Document:
    doc = Document()

    # Base style. python-docx's default Normal style ships with 8pt space-after
    # and 1.08 line spacing on EVERY paragraph — that is the source of the loose,
    # whitespace-heavy look. Zero it out globally and add spacing deliberately.
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = BODY_SIZE
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.04

    # List Bullet carries its own spacing too — tighten it to match.
    try:
        lb = doc.styles["List Bullet"]
        lb.font.name = BODY_FONT
        lb.font.size = BODY_SIZE
        lb.paragraph_format.space_before = Pt(0)
        lb.paragraph_format.space_after = Pt(0)
        lb.paragraph_format.line_spacing = 1.04
    except KeyError:
        pass

    # Disable "contextual spacing" on Normal + List Bullet. Otherwise Word/QuickLook
    # suppress space-after BETWEEN same-style paragraphs (e.g. consecutive bullets),
    # which silently swallows about half of the elastic page-fill spacing.
    for _name in ("Normal", "List Bullet"):
        try:
            _disable_contextual_spacing(doc.styles[_name])
        except KeyError:
            pass

    # 0.75" margins all sides
    from docx.shared import Inches

    for section in doc.sections:
        section.top_margin = Inches(MARGIN)
        section.bottom_margin = Inches(MARGIN)
        section.left_margin = Inches(MARGIN)
        section.right_margin = Inches(MARGIN)

    return doc


def _disable_contextual_spacing(style) -> None:
    """Force w:contextualSpacing=0 on a style so space-after is honored between
    consecutive same-style paragraphs (Word suppresses it by default for lists)."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    pPr = style.element.get_or_add_pPr()
    cs = pPr.find(qn("w:contextualSpacing"))
    if cs is None:
        cs = OxmlElement("w:contextualSpacing")
        pPr.append(cs)
    cs.set(qn("w:val"), "0")


def _short_location(location: str | None) -> str:
    """Header wants just 'City, State' — strip any '— Open to Relocation' etc."""
    if not location:
        return ""
    for sep in ("—", " - ", " – ", "(", "|"):
        location = location.split(sep)[0]
    return location.strip().rstrip(",").strip()


def _fill_page(doc, resume: dict) -> None:
    """No-op: fill was disabled after discovering that LibreOffice (and Word) render
    the base content at ~97% of the page already — adding any extra spacing causes
    overflow to page 2 in the actual viewer. The qlmanage Quick Look renderer gave
    misleadingly low fill estimates (~89%) because its Times New Roman metrics differ
    from the real Word/LibreOffice layout engine. LibreOffice validation in the
    generate pipeline is the authoritative page-count check."""
    return


def _section_heading(doc: Document, text: str, extra_before: float = 0.0) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8 + extra_before)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text.upper())
    run.bold = True
    run.font.size = HEADING_SIZE
    run.font.name = BODY_FONT
    # Bottom border under the heading (a horizontal rule, ATS-safe)
    _add_bottom_border(p)


def _add_bottom_border(paragraph) -> None:
    """Add a thin bottom border to a paragraph (section-header underline)."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "999999")
    p_bdr.append(bottom)
    p_pr.append(p_bdr)


def build_resume_docx(resume: dict[str, Any], job: dict[str, Any] | None = None) -> bytes:
    doc = _new_document()

    # ── Header: name + contact ──
    name_p = doc.add_paragraph()
    name_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    name_p.paragraph_format.space_after = Pt(2)
    name_run = name_p.add_run(resume.get("name", ""))
    name_run.bold = True
    name_run.font.size = NAME_SIZE
    name_run.font.name = BODY_FONT

    contact = resume.get("contact", {}) or {}
    contact_parts = [
        contact.get("email"),
        contact.get("phone"),
        _short_location(contact.get("location")),
        contact.get("linkedin"),
        contact.get("github"),
    ]
    contact_parts = [c for c in contact_parts if c]
    if contact_parts:
        c_p = doc.add_paragraph()
        c_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c_p.paragraph_format.space_after = Pt(6)
        c_run = c_p.add_run(" | ".join(contact_parts))
        c_run.font.size = Pt(9)
        c_run.font.color.rgb = RGBColor(0x22, 0x22, 0x22)

    # ── Education ── (leads, per Jake's Resume template for new grads)
    education = resume.get("education") or []
    if education:
        _section_heading(doc, "Education")
        for ed in education:
            # School (bold) left, location right
            head = doc.add_paragraph()
            head.paragraph_format.space_after = Pt(0)
            head.add_run(ed.get("school", "")).bold = True
            if ed.get("location"):
                head.add_run("\t")
                loc = head.add_run(ed["location"])
                loc.font.size = Pt(10)
                _right_tab(head)
            # Degree (italic) left, graduation right
            deg_p = doc.add_paragraph()
            deg_p.paragraph_format.space_after = Pt(0)
            degree = ed.get("degree", "")
            field = f" in {ed.get('field', '')}" if ed.get("field") else ""
            dr = deg_p.add_run(f"{degree}{field}")
            dr.italic = True
            if ed.get("graduation"):
                deg_p.add_run("\t")
                g_run = deg_p.add_run(ed["graduation"])
                g_run.italic = True
                g_run.font.size = Pt(10)
                _right_tab(deg_p)
            if ed.get("gpa"):
                gpa = ed["gpa"] if "/" in str(ed["gpa"]) else f"{ed['gpa']} / 4.0"
                gpa_p = doc.add_paragraph()
                gpa_p.paragraph_format.space_after = Pt(0)
                gpa_p.add_run(f"GPA: {gpa}").font.size = Pt(10)
            if ed.get("coursework"):
                cw_p = doc.add_paragraph()
                cw_p.paragraph_format.space_after = Pt(2)
                cw_p.add_run(f"Relevant Coursework: {ed['coursework']}").font.size = Pt(10)

    # ── Technical Skills ── (categorized: one line per category with a bold label)
    skills = resume.get("skills") or []
    if skills:
        _section_heading(doc, "Technical Skills")
        if isinstance(skills[0], dict):
            for group in skills:
                cat = group.get("category", "")
                items = group.get("items", "")
                if not items:
                    continue
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(1)
                p.add_run(f"{cat}: ").bold = True
                p.add_run(items)
        else:  # backward-compat: flat list of strings
            doc.add_paragraph().add_run(", ".join(skills))

    # ── Experience ──
    experience = resume.get("experience") or []
    if experience:
        _section_heading(doc, "Experience")
        for e in experience:
            head = doc.add_paragraph()
            head.paragraph_format.space_before = Pt(3)
            head.paragraph_format.space_after = Pt(0)
            title_run = head.add_run(f"{e.get('title', '')} — {e.get('company', '')}")
            title_run.bold = True
            dates = f"{e.get('start', '')} – {e.get('end', '') or 'Present'}"
            # right-aligned dates via a tab stop
            head.add_run("\t")
            d_run = head.add_run(dates)
            d_run.font.size = Pt(10)
            d_run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
            _right_tab(head)
            for b in e.get("bullets", []) or []:
                bp = doc.add_paragraph(style="List Bullet")
                bp.paragraph_format.space_after = Pt(0)
                bp.add_run(b)

    # ── Projects ──
    projects = resume.get("projects") or []
    if projects:
        _section_heading(doc, "Projects")
        for p in projects:
            head = doc.add_paragraph()
            head.paragraph_format.space_before = Pt(3)
            head.paragraph_format.space_after = Pt(0)
            name_run = head.add_run(p.get("name", ""))
            name_run.bold = True
            if p.get("url"):
                u_run = head.add_run(f"  {p['url']}")
                u_run.font.size = Pt(9)
                u_run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
            bullets = p.get("bullets") or []
            if bullets:
                for b in bullets:
                    bp = doc.add_paragraph(style="List Bullet")
                    bp.paragraph_format.space_after = Pt(0)
                    bp.add_run(b)
            elif p.get("description"):  # backward-compat
                dp = doc.add_paragraph()
                dp.paragraph_format.space_after = Pt(2)
                dp.add_run(p["description"])

    _fill_page(doc, resume)  # distribute slack as uniform spacing to fill the page

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _right_tab(paragraph) -> None:
    """Add a right-aligned tab stop at the right margin so dates sit flush right."""
    from docx.shared import Inches
    from docx.enum.text import WD_TAB_ALIGNMENT

    # 8.5in page - 0.75in*2 margins = 7.0in usable width
    paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(7.0), WD_TAB_ALIGNMENT.RIGHT)


def build_cover_letter_docx(data: dict[str, Any]) -> bytes:
    doc = _new_document()

    name_p = doc.add_paragraph()
    name_p.paragraph_format.space_after = Pt(2)
    name_run = name_p.add_run(data.get("applicant_name", ""))
    name_run.bold = True
    name_run.font.size = Pt(16)

    job = data.get("job", {}) or {}
    meta_bits = [job.get("title"), job.get("company")]
    meta_bits = [m for m in meta_bits if m]
    if meta_bits:
        meta_p = doc.add_paragraph()
        meta_p.paragraph_format.space_after = Pt(12)
        m_run = meta_p.add_run("  ·  ".join(meta_bits))
        m_run.font.size = Pt(10)
        m_run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    body = data.get("cover_letter", "") or ""
    for para in [p.strip() for p in body.split("\n\n") if p.strip()]:
        bp = doc.add_paragraph()
        bp.paragraph_format.space_after = Pt(10)
        bp.add_run(para)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
