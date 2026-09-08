// Appended to the content-script bundle for page-context testing (no extension
// reload). Replaces the background-worker bridge with direct localhost fetches
// — only works because APPLYAI_DEBUG_CORS opens CORS. Not shipped to the extension.
(() => {
  const API = "http://localhost:8000";
  window.chrome = window.chrome || { runtime: {}, storage: {} };

  async function blobToDataUrl(blob) {
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  AA.bg = async (type, payload) => {
    if (type === "GET_AUTOFILL_PROFILE") {
      return fetch(`${API}/profile/autofill`).then((r) => r.json());
    }
    if (type === "GET_RESUME_BLOB") {
      const r = await fetch(`${API}/profile/resume.file`);
      const disp = r.headers.get("Content-Disposition") || "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const blob = await r.blob();
      return { name: m ? m[1] : "resume.pdf", type: blob.type, dataUrl: await blobToDataUrl(blob) };
    }
    if (type === "DRAFT_FORM_ANSWERS") {
      return fetch(`${API}/form-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
    }
    if (type === "CAPTURE_APPLIED") {
      const job = await fetch(`${API}/jobs/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload.job, form_answers: payload.formAnswers || [], mark_applied: true }),
      }).then((r) => r.json());
      return { id: job.id };
    }
    throw new Error("unknown bg call: " + type);
  };

  AA.log("DEBUG bundle active — AA.bg wired direct to localhost");
})();
