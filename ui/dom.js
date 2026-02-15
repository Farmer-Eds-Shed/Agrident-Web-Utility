// ui/dom.js
export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

export function setText(el, text) { el.textContent = text ?? ""; }

export function setBusy(el, isBusy) {
  el.style.display = isBusy ? "" : "none";
}
