// Workday adapter.
//
// Workday application forms are a 5–7 step wizard behind an account gate (the
// user signs in / creates the account themselves; the extension fills each step
// afterwards). Controls carry stable, Workday-controlled `data-automation-id`
// attributes that are consistent across tenants — those are the anchor here,
// not <label for>.
//
// Plain <input>/<textarea> on Workday do have real <label>s, so the generic
// engine handles them. This adapter adds:
//   - key mapping by data-automation-id (more reliable than label text)
//   - Workday's non-native widgets: button-dropdowns, 3-spinner dates, the
//     skills multiselect, and the file-upload dropzone
//   - multi-step navigation (fill step -> user clicks Next -> re-detect)
//
// Built from documented/stable Workday automation IDs. Step-2+ forms sit behind
// sign-in, so live-verify field coverage once signed in and tune WD_FIELD_MAP /
// the widget handlers from what the review panel reports.
//
// Wrapped in an IIFE: content-script files share one global scope, so top-level
// const/let would throw "already declared" if the bundle is injected twice
// (e.g. the popup's manual trigger on an already-auto-injected page).

(() => {
  AA.adapters = AA.adapters || {};

  // formField-* wrapper suffix (or raw automation-id)  ->  semantic key
  const WD_FIELD_MAP = {
    "legalNameSection_firstName": "firstName",
    "legalNameSection_lastName": "lastName",
    "preferredNameSection_firstName": "preferredName",
    "name--legalName--firstName": "firstName",
    "name--legalName--lastName": "lastName",
    "addressSection_addressLine1": "street",
    "addressSection_city": "city",
    "addressSection_postalCode": "zip",
    "addressSection_countryRegion": "state",
    "address--city": "city",
    "address--postalCode": "zip",
    "address--addressLine1": "street",
    "address--countryRegion": "state",
    "country": "country",
    "countryDropdown": "country",
    "phone-number": "phone",
    "phoneNumber--phoneNumber": "phone",
    "email": "email",
    "linkedinQuestion": "linkedin",
    "linkedin": "linkedin",
  };

  // Yes/No dropdown questions where we know the answer regardless of label text.
  const WD_BOOLEAN_IDS = {
    candidateIsPreviousWorker: "no", // "Have you worked here before?" -> No
  };

  const daq = (id, scope = document) => scope.querySelector(`[data-automation-id="${id}"]`);
  const btnByText = (re) =>
    [...document.querySelectorAll('button,a[role="button"],a')].find((b) => re.test(AA.text(b)));

  const wd = {
    name: "workday",
    match: (host) => /myworkdayjobs\.com|workday\.com/.test(host),
    isMultiStep: true,
    partial: true,

    // ── Account creation / sign-in ────────────────────────────────────────────
    // Workday gates every application behind an account (step 1 of N). The
    // extension creates / signs into it using credentials the user stored in
    // the popup (chrome.storage.local only). Passwords never reach the backend.

    _onStepForm() {
      return !!document.querySelector(
        '[data-automation-id="pageFooterNextButton"],[data-automation-id="myInformationPage"],' +
          '[data-automation-id="myExperiencePage"],[data-automation-id="questionnairePage"],' +
          '[data-automation-id="voluntaryDisclosuresPage"],[data-automation-id="fileUploadDropZone"],' +
          '[data-automation-id="formField-legalNameSection_firstName"]'
      );
    },

    isAuthScreen() {
      if (this._onStepForm()) return false;
      // Either the email/password form, or the first "Sign in with …" chooser
      // screen (which needs a "Sign in with email" click to reveal the fields).
      if (document.querySelector('input[type="password"]')) return true;
      const txt = document.body.innerText.slice(0, 2500);
      return (
        /sign in with (google|email|linkedin)|create account/i.test(txt) &&
        !!btnByText(/sign in with email|create account/i)
      );
    },

    // hooks.onVerify() -> Promise<string> (the emailed code); hooks.status(msg)
    async authenticate(creds, hooks = {}) {
      const status = hooks.status || (() => {});
      if (!creds || !creds.email || !creds.password) {
        return { ok: false, reason: "no Workday credentials set — open the ApplyAi popup" };
      }

      status("Creating your Workday account…");

      // Step A: the "Sign in with Google / email / LinkedIn" chooser — take the
      // email path to reveal the actual fields.
      if (!document.querySelector('input[type="password"]')) {
        const emailPath = btnByText(/sign in with email/i);
        if (emailPath) {
          emailPath.click();
          await AA.sleep(1200);
        }
      }

      // Step B: switch from the sign-in form to Create Account.
      if (document.querySelectorAll('input[type="password"]').length < 2) {
        const createLink = daq("createAccountLink") || btnByText(/create account/i);
        if (createLink) {
          createLink.click();
          await AA.sleep(1200);
        }
      }

      const mode = document.querySelectorAll('input[type="password"]').length >= 2 ? "create" : "signin";
      let submitBtn = await fillAuth(creds, mode);
      let resubmits = 0;

      // Outcomes: verification screen / "already exists" / straight into the form.
      for (let i = 0; i < 30; i++) {
        await AA.sleep(500);
        if (this.isApplicationForm()) return { ok: true };

        const bodyText = document.body.innerText.slice(0, 3000);

        // Still on the same auth form after the click — retry the submit (React
        // sometimes drops the first synthetic press) up to twice.
        if (
          submitBtn &&
          submitBtn.isConnected &&
          document.querySelector('input[type="password"]') &&
          resubmits < 2 &&
          i > 2 &&
          i % 4 === 0
        ) {
          resubmits++;
          status("Submitting…");
          AA.fill.realClick(submitBtn);
          continue;
        }

        if (/already (exists|in use|registered|an account)/i.test(bodyText) || /account.*already/i.test(bodyText)) {
          status("That account already exists — signing in…");
          (daq("signInLink") || btnByText(/^sign in$/i) || btnByText(/back to sign in/i))?.click();
          await AA.sleep(1000);
          await fillAuth(creds, "signin");
          await AA.sleep(1500);
          continue;
        }

        const codeField = document.querySelector(
          'input[data-automation-id*="erificat" i],input[data-automation-id*="code" i],input[autocomplete="one-time-code"]'
        );
        if (codeField && hooks.onVerify && !codeField.dataset.aaTried) {
          codeField.dataset.aaTried = "1";
          status("Enter the code Workday emailed you.");
          const code = await hooks.onVerify();
          el_set(codeField, code);
          (btnByText(/verify|submit|continue/i))?.click();
          await AA.sleep(1800);
          continue;
        }
      }
      return { ok: this.isApplicationForm(), reason: "sign-in didn't reach the application form" };
    },

    detectJobContext() {
      const g = (d) => {
        const e = document.querySelector(`[data-automation-id="${d}"]`);
        return e ? AA.text(e) : null;
      };
      const ctx = AA.adapters.generic.detectJobContext();
      ctx.title = g("jobPostingHeader") || ctx.title;

      const locEl = document.querySelector('[data-automation-id="locations"] dd, [data-automation-id="locations"]');
      const fromUrl = (location.pathname.match(/\/job\/([^/]+)\//) || [])[1];
      if (locEl && locEl.tagName === "DD") ctx.location = AA.text(locEl);
      else if (fromUrl) ctx.location = fromUrl.replace(/-/g, " ").replace(/^US\s*/, "");
      ctx.location = (ctx.location || "").replace(/^locations?/i, "").trim() || ctx.location;

      ctx.description = g("jobPostingDescription") || ctx.description;
      ctx.company = ctx.company || AA.host.split(".")[0].replace(/\b\w/g, (c) => c.toUpperCase());
      return ctx;
    },

    // We're in the wizard (not the job posting / sign-in) if a step footer or a
    // known application section is present. NB the "step 1 of N" progress bar
    // shows on the sign-in screen too, so it's not a valid marker on its own.
    isApplicationForm() {
      if (this.isAuthScreen()) return false;
      return !!document.querySelector(
        '[data-automation-id="pageFooterNextButton"],[data-automation-id="bottom-navigation-next-button"],' +
          '[data-automation-id="pageFooterSubmitButton"],' +
          '[data-automation-id="myInformationPage"],[data-automation-id="myExperiencePage"],' +
          '[data-automation-id="questionnairePage"],[data-automation-id="voluntaryDisclosuresPage"],' +
          '[data-automation-id="formField-legalNameSection_firstName"],[data-automation-id="fileUploadDropZone"]'
      );
    },

    stepName() {
      const active = document.querySelector(
        '[data-automation-id="progressBarActiveStep"],[aria-current="step"]'
      );
      if (active) return AA.text(active);
      const page = document.querySelector(
        '[data-automation-id$="Page"][data-automation-id^="my"],[data-automation-id="questionnairePage"],[data-automation-id="voluntaryDisclosuresPage"]'
      );
      return page ? page.getAttribute("data-automation-id").replace(/Page$/, "") : "application";
    },

    nextButton() {
      return document.querySelector(
        '[data-automation-id="pageFooterNextButton"],[data-automation-id="bottom-navigation-next-button"]'
      );
    },
    submitButton() {
      return document.querySelector('[data-automation-id="pageFooterSubmitButton"]');
    },

    detectFields(root = document) {
      const scope =
        root.querySelector?.('[data-automation-id$="Page"]') ||
        root.querySelector?.('form[data-automation-id="applyFlow"]') ||
        root;

      // 1. Generic engine for the labelled native inputs/textareas.
      const generic = AA.detect.detectFields(scope).filter((f) => f.kind !== "file");

      // Attach a Workday key hint from the wrapper automation-id.
      for (const f of generic) {
        const wrap = f.el.closest("[data-automation-id]");
        const dai = wrap?.getAttribute("data-automation-id") || "";
        const suffix = dai.replace(/^formField-/, "");
        if (WD_FIELD_MAP[suffix]) f.wdKey = WD_FIELD_MAP[suffix];
        f.wdId = suffix;
      }

      // 2. Button-dropdowns (Workday renders selects as <button>).
      const dropdowns = [...AA.deepQueryAll('button[aria-haspopup="listbox"],[data-automation-id="selectShowAll"] button', scope)]
        .filter(AA.isVisible)
        .map((btn) => {
          const wrap = btn.closest('[data-automation-id^="formField-"]') || btn.closest("[data-automation-id]");
          const dai = (wrap?.getAttribute("data-automation-id") || "").replace(/^formField-/, "");
          return {
            el: btn,
            kind: "wd-dropdown",
            wdKind: "dropdown",
            wdId: dai,
            wdKey: WD_FIELD_MAP[dai] || null,
            label: wdLabel(btn, wrap),
            labelSource: "wd",
            options: [],
            required: btn.getAttribute("aria-required") === "true",
          };
        });

      // 3. Date widgets (three spin inputs).
      const dates = [...AA.deepQueryAll('[data-automation-id="dateInputWrapper"],[data-automation-id="dateWidget"]', scope)]
        .filter(AA.isVisible)
        .map((el) => ({
          el,
          kind: "wd-date",
          wdKind: "date",
          wdId: (el.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "").replace(/^formField-/, ""),
          label: wdLabel(el, el.closest('[data-automation-id^="formField-"]')),
          labelSource: "wd",
          options: [],
        }));

      // 4. Skills / multiselect.
      const multis = [...AA.deepQueryAll('[data-automation-id="multiSelectContainer"]', scope)]
        .filter(AA.isVisible)
        .map((el) => ({
          el,
          kind: "wd-multiselect",
          wdKind: "multiselect",
          wdId: "skills",
          label: wdLabel(el, el.closest('[data-automation-id^="formField-"]')),
          labelSource: "wd",
          options: [],
        }));

      return [...generic, ...dropdowns, ...dates, ...multis];
    },

    fileInput() {
      return (
        document.querySelector('input[type="file"][data-automation-id="file-upload-input-ref"]') ||
        document.querySelector('[data-automation-id="select-files"] input[type="file"]') ||
        document.querySelector('input[type="file"]')
      );
    },

    // index.js delegates here for wd-* fields; return {filled,...} if handled,
    // null to fall through to the generic filler.
    async fillField(field, { cls, profile }) {
      if (field.wdKind === "dropdown") {
        const target = pickDropdownValue(field, cls, profile);
        if (!target) return { filled: false, reason: "no matching option" };
        return { filled: await selectDropdown(field.el, target), value: target };
      }
      if (field.wdKind === "date") {
        const v = field.wdKey ? AA.classify.valueFor(field.wdKey, profile) : null;
        const dstr = v || (/(grad|start|end)/i.test(field.label) ? profile.graduation : "");
        if (!dstr) return { filled: false, reason: "no date value" };
        return { filled: await fillWdDate(field.el, dstr), value: dstr };
      }
      if (field.wdKind === "multiselect") {
        return { filled: false, reason: "skills left for you" };
      }
      return null;
    },
  };

  function el_set(el, value) {
    if (!el) return false;
    el.focus();
    AA.fill.setNativeValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  const isHoneypot = (el) =>
    el.getAttribute("data-automation-id") === "beecatcher" ||
    /robot|do not enter|human/i.test(el.getAttribute("aria-label") || "") ||
    el.tabIndex === -1;

  // mode: "create" (email + password + verify + agree) or "signin" (email + password)
  async function fillAuth(creds, mode) {
    const emailEl =
      document.querySelector('input[data-automation-id="email"]') ||
      document.querySelector('input[type="email"]') ||
      [...document.querySelectorAll("input[type=text],input:not([type])")].find((i) => !isHoneypot(i));
    const pwEls = [...document.querySelectorAll('input[type="password"]')].filter((i) => !isHoneypot(i));

    el_set(emailEl, creds.email);
    await AA.sleep(150);
    if (pwEls[0]) el_set(pwEls[0], creds.password);
    if (mode === "create" && pwEls[1]) el_set(pwEls[1], creds.password);
    await AA.sleep(150);

    if (mode === "create") {
      const agree = [...document.querySelectorAll('input[type="checkbox"]')].find((c) => !isHoneypot(c));
      if (agree && !agree.checked) {
        agree.click();
        await AA.sleep(150);
      }
    }

    const submit =
      document.querySelector('[data-automation-id="createAccountSubmitButton"],[data-automation-id="signInSubmitButton"]') ||
      btnByText(mode === "create" ? /^create account$/i : /^sign in$/i) ||
      btnByText(/^(create account|sign in)$/i);
    if (!submit) return null;
    // Workday's submit button, like its react-select, ignores a bare .click() —
    // use the full pointer sequence.
    AA.fill.realClick(submit);
    await AA.sleep(1600);
    return submit;
  }

  function wdLabel(el, wrap) {
    const w = wrap || el.closest('[data-automation-id^="formField-"]') || el.parentElement;
    if (w) {
      const lbl = w.querySelector('label,[id$="-label"],[data-automation-id$="-label"]');
      if (lbl && AA.text(lbl)) return AA.text(lbl);
    }
    return el.getAttribute("aria-label") || AA.text(el) || "";
  }

  function pickDropdownValue(field, cls, profile) {
    if (field.wdId && WD_BOOLEAN_IDS[field.wdId]) {
      return WD_BOOLEAN_IDS[field.wdId] === "yes" ? "Yes" : "No";
    }
    if (field.wdKey) {
      const v = AA.classify.valueFor(field.wdKey, profile);
      if (v) return v;
    }
    const c = cls && cls.key ? cls : AA.classify.classify(field.label);
    if (c.kind === "boolean") return AA.classify.booleanIntent(c.key) ? "Yes" : "No";
    if (c.kind === "decline") return "I do not wish to answer";
    return c.key ? AA.classify.valueFor(c.key, profile) : null;
  }

  // Click a Workday button-dropdown and pick the option matching `text`.
  async function selectDropdown(btn, text) {
    btn.scrollIntoView({ block: "center" });
    btn.click();
    const want = AA.normalize(text);
    for (let i = 0; i < 15; i++) {
      await AA.sleep(120);
      const opts = [...document.querySelectorAll('[data-automation-id="promptOption"],[role="option"]')].filter(AA.isVisible);
      if (opts.length) {
        const hit =
          opts.find((o) => AA.normalize(AA.text(o)) === want) ||
          opts.find((o) => AA.normalize(AA.text(o)).startsWith(want)) ||
          opts.find((o) => AA.normalize(AA.text(o)).includes(want)) ||
          (want === "no" && opts.find((o) => /^no\b/i.test(AA.text(o)))) ||
          (want === "yes" && opts.find((o) => /^yes\b/i.test(AA.text(o))));
        if (hit) {
          hit.scrollIntoView({ block: "nearest" });
          hit.click();
          await AA.sleep(60);
          return true;
        }
      }
    }
    btn.click(); // close the menu we opened
    return false;
  }

  // Workday dates: month/day/year spin inputs. Accepts "May 2025", "2025-05"...
  async function fillWdDate(wrapper, str) {
    const d = parseLooseDate(str);
    if (!d) return false;
    const set = (sel, val) => {
      const inp = wrapper.querySelector(`[data-automation-id="${sel}"]`);
      if (!inp) return;
      inp.focus();
      AA.fill.setNativeValue(inp, String(val));
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      inp.dispatchEvent(new Event("blur", { bubbles: true }));
    };
    set("dateSectionMonth-input", d.m);
    set("dateSectionDay-input", d.day);
    set("dateSectionYear-input", d.y);
    return true;
  }

  function parseLooseDate(str) {
    const months = "january february march april may june july august september october november december".split(" ");
    const s = String(str).toLowerCase().trim();
    let m = s.match(/([a-z]+)\s+(\d{4})/);
    if (m) {
      const mi = months.findIndex((x) => x.startsWith(m[1].slice(0, 3)));
      if (mi >= 0) return { m: mi + 1, day: 1, y: +m[2] };
    }
    m = s.match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (m) return { m: +m[2], day: +(m[3] || 1), y: +m[1] };
    m = s.match(/(\d{1,2})\/(\d{4})/);
    if (m) return { m: +m[1], day: 1, y: +m[2] };
    m = s.match(/\b(19|20)\d{2}\b/);
    if (m) return { m: 1, day: 1, y: +m[0] };
    return null;
  }

  AA.adapters.workday = wd;
})();
