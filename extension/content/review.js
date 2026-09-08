// The status tracker: a persistent panel (Jobright-style) showing every field
// on the current step split into Required / Optional, what got filled, what
// didn't, and a button to advance multi-step forms.
//
// API (all via AA.tracker; AA.review kept as an alias):
//   mountLauncher(onFill, label?)     floating trigger button
//   render(report, handlers)          draw/redraw the panel for a step
//   setStatus(text)                   one-line status under the header
//   verifyPrompt(onSubmit)            show the "enter Workday code" state
//
// report = {
//   title, step: { name, index, total } | null,
//   phase: 'fill' | 'auth' | 'review',
//   fields: [{ label, required, status, value, note, ref }]
// }
//   status: 'filled' | 'review' | 'empty-optional' | 'empty-required' | 'skipped'
//
// handlers = { onNext, onJump, onRefill }

AA.tracker = (() => {
  let root, shadow, panel, launcher, statusEl;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .launcher {
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
      background: #4f46e5; color: #fff; border: none; border-radius: 999px;
      padding: 11px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 6px 24px rgba(0,0,0,.28);
    }
    .launcher:disabled { opacity: .6; cursor: default; }
    .panel {
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
      width: 370px; max-height: 82vh; display: flex; flex-direction: column;
      background: #16181d; color: #e7e7ea; border: 1px solid #2c2f36;
      border-radius: 12px; box-shadow: 0 10px 44px rgba(0,0,0,.5); font-size: 13px;
    }
    .hd { padding: 12px 14px 10px; border-bottom: 1px solid #2c2f36; }
    .hd .top { display: flex; justify-content: space-between; align-items: center; }
    .hd strong { font-size: 13px; }
    .hd .x { background: none; border: none; color: #9a9fa8; font-size: 16px; cursor: pointer; }
    .hd .step { color: #b6bac2; font-size: 11.5px; margin-top: 3px; }
    .bar { height: 3px; background: #2c2f36; border-radius: 2px; margin-top: 8px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: #4f46e5; }
    .status { padding: 7px 14px; color: #9a9fa8; font-size: 11.5px; border-bottom: 1px solid #2c2f36; }
    .body { overflow-y: auto; }
    .sec { padding: 4px 0; }
    .sec h4 {
      margin: 0; padding: 9px 14px 4px; font-size: 10px; letter-spacing: .06em;
      text-transform: uppercase; color: #7b818c; display: flex; justify-content: space-between;
    }
    .f { display: flex; gap: 9px; padding: 7px 14px; align-items: baseline; cursor: pointer; border-left: 2px solid transparent; }
    .f:hover { background: #1c1f26; border-left-color: #4f46e5; }
    .f .ic { flex: none; width: 14px; text-align: center; font-size: 11px; }
    .f .m { flex: 1; min-width: 0; }
    .f .lbl { color: #cdd0d7; }
    .f .val { color: #f2f2f4; word-break: break-word; }
    .f .val.empty { color: #6b7280; }
    .f .note { font-size: 10.5px; margin-top: 1px; }
    .ic.ok { color: #22c55e; } .note.ok { color: #6b7280; }
    .ic.rev { color: #fcd34d; } .note.rev { color: #fcd34d; }
    .ic.req { color: #f87171; } .note.req { color: #f87171; }
    .ic.opt { color: #565b64; }
    .ft { padding: 11px 14px; border-top: 1px solid #2c2f36; }
    .ft .warn { color: #fcd34d; font-size: 11px; margin-bottom: 7px; }
    .ft .ok { color: #6b7280; font-size: 11px; margin-bottom: 7px; }
    .ft button { width: 100%; padding: 9px; border: none; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; background: #4f46e5; color: #fff; }
    .ft button.review { background: #22c55e; color: #06240f; }
    .verify input { width: 100%; padding: 8px; margin: 8px 0; background: #0f1114; color: #e7e7ea; border: 1px solid #2c2f36; border-radius: 6px; font-size: 13px; }
    .flash { animation: fl 1.6s ease-out; }
    @keyframes fl { 0% { outline: 3px solid #4f46e5; } 100% { outline: 3px solid transparent; } }
  `;

  function ensureRoot() {
    if (root && root.isConnected) return;
    root = document.createElement("div");
    root.id = "applyai-root";
    shadow = root.attachShadow({ mode: "open" });
    const s = document.createElement("style");
    s.textContent = CSS;
    shadow.appendChild(s);
    document.documentElement.appendChild(root);
  }

  function mountLauncher(onFill, label) {
    ensureRoot();
    if (panel) panel.remove();
    if (launcher) launcher.remove();
    const text = label || "⚡ Autofill with ApplyAi";
    launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.textContent = text;
    launcher.addEventListener("click", async () => {
      launcher.disabled = true;
      launcher.textContent = "Filling…";
      try {
        await onFill();
      } catch (err) {
        AA.warn(err);
        launcher.disabled = false;
        launcher.textContent = text;
      }
    });
    shadow.appendChild(launcher);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
    else if (launcher) launcher.textContent = text;
  }

  const ICON = { filled: ["ok", "✓"], review: ["rev", "!"], "empty-required": ["req", "●"], "empty-optional": ["opt", "○"], skipped: ["opt", "–"] };

  function fieldRow(f, handlers) {
    const [cls, gly] = ICON[f.status] || ICON.skipped;
    const row = document.createElement("div");
    row.className = "f";
    const filled = f.status === "filled" || f.status === "review";
    row.innerHTML = `
      <span class="ic ${cls}">${gly}</span>
      <span class="m">
        <span class="lbl">${esc(f.label || "field")}</span>
        <div class="val ${filled ? "" : "empty"}">${filled ? esc(f.value || "") : f.status === "empty-required" ? "needs you" : "—"}</div>
        ${f.note ? `<div class="note ${cls}">${esc(f.note)}</div>` : ""}
      </span>`;
    row.addEventListener("click", () => handlers.onJump && handlers.onJump(f));
    return row;
  }

  function render(report, handlers = {}) {
    ensureRoot();
    if (launcher) launcher.remove();
    if (panel) panel.remove();
    panel = document.createElement("div");
    panel.className = "panel";

    const req = report.fields.filter((f) => f.required);
    const opt = report.fields.filter((f) => !f.required);
    const done = (arr) => arr.filter((f) => f.status === "filled" || f.status === "review").length;
    const missingReq = req.filter((f) => f.status === "empty-required").length;
    const last = report.step && report.step.index >= report.step.total;
    const pct = report.step ? Math.round((report.step.index / report.step.total) * 100) : 100;

    panel.innerHTML = `
      <div class="hd">
        <div class="top"><strong>⚡ ApplyAi${report.title ? " · " + esc(report.title) : ""}</strong><button class="x">×</button></div>
        ${report.step ? `<div class="step">Step ${report.step.index} of ${report.step.total} · ${esc(report.step.name)}</div><div class="bar"><i style="width:${pct}%"></i></div>` : ""}
      </div>
      <div class="status"></div>
      <div class="body"></div>
      <div class="ft"></div>`;

    statusEl = panel.querySelector(".status");
    statusEl.textContent = `Filled ${done(report.fields)} of ${report.fields.length}${
      report.fields.filter((f) => f.status === "review").length ? ` · ${report.fields.filter((f) => f.status === "review").length} to check` : ""
    }`;
    panel.querySelector(".x").addEventListener("click", () => panel.remove());

    const body = panel.querySelector(".body");
    for (const [title, arr] of [["Required", req], ["Optional", opt]]) {
      if (!arr.length) continue;
      const sec = document.createElement("div");
      sec.className = "sec";
      sec.innerHTML = `<h4><span>${title}</span><span>${done(arr)}/${arr.length}</span></h4>`;
      arr.forEach((f) => sec.appendChild(fieldRow(f, handlers)));
      body.appendChild(sec);
    }

    const ft = panel.querySelector(".ft");
    if (report.phase === "review" || last) {
      ft.innerHTML = `<div class="ok">Review everything above, then submit on the page yourself.</div>`;
    } else if (handlers.onNext) {
      ft.innerHTML =
        (missingReq
          ? `<div class="warn">${missingReq} required field${missingReq === 1 ? "" : "s"} not filled — you can still continue.</div>`
          : `<div class="ok">All required fields filled.</div>`) + `<button>Next step →</button>`;
      ft.querySelector("button").addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.textContent = "…";
        await handlers.onNext();
      });
    }
    shadow.appendChild(panel);
  }

  function verifyPrompt(onSubmit) {
    ensureRoot();
    if (launcher) launcher.remove();
    if (panel) panel.remove();
    panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
      <div class="hd"><div class="top"><strong>⚡ ApplyAi · Workday</strong><button class="x">×</button></div>
        <div class="step">Account created — check your email</div></div>
      <div class="verify" style="padding:12px 14px">
        <div style="color:#b6bac2;font-size:12px">Workday emailed a verification code. Paste it here and I'll continue.</div>
        <input type="text" placeholder="6-digit code" inputmode="numeric" />
        <button style="width:100%;padding:9px;border:none;border-radius:7px;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer">Continue</button>
      </div>`;
    panel.querySelector(".x").addEventListener("click", () => panel.remove());
    const input = panel.querySelector("input");
    panel.querySelector("button").addEventListener("click", () => {
      const code = input.value.trim();
      if (code) onSubmit(code);
    });
    shadow.appendChild(panel);
  }

  function jumpTo(el) {
    if (!el || !el.isConnected) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1700);
    try {
      el.focus({ preventScroll: true });
    } catch {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  const api = { mountLauncher, render, setStatus, verifyPrompt, jumpTo };
  AA.review = api; // back-compat alias
  return api;
})();
