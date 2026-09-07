// LinkedIn Easy Apply adapter — STUB (wired in milestone M5, at which point the
// old LinkedIn-only content.js trigger flow is removed and this entry's matches
// gain www.linkedin.com/jobs/*).
//
// Easy Apply is an in-page modal with a multi-step flow (Contact info →
// Resume → Additional questions → Review). Each "Next" swaps the modal body.

AA.adapters = AA.adapters || {};

AA.adapters.linkedin = {
  name: "linkedin",
  match: (host) => host.includes("linkedin.com"),
  isMultiStep: true,

  detectJobContext() {
    return AA.adapters.generic.detectJobContext();
  },

  detectFields() {
    const modal = document.querySelector(".jobs-easy-apply-modal, [data-test-modal]");
    return AA.detect.detectFields(modal || document);
  },

  isApplicationForm() {
    return !!document.querySelector(".jobs-easy-apply-modal, [data-test-modal]");
  },
};
