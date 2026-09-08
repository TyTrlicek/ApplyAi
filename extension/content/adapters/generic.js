// Default adapter. The generic detect/fill engine does all the work; this only
// supplies job-context scraping and a "is there an application form here" check.
//
// IIFE-wrapped so re-injection (popup manual trigger over an already-injected
// page) doesn't redeclare its helpers in the shared content-script scope.

(() => {
  AA.adapters = AA.adapters || {};

  function meta(prop) {
    const el =
      document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
    return el ? el.getAttribute("content") : null;
  }

  function stripHtml(html) {
    if (!html) return null;
    const d = document.createElement("div");
    d.innerHTML = html;
    return AA.text(d).slice(0, 12000);
  }

  function guessCompanyFromHost() {
    const h = AA.host;
    if (h.includes("greenhouse.io") || h.includes("lever.co") || h.includes("ashbyhq.com")) {
      const seg = location.pathname.split("/").filter(Boolean)[0];
      if (seg) return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const parts = h.split(".");
    return parts.length >= 2 ? parts[parts.length - 2] : h;
  }

  AA.adapters.generic = {
    name: "generic",
    match: () => true,
    isMultiStep: false,

    // Best-effort scrape of the posting for AI answer context. All optional.
    detectJobContext() {
      const ctx = { title: null, company: null, location: null, description: null };

      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(s.textContent);
          const arr = Array.isArray(data) ? data : [data];
          const jp = arr.find((d) => d["@type"] === "JobPosting");
          if (jp) {
            ctx.title = jp.title || ctx.title;
            ctx.company = jp.hiringOrganization?.name || ctx.company;
            ctx.description = stripHtml(jp.description) || ctx.description;
            const loc = jp.jobLocation?.address?.addressLocality;
            if (loc) ctx.location = loc;
          }
        } catch {
          /* ignore malformed ld+json */
        }
      }

      ctx.title =
        ctx.title ||
        meta("og:title") ||
        AA.text(document.querySelector("h1")) ||
        document.title.split(/[|\-–]/)[0].trim();

      ctx.company = ctx.company || meta("og:site_name") || guessCompanyFromHost();

      if (!ctx.description) {
        const main = document.querySelector(
          '[class*="job-description"],[class*="posting-description"],[data-testid*="description"],main article,main'
        );
        if (main) ctx.description = AA.text(main).slice(0, 12000);
      }
      return ctx;
    },

    detectFields(root) {
      return AA.detect.detectFields(root);
    },

    // Something to fill: a few labelled controls including an email/name field,
    // or a visible file input.
    isApplicationForm() {
      const fields = AA.detect.detectFields();
      if (fields.length < 3) return false;
      const hasFile = fields.some((f) => f.kind === "file");
      const hasIdentity = fields.some((f) => /name|email/i.test(f.label));
      return hasFile || hasIdentity;
    },
  };
})();
