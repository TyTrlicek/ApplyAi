// The overlay: a floating launcher button and, after a fill, a review panel.
// Rendered in a shadow root so page CSS can't touch it and vice versa.

AA.review = (() => {
  let root, shadow, panel, statusEl, launcher;

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
      width: 360px; max-height: 78vh; display: flex; flex-direction: column;
      background: #16181d; color: #e7e7ea; border: 1px solid #2c2f36;
      border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.45); font-size: 13px;
    }
    .hd { display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; border-bottom: 1px solid #2c2f36; }
    .hd strong { font-size: 13px; }
    .hd button { background: none; border: none; color: #9a9fa8; font-size: 16px; cursor: pointer; }
    .status { padding: 8px 14px; color: #9a9fa8; font-size: 12px; border-bottom: 1px solid #2c2f36; }
    .list { overflow-y: auto; padding: 6px 0; }
    .row { padding: 8px 14px; border-bottom: 1px solid #21242b; }
    .row:last-child { border-bottom: none; }
    .row .lbl { color: #b6bac2; font-size: 11px; margin-bottom: 3px; display: flex; gap: 6px; align-items: center; }
    .row .val { color: #f2f2f4; white-space: pre-wrap; word-break: break-word; cursor: text; }
    .row .val[contenteditable] { outline: 1px solid #4f46e5; border-radius: 4px; padding: 2px 4px; }
    .tag { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; padding: 1px 5px; border-radius: 4px; }
    .tag.ai { background: #3b2d66; color: #c4b5fd; }
    .tag.low { background: #5c4813; color: #fcd34d; }
    .tag.skip { background: #5b1f24; color: #fca5a5; }
    .ft { padding: 10px 14px; border-top: 1px solid #2c2f36; color: #9a9fa8; font-size: 11px; }
    .ft b { color: #e7e7ea; }
  `;

  function ensureRoot() {
    if (root) return;
    root = document.createElement("div");
    root.id = "applyai-root";
    shadow = root.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(root);
  }

  function mountLauncher(onFill) {
    ensureRoot();
    if (launcher) launcher.remove();
    launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.textContent = "⚡ Autofill with ApplyAi";
    launcher.addEventListener("click", async () => {
      launcher.disabled = true;
      launcher.textContent = "Filling…";
      try {
        await onFill();
      } catch (err) {
        AA.warn(err);
        setStatus("Error: " + err.message);
        launcher.disabled = false;
        launcher.textContent = "⚡ Autofill with ApplyAi";
      }
    });
    shadow.appendChild(launcher);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
    else if (launcher) launcher.textContent = text;
  }

  function showResults(results, { onEdit } = {}) {
    ensureRoot();
    if (launcher) launcher.remove();
    if (panel) panel.remove();

    panel = document.createElement("div");
    panel.className = "panel";

    const filled = results.filter((r) => r.filled);
    const skipped = results.filter((r) => !r.filled);
    const ai = filled.filter((r) => r.aiGenerated).length;

    panel.innerHTML = `
      <div class="hd"><strong>ApplyAi — review before submitting</strong><button data-x>×</button></div>
      <div class="status">Filled ${filled.length} field${filled.length === 1 ? "" : "s"}${
      ai ? ` · ${ai} AI-drafted` : ""
    }${skipped.length ? ` · ${skipped.length} left for you` : ""}</div>
      <div class="list"></div>
      <div class="ft">Nothing is submitted automatically. Check the highlighted fields, then click <b>Submit</b> on the page yourself.</div>
    `;
    statusEl = panel.querySelector(".status");
    panel.querySelector("[data-x]").addEventListener("click", () => panel.remove());

    const list = panel.querySelector(".list");
    for (const r of [...filled, ...skipped]) {
      const row = document.createElement("div");
      row.className = "row";
      const tags = [];
      if (r.aiGenerated) tags.push('<span class="tag ai">AI</span>');
      if (r.filled && r.confidence === "low") tags.push('<span class="tag low">check</span>');
      if (!r.filled) tags.push('<span class="tag skip">not filled</span>');
      row.innerHTML = `<div class="lbl">${escapeHtml(r.label || r.key || "field")} ${tags.join("")}</div>
        <div class="val"></div>`;
      const valEl = row.querySelector(".val");
      valEl.textContent = r.filled ? r.value : r.reason || "—";
      if (r.filled && onEdit) {
        valEl.title = "Click to edit";
        valEl.addEventListener("click", () => {
          valEl.setAttribute("contenteditable", "true");
          valEl.focus();
        });
        valEl.addEventListener("blur", async () => {
          valEl.removeAttribute("contenteditable");
          const next = valEl.textContent.trim();
          if (next && next !== r.value) {
            await onEdit(r, next);
            r.value = next;
          }
        });
      }
      list.appendChild(row);
    }

    shadow.appendChild(panel);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  return { mountLauncher, showResults, setStatus };
})();
