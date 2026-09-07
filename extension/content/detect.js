// Generic form-field discovery + label association.
// Works on any cleanly-labelled ATS form (Greenhouse, Lever, Ashby, Workable,
// iCIMS...). Site adapters can post-process or replace the result.

AA.detect = (() => {
  const CONTROL_SEL = [
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
    "textarea",
    "select",
    '[role="combobox"]',
    '[contenteditable="true"]',
  ].join(",");

  function labelFromFor(el) {
    if (!el.id) return null;
    const esc = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
    const lbl = document.querySelector(`label[for="${esc}"]`);
    return lbl ? AA.text(lbl) : null;
  }

  function labelFromWrap(el) {
    const lbl = el.closest("label");
    if (!lbl) return null;
    // Text of the label minus the control's own text.
    const clone = lbl.cloneNode(true);
    clone.querySelectorAll("input,textarea,select").forEach((n) => n.remove());
    return AA.text(clone);
  }

  function labelFromAria(el) {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const txt = by
        .split(/\s+/)
        .map((id) => {
          const n = document.getElementById(id);
          return n ? AA.text(n) : "";
        })
        .join(" ")
        .trim();
      if (txt) return txt;
    }
    const al = el.getAttribute("aria-label");
    return al ? al.trim() : null;
  }

  // Nearest preceding visible text inside the field's container. The messy
  // fallback — used when a form has no real <label> association.
  function labelFromProximity(el) {
    let container = el.closest(
      '[class*="field"],[class*="question"],[class*="form-group"],[class*="input"],div,fieldset,li'
    );
    for (let hops = 0; container && hops < 4; hops++) {
      // A label-ish node that isn't wrapping another control.
      const cand = [...container.querySelectorAll('label,legend,.label,[class*="label"],p,span,div')]
        .filter((n) => !n.contains(el) && AA.isVisible(n))
        .map((n) => AA.text(n))
        .filter((t) => t.length >= 2 && t.length <= 160);
      if (cand.length) return cand[0];
      container = container.parentElement;
    }
    return null;
  }

  function labelFromAttrs(el) {
    const p = el.getAttribute("placeholder");
    if (p && p.length > 1) return p;
    const raw = el.getAttribute("name") || el.id || "";
    if (!raw) return null;
    // firstName / first_name / first-name / applicant[first_name] -> "first name"
    return raw
      .replace(/.*\[|\]/g, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-.]+/g, " ")
      .trim();
  }

  function resolveLabel(el) {
    const tries = [
      ["for", labelFromFor],
      ["wrap", labelFromWrap],
      ["aria", labelFromAria],
      ["proximity", labelFromProximity],
      ["attr", labelFromAttrs],
    ];
    for (const [source, fn] of tries) {
      let txt = null;
      try {
        txt = fn(el);
      } catch {
        txt = null;
      }
      if (txt && txt.trim()) return { label: txt.trim().replace(/\s*\*\s*$/, ""), labelSource: source };
    }
    return { label: "", labelSource: "none" };
  }

  function selectOptions(el) {
    return [...el.options]
      .filter((o) => o.value !== "" && !/^(select|choose|please)/i.test(o.text.trim()))
      .map((o) => ({ raw: o.text.trim(), value: o.value, el: o }));
  }

  // Radio / checkbox groups keyed by name.
  function groupControls(inputs) {
    const groups = new Map();
    const singles = [];
    for (const el of inputs) {
      if ((el.type === "radio" || el.type === "checkbox") && el.name) {
        if (!groups.has(el.name)) groups.set(el.name, []);
        groups.get(el.name).push(el);
      } else {
        singles.push(el);
      }
    }
    return { groups, singles };
  }

  function groupLabel(members) {
    const first = members[0];
    const fs = first.closest("fieldset");
    if (fs) {
      const legend = fs.querySelector("legend");
      if (legend && AA.text(legend)) return { label: AA.text(legend), labelSource: "legend" };
    }
    const rg = first.closest('[role="radiogroup"],[role="group"]');
    if (rg) {
      const aria = labelFromAria(rg);
      if (aria) return { label: aria, labelSource: "aria" };
    }
    return resolveLabel(first);
  }

  function optionLabel(el) {
    const r = resolveLabel(el);
    return r.label || el.value || "";
  }

  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") return "select";
    if (tag === "textarea") return "text";
    if (el.getAttribute("role") === "combobox" || el.getAttribute("contenteditable") === "true") return "combobox";
    if (tag === "input") {
      if (el.type === "file") return "file";
      return "text";
    }
    return "text";
  }

  function detectFields(root = document) {
    const controls = [...AA.deepQueryAll(CONTROL_SEL, root)].filter(AA.isVisible);
    const { groups, singles } = groupControls(controls);
    const fields = [];

    for (const el of singles) {
      const { label, labelSource } = resolveLabel(el);
      const kind = kindOf(el);
      fields.push({
        el,
        kind,
        label,
        labelSource,
        name: el.name || "",
        id: el.id || "",
        required: el.required || el.getAttribute("aria-required") === "true",
        options: kind === "select" ? selectOptions(el) : [],
      });
    }

    for (const [name, members] of groups) {
      const { label, labelSource } = groupLabel(members);
      const type = members[0].type; // radio | checkbox
      fields.push({
        el: members[0],
        kind: type,
        label,
        labelSource,
        name,
        id: "",
        required: members.some((m) => m.required),
        members,
        options: members.map((m) => ({ raw: optionLabel(m), value: m.value, el: m })),
      });
    }

    return fields;
  }

  return { detectFields, resolveLabel, CONTROL_SEL };
})();
