// ui/renderGroups.js

export function getGroupHeaders(groupHeaders, groupRows) {
  if (groupHeaders?.length) return groupHeaders;

  if (groupRows?.length) {
    const maxLen = Math.max(...groupRows.map((r) => r.length));
    return Array.from({ length: maxLen }, (_, i) => `Field${i + 1}`);
  }
  return [];
}

export function renderGroupsDropdown(els, groups, { isConnected }) {
  els.groupSelect.innerHTML = "";

  if (!groups?.length) {
    els.groupSelect.appendChild(new Option("(no groups found)", ""));
    els.groupSelect.disabled = true;
    els.syncGroupsBtn.disabled = !isConnected;
    return;
  }

  els.groupSelect.appendChild(new Option("(select a group…)", "", true, false));
  for (const g of groups) {
    els.groupSelect.appendChild(new Option(`${g.id}: ${g.name}`, String(g.id)));
  }

  els.groupSelect.disabled = false;
  els.syncGroupsBtn.disabled = !isConnected;
}

/**
 * Render groups preview.
 * Optional `view`:
 *   view = [{ r: rowArray, realIndex: number }, ...]
 */
export function renderGroupPreview(
  els,
  {
    selectedGroup,
    groupHeaders,
    groupRows,
    view, // optional [{r, realIndex}]
    isConnected,
    onEditRow,
    onDeleteRow,
    limit = 200,
  }
) {
  els.groupPreviewHead.innerHTML = "";
  els.groupPreviewBody.innerHTML = "";

  const headers = getGroupHeaders(groupHeaders, groupRows);

  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    els.groupPreviewHead.appendChild(th);
  }

  const thActions = document.createElement("th");
  thActions.textContent = "Actions";
  els.groupPreviewHead.appendChild(thActions);

  const rowsToShow = (Array.isArray(view) ? view : (groupRows || []).map((r, i) => ({ r, realIndex: i })))
    .slice(0, limit);

  for (const item of rowsToShow) {
    const r = item?.r ?? [];
    const realIndex = item?.realIndex;

    if (typeof realIndex !== "number") continue;

    const tr = document.createElement("tr");

    for (let i = 0; i < headers.length; i++) {
      const td = document.createElement("td");
      td.textContent = r[i] ?? "";

      const h = (headers[i] ?? "").toLowerCase();
      if (h.includes("eid") || h.includes("transponder")) td.classList.add("mono");

      tr.appendChild(td);
    }

    const tdAct = document.createElement("td");
    tdAct.style.display = "flex";
    tdAct.style.flexDirection = "column";
    tdAct.style.gap = "6px";
    tdAct.style.minWidth = "120px";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btnSmall";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => onEditRow(realIndex));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btnSmall btnDanger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => onDeleteRow(realIndex));

    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    els.groupPreviewBody.appendChild(tr);
  }

  els.groupPreviewMeta.textContent = selectedGroup
    ? `Group ${selectedGroup.id}: ${selectedGroup.name} — ${groupRows.length} record(s), ${headers.length} column(s).`
    : "No group selected.";

  els.downloadGroupCsvBtn.disabled = !(isConnected && (groupRows?.length || 0) > 0);

  return headers;
}
