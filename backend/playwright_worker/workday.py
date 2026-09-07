"""Workday job application Playwright handler.

Workday uses stable data-automation-id attributes on every element — these are
used by Workday's own test suite and don't change with UI redesigns.

Flow:
  1. Navigate to job URL
  2. Check login state → try LinkedIn SSO → if blocked, pause for manual login
  3. Click Apply → Apply Manually
  4. Fill pages in sequence: Contact Info → Experience → any custom question pages
  5. On EEO/voluntary pages, decline all (I prefer not to answer)
  6. Stop at Review → wait for human Submit signal
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, TimeoutError as PWTimeout

from playwright_worker import field_mapper

log = logging.getLogger("applyai.workday")

# ── Navigation selectors ───────────────────────────────────────────────────────

_SIGN_IN_BTN = 'button[data-automation-id="utilityButtonSignIn"]'
_LINKEDIN_SSO = [
    "button:has-text('LinkedIn')",
    "a:has-text('LinkedIn')",
    "[aria-label*='LinkedIn']",
]
_APPLY_BTN = [
    'a[data-automation-id="adventureButton"]',
    'button[data-automation-id="adventureButton"]',
]
_APPLY_MANUALLY = 'a[data-automation-id="applyManually"]'

_NEXT = 'button[data-automation-id="bottom-navigation-next-button"]'
_REVIEW_NEXT = 'button[data-automation-id="bottom-navigation-review-button"]'
_SUBMIT = [
    'button[data-automation-id="bottom-navigation-submit-button"]',
    "button:has-text('Submit')",
]

# ── Page detection ─────────────────────────────────────────────────────────────

_PAGE_CONTACT = 'div[data-automation-id="contactInformationPage"]'
_PAGE_EXPERIENCE = 'div[data-automation-id="myExperiencePage"]'
_PAGE_DISCLOSURES = 'div[data-automation-id="voluntaryDisclosuresPage"]'
_PAGE_SELF_ID = 'div[data-automation-id="selfIdentificationPage"]'
_PAGE_REVIEW = 'div[data-automation-id="reviewPage"]'

# ── Field selectors ────────────────────────────────────────────────────────────

_FNAME = 'input[data-automation-id="legalNameSection_firstName"]'
_LNAME = 'input[data-automation-id="legalNameSection_lastName"]'
_CITY = 'input[data-automation-id="addressSection_city"]'
_STATE = 'button[data-automation-id="addressSection_countryRegion"]'
_ZIP = 'input[data-automation-id="addressSection_postalCode"]'
_STREET = 'input[data-automation-id="addressSection_addressLine1"]'
_PHONE_TYPE = 'button[data-automation-id="phone-device-type"]'
_PHONE_NUM = 'input[data-automation-id="phone-number"]'
_PREV_WORKER_NO = 'div[data-automation-id="previousWorker"] input[id="2"]'

_FILE_UPLOAD = 'input[data-automation-id="file-upload-input-ref"]'
_LINKEDIN_INPUT = 'input[data-automation-id="linkedinQuestion"]'
_WEBSITE_ADD = 'div[data-automation-id="websiteSection"] button[data-automation-id="Add"]'
_WEBSITE_PANEL = 'div[data-automation-id="websitePanelSet-{n}"] input'


class WorkdayApply:
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
        log.info("Navigating to Workday job: %s", self.job_url)
        self._write_state("running", step="navigating")
        self.page.goto(self.job_url, wait_until="domcontentloaded", timeout=30_000)
        self.page.wait_for_timeout(2500)

        self._ensure_logged_in()
        if self._cancelled():
            return

        self._start_application()
        if self._cancelled():
            return

        self._fill_all_pages()

    # ── Auth ───────────────────────────────────────────────────────────────────

    def _ensure_logged_in(self) -> None:
        """Try LinkedIn SSO, else pause and let the user log in manually."""
        if not self._needs_login():
            log.info("Already logged in to Workday")
            return

        log.info("Not logged in — trying LinkedIn SSO")
        self._write_state("running", step="login")

        # Click Sign In if the button exists
        try:
            sign_in = self.page.wait_for_selector(_SIGN_IN_BTN, timeout=5_000)
            if sign_in:
                sign_in.click()
                self.page.wait_for_timeout(1500)
        except PWTimeout:
            pass

        # Try LinkedIn SSO
        for sel in _LINKEDIN_SSO:
            try:
                btn = self.page.wait_for_selector(sel, timeout=3_000)
                if btn and btn.is_visible():
                    btn.click()
                    log.info("Clicked LinkedIn SSO")
                    self.page.wait_for_timeout(4000)
                    if not self._needs_login():
                        log.info("LinkedIn SSO succeeded")
                        return
                    break
            except PWTimeout:
                continue

        # Still not logged in — pause for manual login
        log.info("Pausing for manual login")
        self._write_state("waiting_for_login", step="login", filled_fields=self.filled_fields)
        self._wait_for_signal(expected="continue")

    def _needs_login(self) -> bool:
        """Return True if the page shows a sign-in prompt."""
        try:
            btn = self.page.query_selector(_SIGN_IN_BTN)
            if btn and btn.is_visible():
                return True
        except Exception:
            pass
        # Also check for a login form (email input)
        try:
            inp = self.page.query_selector('input[data-automation-id="email"]')
            if inp and inp.is_visible():
                return True
        except Exception:
            pass
        return False

    # ── Application start ──────────────────────────────────────────────────────

    def _start_application(self) -> None:
        """Click Apply → Apply Manually to enter the application form."""
        # If already inside the form (navigated directly to /apply URL), skip
        for page_id in [_PAGE_CONTACT, _PAGE_EXPERIENCE]:
            try:
                if self.page.query_selector(page_id):
                    log.info("Already inside Workday application form")
                    return
            except Exception:
                pass

        log.info("Clicking Apply button")
        self._write_state("running", step="starting_application")

        # Click the top-level Apply button (may need two clicks)
        for sel in _APPLY_BTN:
            try:
                btn = self.page.wait_for_selector(sel, timeout=8_000)
                if btn and btn.is_visible():
                    btn.click()
                    self.page.wait_for_timeout(1500)
                    break
            except PWTimeout:
                continue

        # Click "Apply Manually" (not resume-parsing)
        try:
            manually = self.page.wait_for_selector(_APPLY_MANUALLY, timeout=5_000)
            if manually:
                manually.click()
                self.page.wait_for_timeout(2000)
        except PWTimeout:
            log.info("No 'Apply Manually' option — continuing")

    # ── Page-by-page fill loop ─────────────────────────────────────────────────

    def _fill_all_pages(self) -> None:
        for step in range(20):
            if self._cancelled():
                return

            self.page.wait_for_timeout(1000)

            # Check for Submit (final review page)
            for sel in _SUBMIT:
                try:
                    btn = self.page.query_selector(sel)
                    if btn and btn.is_visible():
                        log.info("Submit button found — stopping for human review")
                        self._write_state("waiting_for_review", step="review", filled_fields=self.filled_fields)
                        self._wait_for_signal(expected="submit")
                        return
                except Exception:
                    pass

            # Detect and fill current page
            page_type = self._detect_page()
            log.info("Step %d — page: %s", step + 1, page_type)
            self._write_state("running", step=page_type, filled_fields=self.filled_fields)

            if page_type == "contact":
                self._fill_contact()
            elif page_type == "experience":
                self._fill_experience()
            elif page_type in ("disclosures", "self_id"):
                self._decline_eeo_page()
            elif page_type == "questions":
                self._fill_question_page()
            # "unknown" pages: just click Next and hope for the best

            self.page.wait_for_timeout(500)
            self._click_next()
            self.page.wait_for_timeout(2000)

        self._write_state("error", error="Reached max steps without finding Submit button")

    def _detect_page(self) -> str:
        checks = [
            (_PAGE_CONTACT, "contact"),
            (_PAGE_EXPERIENCE, "experience"),
            (_PAGE_DISCLOSURES, "disclosures"),
            (_PAGE_SELF_ID, "self_id"),
            (_PAGE_REVIEW, "review"),
        ]
        for sel, name in checks:
            try:
                if self.page.query_selector(sel):
                    return name
            except Exception:
                pass
        # Detect generic question page by presence of textarea or custom inputs
        try:
            if self.page.query_selector('div[data-automation-id="questionnaire"]'):
                return "questions"
        except Exception:
            pass
        return "unknown"

    # ── Contact Info page ──────────────────────────────────────────────────────

    def _fill_contact(self) -> None:
        personal = self._p
        name = personal.get("name", "")
        phone = personal.get("phone", "")
        location = personal.get("location", "")  # e.g. "Dallas, TX"

        # "Have you previously worked here?" → No
        self._opt_click(_PREV_WORKER_NO)

        city = location.split(",")[0].strip() if "," in location else location
        state = location.split(",")[1].strip() if "," in location else ""

        self._fill_if_empty(_FNAME, field_mapper._first_name(name), "First name")
        self._fill_if_empty(_LNAME, field_mapper._last_name(name), "Last name")
        self._fill_if_empty(_STREET, personal.get("street", ""), "Street address")
        self._fill_if_empty(_CITY, city, "City")
        self._fill_if_empty(_ZIP, personal.get("zip", ""), "ZIP code")

        # State: custom dropdown — click, type, Enter
        if state:
            self._dropdown_select(_STATE, state, "State")

        # Phone type → Mobile
        self._dropdown_select(_PHONE_TYPE, "Mobile", "Phone type")

        digits = field_mapper._digits_only(phone)
        self._fill_if_empty(_PHONE_NUM, digits, "Phone number")

    # ── Experience page ────────────────────────────────────────────────────────

    def _fill_experience(self) -> None:
        personal = self._p

        # Resume upload
        if self.resume_path and self.resume_path.exists():
            try:
                upload = self.page.query_selector(_FILE_UPLOAD)
                if upload:
                    upload.set_input_files(str(self.resume_path))
                    self._record("Resume", self.resume_path.name, ai=False)
                    log.info("Uploaded resume: %s", self.resume_path.name)
                    self.page.wait_for_timeout(2000)
            except Exception as e:
                log.warning("Resume upload failed: %s", e)

        # LinkedIn URL
        linkedin = personal.get("linkedin", "")
        if linkedin:
            try:
                inp = self.page.query_selector(_LINKEDIN_INPUT)
                if inp and inp.is_visible():
                    inp.fill(linkedin)
                    self._record("LinkedIn URL", linkedin, ai=False)
            except Exception:
                pass

        # GitHub via website section
        github = personal.get("github", "")
        if github:
            self._add_website_link(github, slot=1)

    def _add_website_link(self, url: str, slot: int) -> None:
        """Add a link in the websites section (click Add if needed)."""
        panel_sel = _WEBSITE_PANEL.format(n=slot)
        try:
            panel = self.page.query_selector(panel_sel)
            if not panel:
                add_btn = self.page.query_selector(_WEBSITE_ADD)
                if add_btn:
                    add_btn.click()
                    self.page.wait_for_timeout(800)
            inp = self.page.wait_for_selector(panel_sel, timeout=3_000)
            if inp:
                inp.fill(url)
                self._record(f"Website {slot}", url, ai=False)
        except Exception as e:
            log.warning("Could not add website link: %s", e)

    # ── EEO / Voluntary pages ──────────────────────────────────────────────────

    def _decline_eeo_page(self) -> None:
        """Select 'I prefer not to answer' / 'Decline to Identify' on all dropdowns."""
        decline_phrases = [
            "prefer not",
            "decline",
            "i do not want",
            "not specified",
            "choose not",
        ]
        # All dropdown buttons on the page
        for btn in self.page.query_selector_all("button[data-automation-id]"):
            try:
                auto_id = btn.get_attribute("data-automation-id") or ""
                # Skip navigation buttons
                if "navigation" in auto_id or "sign" in auto_id or "apply" in auto_id:
                    continue
                if not btn.is_visible():
                    continue
                btn.click()
                self.page.wait_for_timeout(400)
                # Try to find a "prefer not to answer" option
                options = self.page.query_selector_all("li[data-automation-id='promptOption'], [role='option']")
                clicked = False
                for opt in options:
                    text = opt.inner_text().lower()
                    if any(p in text for p in decline_phrases):
                        opt.click()
                        clicked = True
                        break
                if not clicked:
                    # Close dropdown without selecting
                    self.page.keyboard.press("Escape")
                self.page.wait_for_timeout(300)
            except Exception:
                pass

        # Agreements / checkboxes — check them to proceed
        for cb in self.page.query_selector_all('input[data-automation-id="agreementCheckbox"]'):
            try:
                if not cb.is_checked():
                    cb.click()
            except Exception:
                pass

    # ── Generic question pages ─────────────────────────────────────────────────

    def _fill_question_page(self) -> None:
        """Fill custom application questions: known fields + AI for unknowns."""
        # Standard text inputs
        for inp in self.page.query_selector_all("input[data-automation-id='textInputBox']"):
            try:
                if not inp.is_visible():
                    continue
                label = self._label(inp)
                if label:
                    self._fill_input_by_label(inp, label)
            except Exception:
                pass

        # Textareas
        for ta in self.page.query_selector_all("textarea"):
            try:
                if not ta.is_visible():
                    continue
                label = self._label(ta)
                if label:
                    self._fill_input_by_label(ta, label)
            except Exception:
                pass

        # Custom Workday dropdowns (button-based)
        for btn in self.page.query_selector_all(
            "button[data-automation-id]:not([data-automation-id*='navigation'])"
            ":not([data-automation-id*='sign'])"
        ):
            try:
                if not btn.is_visible():
                    continue
                label = self._label(btn)
                if not label:
                    continue
                value = field_mapper.get_known_value(label, self.profile)
                if value:
                    self._dropdown_select(
                        f"button[data-automation-id='{btn.get_attribute('data-automation-id')}']",
                        value,
                        label,
                    )
            except Exception:
                pass

    def _fill_input_by_label(self, inp, label: str) -> None:
        try:
            current = inp.input_value()
            if current and current.strip():
                self._record(label, current, ai=False)
                return
        except Exception:
            pass

        value = field_mapper.get_known_value(label, self.profile)
        if value:
            inp.fill(value)
            self._record(label, value, ai=False)
        elif self.ai_answer_fn:
            answer = self.ai_answer_fn(label)
            if answer:
                inp.fill(answer)
                self._record(label, answer, ai=True)

    # ── Navigation ─────────────────────────────────────────────────────────────

    def _click_next(self) -> bool:
        for sel in [_REVIEW_NEXT, _NEXT]:
            try:
                btn = self.page.query_selector(sel)
                if btn and btn.is_visible():
                    btn.click()
                    log.info("Clicked Next: %s", sel)
                    return True
            except Exception:
                pass
        log.warning("No Next button found")
        return False

    # ── Signal handling ────────────────────────────────────────────────────────

    def _wait_for_signal(self, expected: str) -> None:
        log.info("Waiting for signal: %s", expected)
        while True:
            signal = self._read_signal()
            if signal == expected:
                log.info("Got signal: %s", signal)
                if expected == "submit":
                    for sel in _SUBMIT:
                        try:
                            btn = self.page.query_selector(sel)
                            if btn and btn.is_visible():
                                btn.click()
                                self.page.wait_for_timeout(2000)
                                self._write_state("submitted", step="done", filled_fields=self.filled_fields)
                                log.info("Submitted")
                                return
                        except Exception:
                            pass
                    self._write_state("error", error="Submit button disappeared")
                elif expected == "continue":
                    pass  # Caller resumes after this returns
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
            log.info("Filled '%s' → '%s'", field_name, value[:40])
        except Exception as e:
            log.warning("Could not fill '%s': %s", field_name, e)

    def _dropdown_select(self, selector: str, value: str, field_name: str) -> None:
        """Click a Workday custom dropdown button, type the value, press Enter."""
        try:
            btn = self.page.query_selector(selector)
            if not btn or not btn.is_visible():
                return
            btn.click()
            self.page.wait_for_timeout(400)
            self.page.keyboard.type(value, delay=80)
            self.page.wait_for_timeout(600)
            # Try to click a matching option first
            options = self.page.query_selector_all("li[data-automation-id='promptOption'], [role='option']")
            clicked = False
            for opt in options:
                if value.lower() in opt.inner_text().lower():
                    opt.click()
                    clicked = True
                    break
            if not clicked:
                self.page.keyboard.press("Enter")
            self._record(field_name, value, ai=False)
            log.info("Dropdown '%s' → '%s'", field_name, value)
            self.page.wait_for_timeout(300)
        except Exception as e:
            log.warning("Dropdown '%s' failed: %s", field_name, e)

    def _opt_click(self, selector: str) -> None:
        try:
            el = self.page.query_selector(selector)
            if el and el.is_visible():
                el.click()
        except Exception:
            pass

    def _label(self, element) -> str:
        try:
            elem_id = element.get_attribute("id")
            if elem_id:
                lbl = self.page.query_selector(f"label[for='{elem_id}']")
                if lbl:
                    return lbl.inner_text().strip()
            aria = element.get_attribute("aria-label")
            if aria:
                return aria.strip()
            return element.evaluate(
                "el => el.closest('[data-automation-id]')?.querySelector('label, legend')?.innerText || ''"
            ).strip()
        except Exception:
            return ""

    def _record(self, field: str, value: str, *, ai: bool) -> None:
        for existing in self.filled_fields:
            if existing["field"] == field:
                existing["value"] = value
                existing["ai_generated"] = ai
                return
        self.filled_fields.append({"field": field, "value": value, "ai_generated": ai})
