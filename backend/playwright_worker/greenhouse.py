"""Greenhouse job application Playwright handler.

Greenhouse renders a single scrollable form (no multi-step navigation). Every
field on the hosted `job-boards.greenhouse.io` form is paired with a label
whose id is `<fieldId>-label` — a stable, product-wide pattern independent of
the per-job custom question ids, which makes generic question discovery
reliable without per-company selectors.

Flow:
  1. Navigate to job URL (the application page — Greenhouse's hosted board
     serves the form directly, no separate "Apply" click needed)
  2. Fill known standard fields (name, email, phone, location, resume) and
     best-effort education fields
  3. Walk every remaining labeled question: known fields deterministically
     (including EEO dropdowns, declined), free text via AI
  4. Stop before Submit application -> wait for human signal
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page

from playwright_worker import field_mapper

log = logging.getLogger("applyai.greenhouse")

# ── Selectors ──────────────────────────────────────────────────────────────────

_FIRST_NAME = "#first_name"
_LAST_NAME = "#last_name"
_EMAIL = "#email"
_PHONE = "#phone"
_LOCATION = "#candidate-location"
_RESUME_UPLOAD = "#resume"

_EDUCATION_FIELDS = {
    "school--0": "school",
    "degree--0": "degree",
    "discipline--0": "field",
}

_SUBMIT_BTN = "button:has-text('Submit application')"

_KNOWN_FIELD_IDS = {
    "first_name",
    "last_name",
    "email",
    "phone",
    "candidate-location",
    "resume",
    *_EDUCATION_FIELDS.keys(),
}

_DECLINE_PHRASES = ["prefer not", "decline", "i do not want", "not specified", "choose not", "don't wish"]


class GreenhouseApply:
    def __init__(
        self,
        page: Page,
        job_id: int,
        job_url: str,
        profile: dict,
        resume_path: Path | None,
        cover_letter_path: Path | None,
        ai_answer_fn: Callable[[str], str] | None,
        write_state_fn: Callable,
        read_signal_fn: Callable,
    ):
        self.page = page
        self.job_id = job_id
        self.job_url = job_url
        self.profile = profile
        self.resume_path = resume_path
        self.cover_letter_path = cover_letter_path
        self.ai_answer_fn = ai_answer_fn
        self._write_state = write_state_fn
        self._read_signal = read_signal_fn
        self.filled_fields: list[dict] = []
        self._p = profile.get("personal", {})

    # ── Entry point ────────────────────────────────────────────────────────────

    def run(self) -> None:
        log.info("Navigating to Greenhouse job: %s", self.job_url)
        self._write_state("running", step="navigating")
        self.page.goto(self.job_url, wait_until="domcontentloaded", timeout=30_000)
        self.page.wait_for_timeout(2000)

        if self._cancelled():
            return

        self._write_state("running", step="filling")
        self._fill_standard_fields()
        self._fill_education()
        self._fill_remaining_questions()

        if self._cancelled():
            return

        self._write_state("waiting_for_review", step="review", filled_fields=self.filled_fields)
        self._wait_for_signal(expected="submit")

    # ── Standard fields ─────────────────────────────────────────────────────────

    def _fill_standard_fields(self) -> None:
        personal = self._p
        name = personal.get("name", "")

        self._fill_if_empty(_FIRST_NAME, field_mapper._first_name(name), "First name")
        self._fill_if_empty(_LAST_NAME, field_mapper._last_name(name), "Last name")
        self._fill_if_empty(_EMAIL, personal.get("email", ""), "Email")
        self._fill_if_empty(_PHONE, personal.get("phone", ""), "Phone")
        self._fill_if_empty(_LOCATION, personal.get("location", ""), "Location")

        if self.resume_path and self.resume_path.exists():
            try:
                upload = self.page.query_selector(_RESUME_UPLOAD)
                if upload:
                    upload.set_input_files(str(self.resume_path))
                    self._record("Resume", self.resume_path.name, ai=False)
                    log.info("Uploaded resume: %s", self.resume_path.name)
                    self.page.wait_for_timeout(1500)
            except Exception as e:
                log.warning("Resume upload failed: %s", e)

    def _fill_education(self) -> None:
        education = self.profile.get("education", {})
        if not education:
            return
        for field_id, profile_key in _EDUCATION_FIELDS.items():
            value = education.get(profile_key, "")
            self._fill_if_empty(f"#{field_id}", value, profile_key)

    # ── Generic remaining questions ─────────────────────────────────────────────

    def _fill_remaining_questions(self) -> None:
        for label in self.page.query_selector_all('label[id$="-label"]'):
            try:
                label_id = label.get_attribute("id") or ""
                field_id = label_id[: -len("-label")]
                if not field_id or field_id in _KNOWN_FIELD_IDS:
                    continue
                target = self.page.query_selector(f"#{field_id}")
                if not target or not target.is_visible():
                    continue
                question = label.inner_text().strip().rstrip("*").strip()
                if not question:
                    continue
                tag = target.evaluate("el => el.tagName.toLowerCase()")
                if tag == "select":
                    self._fill_select_question(target, question)
                elif tag in ("input", "textarea"):
                    input_type = target.get_attribute("type") or "text"
                    if input_type in ("radio", "checkbox", "file"):
                        continue
                    self._fill_text_question(target, question)
            except Exception as e:
                log.warning("Question fill failed: %s", e)

    def _fill_select_question(self, select, question: str) -> None:
        try:
            options = select.query_selector_all("option")
            option_texts = [o.inner_text().strip() for o in options]

            target_text = None
            for text in option_texts:
                if any(p in text.lower() for p in _DECLINE_PHRASES):
                    target_text = text
                    break

            if not target_text:
                value = field_mapper.get_known_value(question, self.profile)
                if value:
                    v = value.strip().lower()
                    # Exact match first, then whole-word containment — plain
                    # substring is unsafe for short values like "Yes"/"No"
                    # (e.g. "No" would falsely match inside "November").
                    for text in option_texts:
                        if text.strip().lower() == v:
                            target_text = text
                            break
                    if not target_text:
                        for text in option_texts:
                            if re.search(rf"\b{re.escape(v)}\b", text.lower()):
                                target_text = text
                                break

            if target_text:
                select.select_option(label=target_text)
                self._record(question, target_text, ai=False)
                log.info("Select '%s' -> '%s'", question[:50], target_text)
        except Exception as e:
            log.warning("Select question '%s' failed: %s", question[:50], e)

    def _fill_text_question(self, target, question: str) -> None:
        try:
            current = target.input_value()
            if current and current.strip():
                self._record(question, current, ai=False)
                return
        except Exception:
            pass

        value = field_mapper.get_known_value(question, self.profile)
        if value:
            target.fill(value)
            self._record(question, value, ai=False)
            return

        if self.ai_answer_fn:
            answer = self.ai_answer_fn(question)
            if answer:
                target.fill(answer)
                self._record(question, answer, ai=True)

    # ── Signal handling ────────────────────────────────────────────────────────

    def _wait_for_signal(self, expected: str) -> None:
        import time

        log.info("Waiting for signal: %s", expected)
        while True:
            signal = self._read_signal()
            if signal == expected:
                log.info("Got signal: %s", signal)
                if expected == "submit":
                    btn = self.page.query_selector(_SUBMIT_BTN)
                    if btn and btn.is_visible():
                        btn.click()
                        self.page.wait_for_timeout(2000)
                        self._write_state("submitted", step="done", filled_fields=self.filled_fields)
                        log.info("Submitted")
                    else:
                        self._write_state("error", error="Submit button disappeared")
                return
            elif signal == "cancel":
                self._write_state("cancelled", step="cancelled", filled_fields=self.filled_fields)
                return
            time.sleep(0.5)

    def _cancelled(self) -> bool:
        if self._read_signal() == "cancel":
            self._write_state("cancelled", step="cancelled", filled_fields=self.filled_fields)
            return True
        return False

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _fill_if_empty(self, selector: str, value: str, field_name: str) -> None:
        if not value:
            return
        try:
            inp = self.page.query_selector(selector)
            if not inp or not inp.is_visible():
                return
            current = inp.input_value()
            if current and current.strip():
                self._record(field_name, current, ai=False)
                return
            inp.fill(value)
            self._record(field_name, value, ai=False)
            log.info("Filled '%s' -> '%s'", field_name, value[:40])
        except Exception as e:
            log.warning("Could not fill '%s': %s", field_name, e)

    def _record(self, field: str, value: str, *, ai: bool) -> None:
        for existing in self.filled_fields:
            if existing["field"] == field:
                existing["value"] = value
                existing["ai_generated"] = ai
                return
        self.filled_fields.append({"field": field, "value": value, "ai_generated": ai})
