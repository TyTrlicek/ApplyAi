"""Unit tests for playwright_worker modules."""
import json
import pytest
from pathlib import Path


# ── Shared fixture ────────────────────────────────────────────────────────────

PROFILE = {
    "personal": {
        "name": "Tyler Trlicek",
        "email": "ty.trlicek@gmail.com",
        "phone": "(214) 555-0101",
        "location": "Dallas, TX",
        "street": "1200 Main St",
        "linkedin": "https://linkedin.com/in/tylertrlicek",
        "github": "https://github.com/tylertrlicek",
        "website": "",
        "zip": "75201",
    },
    "experience": [
        {
            "company": "Tyler Technologies",
            "title": "Software Engineer Intern",
            "start": "May 2025",
            "end": "",
            "bullets": "",
            "context": "",
        },
        {
            "company": "SportsFrames",
            "title": "Founder",
            "start": "January 2024",
            "end": "April 2025",
            "bullets": "",
            "context": "",
        },
    ],
}


# ── field_mapper tests ────────────────────────────────────────────────────────

class TestGetKnownValue:
    def setup_method(self):
        from playwright_worker.field_mapper import get_known_value
        self.fn = get_known_value

    def test_first_name(self):
        assert self.fn("First name", PROFILE) == "Tyler"

    def test_last_name(self):
        assert self.fn("Last name", PROFILE) == "Trlicek"

    def test_full_name(self):
        assert self.fn("Full name", PROFILE) == "Tyler Trlicek"

    def test_email(self):
        assert self.fn("Email address", PROFILE) == "ty.trlicek@gmail.com"

    def test_email_variant(self):
        assert self.fn("Work email", PROFILE) == "ty.trlicek@gmail.com"

    def test_phone(self):
        result = self.fn("Mobile phone number", PROFILE)
        assert result == "2145550101"

    def test_phone_tel_variant(self):
        result = self.fn("Phone (tel)", PROFILE)
        assert result == "2145550101"

    def test_city(self):
        assert self.fn("City", PROFILE) == "Dallas"

    def test_location(self):
        assert self.fn("Location", PROFILE) == "Dallas"

    def test_zip(self):
        assert self.fn("ZIP code", PROFILE) == "75201"

    def test_postal_code(self):
        assert self.fn("Postal Code", PROFILE) == "75201"

    def test_street_address(self):
        assert self.fn("Address", PROFILE) == "1200 Main St"

    def test_address_does_not_shadow_email_address(self):
        assert self.fn("Email address", PROFILE) == "ty.trlicek@gmail.com"

    def test_current_company(self):
        assert self.fn("Current company", PROFILE) == "Tyler Technologies"

    def test_current_employer_variant(self):
        assert self.fn("What is your current or most recent employer?", PROFILE) == "Tyler Technologies"

    def test_linkedin(self):
        assert self.fn("LinkedIn URL", PROFILE) == "https://linkedin.com/in/tylertrlicek"

    def test_linkedin_case(self):
        assert self.fn("LinkedIn Profile", PROFILE) == "https://linkedin.com/in/tylertrlicek"

    def test_github(self):
        assert self.fn("GitHub URL", PROFILE) == "https://github.com/tylertrlicek"

    def test_years_experience(self):
        result = self.fn("Years of experience", PROFILE)
        # SportsFrames: Jan 2024 – Apr 2025 = 15 months
        # Tyler Tech: May 2025 – now = varies
        # Total should be ≥ 1 and is numeric
        assert result is not None
        assert int(result) >= 1

    def test_years_experience_variant(self):
        result = self.fn("How many years of professional experience do you have?", PROFILE)
        assert result is not None
        assert int(result) >= 1

    def test_work_auth_yes(self):
        assert self.fn("Are you legally authorized to work in the US?", PROFILE) == "Yes"

    def test_work_auth_variant(self):
        assert self.fn("Authorized to work in United States", PROFILE) == "Yes"

    def test_sponsorship_no(self):
        assert self.fn("Do you require visa sponsorship?", PROFILE) == "No"

    def test_sponsorship_variant(self):
        assert self.fn("Will you need sponsorship now or in the future?", PROFILE) == "No"

    def test_unknown_returns_none(self):
        assert self.fn("Why do you want to work here?", PROFILE) is None

    def test_unknown_behavioral(self):
        assert self.fn("Describe a time you showed leadership", PROFILE) is None

    def test_portfolio(self):
        # No website set, should fall back to github
        result = self.fn("Portfolio URL", PROFILE)
        assert result == "https://github.com/tylertrlicek"


class TestPickSelectOption:
    def setup_method(self):
        from playwright_worker.field_mapper import pick_select_option
        self.fn = pick_select_option

    def test_yes_exact(self):
        options = ["Select an option", "Yes", "No"]
        assert self.fn("Are you authorized to work in the US?", options, PROFILE) == "Yes"

    def test_no_exact(self):
        options = ["Select an option", "Yes", "No"]
        assert self.fn("Do you require visa sponsorship?", options, PROFILE) == "No"

    def test_partial_match(self):
        options = ["Select...", "Yes, I am authorized", "No, I am not"]
        result = self.fn("Are you legally authorized to work?", options, PROFILE)
        assert result is not None and "Yes" in result

    def test_unknown_label_returns_none(self):
        options = ["Option A", "Option B"]
        assert self.fn("Describe your favorite project", options, PROFILE) is None


# ── state.py tests ────────────────────────────────────────────────────────────

TEST_JOB_ID = 99999


class TestState:
    def setup_method(self):
        from playwright_worker.state import clear_state, clear_signal
        clear_state(TEST_JOB_ID)
        clear_signal(TEST_JOB_ID)

    def teardown_method(self):
        from playwright_worker.state import clear_state
        clear_state(TEST_JOB_ID)

    def test_read_nonexistent_returns_none(self):
        from playwright_worker.state import read_state
        assert read_state(TEST_JOB_ID) is None

    def test_write_and_read_state(self):
        from playwright_worker.state import write_state, read_state
        write_state(TEST_JOB_ID, "running", step="contact", pid=12345)
        s = read_state(TEST_JOB_ID)
        assert s is not None
        assert s["status"] == "running"
        assert s["step"] == "contact"
        assert s["pid"] == 12345

    def test_write_preserves_pid_across_updates(self):
        from playwright_worker.state import write_state, read_state
        write_state(TEST_JOB_ID, "starting", pid=9999)
        write_state(TEST_JOB_ID, "running", step="filling")
        s = read_state(TEST_JOB_ID)
        assert s["pid"] == 9999  # preserved from first write

    def test_write_with_filled_fields(self):
        from playwright_worker.state import write_state, read_state
        fields = [{"field": "First name", "value": "Tyler", "ai_generated": False}]
        write_state(TEST_JOB_ID, "running", filled_fields=fields)
        s = read_state(TEST_JOB_ID)
        assert len(s["filled_fields"]) == 1
        assert s["filled_fields"][0]["field"] == "First name"

    def test_clear_state(self):
        from playwright_worker.state import write_state, read_state, clear_state
        write_state(TEST_JOB_ID, "running")
        clear_state(TEST_JOB_ID)
        assert read_state(TEST_JOB_ID) is None

    def test_write_and_read_signal(self):
        from playwright_worker.state import write_signal, read_signal
        write_signal(TEST_JOB_ID, "submit")
        assert read_signal(TEST_JOB_ID) == "submit"

    def test_cancel_signal(self):
        from playwright_worker.state import write_signal, read_signal
        write_signal(TEST_JOB_ID, "cancel")
        assert read_signal(TEST_JOB_ID) == "cancel"

    def test_continue_signal(self):
        from playwright_worker.state import write_signal, read_signal
        write_signal(TEST_JOB_ID, "continue")
        assert read_signal(TEST_JOB_ID) == "continue"

    def test_read_signal_nonexistent_returns_none(self):
        from playwright_worker.state import read_signal
        assert read_signal(TEST_JOB_ID) is None

    def test_clear_signal(self):
        from playwright_worker.state import write_signal, read_signal, clear_signal
        write_signal(TEST_JOB_ID, "submit")
        clear_signal(TEST_JOB_ID)
        assert read_signal(TEST_JOB_ID) is None

    def test_state_file_is_valid_json(self):
        from playwright_worker.state import write_state, state_path
        write_state(TEST_JOB_ID, "waiting_for_review", filled_fields=[])
        raw = state_path(TEST_JOB_ID).read_text()
        data = json.loads(raw)  # must not raise
        assert "status" in data
        assert "filled_fields" in data
        assert "started_at" in data

    def test_error_state_with_message(self):
        from playwright_worker.state import write_state, read_state
        write_state(TEST_JOB_ID, "error", error="Job not found")
        s = read_state(TEST_JOB_ID)
        assert s["status"] == "error"
        assert s["error"] == "Job not found"


# ── Portal detection tests ────────────────────────────────────────────────────

class TestDetectPortal:
    def setup_method(self):
        from playwright_worker.portals import detect_portal
        self.fn = detect_portal

    def test_workday_wd5(self):
        assert self.fn("https://amazon.wd5.myworkdayjobs.com/en-US/Amazon_Jobs/job/SDE_123") == "workday"

    def test_workday_wd3(self):
        assert self.fn("https://microsoft.wd3.myworkdayjobs.com/en-US/External/job/123") == "workday"

    def test_workday_generic(self):
        assert self.fn("https://company.workday.com/apply") == "workday"

    def test_linkedin(self):
        assert self.fn("https://www.linkedin.com/jobs/view/123456") == "linkedin"

    def test_linkedin_easy_apply(self):
        assert self.fn("https://www.linkedin.com/jobs/view/123?applyId=abc") == "linkedin"

    def test_greenhouse(self):
        assert self.fn("https://boards.greenhouse.io/stripe/jobs/123456") == "greenhouse"

    def test_greenhouse_variant(self):
        assert self.fn("https://job-boards.greenhouse.io/airbnb/jobs/123") == "greenhouse"

    def test_lever(self):
        assert self.fn("https://jobs.lever.co/openai/abc-123") == "lever"

    def test_ashby(self):
        assert self.fn("https://jobs.ashbyhq.com/whoop/0623a9e9-d7bb-4ee5-8100-51c68df81133/application") == "ashby"

    def test_unsupported_generic(self):
        assert self.fn("https://careers.google.com/jobs/results/123") == "unsupported"

    def test_unsupported_indeed(self):
        assert self.fn("https://www.indeed.com/viewjob?jk=abc123") == "unsupported"

    def test_none_url(self):
        assert self.fn(None) == "unsupported"

    def test_empty_url(self):
        assert self.fn("") == "unsupported"
