// Orchestrator: detect the form, mount the launcher, run the fill, show the
// review panel, and capture the job into the pipeline once you submit.

(() => {
  const adapter = pickAdapter();
  AA.log("adapter:", adapter.name, "on", AA.host);

  let launcherUp = false;
  let filling = false;
  let stepFilled = false; // this step's fill has run
  let lastStepKey = null;
  let submitArmed = false;
  let jobContext = null;
  let heldAnswers = []; // [{question, answer}] — persisted only on submit (decision 3)

  const stepKey = () => {
    if (!adapter.isMultiStep) return "single";
    try {
      return adapter.stepName ? adapter.stepName() : location.pathname;
    } catch {
      return location.pathname;
    }
  };

  const scan = () => {
    if (filling) return;

    // Multi-step: a step change re-opens the launcher for the new step.
    const sk = stepKey();
    if (sk !== lastStepKey) {
      lastStepKey = sk;
      stepFilled = false;
      launcherUp = false;
    }
    if (launcherUp || stepFilled) return;

    let isForm = false;
    try {
      isForm = adapter.isApplicationForm();
    } catch (e) {
      AA.warn("isApplicationForm threw", e);
    }
    if (isForm) {
      launcherUp = true;
      AA.review.mountLauncher(runFill, adapter.isMultiStep ? `⚡ Autofill this step` : undefined);
      AA.log("form detected — launcher mounted", adapter.isMultiStep ? `(step: ${sk})` : "");
    }
  };

  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  scan();
  const scanInterval = setInterval(scan, 1500);
  // Multi-step flows can take many minutes; keep scanning longer.
  setTimeout(() => clearInterval(scanInterval), (adapter.isMultiStep ? 20 : 1) * 60000);

  async function runFill() {
    filling = true;
    try {
      const profile = await AA.profile.get();
      const resumeBlob = await AA.profile.resume();
      jobContext = safe(() => adapter.detectJobContext()) || {};
      AA.log("job context:", jobContext);

      const fields = adapter.detectFields(document) || [];
      const results = [];
      const questions = [];
      const questionFields = [];

      for (const f of fields) {
        const cls = classifyField(f);

        // File inputs → resume (uploaded default; decision 4).
        if (f.kind === "file" || f.wdKind === "file") {
          const hint = (f.label + " " + (f.name || "") + " " + (f.id || "")).toLowerCase();
          if (/cover\s*letter|coverletter/.test(hint)) {
            results.push(row(f, { filled: false, reason: "cover letter not attached" }));
            continue;
          }
          if (!resumeBlob) {
            results.push(row(f, { filled: false, reason: "no default resume uploaded" }));
            continue;
          }
          const target = f.kind === "file" ? f.el : adapter.fileInput && adapter.fileInput();
          const ok = target && (await safeAsync(() => AA.fill.fillFile(target, resumeBlob)));
          results.push(row(f, { filled: !!ok, value: resumeBlob.name, key: "resume", confidence: "high" }));
          continue;
        }

        // Adapter-specific widgets (Workday dropdowns/dates/multiselect).
        if (f.wdKind && adapter.fillField) {
          const r = await safeAsync(() => adapter.fillField(f, { cls, profile, resumeBlob }));
          if (r) {
            results.push(row(f, { filled: !!r.filled, value: r.value || "", reason: r.reason || "", confidence: f.wdKey ? "high" : "medium" }));
            continue;
          }
        }

        // Unknown free-text textarea → queue for AI. Unknown selects/comboboxes/
        // radios are left for the user (guessing an option is worse than blank).
        if (cls.kind === "unknown") {
          if (f.el.tagName === "TEXTAREA" && f.label && f.label.length > 8) {
            questions.push(f.label);
            questionFields.push(f);
            continue;
          }
          results.push(row(f, { filled: false, reason: "unrecognised field — fill this one yourself" }));
          continue;
        }

        const ok = await applyField(f, cls, profile);
        results.push(
          row(f, {
            filled: !!ok,
            value: displayValue(f, cls, profile),
            key: cls.key,
            confidence: confidenceOf(f),
            reason: ok ? "" : "couldn't match an option",
          })
        );
      }

      // One batched AI call for the leftover questions.
      if (questions.length) {
        AA.review.setStatus(`Drafting ${questions.length} answer${questions.length === 1 ? "" : "s"}…`);
        try {
          const drafted = await AA.answers.draft(questions, jobContext);
          heldAnswers = heldAnswers.concat(drafted);
          for (let i = 0; i < questionFields.length; i++) {
            const f = questionFields[i];
            const answer = drafted[i]?.answer || "";
            if (!answer) {
              results.push(row(f, { filled: false, reason: "no draft returned" }));
              continue;
            }
            const ok =
              f.kind === "combobox"
                ? await safeAsync(() => AA.fill.fillCombobox(f.el, answer))
                : await safeAsync(() => AA.fill.fillText(f.el, answer));
            results.push(row(f, { filled: !!ok, value: answer, aiGenerated: true, confidence: "low" }));
          }
        } catch (err) {
          for (const f of questionFields) results.push(row(f, { filled: false, reason: "AI draft failed: " + err.message }));
        }
      }

      stepFilled = true;
      launcherUp = false;
      AA.review.showResults(results, {
        onEdit,
        multiStep: adapter.isMultiStep,
        partial: adapter.partial,
        stepName: adapter.isMultiStep ? lastStepKey : null,
      });
      if (!submitArmed) {
        armSubmitCapture();
        submitArmed = true;
      }
    } finally {
      filling = false;
    }
  }

  // wdKey (Workday's data-automation-id mapping) overrides label classification.
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
      const v = AA.classify.valueFor(cls.key, profile);
      return v ? AA.fill.fillCombobox(f.el, v) : false;
    }
    const value = AA.classify.valueFor(cls.key, profile);
    if (!value) return false;
    return AA.fill.fillText(f.el, value);
  }

  async function onEdit(result, newValue) {
    const fields = adapter.detectFields(document) || [];
    const f = fields.find((x) => (x.label || "") === (result.label || ""));
    if (!f) return;
    if (f.wdKind === "dropdown" && adapter.fillField) {
      await safeAsync(() => adapter.fillField({ ...f, wdKey: null, label: newValue }, { cls: { key: null }, profile: {} }));
    } else if (f.kind === "select") await AA.fill.fillSelect(f.el, newValue);
    else if (f.kind === "combobox") await AA.fill.fillCombobox(f.el, newValue);
    else await AA.fill.fillText(f.el, newValue);
    const h = heldAnswers.find((a) => a.question === result.label);
    if (h) h.answer = newValue;
  }

  // Decision 3: nothing is written to the DB until we see a submit.
  function armSubmitCapture() {
    let captured = false;
    const capture = async (why) => {
      if (captured) return;
      captured = true;
      AA.log("submit detected via", why, "— capturing job");
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
        AA.review.setStatus("Logged to your ApplyAi pipeline as applied ✓");
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

    const successMo = new MutationObserver(() => {
      const body = AA.normalize(document.body.innerText).slice(0, 4000);
      if (/(application (was )?submitted|thank you for applying|we('| ha)ve received your application|successfully submitted|your application has been submitted)/.test(body)) {
        capture("success-text");
        successMo.disconnect();
      }
    });
    successMo.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(() => successMo.disconnect(), 30 * 60 * 1000);
  }

  function confirmSubmitted(capture) {
    const body = AA.normalize(document.body.innerText).slice(0, 4000);
    const gone = !safe(() => adapter.isApplicationForm());
    if (gone || /(submitted|thank you|received your application)/.test(body)) capture("submit-click");
  }

  // ---- helpers ----
  function pickAdapter() {
    for (const name of ["workday", "linkedin"]) {
      const a = AA.adapters[name];
      if (a && safe(() => a.match(AA.host))) return a;
    }
    return AA.adapters.generic;
  }
  function row(f, extra) {
    return { label: f.label, kind: f.wdKind || f.kind, filled: false, value: "", aiGenerated: false, confidence: "medium", ...extra };
  }
  function confidenceOf(f) {
    if (["for", "wrap", "legend"].includes(f.labelSource)) return "high";
    if (f.labelSource === "aria" || f.labelSource === "wd") return "medium";
    return "low";
  }
  function displayValue(f, cls, profile) {
    if (cls.kind === "boolean") return AA.classify.valueFor(cls.key, profile);
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
