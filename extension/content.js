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

// A lot of LinkedIn postings — many of them Workday-backed — aren't Easy
// Apply: LinkedIn's real Apply button just hands off to the employer's own
// site. We need that destination URL (not the LinkedIn posting URL) for the
// backend to detect the portal (Workday/Greenhouse/Lever) and drive it.
function findRealApplyButton() {
  // .jobs-apply-button is LinkedIn's own class — same one playwright_worker's
  // LinkedIn handler targets. Excludes our own widget button (different id).
  return document.querySelector("button.jobs-apply-button, a.jobs-apply-button");
}

function detectApplyMode() {
  const btn = findRealApplyButton();
  if (!btn) return "unknown"; // e.g. not logged in — button may be hidden/absent
  return /easy apply/i.test(btn.innerText || "") ? "easy_apply" : "external";
}

// LinkedIn's "Apply on company website" link is a real <a href>, wrapped in a
// safety redirect: linkedin.com/safety/go/?url=<encoded-destination>. When
// present this is a synchronous, reliable read — no click or new-tab watch
// needed. Confirmed present on every external-apply posting sampled (Ashby,
// Greenhouse, Workday, Workable, and others) as of 2026-08-25.
function extractStaticApplyUrl() {
  const btn = findRealApplyButton();
  const href = btn?.getAttribute("href");
  if (!href) return null;
  try {
    const u = new URL(href, location.href);
    if (u.hostname.includes("linkedin.com")) {
      const target = u.searchParams.get("url");
      return target || null;
    }
    return u.href;
  } catch {
    return null;
  }
}

// Clicks LinkedIn's real Apply button and waits for the background watcher to
// report where the browser ended up. Only meaningful for "external" mode —
// the click there opens (or navigates to) the employer's application page
// rather than LinkedIn's own Easy Apply modal.
async function detectExternalApplyUrl() {
  const btn = findRealApplyButton();
  if (!btn) throw new Error("Could not find LinkedIn's Apply button");

  await chrome.runtime.sendMessage({ type: "ARM_EXTERNAL_APPLY_WATCH" });
  btn.click();

  const result = await chrome.runtime.sendMessage({ type: "AWAIT_EXTERNAL_APPLY_URL" });
  if (result.error) throw new Error(result.error);
  return result.url;
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
    <div id="applyai-apply-mode" style="margin-bottom:8px; font-size:12px; color:#8a8f98;"></div>
    <textarea id="applyai-description" rows="4"
      style="width:100%; box-sizing:border-box; background:#111; color:#ddd; border:1px solid #333; border-radius:6px; padding:6px; margin-bottom:8px; font-size:12px; resize:vertical;"
      placeholder="Job description (auto-scraped where possible — edit if it's missing or wrong)"></textarea>
    <input id="applyai-manual-url" type="text"
      style="width:100%; box-sizing:border-box; background:#111; color:#ddd; border:1px solid #333; border-radius:6px; padding:6px; margin-bottom:8px; font-size:12px;"
      placeholder="Application page URL (only needed if auto-detect fails)" />
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; color:#b0b0b0; cursor:pointer;">
      <input type="checkbox" id="applyai-tailor" />
      ✨ Tailor resume with AI for this job
    </label>
    <button id="applyai-apply-btn"
      style="width:100%; padding:8px; background:#4f46e5; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
      Apply with ApplyAI
    </button>
    <button id="applyai-track-btn"
      style="width:100%; margin-top:6px; padding:6px; background:transparent; color:#8a8f98; border:1px solid #333; border-radius:6px; cursor:pointer; font-size:12px;">
      Applying manually — just log it
    </button>
    <div id="applyai-status" style="margin-top:8px; color:#999; min-height:16px;"></div>
  `;

  document.body.appendChild(root);

  root.querySelector("#applyai-close").addEventListener("click", () => {
    root.remove();
    widgetEl = null;
  });

  root.querySelector("#applyai-apply-btn").addEventListener("click", onApplyClick);
  root.querySelector("#applyai-track-btn").addEventListener("click", onTrackClick);

  return root;
}

function setStatus(text, isError) {
  if (!widgetEl) return;
  const el = widgetEl.querySelector("#applyai-status");
  el.textContent = text;
  el.style.color = isError ? "#f87171" : "#999";
}

let currentUrl = null;

async function onApplyClick() {
  const applyBtn = widgetEl.querySelector("#applyai-apply-btn");
  applyBtn.disabled = true;

  const fields = scrapeJobFields();
  const description = widgetEl.querySelector("#applyai-description").value;
  const tailorWithAI = widgetEl.querySelector("#applyai-tailor").checked;
  const manualUrl = widgetEl.querySelector("#applyai-manual-url").value.trim();

  let applyUrl = currentUrl; // default: Easy Apply happens on this same LinkedIn page
  if (manualUrl) {
    applyUrl = manualUrl;
  } else {
    const mode = detectApplyMode();
    if (mode === "external") {
      const staticUrl = extractStaticApplyUrl();
      if (staticUrl) {
        applyUrl = staticUrl;
        setStatus(`Captured application link (${new URL(staticUrl).hostname})`);
      } else {
        try {
          setStatus("Off-platform application detected — opening the employer's page…");
          applyUrl = await detectExternalApplyUrl();
          setStatus(`Captured application link (${new URL(applyUrl).hostname})`);
        } catch (err) {
          setStatus(`${err.message} — paste the application URL above and try again`, true);
          applyBtn.disabled = false;
          return;
        }
      }
    } else if (mode === "unknown") {
      setStatus("Couldn't find LinkedIn's Apply button (are you signed in?) — paste the application URL above", true);
      applyBtn.disabled = false;
      return;
    }
  }

  const payload = {
    title: fields?.jobTitle || document.title,
    company: fields?.company || null,
    location: fields?.location || null,
    url: currentUrl,
    apply_url: applyUrl,
    description,
  };

  setStatus("Sending…");

  chrome.runtime.sendMessage({ type: "CAPTURE_JOB", payload, tailorWithAI }, () => {
    // Real progress arrives via STATUS_UPDATE messages below; this callback
    // only confirms the background worker received the request.
  });
}

// For jobs you'd rather apply to by hand — logs the job into the dashboard
// already marked Applied, skipping resume generation, cover letter, and the
// Playwright automation entirely.
function onTrackClick() {
  const applyBtn = widgetEl.querySelector("#applyai-apply-btn");
  const trackBtn = widgetEl.querySelector("#applyai-track-btn");
  const fields = scrapeJobFields();
  const description = widgetEl.querySelector("#applyai-description").value;

  const payload = {
    title: fields?.jobTitle || document.title,
    company: fields?.company || null,
    location: fields?.location || null,
    url: currentUrl,
    description,
  };

  applyBtn.disabled = true;
  trackBtn.disabled = true;
  setStatus("Logging…");

  chrome.runtime.sendMessage({ type: "TRACK_APPLIED", payload }, () => {
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
  widgetEl.querySelector("#applyai-manual-url").value = "";
  widgetEl.querySelector("#applyai-apply-btn").disabled = false;
  widgetEl.querySelector("#applyai-track-btn").disabled = false;

  const modeEl = widgetEl.querySelector("#applyai-apply-mode");
  const mode = detectApplyMode();
  modeEl.textContent = {
    easy_apply: "Easy Apply on LinkedIn",
    external: "Off-platform application — link will be auto-detected on click",
    unknown: "Apply button not found — sign in, or paste the application URL below",
  }[mode];

  setStatus(fields.source === "title" ? "Description not auto-detected on this page — paste it above" : "");
}

function checkForJobChange() {
  const signal = document.querySelector(BEM.title)?.innerText || document.title;
  if (signal === lastSignal) {
    // Same job, but LinkedIn's Apply button can render in after the title —
    // keep the mode indicator honest without a full re-scrape.
    const modeEl = widgetEl?.querySelector("#applyai-apply-mode");
    if (modeEl && findRealApplyButton()) {
      const mode = detectApplyMode();
      modeEl.textContent = {
        easy_apply: "Easy Apply on LinkedIn",
        external: "Off-platform application — link will be auto-detected on click",
        unknown: "Apply button not found — sign in, or paste the application URL below",
      }[mode];
    }
    return;
  }
  lastSignal = signal;
  refreshWidgetForCurrentJob();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "STATUS_UPDATE") return;
  setStatus(message.message, message.status === "error");
  if (["submitted", "cancelled", "error", "tracked"].includes(message.status)) {
    setTimeout(() => {
      const applyBtn = widgetEl?.querySelector("#applyai-apply-btn");
      const trackBtn = widgetEl?.querySelector("#applyai-track-btn");
      if (applyBtn) applyBtn.disabled = false;
      if (trackBtn) trackBtn.disabled = false;
    }, 1000);
  }
});

setInterval(checkForJobChange, 1000);
checkForJobChange();
