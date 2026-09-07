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

  return { get, resume, refresh: () => get({ force: true }) };
})();
