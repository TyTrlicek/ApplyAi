// Background service worker — owns all HTTP calls to the local ApplyAi backend.
// content.js never calls localhost:8000 directly (LinkedIn's CSP would likely
// block it, and it'd be subject to page-origin CORS); it only messages this
// service worker, which makes extension-privileged fetches instead.

const API_BASE = "http://localhost:8000";
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 300; // 10 minutes ceiling, matches runner.py's own step ceiling in spirit

const TERMINAL_STATUSES = new Set(["submitted", "error", "cancelled"]);

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore — not all error responses are JSON
    }
    throw new Error(detail);
  }
  return res.json();
}

function sendStatus(tabId, message, status) {
  chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", message, status }).catch(() => {
    // tab may have navigated away or closed — nothing to do
  });
}

async function pollApplyStatus(tabId, jobId) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let status;
    try {
      status = await apiFetch(`/jobs/${jobId}/apply-status`);
    } catch (err) {
      sendStatus(tabId, `Lost connection to backend: ${err.message}`, "error");
      return;
    }

    const label = {
      starting: "Opening browser…",
      running: `Filling form (${status.step || "…"})…`,
      waiting_for_login: "Waiting for you to log in to LinkedIn in the automation window…",
      waiting_for_review: "Waiting for your review — check the automation window",
      submitted: "Submitted",
      error: `Error: ${status.error || "unknown"}`,
      cancelled: "Cancelled",
    }[status.status] || status.status;

    sendStatus(tabId, label, status.status);

    if (TERMINAL_STATUSES.has(status.status)) return;
  }
  sendStatus(tabId, "Timed out waiting for the apply session — check the automation window", "error");
}

async function handleCaptureJob(payload, tailorWithAI, tabId) {
  try {
    sendStatus(tabId, "Capturing job…", "capturing");
    const job = await apiFetch("/jobs/capture", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (tailorWithAI) {
      sendStatus(tabId, "Tailoring resume with AI…", "tailoring_resume");
      await apiFetch(`/jobs/${job.id}/resume`, { method: "POST" });
    }

    sendStatus(tabId, "Generating cover letter…", "generating_cover_letter");
    await apiFetch(`/jobs/${job.id}/cover-letter`, { method: "POST" });

    sendStatus(tabId, "Opening browser to apply…", "opening_browser");
    await apiFetch(`/jobs/${job.id}/apply`, { method: "POST" });

    await pollApplyStatus(tabId, job.id);
  } catch (err) {
    sendStatus(tabId, `Error: ${err.message}`, "error");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CAPTURE_JOB") return false;
  const tabId = sender.tab?.id;
  if (tabId == null) return false;

  handleCaptureJob(message.payload, !!message.tailorWithAI, tabId);
  sendResponse({ ok: true }); // acknowledge receipt; real progress comes via STATUS_UPDATE
  return false;
});
