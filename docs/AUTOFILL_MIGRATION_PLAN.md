# ApplyAi — Autofill Migration Plan
_Created 2026-09-06. Move from server-side Playwright automation to an in-browser, Jobright-style autofill extension._

---

## Why

The current apply system runs a **second, headless browser** on the backend:

```
LinkedIn tab → content.js scrapes job → POST /jobs/{id}/apply
  → apply.py spawns playwright_worker/runner.py (subprocess)
  → a separate Chromium opens, logs in on its own persistent profile, fills the form
  → stops before Submit, waits for a signal file, user clicks Submit in that window
```

Problems: separate login/session per portal, headless fingerprint that ATS bot-detection flags, the automation can't see the page you're looking at, a subprocess + state-file IPC layer to maintain, and every portal is a hardcoded selector map (`greenhouse.py`, `ashby.py`, `workday.py`) that returns `"unsupported"` for anything unwritten.

Jobright (and JobWizard, Simplify, etc.) do it differently: **the extension fills the form in your own tab, in your own session.** No headless browser. ~90% of the fill is deterministic rule-matching on the DOM; an LLM is called only for free-text questions that don't map to a known field.

## Target architecture

```
Any ATS tab (Greenhouse / Lever / Ashby / Workday / iCIMS / Workable / unknown)
  → content script detects the form
  → generic engine: label → semantic key → MAP value → set with framework-safe events
  → unmapped free-text questions → batched to POST /form-answers (LLM)
  → file inputs → resume/cover-letter blob injected via DataTransfer
  → overlay panel: every filled field listed, AI answers highlighted, edit in place
  → user clicks the site's real Submit button
  → content script detects submission → POST /jobs/{id}/status {applied}
```

Backend keeps: MAP storage, resume/cover-letter generation, the form-answers LLM endpoint, job capture, pipeline tracking. Backend loses: the Playwright subprocess, `apply.py`'s spawn/signal/state machinery, per-portal Python handlers.

### Hardcoding: what changes

| | Today | Target |
|---|---|---|
| Standard fields (name, email, phone, work auth, sponsorship, LinkedIn, school) | per-portal selector constants | **one generic engine**, no site code |
| Greenhouse / Lever / Ashby / Workable / iCIMS | one Python class each | generic engine handles all (clean, labeled forms) |
| Workday | `workday.py` | **keeps a dedicated adapter** — custom web components, multi-step wizard, dynamic re-render |
| LinkedIn Easy Apply | `linkedin.py` | small adapter — in-page modal, multi-step |
| Unknown ATS | `"unsupported"`, nothing happens | best-effort generic fill |

Net: from ~5 hardcoded adapters to **1 generic engine + 2 real adapters (Workday, LinkedIn) + occasional quirk patches**.

---

## Extension module layout

```
extension/
  manifest.json          # broaden matches; add scripting, activeTab
  background.js           # keeps: all HTTP to localhost:8000, resume-blob fetch
  content/
    index.js             # orchestrator: detect → classify → fill → answers → review
    detect.js            # form + field discovery, label association
    classify.js          # field label → semantic key   (port of field_mapper.py)
    fill.js              # framework-safe value setters; select / radio / checkbox / file
    answers.js           # collect unmapped free-text Qs, batch to backend, apply results
    review.js            # overlay panel UI (shadow DOM), edit-in-place, submit detection
    profile.js           # fetch + cache MAP and resume blob (chrome.storage)
    adapters/
      workday.js         # multi-step nav, custom-component fill, MutationObserver re-detect
      linkedin.js        # Easy Apply modal, step-through
      _generic.js        # default: no-op overrides, engine does everything
```

`classify.js` is a near-direct port of `backend/playwright_worker/field_mapper.py` — the regex label→value logic moves to JS almost 1:1. Keep the Python copy until the port is verified, then delete `playwright_worker/`.

---

## Backend changes

Small. Most endpoints already exist.

1. **`GET /profile/autofill`** — flattened, fill-ready shape of the MAP (`firstName`, `lastName`, `email`, `phone`, `city`, `state`, `zip`, `linkedin`, `github`, `website`, `workAuthorized: true`, `needsSponsorship: false`, `yearsExperience`, `currentEmployer`, education list). Content script shouldn't reimplement MAP-shape knowledge.
2. **`GET /jobs/{id}/resume.file`** and **`GET /jobs/{id}/cover-letter.file`** — return the binary (PDF/DOCX) with correct `Content-Type` + `Content-Disposition`. Falls back to the uploaded default resume when no tailored one exists (mirror the logic already in `apply.py:46-53`).
3. **`GET /profile/resume.file`** — the default resume blob, for jobs applied to without a capture step.
4. **`POST /form-answers`** (no job id) — accept `{questions: [...], job: {title, company, description}}` so the extension can get answers for a job that isn't in the DB yet. Keep `POST /jobs/{id}/form-answers` as-is.
5. **`POST /jobs/capture`** — unchanged. Still used to log the job + attach `form_answers`.
6. **Deprecate** `apply.py` (`/apply`, `/apply-status`, `/apply-continue`, `/apply-submit`, `DELETE /apply`) and `scheduler_route.py`'s apply hooks. Leave the code in place behind a `LEGACY_PLAYWRIGHT_APPLY` env flag for one milestone, then remove.
7. **DB:** `Job.form_answers` JSON already exists. Add `Job.application_filled_at` (nullable datetime). No migration framework in use — follow the existing pattern (`scripts/` one-off, or the manual DDL notes in HANDOFF).

CORS already allows `localhost:3000`; add the extension origin (`chrome-extension://<id>`) to `app/main.py` CORS, or keep all calls routed through `background.js` (extension-privileged fetch, no CORS) as today — **prefer the latter**, it's already wired.

---

## The generic field-detection engine (`detect.js` + `classify.js`)

This is the core of the whole migration. Everything else is plumbing.

**Discovery.** For each `<form>` (and form-less field clusters — Workday), collect every `input:not([type=hidden])`, `textarea`, `select`, `[role=combobox]`, `[role=radiogroup]`, `[contenteditable]`.

**Label association**, in priority order:
1. `<label for=id>` / wrapping `<label>`
2. `aria-labelledby` → resolved text
3. `aria-label`
4. `[data-*]` label attributes (Workday uses `data-automation-id`)
5. Nearest preceding block-level text node within the field's container (proximity fallback — the messy case)
6. `placeholder` / `name` / `id` (last resort, tokenized: `firstName` → "first name")

**Classification** (`classify.js`) — normalize label to lowercase, match against the rule table ported from `field_mapper.py`:
- known key → pull value from cached `/profile/autofill`
- `<select>` / combobox → `pickOption(label, optionTexts, profile)` (exact then partial match, same as `field_mapper.pick_select_option`)
- radio/checkbox group (EEO, work auth, sponsorship) → match option label text
- `<input type=file>` → resume vs cover letter by label keyword
- no match + free-text (`textarea`, long text input) → queue for `answers.js`
- no match + structured → leave blank, flag in review panel

**Confidence.** Tag each match `high` (explicit `<label for>` + exact key) / `medium` (proximity or partial) / `low` (guessed). Review panel surfaces `medium`/`low` for a look.

---

## Framework-safe filling (`fill.js`)

ATS forms are React/Angular/Vue — `el.value = x` doesn't register. Standard pattern:

```js
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur',   { bubbles: true }));
}
```

- **Selects:** set `value` + `change`; for custom comboboxes, click to open, click the matching option node.
- **Radio/checkbox:** `el.click()` on the matching input (not `checked =`).
- **File inputs:**
  ```js
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'resume.pdf', { type: 'application/pdf' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  ```
  Custom drag-drop upload zones (some Workday, Lever) need a per-site drop-event synthesis — handle as they come up, don't pre-build.
- **Typing simulation:** for sites that debounce on real keystrokes, fall back to per-character `input` events. Only if a site needs it.

---

## Milestones

### M0 — Backend endpoints + extension scaffold  ·  ✅ DONE (2026-09-06)
- `GET /profile/autofill` (`app/profile_autofill.py` does the flattening + eligibility constants), `GET /profile/resume.file`, `POST /form-answers` (no-id, `answers_router` in `generate.py`). `/jobs/{id}/resume.file` deferred — not needed until AI tailoring returns post-M5.
- `extension/content/` module structure: `util / profile / classify / detect / fill / answers / review / adapters{generic,workday,linkedin} / index`.
- `manifest.json` v0.2.0 — allowlist matches + `activeTab`; old `content.js` LinkedIn trigger left in parallel.
- `background.js` — `AUTOFILL_HANDLERS` for profile/resume-blob/answers/capture; legacy dispatch kept.
- `JobCapture` gains `form_answers` + `mark_applied`; capture route sets `application_submitted_at`.
- Tests: `tests/test_profile_autofill.py` (8). Suite 80 passing.

### M1 — Generic engine on clean ATSs  ·  ✅ core done (2026-09-06), pending in-extension test
- `detect.js` (label association: for → wrap → aria → proximity → attr; radio/checkbox grouping; shadow-DOM pierce) + `classify.js` (rule table ported from `field_mapper.py`, policy/EEO rules first).
- `fill.js` — native-setter text, select, radio/checkbox click, custom combobox (type + listbox pick), file via `DataTransfer`.
- `review.js` — shadow-DOM launcher + review panel, confidence tags, edit-in-place.
- `index.js` — orchestrator: detect form → fill → batch AI questions → review → submit-detection capture.
- **Verified** against live Greenhouse forms (Anthropic 7 fields, Figma 20 fields): all standard fields + Country + EEO + work-auth classified correctly; free-text → AI, unknown selects → user. Detection/classification only — no live submit.
- **Not yet done:** load unpacked in Chrome and run an end-to-end fill on a real form; Lever + Ashby live checks.

### M2 — File upload + review panel  ·  partially built in M1, needs live test  ·  ~0.5 session
- `DataTransfer` resume + cover-letter injection.
- `review.js`: shadow-DOM panel, every field grouped by confidence, edit-in-place writes back to the form, "looks good" dismisses.
- Submission detection: content script observes the site's Submit click + a success signal (URL change / confirmation text), then `POST /jobs/capture` → `PATCH /jobs/{id}/status {applied}` → set `application_filled_at`. Nothing written before submit (decision 3).

### M3 — AI free-text answers  ·  ~0.5 session
- `answers.js`: collect unmapped `textarea` questions, one batched `POST /form-answers` (no-id, with job context) → fill results → flag every one as AI-generated in the review panel.
- Hold Q/A pairs in the content script; include them in the `POST /jobs/capture` payload at submit-detection so they persist to `Job.form_answers` (decision 3 — no job row exists before then).

### M4 — Workday adapter  ·  🚧 built, needs live verification behind sign-in
- `adapters/workday.js` built from stable Workday `data-automation-id`s:
  - `WD_FIELD_MAP` — automation-id suffix → semantic key (more reliable than label text on Workday)
  - button-dropdown handler (click → `promptOption` listbox → pick), 3-spinner date handler (`dateSectionMonth/Day/Year-input`), skills multiselect (left for user), file input (`file-upload-input-ref`)
  - `WD_BOOLEAN_IDS` — known yes/no questions (e.g. `candidateIsPreviousWorker` → No)
  - `isApplicationForm()` / `stepName()` off `progressBar` + `*Page` ids
- `index.js` multi-step: fill step → "⚡ Autofill this step" launcher re-arms on step change; submit-capture armed once, watches for `pageFooterSubmitButton` + success text
- **Verified** against live NVIDIA Workday: adapter loads, `detectJobContext` (title/location/description) works, `isApplicationForm` correctly false on the posting page.
- **Blocked:** steps 2–7 sit behind Workday account sign-in (can't create accounts / enter passwords). Needs Ty signed in to verify field coverage, then tune `WD_FIELD_MAP` + widget handlers from the review-panel output.
- Not handled yet: "Use My Last Application" prefill path; Workday's drag-drop upload-zone variant.

### M5 — LinkedIn Easy Apply + cutover  ·  ~1 session
- `adapters/linkedin.js`: Easy Apply modal, step-through, the existing external-apply-URL detection (already in `background.js`) still useful for logging.
- Broaden `manifest.json` matches to the full ATS list + `activeTab` for everything else.
- Flip `LEGACY_PLAYWRIGHT_APPLY` off. Delete `playwright_worker/`, `apply.py`, `field_mapper.py` (Python), the state-file IPC, subprocess spawn. Update tests.

### M6 — Polish  ·  ongoing
- Per-site quirk patches as encountered.
- "Fill confidence" tuning from real use.
- Undo-all. Keyboard shortcut to trigger. Optional: match-score-free "is this worth applying to" summary in the overlay (out of scope unless wanted).

---

## Decisions (settled 2026-09-06)

1. **`playwright_worker/` — DELETE outright.** No headless-fallback flag. `playwright_worker/`, `apply.py`, `field_mapper.py` (Python), the state-file IPC and subprocess spawn all go in M5. `playwright` drops out of `requirements.txt`. Tests referencing the worker get removed/rewritten.
2. **Manifest match scope — explicit ATS allowlist + `activeTab`.** Auto-inject on: `*.myworkdayjobs.com`, `boards.greenhouse.io` + `job-boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com`, `*.icims.com`, `*.workable.com`, `*.smartrecruiters.com`, `*.bamboohr.com`, `jobs.jobvite.com`, `www.linkedin.com/jobs/*`. `activeTab` + `scripting` so the fill can be manually triggered on any other page from the toolbar button. No `<all_urls>`.
3. **Pipeline capture — on submit-detection only.** Nothing is written to the DB when you click Autofill. When the content script detects the site's real Submit was clicked, it calls `POST /jobs/capture` then `PATCH /jobs/{id}/status {applied}` + sets `application_filled_at`. Pipeline only ever contains real submitted applications. (Trade-off accepted: abandoned autofills leave no trace.)
4. **Resume — uploaded default only.** The overlay uses `GET /profile/resume.file` for every application. No per-job AI tailoring in this migration. The "Tailor with AI" checkbox and `POST /jobs/{id}/resume` flow stay in the codebase but are not wired into the autofill path yet — revisit after M5.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Workday complexity | High | Dedicated milestone, accept partial fills, MutationObserver re-detect |
| Generic detection long tail — "incomplete fields" | Medium (permanent) | Confidence flags in review panel; treat as ongoing tuning, not a bug to close |
| ATS DOM changes break selectors | Medium | Generic engine is resilient (semantic, not selector-based); only adapters are brittle |
| Custom file-upload widgets | Medium | Per-site drop synthesis, handled reactively |
| Page CSP blocking the overlay | Low | Render panel in a shadow DOM root; all logic is content-script, no injected `<script>` |
| Chrome Web Store review (if ever published) | Low | No remote code; API calls to a user-run localhost backend are compliant. Unpacked/local install needs no review. |
| ATS "no-bot" heuristics | Low | It's your real session in your real browser with human-paced events — the thing bot-detection is looking for (headless, datacenter IP, fresh session) is exactly what this removes |

---

## What stays exactly as-is

- Job fetch pipeline (`fetch.py`, JobSpy, filters) — untouched
- MAP storage, `/profile` CRUD, resume upload
- Resume + cover-letter generation (`generate.py`)
- Pipeline / Discover / Analytics frontend
- `background.js` as the HTTP broker to `localhost:8000`
