// ui/renderTasks.js

export function getTaskHeaders(taskHeaders, taskRows) {
  if (taskHeaders?.length) return taskHeaders;

  if (taskRows?.length) {
    const maxLen = Math.max(...taskRows.map((r) => r.length));
    return Array.from({ length: maxLen }, (_, i) => `Field${i + 1}`);
  }
  return [];
}

export function renderTasksDropdown(els, tasks, { isConnected }) {
  els.taskSelect.innerHTML = "";

  if (!tasks?.length) {
    els.taskSelect.appendChild(new Option("(no tasks found)", ""));
    els.taskSelect.disabled = true;
    els.syncTasksBtn.disabled = !isConnected;
    return;
  }

  els.taskSelect.appendChild(new Option("(select a task…)", "", true, false));
  for (const t of tasks) {
    els.taskSelect.appendChild(
      new Option(`${t.idx}: ${t.name} (${t.count})`, String(t.idx))
    );
  }

  els.taskSelect.disabled = false;
  els.syncTasksBtn.disabled = !isConnected;
}

/**
 * Render tasks preview.
 * You can optionally provide a precomputed `view` list:
 *   view = [{ r: rowArray, realIndex: number }, ...]
 * This preserves original indices for edit/delete even after filtering/sorting.
 */
export function renderTaskPreview(
  els,
  {
    selectedTask,
    taskHeaders,
    taskRows,
    view, // optional [{r, realIndex}]
    isConnected,
    onEditRow,
    onDeleteRow,
    limit = 200,
  }
) {
  els.previewHead.innerHTML = "";
  els.previewBody.innerHTML = "";

  const headers = getTaskHeaders(taskHeaders, taskRows);

  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    els.previewHead.appendChild(th);
  }

  const thActions = document.createElement("th");
  thActions.textContent = "Actions";
  els.previewHead.appendChild(thActions);

  const rowsToShow = (Array.isArray(view) ? view : (taskRows || []).map((r, i) => ({ r, realIndex: i })))
    .slice(0, limit);

  for (const item of rowsToShow) {
    const r = item?.r ?? [];
    const realIndex = item?.realIndex;

    // If view items are malformed, skip safely
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

    els.previewBody.appendChild(tr);
  }

  els.previewMeta.textContent = selectedTask
    ? `Task ${selectedTask.idx}: ${selectedTask.name} — ${taskRows.length} record(s), ${headers.length} column(s).`
    : "No task selected.";

  els.downloadCsvBtn.disabled = !(isConnected && (taskRows?.length || 0) > 0);

  return headers;
}
