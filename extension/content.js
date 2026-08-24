// Injected on LinkedIn job pages. Detects the currently-viewed job, scrapes
// what it can, and lets the user trigger the ApplyAi pipeline without leaving
// the page. All actual HTTP calls happen in background.js — this file only
// scrapes the DOM and renders a small floating widget.
//
// Selector/format notes verified against real LinkedIn pages (2026-08-22):
// - Split-pane search view (/jobs/search/... and /jobs/collections/...?currentJobId=)
//   exposes reliable, semantic BEM-style classes:
//     .job-details-jobs-unified-top-card__job-title
//     .job-details-jobs-unified-top-card__company-name
//     .job-details-jobs-unified-top-card__primary-description-container (location + posted/applicant info)
//     #job-details / .jobs-description__content / .jobs-box__html-content (description)
//   This is the common case — LinkedIn funnels almost all browsing (search results,
//   recommended feed clicks) into this URL shape.
// - A bare /jobs/view/<id>/ page (e.g. a shared permalink) renders differently —
//   none of the above selectors were found even after a long wait, despite the
//   text being visible on screen. Rather than chase that down further, this falls
//   back to parsing document.title ("<Title> | <Company> | LinkedIn" — confirmed
//   format, no location available this way) for title/company, and leaves
//   description to the manual textarea in that case.
// - An earlier assumption (title format "<Title> hiring <Company> in <Location> |
//   LinkedIn") was WRONG — that pattern doesn't appear on any real page tested.
//   Real format is "<Title> | <Company> | LinkedIn".

const BEM = {
  title: ".job-details-jobs-unified-top-card__job-title",
  company: ".job-details-jobs-unified-top-card__company-name",
  primaryDescription: ".job-details-jobs-unified-top-card__primary-description-container",
};
const DESCRIPTION_SELECTORS = ["#job-details", ".jobs-description__content", ".jobs-box__html-content"];
const TITLE_TAG_PATTERN = /^(.+?) \| (.+?) \| LinkedIn$/;

let lastSignal = null;
let widgetEl = null;

function scrapeJobFields() {
  const bemTitle = document.querySelector(BEM.title)?.innerText?.trim();
  const bemCompany = document.querySelector(BEM.company)?.innerText?.trim();

  if (bemTitle && bemCompany) {
    const primaryDesc = document.querySelector(BEM.primaryDescription)?.innerText?.trim() || "";
    // e.g. "Andover, MA · 1 month ago · Over 100 applicants" — location is the first segment.
    const location = primaryDesc.split("·")[0]?.trim() || null;
    return { jobTitle: bemTitle, company: bemCompany, location, source: "bem" };
  }

  // Fallback: bare /jobs/view/ pages didn't expose the BEM selectors in testing,
  // but reliably set the tab title.
  const m = document.title.match(TITLE_TAG_PATTERN);
  if (m) {
    return { jobTitle: m[1].trim(), company: m[2].trim(), location: null, source: "title" };
  }

  return null;
}

// Best-effort description scrape — only reliable on the split-pane view (see
// notes above). Always lands in an editable textarea, never sent blind.
function scrapeDescription() {
  for (const sel of DESCRIPTION_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length > 100) {
      return el.innerText.trim();
    }
  }
  return "";
}

function buildWidget() {
  const root = document.createElement("div");
  root.id = "applyai-widget";
  Object.assign(root.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999",
    width: "320px",
    background: "#1b1f23",
    color: "#e6e6e6",
    border: "1px solid #333",
    borderRadius: "10px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: "13px",
    padding: "12px",
  });

  root.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <strong style="font-size:13px;">ApplyAi</strong>
      <button id="applyai-close" style="background:none; border:none; color:#999; cursor:pointer; font-size:14px;">×</button>
    </div>
    <div id="applyai-job-summary" style="margin-bottom:8px; color:#b0b0b0;"></div>
    <textarea id="applyai-description" rows="4"
      style="width:100%; box-sizing:border-box; background:#111; color:#ddd; border:1px solid #333; border-radius:6px; padding:6px; margin-bottom:8px; font-size:12px; resize:vertical;"
      placeholder="Job description (auto-scraped where possible — edit if it's missing or wrong)"></textarea>
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; color:#b0b0b0; cursor:pointer;">
      <input type="checkbox" id="applyai-tailor" />
      ✨ Tailor resume with AI for this job
    </label>
    <button id="applyai-apply-btn"
      style="width:100%; padding:8px; background:#4f46e5; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
      Apply with ApplyAI
    </button>
    <div id="applyai-status" style="margin-top:8px; color:#999; min-height:16px;"></div>
  `;

  document.body.appendChild(root);

  root.querySelector("#applyai-close").addEventListener("click", () => {
    root.remove();
    widgetEl = null;
  });

  root.querySelector("#applyai-apply-btn").addEventListener("click", onApplyClick);

  return root;
}

function setStatus(text, isError) {
  if (!widgetEl) return;
  const el = widgetEl.querySelector("#applyai-status");
  el.textContent = text;
  el.style.color = isError ? "#f87171" : "#999";
}

let currentUrl = null;

function onApplyClick() {
  const fields = scrapeJobFields();
  const description = widgetEl.querySelector("#applyai-description").value;
  const tailorWithAI = widgetEl.querySelector("#applyai-tailor").checked;

  const payload = {
    title: fields?.jobTitle || document.title,
    company: fields?.company || null,
    location: fields?.location || null,
    url: currentUrl,
    description,
  };

  widgetEl.querySelector("#applyai-apply-btn").disabled = true;
  setStatus("Sending…");

  chrome.runtime.sendMessage({ type: "CAPTURE_JOB", payload, tailorWithAI }, () => {
    // Real progress arrives via STATUS_UPDATE messages below; this callback
    // only confirms the background worker received the request.
  });
}

function refreshWidgetForCurrentJob() {
  const fields = scrapeJobFields();
  if (!fields) {
    if (widgetEl) {
      widgetEl.remove();
      widgetEl = null;
    }
    return;
  }

  // currentJobId identifies the job on split-pane pages even though the URL's
  // path/query otherwise stays put as you click between list items.
  const params = new URLSearchParams(location.search);
  currentUrl = params.get("currentJobId")
    ? `${location.origin}/jobs/view/${params.get("currentJobId")}/`
    : location.href.split("?")[0];

  if (!widgetEl) widgetEl = buildWidget();

  widgetEl.querySelector("#applyai-job-summary").textContent = `${fields.jobTitle} — ${fields.company}`;
  widgetEl.querySelector("#applyai-description").value = scrapeDescription();
  widgetEl.querySelector("#applyai-apply-btn").disabled = false;
  setStatus(fields.source === "title" ? "Description not auto-detected on this page — paste it above" : "");
}

function checkForJobChange() {
  const signal = document.querySelector(BEM.title)?.innerText || document.title;
  if (signal === lastSignal) return;
  lastSignal = signal;
  refreshWidgetForCurrentJob();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "STATUS_UPDATE") return;
  setStatus(message.message, message.status === "error");
  if (["submitted", "cancelled", "error"].includes(message.status)) {
    setTimeout(() => {
      const btn = widgetEl?.querySelector("#applyai-apply-btn");
      if (btn) btn.disabled = false;
    }, 1000);
  }
});

setInterval(checkForJobChange, 1000);
checkForJobChange();
