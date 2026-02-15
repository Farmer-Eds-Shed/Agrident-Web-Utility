// ui/modalEditor.js
export function createModalEditor(els, {
  getRow,
  setRow,
  deleteRow,
  getHeaders,
  getSubtitle,
  onAfterChange,
}) {
  let editingMode = "tasks";
  let editingRealIndex = null;
  let editingHeaders = [];
  let editingInputs = [];
  let lastFocusEl = null;

  function openEditor(mode, realIndex) {
    const row = getRow(mode, realIndex);
    if (!row) return;

    lastFocusEl = document.activeElement;
    editingMode = (mode === "groups") ? "groups" : "tasks";
    editingRealIndex = realIndex;
    editingHeaders = getHeaders(editingMode);
    editingInputs = [];

    els.modalTitle.textContent = "Edit Row";
    els.modalSubtitle.textContent = getSubtitle(editingMode, realIndex);

    els.modalGrid.innerHTML = "";

    for (let i = 0; i < editingHeaders.length; i++) {
      const h = editingHeaders[i];

      const label = document.createElement("label");
      label.title = h;
      label.textContent = h;

      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = row[i] ?? "";
      inp.dataset.colIndex = String(i);

      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); saveEditor(); }
        if (ev.key === "Escape") { ev.preventDefault(); closeEditor(true); }
      });

      const wrap = document.createElement("div");
      wrap.className = "field";
      wrap.appendChild(label);
      wrap.appendChild(inp);

      els.modalGrid.appendChild(wrap);
      editingInputs.push(inp);
    }

    els.overlay.classList.add("show");
    els.overlay.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      const first = editingInputs.find(el => el && typeof el.focus === "function");
      if (first) first.focus();
      else els.modalCloseBtn?.focus?.();
    }, 0);
  }

  function closeEditor(keepFocus = true) {
    const target = (keepFocus && lastFocusEl && typeof lastFocusEl.focus === "function")
      ? lastFocusEl
      : els.connectBtn;

    try { target?.focus?.(); } catch {}

    els.overlay.classList.remove("show");
    els.overlay.setAttribute("aria-hidden", "true");

    editingRealIndex = null;
    editingHeaders = [];
    editingInputs = [];
    els.modalGrid.innerHTML = "";
    lastFocusEl = null;
  }

  function saveEditor() {
    if (editingRealIndex === null) return;
    const idx = editingRealIndex;

    const updated = editingHeaders.map((h, i) => editingInputs[i]?.value ?? "");
    setRow(editingMode, idx, updated);

    closeEditor(true);
    onAfterChange(editingMode);
  }

  function deleteEditorRowConfirm() {
    if (editingRealIndex === null) return;
    const idx = editingRealIndex;
    if (!confirm(`Delete row #${idx + 1}?`)) return;

    deleteRow(editingMode, idx);
    closeEditor(true);
    onAfterChange(editingMode);
  }

  // wire listeners once
  els.overlay.addEventListener("click", (ev) => {
    if (ev.target === els.overlay) closeEditor(true);
  });

  els.modalCloseBtn.addEventListener("click", () => closeEditor(true));
  els.modalCancelBtn.addEventListener("click", () => closeEditor(true));
  els.modalSaveBtn.addEventListener("click", saveEditor);
  els.modalDeleteBtn.addEventListener("click", deleteEditorRowConfirm);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && els.overlay.classList.contains("show")) {
      ev.preventDefault();
      closeEditor(true);
    }
  });

  return { openEditor, closeEditor };
}
