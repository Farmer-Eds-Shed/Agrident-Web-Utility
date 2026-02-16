// ui/renderTaglist.js

export const TAGLIST_HEADERS = ["EID", "VID", "AlertNo"];

export function renderTaglistPreview(els, {
  rows,
  view,
  isConnected,
  onEditRow,
  onDeleteRow,
  limit = 200,
  statusText = "",
}) {
  els.taglistHead.innerHTML = "";
  els.taglistBody.innerHTML = "";

  for (const h of TAGLIST_HEADERS) {
    const th = document.createElement("th");
    th.textContent = h;
    els.taglistHead.appendChild(th);
  }
  const thActions = document.createElement("th");
  thActions.textContent = "Actions";
  els.taglistHead.appendChild(thActions);

  const indexed = Array.isArray(view) ? view : (rows || []).map((r, i) => ({ r, realIndex: i }));
  const rowsToShow = indexed.slice(0, limit);

  for (const { r, realIndex } of rowsToShow) {
    const tr = document.createElement("tr");

    const cells = [r.eid ?? "", r.vid ?? "", r.alertNo ?? "0"];
    for (let i = 0; i < cells.length; i++) {
      const td = document.createElement("td");
      td.textContent = cells[i];
      if (i === 0) td.classList.add("mono");
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

    els.taglistBody.appendChild(tr);
  }

  const total = (rows || []).length;
  const shown = rowsToShow.length;
  els.taglistMeta.textContent = statusText || `Taglist — ${total} tag(s). Showing ${shown}.`;

  // buttons enabling is handled in app.js
}
