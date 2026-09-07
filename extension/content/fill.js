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

  // Custom combobox (role=combobox / typeahead): type, wait for the listbox,
  // click the option that matches.
  async function fillCombobox(el, value) {
    el.focus();
    const input = el.matches("input,textarea") ? el : el.querySelector("input,textarea") || el;
    if (input.isContentEditable) {
      input.textContent = value;
    } else {
      setNativeValue(input, value);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));

    for (let i = 0; i < 12; i++) {
      await AA.sleep(120);
      const listbox = document.querySelector('[role="listbox"]:not([hidden]),ul[class*="menu"]:not([hidden])');
      const opts = listbox ? [...listbox.querySelectorAll('[role="option"],li')] : [];
      const vNorm = AA.normalize(value);
      const hit =
        opts.find((o) => AA.normalize(AA.text(o)) === vNorm) ||
        opts.find((o) => AA.normalize(AA.text(o)).includes(vNorm)) ||
        opts.find((o) => vNorm.includes(AA.normalize(AA.text(o))));
      if (hit) {
        hit.scrollIntoView({ block: "nearest" });
        hit.click();
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      }
    }
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

  return { fillText, fillContentEditable, fillSelect, pickRadio, fillCombobox, fillFile, setNativeValue };
})();
