"""Ashby job application Playwright handler.

Ashby renders a single-page application form (no multi-step navigation like
Workday). Every field — standard and custom — carries the stable, product-wide
class `ashby-application-form-question-title` on its label, and standard
fields use predictable ids (`_systemfield_name`, `currentLocation`, etc.)
that are the same across every company's Ashby-hosted job board.

Flow:
  1. Navigate to job URL, click into the Application tab if not already there
  2. Fill known standard fields (name, email, location, phone, resume, links)
  3. Walk every remaining labeled question: known fields deterministically,
     free text via AI
  4. Stop before Submit Application → wait for human signal (also lets the
     human clear the reCAPTCHA checkbox Ashby shows on most postings)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, TimeoutError as PWTimeout

from playwright_worker import field_mapper

log = logging.getLogger("applyai.ashby")

# ── Selectors ──────────────────────────────────────────────────────────────────

_APPLICATION_TAB = "a:has-text('Application')"

_NAME = "#_systemfield_name"
_EMAIL = "#_systemfield_email"
_CURRENT_COMPANY = "#currentCompany"
_CURRENT_LOCATION = "#currentLocation"
_PHONE = "#phone"
_RESUME_UPLOAD = "#_systemfield_resume"
_LINKEDIN = "#LinkedIn"
_GITHUB = "#GitHub"
_PORTFOLIO = "#Portfolio"

_QUESTION_TITLE = "label.ashby-application-form-question-title"
_RADIO_GROUP = "fieldset.ashby-application-form-input-radio-group"
_SUBMIT_BTN = "button.ashby-application-form-submit-button"

_KNOWN_FIELD_IDS = {
    "_systemfield_name",
    "_systemfield_email",
    "currentCompany",
    "currentLocation",
    "phone",
    "_systemfield_resume",
    "LinkedIn",
    "GitHub",
    "Portfolio",
    # Structured optional link fields we have no profile data for — better
    # left blank than AI-filled with an apologetic paragraph of prose.
    "Twitter",
    "Other",
}

_DECLINE_PHRASES = ["prefer not", "decline", "i do not want", "not specified", "choose not"]


class AshbyApply:
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
        log.info("Navigating to Ashby job: %s", self.job_url)
        self._write_state("running", step="navigating")
        self.page.goto(self.job_url, wait_until="domcontentloaded", timeout=30_000)
        self.page.wait_for_timeout(2000)

        if self._cancelled():
            return

        self._ensure_on_application_tab()
        if self._cancelled():
            return

        self._write_state("running", step="filling")
        self._fill_standard_fields()
        self._fill_custom_questions()

        if self._cancelled():
            return

        self._write_state("waiting_for_review", step="review", filled_fields=self.filled_fields)
        self._wait_for_signal(expected="submit")

    def _ensure_on_application_tab(self) -> None:
        if self.page.query_selector(_NAME):
            return
        try:
            tab = self.page.wait_for_selector(_APPLICATION_TAB, timeout=5_000)
            if tab:
                tab.click()
                self.page.wait_for_timeout(1500)
        except PWTimeout:
            log.info("No separate Application tab found — assuming already on it")

    # ── Standard fields ─────────────────────────────────────────────────────────

    def _fill_standard_fields(self) -> None:
        personal = self._p
        experience = self.profile.get("experience", [])

        self._fill_if_empty(_NAME, personal.get("name", ""), "Name")
        self._fill_if_empty(_EMAIL, personal.get("email", ""), "Email")
        self._fill_if_empty(_CURRENT_LOCATION, personal.get("location", ""), "Current location")
        self._fill_if_empty(_PHONE, personal.get("phone", ""), "Phone")

        if experience:
            self._fill_if_empty(_CURRENT_COMPANY, experience[0].get("company", ""), "Current company")

        self._fill_if_empty(_LINKEDIN, personal.get("linkedin", ""), "LinkedIn")
        self._fill_if_empty(_GITHUB, personal.get("github", ""), "GitHub")
        website = personal.get("website", "") or personal.get("github", "")
        self._fill_if_empty(_PORTFOLIO, website, "Portfolio")

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

    # ── Custom questions ────────────────────────────────────────────────────────

    def _fill_custom_questions(self) -> None:
        for fieldset in self.page.query_selector_all(_RADIO_GROUP):
            try:
                self._fill_radio_question(fieldset)
            except Exception as e:
                log.warning("Radio question failed: %s", e)

        for label in self.page.query_selector_all(_QUESTION_TITLE):
            try:
                target_id = label.get_attribute("for")
                if not target_id or target_id in _KNOWN_FIELD_IDS:
                    continue
                target = self.page.query_selector(f"#{_css_escape(target_id)}")
                if not target or not target.is_visible():
                    continue
                tag = target.evaluate("el => el.tagName.toLowerCase()")
                if tag not in ("input", "textarea"):
                    continue
                input_type = target.get_attribute("type") or "text"
                if input_type in ("radio", "checkbox", "file"):
                    continue
                self._fill_text_question(target, label.inner_text().strip())
            except Exception as e:
                log.warning("Question fill failed: %s", e)

    def _fill_radio_question(self, fieldset) -> None:
        label_el = fieldset.query_selector(_QUESTION_TITLE)
        question = label_el.inner_text().strip() if label_el else ""
        if not question:
            return

        # Each choice is its own <label for="..."> wrapping the radio input +
        # choice text. Exclude the question-title label by its `for` id, not
        # object identity — Playwright hands back a fresh ElementHandle per
        # query, so `!=` never matches even for the same underlying DOM node
        # (this previously let the question text itself get treated as a
        # selectable option).
        title_for = label_el.get_attribute("for") if label_el else None
        options: list[tuple[str, object]] = []
        for opt in fieldset.query_selector_all("label"):
            if title_for and opt.get_attribute("for") == title_for:
                continue
            text = opt.inner_text().strip()
            if text:
                options.append((text, opt))

        value = field_mapper.get_known_value(question, self.profile)

        target = None
        if value:
            # Exact match only — substring containment is unsafe for short
            # values like "Yes"/"No" (e.g. "No" falsely matches inside "Now").
            for text, opt in options:
                if text.strip().lower() == value.strip().lower():
                    target = (text, opt)
                    break
        if not target:
            for text, opt in options:
                if any(p in text.lower() for p in _DECLINE_PHRASES):
                    target = (text, opt)
                    break

        if not target:
            return  # leave unanswered for human review rather than guessing

        text, opt = target
        opt.click()
        self._record(question, text, ai=False)
        log.info("Radio '%s' -> '%s'", question[:50], text)

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


def _css_escape(value: str) -> str:
    return value.replace(":", r"\:").replace(".", r"\.")
