const API = "http://localhost:8000";

const CONTENT_FILES = [
  "content/util.js",
  "content/profile.js",
  "content/classify.js",
  "content/detect.js",
  "content/fill.js",
  "content/answers.js",
  "content/review.js",
  "content/adapters/generic.js",
  "content/adapters/workday.js",
  "content/adapters/linkedin.js",
  "content/index.js",
];

function set(id, cls, text) {
  document.getElementById("d-" + id).className = "dot " + cls;
  document.getElementById("t-" + id).textContent = text;
}

async function check() {
  let profileOk = false;
  let resumeOk = false;

  try {
    const health = await fetch(`${API}/health`).then((r) => r.json());
    if (health.status === "ok") set("backend", "ok", "Backend connected");
    else throw new Error();
  } catch {
    set("backend", "down", "Backend not reachable — run uvicorn");
    set("profile", "down", "—");
    set("resume", "down", "—");
    return;
  }

  try {
    const p = await fetch(`${API}/profile/autofill`).then((r) => (r.ok ? r.json() : Promise.reject()));
    profileOk = !!(p.firstName && p.email);
    resumeOk = !!p.hasResume;
    set("profile", profileOk ? "ok" : "warn", profileOk ? `Profile: ${p.fullName}` : "Profile incomplete");
    set("resume", resumeOk ? "ok" : "warn", resumeOk ? `Resume: ${p.resumeFilename}` : "No default resume uploaded");
  } catch {
    set("profile", "down", "Profile not found");
    set("resume", "down", "—");
  }

  document.getElementById("fill").disabled = !(profileOk && resumeOk);
}

document.getElementById("fill").addEventListener("click", async () => {
  const btn = document.getElementById("fill");
  btn.disabled = true;
  btn.textContent = "Injecting…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    // If the bundle already auto-injected (allowlisted site), don't inject
    // again — just nudge it. Otherwise inject the full bundle.
    const [{ result: alreadyActive }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.__AA_ACTIVE__,
    });
    if (!alreadyActive) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
    }
    btn.textContent = alreadyActive ? "Already running here" : "Running — see the page";
    setTimeout(() => window.close(), 900);
  } catch (err) {
    btn.textContent = "Failed: " + err.message.slice(0, 30);
    btn.disabled = false;
  }
});

check();
