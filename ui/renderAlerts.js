// ui/renderAlerts.js

export const ALERT_HEADERS = ["AlertNo", "AlertText"];

export function renderAlertsPreview(els, {
  rows,
  view,
  isConnected,
  onEditRow,
  onDeleteRow,
  limit = 200,
  statusText = "",
}) {
  els.alertsHead.innerHTML = "";
  els.alertsBody.innerHTML = "";

  for (const h of ALERT_HEADERS) {
    const th = document.createElement("th");
    th.textContent = h;
    els.alertsHead.appendChild(th);
  }
  const thActions = document.createElement("th");
  thActions.textContent = "Actions";
  els.alertsHead.appendChild(thActions);

  const indexed = Array.isArray(view) ? view : (rows || []).map((r, i) => ({ r, realIndex: i }));
  const rowsToShow = indexed.slice(0, limit);

  for (const { r, realIndex } of rowsToShow) {
    const tr = document.createElement("tr");

    const cells = [r.alertNo ?? "", r.alertText ?? ""];
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

    els.alertsBody.appendChild(tr);
  }

  const total = (rows || []).length;
  const shown = rowsToShow.length;
  els.alertsMeta.textContent = statusText || `Alerts — ${total} string(s). Showing ${shown}.`;
}
