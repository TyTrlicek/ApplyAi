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

// ── External (off-platform) apply URL detection ────────────────────────────
// Many LinkedIn postings — a lot of them Workday-backed — don't use Easy
// Apply. Clicking their "Apply" button opens a new tab (or navigates the
// same tab) to the employer's own application page. We can't read that URL
// out of LinkedIn's DOM ahead of time (it's resolved via LinkedIn's own JS,
// not a static href), so instead we arm a tab watcher, let content.js click
// the real Apply button, and capture wherever the browser ends up.

const externalApplyWatchers = new Map(); // tabId -> Promise<string>

function armExternalApplyWatcher(openerTabId, timeoutMs = 20000) {
  let watchedTabId = null;
  let settleTimer = null;
  let timeoutHandle = null;

  const promise = new Promise((resolve, reject) => {
    function isLinkedInHop(url) {
      try {
        const host = new URL(url).hostname;
        return host.includes("linkedin.com") || host.includes("lnkd.in");
      } catch {
        return true; // about:blank etc — not a real destination yet
      }
    }

    function finish(url) {
      cleanup();
      if (watchedTabId != null) chrome.tabs.remove(watchedTabId).catch(() => {});
      resolve(url);
    }

    function maybeSettle(url) {
      if (isLinkedInHop(url)) return; // still mid-redirect, keep waiting
      clearTimeout(settleTimer);
      // Brief quiet period in case of a further client-side redirect.
      settleTimer = setTimeout(() => finish(url), 1200);
    }

    const onCreated = (tab) => {
      if (tab.openerTabId === openerTabId) watchedTabId = tab.id;
    };
    // New-tab case: LinkedIn opens the employer's application in a fresh tab.
    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== watchedTabId) return;
      if (changeInfo.status !== "complete" || !tab.url) return;
      maybeSettle(tab.url);
    };
    // Same-tab fallback: some flows navigate the LinkedIn tab itself away.
    const onSameTabUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== openerTabId || changeInfo.status !== "complete" || !tab.url) return;
      maybeSettle(tab.url);
    };

    function cleanup() {
      clearTimeout(timeoutHandle);
      clearTimeout(settleTimer);
      chrome.tabs.onCreated.removeListener(onCreated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onUpdated.removeListener(onSameTabUpdated);
      externalApplyWatchers.delete(openerTabId);
    }

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error("Could not detect the application page automatically"));
    }, timeoutMs);

    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onUpdated.addListener(onSameTabUpdated);
  });

  // Prevent "unhandled rejection" noise; real consumers await the same
  // promise via externalApplyWatchers.get() and handle rejection there.
  promise.catch(() => {});
  externalApplyWatchers.set(openerTabId, promise);
  return promise;
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

// For jobs you'd rather apply to by hand — captures the job and marks it
// Applied directly, skipping resume generation, cover letter, and the apply
// automation entirely.
async function handleTrackApplied(payload, tabId) {
  try {
    sendStatus(tabId, "Logging job…", "capturing");
    const job = await apiFetch("/jobs/capture", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    await apiFetch(`/jobs/${job.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "applied" }),
    });

    sendStatus(tabId, "Logged as applied", "tracked");
  } catch (err) {
    sendStatus(tabId, `Error: ${err.message}`, "error");
  }
}

// ── Autofill extension (content/) message handlers ────────────────────────────
// These respond directly to the caller (sendResponse) rather than via
// STATUS_UPDATE tab messages. Shape: { type, payload } in, { ...data } | { error } out.

async function blobToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

const AUTOFILL_HANDLERS = {
  async GET_AUTOFILL_PROFILE() {
    return apiFetch("/profile/autofill");
  },
  async GET_RESUME_BLOB() {
    const res = await fetch(`${API_BASE}/profile/resume.file`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const disp = res.headers.get("Content-Disposition") || "";
    const m = disp.match(/filename="?([^"]+)"?/);
    const blob = await res.blob();
    return { name: m ? m[1] : "resume.pdf", type: blob.type, dataUrl: await blobToDataUrl(blob) };
  },
  async DRAFT_FORM_ANSWERS(payload) {
    return apiFetch("/form-answers", { method: "POST", body: JSON.stringify(payload) });
  },
  async CAPTURE_APPLIED(payload) {
    const job = await apiFetch("/jobs/capture", {
      method: "POST",
      body: JSON.stringify({
        ...payload.job,
        form_answers: payload.formAnswers || [],
        mark_applied: true,
      }),
    });
    return { id: job.id };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = AUTOFILL_HANDLERS[message?.type];
  if (handler) {
    handler(message.payload)
      .then((data) => sendResponse(data ?? {}))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // async response
  }
  return dispatchLegacy(message, sender, sendResponse);
});

function dispatchLegacy(message, sender, sendResponse) {
  const tabId = sender.tab?.id;
  if (tabId == null) return false;

  if (message.type === "TRACK_APPLIED") {
    handleTrackApplied(message.payload, tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "CAPTURE_JOB") {
    handleCaptureJob(message.payload, !!message.tailorWithAI, tabId);
    sendResponse({ ok: true }); // acknowledge receipt; real progress comes via STATUS_UPDATE
    return false;
  }

  if (message.type === "ARM_EXTERNAL_APPLY_WATCH") {
    armExternalApplyWatcher(tabId);
    sendResponse({ armed: true });
    return false;
  }

  if (message.type === "AWAIT_EXTERNAL_APPLY_URL") {
    const watcher = externalApplyWatchers.get(tabId);
    if (!watcher) {
      sendResponse({ error: "No watcher armed — call ARM_EXTERNAL_APPLY_WATCH first" });
      return false;
    }
    watcher.then((url) => sendResponse({ url })).catch((err) => sendResponse({ error: err.message }));
    return true; // async response — keep the message channel open
  }

  return false;
}
