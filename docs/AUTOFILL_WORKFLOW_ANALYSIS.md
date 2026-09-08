# Autofill Workflow — Analysis & Refinement
_2026-09-08. After the first live Workday practice run (NVIDIA), + research on how the category handles this._

---

## What the live run actually did

Driven through Ty's Chrome (real extension, real credentials from the popup) on
`nvidia.wd5.myworkdayjobs.com/.../apply/applyManually`:

| Stage | Result |
|---|---|
| Content script injects on Workday | ✅ |
| `isAuthScreen()` detects the "Sign in with Google/LinkedIn/email" chooser | ✅ (after this session's fix) |
| Launcher shows "⚡ Sign in & autofill" | ✅ |
| `authenticate()`: chooser → "Sign in with email" → "Create Account" | ✅ navigated correctly |
| `fillAuth()`: email, password, verify-password, "I agree" checkbox | ✅ **all filled correctly** from `chrome.storage.local` creds |
| Click "Create Account" (submit) | ❌ **no-op** — form stayed put |
| `authenticate()` loop | ❌ timed out after 12 s → "Sign-in failed" |
| Email verification / steps 2–7 | ⬜ never reached |

**Root cause of the submit failure:** bare `submitBtn.click()`. Workday's submit
button — like its react-select dropdowns — ignores a lone synthetic click and
needs the full `pointerdown → mousedown → pointerup → mouseup → click` sequence.
Same lesson we already learned for Greenhouse dropdowns, not yet applied here.
**Fixed this session** (`fillAuth` now uses `AA.fill.realClick`, `authenticate`
retries up to 2×).

---

## Shortcomings of the current system

### 1. Everything runs in the isolated world — there's a ceiling

The whole extension executes in the content-script isolated world. This works
for Greenhouse text fields and, with `realClick`, react-select. But mature
open-source fillers ([job_app_filler](https://github.com/berellevy/job_app_filler))
found the isolated world **"is sandboxed from any custom js on the webpage, which
is needed to fill React-controlled form fields"** — and had to inject a second
script into the **page's main world** to reach React's internal handlers.

Our `setNativeValue` + event-dispatch trick is a good approximation, but for the
hardest Workday widgets (custom comboboxes, date spinners, repeating sections)
it may not be enough. **Gap:** no MAIN-world escape hatch. MV3 supports
`content_scripts[].world: "MAIN"` or `chrome.scripting.executeScript({world:"MAIN"})`.

### 2. `.click()` and blind `sleep()` everywhere

- **Clicks:** bare `.click()` on buttons/checkboxes/Next/Submit is unreliable on
  React. `realClick` should be the default for *every* interaction, not just
  dropdown options. (Partly fixed.)
- **Timing:** the flow is a chain of `await AA.sleep(N)` guesses. Too short → miss
  the element; too long → sluggish. There is now an `AA.waitFor(predicate)`
  primitive — it needs to replace the sleeps in `authenticate`, `goNext`,
  `fillCombobox`, `selectDropdown`.

### 3. No failure detection / escalation

When a fill silently fails (the submit no-op), the code loops and times out
blind. It should: snapshot state → act → check "did anything change?" → if not,
escalate (bare click → realClick → focus+Enter → report). Applies to submit,
Next, dropdowns, file upload.

### 4. Email verification is unsolved — and it's per-tenant

Every **first** application to a new Workday company = create an account, and
some tenants email a 6-digit code before letting you in. The extension can't
read the inbox. Best case is the `verifyPrompt()` paste box (built, unverified).
No tool in the category automates this — it's a human step.

### 5. Practice runs create real accounts — with real consequences

NVIDIA's create-account screen: *"each candidate is permitted to maintain only
one authentic profile. The creation of duplicate accounts may result in
disqualification."* Every practice run or re-run of the auth flow makes a real
candidate account. **Testing the account-creation path is destructive.**
→ Need a `DRY_RUN` mode: fill everything, never click Create Account / Next /
Submit.

### 6. Multi-step navigation is unproven

`goNext()`, `stepInfo()`, the "step N of M" parsing, step-change re-detection —
none has run against a real Workday wizard. High risk.

### 7. Repeating sections aren't handled

Work Experience / Education on Workday use "Add Another" and one React-registered
value per block. The MAP → adapter path only fills a single flat set of fields.

### 8. Per-tenant variance

The adapter is built against NVIDIA's Workday. Custom screening questions,
section ordering, and some automation-ids differ per company. Every new tenant
is a mini-debugging session until coverage broadens.

### 9. Iteration is bottlenecked on Ty

- Can't reload the extension from automation (`chrome://extensions` is blocked)
- Workday's CSP blocks the page-injection test harness (`localhost` fetch hangs)
- Entering passwords is off-limits to the assistant
- Net: every code change → Ty clicks reload → Ty starts an application → hands
  off. Slow.

---

## Refinements, prioritized

### P0 — make the mechanics reliable (mostly code, no new architecture)

1. **`realClick` everywhere.** Route all button/checkbox/link interactions
   through `AA.fill.realClick`. _(submit: done; Next, checkboxes, "Sign in with
   email"/"Create Account" links: todo)_
2. **`waitFor` instead of sleeps.** `authenticate` waits for the create form to
   appear before filling; `goNext` waits for the next step's `data-automation-id`;
   `fillCombobox` waits for `.select__menu`. _(primitive added; wire it in)_
3. **Act → verify → escalate.** After every state-changing action, confirm the
   DOM moved; retry with a stronger method; surface a clear failure to the
   tracker.
4. **`DRY_RUN` toggle** in the popup. Fill the whole flow, stop before every
   irreversible click. This is how we practice Workday without minting accounts.

### P1 — close the Workday gaps

5. **MAIN-world fill fallback.** A tiny injected page-context script exposing
   `window.__AA_reactSet(el, value)` that walks the React fiber to call the real
   `onChange`. Isolated-world fill tries first; falls back to this when the
   value doesn't stick.
6. **Repeating sections.** Loop MAP work/education entries: fill block → click
   "Add Another" → wait → fill next.
7. **Step-machine for the wizard.** Named steps (`myInformation`, `myExperience`,
   `questionnaire`, `voluntaryDisclosures`, `selfIdentify`, `review`), each with
   its own detect + fill routine, driven by the progress bar.

### P2 — reduce the account-creation risk surface

8. **Reconsider autonomous account creation.** Jobright does it ("Account
   Creation & Autofill" — confirmed on screen). But it's the most fragile,
   highest-consequence part. **Alternative:** on the *first* application to a
   Workday tenant, the tracker says "create your account (30 s), then I'll take
   over" — Ty types his own password once. Every *subsequent* application to
   that tenant, the extension signs in automatically from stored creds. Keeps
   ~90% of the value, drops the verification-code and duplicate-account
   problems from the critical path. Autonomous creation stays behind a flag.

### P3 — unblock iteration

9. **"Reload extension" button in the popup** (`chrome.runtime.reload()`) — dev
   convenience so a code change is one popup click, not a `chrome://extensions`
   trip.
10. **A local Workday-shaped test fixture** served by the backend (same origin →
    no CSP) that mimics the react-select / date / multi-step structure, so the
    fill engine can be regression-tested without a live tenant or a reload.

---

## The refined end-to-end (target state)

1. Ty: MAP + resume + Workday email/password in the popup, once.
2. Open Workday job → Apply → Apply Manually.
3. **First time at this company:** tracker → "Create your account (type your
   password), I'll wait." Ty does it (+ pastes a code if asked). _OR_ autonomous
   creation if the flag is on.
   **Returning:** extension signs in from stored creds, silently.
4. Step 2–7: extension fills each, tracker shows Required/Optional + what's
   missing, Ty reviews and clicks **Next step →** in the tracker.
5. Step 7 (Review): tracker says "check and submit." Ty clicks Workday's Submit.
6. Extension captures the job to the ApplyAi pipeline as `applied`.

Realistic attention: ~90 s (review each step + one code paste) vs. 15–20 min.

---

## Sources
- [job_app_filler (open source Workday/iCIMS filler)](https://github.com/berellevy/job_app_filler) — isolated-world sandbox limitation, XPath + MutationObserver discovery, onChange vs onBlur
- [workday-autofill (Playwright/CDP)](https://github.com/jasonchen270/workday-autofill) — server-side approach, pauses before submit
- [JobWizard — Autofill Workday 2026](https://jobwizard.ai/blog/how-to-autofill-job-applications-automatically-in-2026) — data-automation-id polling per step, repeating-section handling
- [Jobright Autofill](https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/) — "mimics standard typing"; on-screen panel confirmed as "Account Creation & Autofill"
