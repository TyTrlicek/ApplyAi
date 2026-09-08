// Shared namespace + helpers for the autofill content script.
// Files in this content_scripts entry execute in order in one isolated world,
// sharing global scope like sequential <script> tags — so `window.AA` set here
// is visible to every later file.

window.AA = window.AA || {};
// `var` (not const) so later content-script files in this same entry can refer
// to bare `AA`, and so re-injection doesn't throw a redeclaration error.
var AA = window.AA;

AA.log = (...args) => console.debug("%c[ApplyAi]", "color:#4f46e5", ...args);
AA.warn = (...args) => console.warn("[ApplyAi]", ...args);

AA.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll `fn` until it returns truthy or the timeout elapses. Returns fn's last
// value (falsy on timeout). Prefer this over blind sleeps.
AA.waitFor = async (fn, { timeout = 8000, interval = 200 } = {}) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    let v;
    try {
      v = fn();
    } catch {
      v = null;
    }
    if (v) return v;
    await AA.sleep(interval);
  }
  return null;
};

// Round-trip a message to background.js, which owns all HTTP to localhost:8000
// (page-origin CORS / CSP would block a direct fetch from here).
AA.bg = (type, payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res && res.error) return reject(new Error(res.error));
      resolve(res);
    });
  });

// Visible text for an element, collapsed. Used for label matching.
AA.text = (el) => (el ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() : "");

AA.normalize = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\(required\)|\(optional\)/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

AA.isVisible = (el) => {
  if (!el || !el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

// Deepest active element, piercing shadow roots (Workday, some Ashby).
AA.deepQueryAll = (selector, root = document) => {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.querySelectorAll) out.push(...node.querySelectorAll(selector));
    const treeWalker = node.querySelectorAll ? node.querySelectorAll("*") : [];
    for (const el of treeWalker) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return out;
};

AA.host = location.hostname;
