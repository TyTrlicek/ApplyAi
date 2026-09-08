// Fetch + cache the flattened autofill profile and the resume blob.
// Cache lives in chrome.storage.session (cleared when the browser closes) so a
// stale profile never lingers past a session; falls back to a fresh fetch.

AA.profile = (() => {
  const TTL_MS = 10 * 60 * 1000;
  let mem = null;

  async function fetchFresh() {
    const data = await AA.bg("GET_AUTOFILL_PROFILE");
    mem = { data, at: Date.now() };
    try {
      await chrome.storage.session.set({ autofillProfile: mem });
    } catch {
      /* storage.session unavailable in some contexts — memory cache is enough */
    }
    return data;
  }

  async function get({ force = false } = {}) {
    if (!force && mem && Date.now() - mem.at < TTL_MS) return mem.data;
    if (!force) {
      try {
        const stored = (await chrome.storage.session.get("autofillProfile")).autofillProfile;
        if (stored && Date.now() - stored.at < TTL_MS) {
          mem = stored;
          return stored.data;
        }
      } catch {
        /* ignore */
      }
    }
    return fetchFresh();
  }

  // Returns { name, type, dataUrl } for the uploaded default resume, or null.
  async function resume() {
    try {
      return await AA.bg("GET_RESUME_BLOB");
    } catch (err) {
      AA.warn("resume fetch failed:", err.message);
      return null;
    }
  }

  // Workday sign-in credentials, set in the popup. Lives ONLY in this browser's
  // chrome.storage.local — never fetched from or sent to the backend.
  async function workdayCreds() {
    try {
      const { workdayCreds } = await chrome.storage.local.get("workdayCreds");
      return workdayCreds && workdayCreds.email && workdayCreds.password ? workdayCreds : null;
    } catch {
      return null;
    }
  }

  return { get, resume, workdayCreds, refresh: () => get({ force: true }) };
})();
