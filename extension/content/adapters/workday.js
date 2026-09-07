// Workday adapter — STUB (built out in milestone M4).
//
// Workday needs real work the generic engine can't do:
//  - fields are custom web components keyed by data-automation-id, not <label for>
//  - the application is a multi-step wizard; each "Next" re-renders the DOM
//  - custom dropdown / date / multi-select widgets
//  - its own file-upload widget
//
// For now it defers to the generic engine (which will fill the plain inputs on
// the "My Information" step and skip the rest) and flags that it's partial.

AA.adapters = AA.adapters || {};

AA.adapters.workday = {
  name: "workday",
  match: (host) => host.includes("myworkdayjobs.com") || host.includes("workday.com"),
  isMultiStep: true,
  partial: true,

  detectJobContext() {
    return AA.adapters.generic.detectJobContext();
  },

  detectFields(root) {
    // TODO(M4): pierce data-automation-id, handle Workday combo/date widgets.
    return AA.detect.detectFields(root);
  },

  isApplicationForm() {
    return /\/apply(\/|$)/.test(location.pathname) || !!document.querySelector('[data-automation-id]');
  },
};
