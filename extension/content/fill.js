// Framework-safe value setting. ATS forms are React/Angular/Vue — assigning
// el.value directly doesn't register with the framework's state, so we go
// through the native setter and dispatch the events they listen for.

AA.fill = (() => {
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillText(el, value) {
    el.focus();
    setNativeValue(el, "");
    fireInput(el);
    setNativeValue(el, value);
    fireInput(el);
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  async function fillContentEditable(el, value) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  async function fillSelect(el, optionValueOrText) {
    const match = [...el.options].find(
      (o) => o.value === optionValueOrText || o.text.trim() === optionValueOrText
    );
    if (!match) return false;
    el.value = match.value;
    fireInput(el);
    return true;
  }

  // Radio/checkbox: click the member whose option label was chosen.
  async function pickRadio(members, optionEl) {
    const target = optionEl || null;
    if (!target) return false;
    target.focus();
    target.click();
    if (!target.checked) {
      target.checked = true;
      fireInput(target);
    }
    return true;
  }

  // A full, realistic pointer press+release+click. React-select v5 (Greenhouse,
  // Lever, Ashby, Workable all use it) ignores lone synthetic mousedown/keydown
  // but honours this sequence.
  function realClick(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
  }

  const _norm = (s) => AA.normalize(s);
  function _matches(optText, want) {
    const o = _norm(optText);
    if (want.match instanceof RegExp) return want.match.test(o);
    const w = _norm(want.text || want);
    return o === w || o.startsWith(w) || o.includes(w) || w.includes(o);
  }

  // Combobox filler. `want` is a string, or { text, typed, match:RegExp }.
  //   typed  — what to type into the input to filter (default: want.text/want)
  //   match  — regex an option must satisfy (overrides text matching)
  // Returns true only if an option was actually chosen.
  async function fillCombobox(el, want) {
    const input = el.matches("input,textarea") ? el : el.querySelector("input,textarea") || el;
    const typed = (want && want.typed) || want.text || (typeof want === "string" ? want : "");
    const control = input.closest('.select__control,[class*="-control"]');

    // Close any menu left open by a previous field.
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await AA.sleep(40);

    input.focus();
    if (control) {
      realClick(control.querySelector('[class*="indicator"]') || control);
      await AA.sleep(140);
    } else {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    }

    if (typed && !input.isContentEditable) {
      setNativeValue(input, typed);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (typed) {
      input.textContent = typed;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // intl-tel-input keeps a 240-country <li role=option> list in the DOM at all
    // times — it must never be mistaken for the field's own menu.
    const notIti = ':not(.iti__country):not([class*="iti__"])';
    for (let i = 0; i < 16; i++) {
      await AA.sleep(130);
      // Prefer react-select's own menu (Greenhouse/Lever/Ashby/Workable).
      let menu = [...document.querySelectorAll(".select__menu")].find(AA.isVisible);
      let opts = menu ? [...menu.querySelectorAll(".select__option")].filter(AA.isVisible) : [];
      if (!opts.length) {
        const generic = [...document.querySelectorAll('[role="listbox"]:not([hidden]),[class*="__menu"],[class*="Menu"]')]
          .filter((m) => !m.className.includes("iti__") && AA.isVisible(m))
          .find((m) => m.querySelector(`[role="option"]${notIti},[class*="__option"]`));
        menu = generic || null;
        opts = menu
          ? [...menu.querySelectorAll(`[role="option"]${notIti},[class*="__option"]`)].filter(AA.isVisible)
          : [];
      }
      if (opts.length) {
        const hit =
          opts.find((o) => _matches(AA.text(o), want)) || (opts.length === 1 ? opts[0] : null);
        if (hit) {
          hit.scrollIntoView({ block: "nearest" });
          realClick(hit);
          await AA.sleep(120);
          const sv = control && control.querySelector('.select__single-value,[class*="singleValue"]');
          input.dispatchEvent(new Event("blur", { bubbles: true }));
          return control ? !!sv : true;
        }
      }
    }
    if (control) realClick(control.querySelector('[class*="indicator"]') || control); // close
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    return false;
  }

  // Inject a File into an <input type=file> via DataTransfer.
  async function fillFile(el, { name, type, dataUrl }) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], name, { type: type || blob.type });
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return { fillText, fillContentEditable, fillSelect, pickRadio, fillCombobox, fillFile, setNativeValue, realClick };
})();
