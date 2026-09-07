"""Tests for the MAP -> flat autofill-profile projection."""

from app.profile_autofill import build_autofill_profile

MAP = {
    "personal": {
        "name": "Tyler Trlicek",
        "email": "ty.trlicek@gmail.com",
        "phone": "(214) 555-0101",
        "location": "Dallas, TX",
        "street": "1200 Main St",
        "zip": "75201",
        "linkedin": "https://linkedin.com/in/tylertrlicek",
        "github": "https://github.com/tylertrlicek",
    },
    "experience": [
        {"company": "Tyler Technologies", "title": "Software Engineer Intern", "start": "May 2025", "end": ""},
        {"company": "SportsFrames", "title": "Founder", "start": "January 2024", "end": "April 2025"},
    ],
    "education": {
        "school": "Texas A&M University",
        "degree": "B.S.",
        "field": "Computer Science",
        "graduation": "December 2026",
        "gpa": "3.7",
    },
}


def test_name_split():
    p = build_autofill_profile(MAP)
    assert p["firstName"] == "Tyler"
    assert p["lastName"] == "Trlicek"
    assert p["fullName"] == "Tyler Trlicek"


def test_location_split():
    p = build_autofill_profile(MAP)
    assert p["city"] == "Dallas"
    assert p["state"] == "TX"


def test_constant_eligibility_answers():
    p = build_autofill_profile(MAP)
    assert p["workAuthorized"] is True
    assert p["needsSponsorship"] is False
    assert p["usCitizen"] is True


def test_current_employer_is_first_experience():
    p = build_autofill_profile(MAP)
    assert p["currentEmployer"] == "Tyler Technologies"
    assert p["currentTitle"] == "Software Engineer Intern"


def test_years_experience_is_positive_int_string():
    p = build_autofill_profile(MAP)
    assert p["yearsExperience"].isdigit()
    assert int(p["yearsExperience"]) >= 1


def test_education_passthrough():
    p = build_autofill_profile(MAP)
    assert p["school"] == "Texas A&M University"
    assert p["fieldOfStudy"] == "Computer Science"
    assert p["gpa"] == "3.7"


def test_website_falls_back_to_github():
    p = build_autofill_profile(MAP)
    assert p["website"] == "https://github.com/tylertrlicek"


def test_empty_profile_does_not_crash():
    p = build_autofill_profile({})
    assert p["firstName"] == ""
    assert p["hasResume"] is False
