"""LinkedIn Easy Apply Playwright handler.

Navigates to a LinkedIn job page, clicks Easy Apply, fills each step of the
multi-step modal, then stops at the final Submit button and waits for the human
to confirm via a signal file before clicking Submit.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, TimeoutError as PWTimeout

from playwright_worker import field_mapper

log = logging.getLogger("applyai.linkedin")

# ── Selectors ──────────────────────────────────────────────────────────────────

_EASY_APPLY = [
    ".jobs-apply-button--top-card #jobs-apply-button-id",
    "div.jobs-apply-button--top-card button.jobs-apply-button",
    "button.jobs-apply-button[aria-label*='Easy Apply']",
    "button[aria-label*='Easy Apply']",
    "button[aria-label*='LinkedIn']",
]
_MODAL = "div.jobs-easy-apply-modal"
_NEXT = [
    "button[aria-label='Continue to next step']",
    "button:has-text('Next')",
    "button:has-text('Continue')",
]
_REVIEW = [
    "button[aria-label='Review your application']",
    "button:has-text('Review')",
]
_SUBMIT = [
    "button[aria-label='Submit application']",
    "button:has-text('Submit application')",
]
_DISMISS = [
    "button[aria-label='Dismiss']",
    "button[aria-label='Close']",
    "button[aria-label='Cancel']",
]


class LinkedInEasyApply:
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

    # ── Public entry point ─────────────────────────────────────────────────────

    def run(self) -> None:
        log.info("Navigating to %s", self.job_url)
        self._write_state("running", step="navigating")
        self.page.goto(self.job_url, wait_until="domcontentloaded", timeout=30_000)
        self.page.wait_for_timeout(2000)

        # If LinkedIn redirected to login, pause for the user
        if self._on_login_page():
            log.info("LinkedIn login required — waiting for user")
            self._write_state("waiting_for_login", step="login")
            self._wait_for_continue_signal()
            self.page.wait_for_timeout(3000)

            # LinkedIn's post-login redirect lands on the home feed, not back
            # on the job page — re-navigate explicitly rather than assuming
            # we're still where we started.
            log.info("Re-navigating to job page after login: %s", self.job_url)
            self.page.goto(self.job_url, wait_until="domcontentloaded", timeout=30_000)
            self.page.wait_for_timeout(2000)

        # Debug: log all visible buttons to help diagnose selector issues
        try:
            btns = self.page.eval_on_selector_all(
                "button, a[role='button']",
                "els => els.filter(e => e.offsetParent !== null).map(e => e.getAttribute('aria-label') || e.innerText).slice(0, 20)"
            )
            log.info("Visible buttons on page: %s", btns)
        except Exception:
            pass

        if not self._click_first(_EASY_APPLY):
            raise RuntimeError("Easy Apply button not found — this may not be a LinkedIn Easy Apply job")

        try:
            self.page.wait_for_selector(_MODAL, timeout=10_000)
        except PWTimeout:
            raise RuntimeError("Easy Apply modal did not open — try again or apply manually")

        log.info("Modal opened, starting form fill")
        self._write_state("running", step="filling")
        self._run_steps()

    # ── Step loop ──────────────────────────────────────────────────────────────

    def _run_steps(self) -> None:
        for step_num in range(15):
            if self._cancelled():
                return

            self.page.wait_for_timeout(800)

            # Reached final review — stop and hand off to human
            if self._visible(_SUBMIT):
                log.info("Submit button visible — stopping for human review (step %d)", step_num + 1)
                self._write_state("waiting_for_review", step="review", filled_fields=self.filled_fields)
                self._wait_for_signal()
                return

            self._write_state("running", step=f"step_{step_num + 1}", filled_fields=self.filled_fields)
            self._fill_current_step()
            self.page.wait_for_timeout(600)

            if self._visible(_REVIEW):
                self._click_first(_REVIEW)
                log.info("Clicked Review button (step %d)", step_num + 1)
                self.page.wait_for_timeout(1500)
            elif self._visible(_NEXT):
                self._click_first(_NEXT)
                log.info("Clicked Next button (step %d)", step_num + 1)
                self.page.wait_for_timeout(1500)
            else:
                log.warning("No Next/Review/Submit on step %d — stopping", step_num + 1)
                self._write_state("error", error=f"Stuck on step {step_num + 1}: no navigation button found")
                return

        self._write_state("error", error="Reached max steps without finding Submit button")

    # ── Form filling ───────────────────────────────────────────────────────────

    def _fill_current_step(self) -> None:
        modal = self.page.query_selector(_MODAL)
        if not modal:
            return

        # File uploads
        for inp in modal.query_selector_all("input[type='file']"):
            try:
                self._handle_file(inp)
            except Exception as e:
                log.warning("File upload error: %s", e)

        # Text / number / email / tel inputs
        for inp in modal.query_selector_all(
            "input[type='text'], input[type='number'], input[type='email'], "
            "input[type='tel'], input[inputmode='tel']"
        ):
            try:
                if not inp.is_visible():
                    continue
                label = self._label(inp)
                if label:
                    self._handle_text(inp, label)
            except Exception as e:
                log.warning("Text input error: %s", e)

        # Textareas
        for inp in modal.query_selector_all("textarea"):
            try:
                if not inp.is_visible():
                    continue
                label = self._label(inp)
                if label:
                    self._handle_text(inp, label)
            except Exception as e:
                log.warning("Textarea error: %s", e)

        # Selects
        for sel in modal.query_selector_all("select"):
            try:
                if not sel.is_visible():
                    continue
                label = self._label(sel)
                if label:
                    self._handle_select(sel, label)
            except Exception as e:
                log.warning("Select error: %s", e)

        # Radio / checkbox groups
        for group in modal.query_selector_all("fieldset, div[role='radiogroup']"):
            try:
                label = self._label(group)
                if label:
                    self._handle_radio(group, label)
            except Exception as e:
                log.warning("Radio error: %s", e)

    def _handle_file(self, inp) -> None:
        container_text = inp.evaluate(
            "el => (el.closest('.jobs-easy-apply-file-upload') "
            "     || el.closest('[class*=\"upload\"]') "
            "     || el.closest('[class*=\"document\"]') "
            "     || el.parentElement)?.innerText || ''"
        ).lower()
        is_cover = "cover" in container_text
        path = self.cover_letter_path if is_cover else self.resume_path
        label = "Cover Letter" if is_cover else "Resume"

        if path and path.exists():
            inp.set_input_files(str(path))
            self._record(label, path.name, ai=False)
            log.info("Uploaded %s: %s", label, path.name)
        else:
            log.warning("No DOCX for %s — skipping upload", label)

    def _handle_text(self, inp, label: str) -> None:
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
            log.info("Filled '%s' → '%s'", label, value[:40])
        elif self.ai_answer_fn:
            answer = self.ai_answer_fn(label)
            if answer:
                inp.fill(answer)
                self._record(label, answer, ai=True)
                log.info("AI-filled '%s'", label)

    def _handle_select(self, sel, label: str) -> None:
        options = [
            o.inner_text().strip()
            for o in sel.query_selector_all("option")
            if o.get_attribute("value") not in (None, "", "0", "Select an option")
        ]
        best = field_mapper.pick_select_option(label, options, self.profile)
        if best:
            sel.select_option(label=best)
            self._record(label, best, ai=False)
            log.info("Selected '%s' = '%s'", label, best)

    def _handle_radio(self, group, label: str) -> None:
        value = field_mapper.get_known_value(label, self.profile)
        if not value:
            return

        v_lower = value.lower()

        # Try input[value=...] directly
        for val in [value, v_lower]:
            radio = group.query_selector(f"input[type='radio'][value='{val}']")
            if radio and radio.is_visible():
                try:
                    radio.click()
                except Exception:
                    radio.click(force=True)
                self._record(label, value, ai=False)
                return

        # Try matching label text
        for lbl_el in group.query_selector_all("label"):
            if v_lower in lbl_el.inner_text().lower():
                radio_id = lbl_el.get_attribute("for")
                if radio_id:
                    radio = group.query_selector(f"input[type='radio']#{radio_id}")
                    if radio:
                        try:
                            radio.click()
                        except Exception:
                            radio.click(force=True)
                    else:
                        lbl_el.click()
                else:
                    lbl_el.click()
                self._record(label, value, ai=False)
                return

    # ── Human submit handoff ───────────────────────────────────────────────────

    def _wait_for_signal(self) -> None:
        log.info("Waiting for submit or cancel signal...")
        while True:
            signal = self._read_signal()
            if signal == "submit":
                log.info("Submit signal received")
                if self._click_first(_SUBMIT):
                    self.page.wait_for_timeout(2000)
                    self._write_state("submitted", step="done", filled_fields=self.filled_fields)
                    log.info("Application submitted")
                else:
                    self._write_state("error", error="Submit button disappeared before clicking")
                return
            elif signal == "cancel":
                log.info("Cancel signal received")
                self._write_state("cancelled", step="cancelled", filled_fields=self.filled_fields)
                self._click_first(_DISMISS)
                return
            time.sleep(0.5)

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _label(self, element) -> str:
        try:
            elem_id = element.get_attribute("id")
            if elem_id:
                lbl = self.page.query_selector(f"label[for='{elem_id}']")
                if lbl:
                    return lbl.inner_text().strip()

            text = element.evaluate("el => el.closest('label')?.innerText || ''").strip()
            if text:
                return text

            aria = element.get_attribute("aria-label")
            if aria:
                return aria.strip()

            placeholder = element.get_attribute("placeholder")
            if placeholder:
                return placeholder.strip()

            # fieldset legend
            legend = element.query_selector("legend")
            if legend:
                return legend.inner_text().strip()

            # nearest label/span in parent div
            return element.evaluate(
                "el => el.closest('div')?.querySelector('label, legend, "
                "[class*=\"label\"], [class*=\"title\"]')?.innerText || ''"
            ).strip()
        except Exception:
            return ""

    def _visible(self, selectors: list[str]) -> bool:
        for sel in selectors:
            try:
                el = self.page.query_selector(sel)
                if el and el.is_visible():
                    return True
            except Exception:
                pass
        return False

    def _click_first(self, selectors: list[str]) -> bool:
        for sel in selectors:
            try:
                el = self.page.query_selector(sel)
                if el and el.is_visible():
                    el.click()
                    return True
            except Exception:
                pass
        return False

    def _on_login_page(self) -> bool:
        url = self.page.url
        if "linkedin.com/login" in url or "linkedin.com/checkpoint" in url:
            return True
        if self.page.query_selector("input#username, input[name='session_key']"):
            return True
        # Logged-out job page: Easy Apply replaced with sign-in prompt
        if self.page.query_selector(
            "button.sign-in-modal__outlet-btn, "
            "a[href*='/login'], "
            ".join-form, "
            ".guest-access-modal"
        ):
            return True
        # No nav bar = not logged in
        if not self.page.query_selector("nav.global-nav, div.global-nav__me"):
            return True
        return False

    def _wait_for_continue_signal(self) -> None:
        log.info("Waiting for 'continue' signal (user login)...")
        while True:
            signal = self._read_signal()
            if signal == "continue":
                log.info("Continue signal received — resuming")
                return
            if signal == "cancel":
                self._write_state("cancelled", step="cancelled", filled_fields=self.filled_fields)
                return
            time.sleep(0.5)

    def _cancelled(self) -> bool:
        if self._read_signal() == "cancel":
            self._write_state("cancelled", step="cancelled", filled_fields=self.filled_fields)
            self._click_first(_DISMISS)
            return True
        return False

    def _record(self, field: str, value: str, *, ai: bool) -> None:
        for existing in self.filled_fields:
            if existing["field"] == field:
                existing["value"] = value
                existing["ai_generated"] = ai
                return
        self.filled_fields.append({"field": field, "value": value, "ai_generated": ai})
