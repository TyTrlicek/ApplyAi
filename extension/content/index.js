// Orchestrator: detect the form (or the Workday sign-in), fill the current step,
// render the status tracker, drive multi-step navigation, and capture the job to
// the pipeline once it's submitted.

(() => {
  if (window.__AA_ACTIVE__) {
    AA.log("already active on this page — skipping re-init");
    return;
  }
  window.__AA_ACTIVE__ = true;

  const adapter = pickAdapter();
  AA.log("adapter:", adapter.name, "on", AA.host);

  let launcherUp = false;
  let busy = false;
  let stepDone = false;
  let lastStepKey = null;
  let submitArmed = false;
  let jobContext = null;
  let heldAnswers = [];

  const stepKey = () => {
    if (adapter.isJobPostingPage && safe(() => adapter.isJobPostingPage())) return "posting";
    if (adapter.isAuthScreen && safe(() => adapter.isAuthScreen())) return "auth";
    if (!adapter.isMultiStep) return "single";
    return safe(() => (adapter.stepName ? adapter.stepName() : location.pathname)) || location.pathname;
  };

  const scan = () => {
    if (busy) return;
    const sk = stepKey();
    if (sk !== lastStepKey) {
      lastStepKey = sk;
      stepDone = false;
      launcherUp = false;
    }
    if (launcherUp || stepDone) return;

    const onPosting = adapter.isJobPostingPage && safe(() => adapter.isJobPostingPage());
    const onAuth = !onPosting && adapter.isAuthScreen && safe(() => adapter.isAuthScreen());
    const onForm = !onPosting && !onAuth && safe(() => adapter.isApplicationForm());
    if (onPosting || onAuth || onForm) {
      launcherUp = true;
      const label = onPosting
        ? "⚡ Apply & autofill (ApplyAi)"
        : onAuth
        ? "⚡ Sign in & autofill (ApplyAi)"
        : adapter.isMultiStep
        ? "⚡ Autofill this step"
        : "⚡ Autofill with ApplyAi";
      AA.tracker.mountLauncher(run, label);
      AA.log("mounted launcher —", onPosting ? "job posting" : onAuth ? "auth screen" : `step: ${sk}`);
    }
  };

  const mo = new MutationObserver(scan);
  mo.observe(document.documentElement, { childList: true, subtree: true });
  scan();
  const iv = setInterval(scan, 1500);
  setTimeout(() => clearInterval(iv), (adapter.isMultiStep ? 25 : 1) * 60000);

  async function run() {
    busy = true;
    try {
      if (adapter.isJobPostingPage && safe(() => adapter.isJobPostingPage())) {
        await runAutoStart();
      } else if (adapter.isAuthScreen && safe(() => adapter.isAuthScreen())) {
        await runAuth();
      } else {
        await runStep();
      }
    } finally {
      busy = false;
    }
  }

  // ── Job posting → Apply → chooser (Workday only) ──────────────────────────
  async function runAutoStart() {
    AA.tracker.setStatus("Starting your application…");
    const res = await adapter.autoStartApply({ status: (m) => AA.tracker.setStatus(m) });
    lastStepKey = null;
    stepDone = false;
    if (!res.ok) {
      AA.tracker.setStatus("Couldn't start it automatically (" + (res.reason || "unknown") + ") — click Apply yourself, I'll take over from there.");
      return;
    }
    await AA.sleep(400);
    if (safe(() => adapter.isAuthScreen())) return runAuth();
    if (safe(() => adapter.isApplicationForm())) return runStep();
  }

  // ── Workday sign-in / account creation ────────────────────────────────────
  async function runAuth() {
    const creds = await AA.profile.workdayCreds();
    if (!creds) {
      AA.tracker.render(
        { title: "Workday", phase: "auth", step: null, fields: [
          { label: "Workday sign-in", required: true, status: "empty-required", note: "Open the ApplyAi popup → Workday sign-in credentials" },
        ] },
        {}
      );
      return;
    }
    AA.tracker.setStatus("Signing in to Workday…");
    const res = await adapter.authenticate(creds, {
      status: (m) => AA.tracker.setStatus(m),
      onVerify: () =>
        new Promise((resolve) => {
          AA.tracker.verifyPrompt((code) => resolve(code));
        }),
    });
    if (res.ok) {
      AA.tracker.setStatus("Signed in — filling the application…");
      // Wait for the first step to render, then fill it automatically.
      for (let i = 0; i < 20; i++) {
        await AA.sleep(500);
        if (safe(() => adapter.isApplicationForm())) {
          lastStepKey = stepKey();
          stepDone = false;
          return runStep();
        }
      }
      lastStepKey = null;
    } else {
      AA.tracker.setStatus("Sign-in failed: " + (res.reason || "unknown") + " — do it manually, I'll take over from the form.");
    }
  }

  // ── Fill one step, build the tracker report ──────────────────────────────
  async function runStep() {
    const profile = await AA.profile.get();
    const resumeBlob = await AA.profile.resume();
    jobContext = safe(() => adapter.detectJobContext()) || {};

    const fields = (safe(() => adapter.detectFields(document)) || []).filter((f) => f.label || f.wdKind);
    const report = [];
    const questions = [];
    const qFields = [];

    for (const f of fields) {
      const cls = classifyField(f);
      const rec = { label: f.label || f.wdId || "field", required: !!f.required, ref: f.el, status: "empty-optional", value: "", note: "" };

      if (f.kind === "file" || f.wdKind === "file") {
        const hint = (f.label + " " + (f.name || "") + " " + (f.id || "")).toLowerCase();
        if (/cover\s*letter|coverletter/.test(hint)) {
          finish(rec, false, "", "cover letter not attached");
        } else if (!resumeBlob) {
          finish(rec, false, "", "no default resume — upload one on the Profile page");
        } else {
          const target = f.kind === "file" ? f.el : adapter.fileInput && adapter.fileInput();
          const ok = target && (await safeAsync(() => AA.fill.fillFile(target, resumeBlob)));
          finish(rec, !!ok, resumeBlob.name, ok ? "" : "upload widget not found — attach it yourself");
        }
        report.push(rec);
        continue;
      }

      if (f.wdKind && adapter.fillField) {
        const r = await safeAsync(() => adapter.fillField(f, { cls, profile, resumeBlob }));
        if (r) {
          finish(rec, !!r.filled, r.value || displayValue(f, cls, profile), r.filled ? "" : r.reason || "fill this one yourself");
          report.push(rec);
          continue;
        }
      }

      if (cls.kind === "unknown") {
        if (f.el.tagName === "TEXTAREA" && f.label && f.label.length > 8) {
          questions.push(f.label);
          qFields.push({ f, rec });
          continue;
        }
        finish(rec, false, "", "not recognised — fill this one yourself");
        report.push(rec);
        continue;
      }

      const ok = await applyField(f, cls, profile);
      finish(rec, !!ok, displayValue(f, cls, profile), ok ? "" : "couldn't match an option");
      if (ok && confidenceOf(f) === "low") rec.status = "review", (rec.note = "fuzzy match — double-check");
      report.push(rec);
    }

    if (questions.length) {
      AA.tracker.setStatus(`Drafting ${questions.length} answer${questions.length === 1 ? "" : "s"} with AI…`);
      try {
        const drafted = await AA.answers.draft(questions, jobContext);
        heldAnswers = heldAnswers.concat(drafted);
        for (let i = 0; i < qFields.length; i++) {
          const { f, rec } = qFields[i];
          const answer = drafted[i]?.answer || "";
          if (!answer) {
            finish(rec, false, "", "no draft returned");
          } else {
            const ok = await safeAsync(() => AA.fill.fillText(f.el, answer));
            finish(rec, !!ok, answer, "");
            if (ok) rec.status = "review", (rec.note = "AI-drafted — read before submitting");
          }
          report.push(rec);
        }
      } catch (err) {
        for (const { rec } of qFields) {
          finish(rec, false, "", "AI draft failed: " + err.message);
          report.push(rec);
        }
      }
    }

    stepDone = true;
    launcherUp = false;

    const step = adapter.isMultiStep ? stepInfo() : null;
    AA.tracker.render(
      { title: adapter.name === "workday" ? "Workday" : jobContext.company || null, step, phase: step && step.index >= step.total ? "review" : "fill", fields: report },
      {
        onJump: (fld) => AA.tracker.jumpTo(fld.ref),
        onNext: adapter.isMultiStep ? goNext : null,
      }
    );

    if (!submitArmed) {
      armSubmitCapture();
      submitArmed = true;
    }
  }

  function finish(rec, ok, value, note) {
    if (ok) {
      rec.status = "filled";
      rec.value = value;
    } else {
      rec.status = rec.required ? "empty-required" : note.includes("yourself") || note ? "skipped" : "empty-optional";
      rec.note = note;
    }
  }

  async function goNext() {
    const btn = adapter.nextButton && adapter.nextButton();
    if (!btn) {
      AA.tracker.setStatus("Couldn't find Workday's Next button — click it yourself.");
      return;
    }
    const before = stepKey();
    btn.click();
    AA.tracker.setStatus("Advancing…");
    for (let i = 0; i < 30; i++) {
      await AA.sleep(400);
      if (stepKey() !== before && safe(() => adapter.isApplicationForm())) {
        stepDone = false;
        lastStepKey = stepKey();
        await AA.sleep(600);
        return runStep();
      }
    }
    AA.tracker.setStatus("Next step didn't load — Workday may want a required field. Check the page.");
    stepDone = false;
  }

  function stepInfo() {
    // "step 3 of 7" appears in Workday's progress text.
    const m = (document.body.innerText.match(/step\s+(\d+)\s+of\s+(\d+)/i) || []).slice(1).map(Number);
    const name = safe(() => adapter.stepName()) || "Application";
    return { name, index: m[0] || 1, total: m[1] || 5 };
  }

  // ── classification / filling ────────────────────────────────────────────
  function classifyField(f) {
    if (f.wdKey) {
      const BOOL = { workAuthorized: 1, usCitizen: 1, needsSponsorship: 1 };
      return { key: f.wdKey, kind: BOOL[f.wdKey] ? "boolean" : "text" };
    }
    return AA.classify.classify(f.label);
  }

  async function applyField(f, cls, profile) {
    if (f.kind === "select") {
      const pick = AA.classify.pickOption(cls, f.options.map((o) => o.raw), profile);
      if (!pick) return false;
      const opt = f.options.find((o) => o.raw === pick);
      return AA.fill.fillSelect(f.el, opt ? opt.value : pick);
    }
    if (f.kind === "radio" || f.kind === "checkbox") {
      const pick = AA.classify.pickOption(cls, f.options.map((o) => o.raw), profile);
      if (!pick) return false;
      const opt = f.options.find((o) => o.raw === pick);
      return AA.fill.pickRadio(f.members, opt ? opt.el : null);
    }
    if (f.kind === "combobox") {
      const want = comboboxWant(cls, profile);
      return want ? AA.fill.fillCombobox(f.el, want) : false;
    }
    const value = AA.classify.valueFor(cls.key, profile);
    if (!value) return false;
    return AA.fill.fillText(f.el, value);
  }

  function comboboxWant(cls, profile) {
    if (cls.kind === "decline") {
      return { typed: "", match: /decline|prefer not|wish (not )?to (answer|disclose|identify)|not to (say|answer|disclose|identify)|don'?t wish|rather not/ };
    }
    if (cls.kind === "boolean") {
      const yes = AA.classify.booleanIntent(cls.key);
      return { typed: "", match: yes ? /^yes\b/i : /^no\b/i };
    }
    const v = AA.classify.valueFor(cls.key, profile);
    return v ? { text: v, typed: v } : null;
  }

  // ── submit → capture (decision 3) ───────────────────────────────────────
  function armSubmitCapture() {
    let captured = false;
    const capture = async (why) => {
      if (captured) return;
      captured = true;
      AA.log("submit detected via", why);
      try {
        await AA.bg("CAPTURE_APPLIED", {
          job: {
            title: jobContext.title,
            company: jobContext.company,
            location: jobContext.location,
            url: location.href,
            description: jobContext.description,
          },
          formAnswers: heldAnswers,
        });
        AA.tracker.setStatus("Logged to your ApplyAi pipeline as applied ✓");
      } catch (err) {
        AA.warn("capture failed", err);
      }
    };

    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest('button,[type="submit"],[role="button"],a');
        if (!btn) return;
        const t = AA.normalize(AA.text(btn) + " " + (btn.value || ""));
        const dai = btn.getAttribute && btn.getAttribute("data-automation-id");
        if (dai === "pageFooterSubmitButton" || /(submit application|submit your application|^submit$|^apply$|send application)/.test(t)) {
          setTimeout(() => confirmSubmitted(capture), 2500);
        }
      },
      true
    );

    const smo = new MutationObserver(() => {
      const b = AA.normalize(document.body.innerText).slice(0, 4000);
      if (/(application (was )?submitted|thank you for applying|we('| ha)ve received your application|successfully submitted|your application has been submitted)/.test(b)) {
        capture("success-text");
        smo.disconnect();
      }
    });
    smo.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(() => smo.disconnect(), 30 * 60 * 1000);
  }

  function confirmSubmitted(capture) {
    const b = AA.normalize(document.body.innerText).slice(0, 4000);
    if (!safe(() => adapter.isApplicationForm()) || /(submitted|thank you|received your application)/.test(b)) capture("submit-click");
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  function pickAdapter() {
    for (const name of ["workday", "linkedin"]) {
      const a = AA.adapters[name];
      if (a && safe(() => a.match(AA.host))) return a;
    }
    return AA.adapters.generic;
  }
  function confidenceOf(f) {
    if (["for", "wrap", "legend"].includes(f.labelSource)) return "high";
    if (f.labelSource === "aria" || f.labelSource === "wd") return "medium";
    return "low";
  }
  function displayValue(f, cls, profile) {
    if (cls.kind === "boolean") return AA.classify.booleanIntent(cls.key) ? "Yes" : "No";
    if (cls.kind === "decline") return "Decline to answer";
    if (f.kind === "select" || f.kind === "radio" || f.kind === "checkbox") {
      return AA.classify.pickOption(cls, f.options.map((o) => o.raw), profile) || "";
    }
    return AA.classify.valueFor(cls.key, profile) || "";
  }
  function safe(fn) {
    try {
      return fn();
    } catch {
      return null;
    }
  }
  async function safeAsync(fn) {
    try {
      return await fn();
    } catch (e) {
      AA.warn(e);
      return false;
    }
  }
})();
