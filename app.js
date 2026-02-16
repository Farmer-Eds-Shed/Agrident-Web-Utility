// app.js

import { toCSV, downloadText } from "./parsers/csv.js";
import { formatRow } from "./parsers/format.js";

import {
  getEls,
  setStatus,
  setBusy,
  setConnDetailsDefault,
  enforceBLEOnMobile,
  updateConnHint,
  isMobileUI,
} from "./ui/dom.js";
import { createTabs } from "./ui/tabs.js";
import { createModalEditor } from "./ui/modalEditor.js";

import { renderTasksDropdown, renderTaskPreview, getTaskHeaders } from "./ui/renderTasks.js";
import { renderGroupsDropdown, renderGroupPreview, getGroupHeaders } from "./ui/renderGroups.js";

import { SerialTransport, BleTransport } from "./wand/transport.js";
import { createWandSession } from "./wand/session.js";

import { fetchTasks, fetchTaskHeaders, fetchTaskRows } from "./wand/commands/tasks.js";
import { fetchGroups, fetchGroupRows } from "./wand/commands/groups.js";

import { parseCSV } from "./parsers/csv_import.js";

import { fetchTaglist, eraseTaglist, uploadTaglist } from "./wand/commands/taglist.js";
import { fetchAlerts, eraseAlerts, uploadAlerts } from "./wand/commands/alerts.js";

import { renderTaglistPreview, TAGLIST_HEADERS } from "./ui/renderTaglist.js";
import { renderAlertsPreview, ALERT_HEADERS } from "./ui/renderAlerts.js";


const SERIAL_BAUD = 9600;
const APPEND_CR = false;
const APPEND_LF = false;

const els = getEls();

// Filters
const taskFilterEl = document.getElementById("taskFilter");
const groupFilterEl = document.getElementById("groupFilter");


// -----------------------
// State
// -----------------------
let tasks = [];
let selectedTask = null;
let taskHeaders = [];
let taskRows = [];

let groups = [];
let selectedGroup = null;
let groupHeaders = [];
let groupRows = [];

let preferGroupX = true;

let tagRows = [];          // [{eid, vid, alertNo}]
let tagRowsLoaded = [];    // from CSV
let alertRows = [];        // [{alertNo, alertText}]
let alertRowsLoaded = [];  // from CSV

// -----------------------
// Transport + Session
// -----------------------
let transport = null; // SerialTransport | BleTransport
let session = null;

function buildSession() {
  session = createWandSession({
    transport,
    setBusy: (t) => setBusy(els, t),
    onCommandUIStateChange: (busy) => {
      els.connectBtn.disabled = true;
      els.disconnectBtn.disabled = false;
      els.connType.disabled = true;

      els.taskSelect.disabled = busy || !(transport?.isConnected && tasks.length);
      els.syncTasksBtn.disabled = busy || !(transport?.isConnected);
      els.downloadCsvBtn.disabled = busy || !(transport?.isConnected && taskRows.length);

      els.groupSelect.disabled = busy || !(transport?.isConnected && groups.length);
      els.syncGroupsBtn.disabled = busy || !(transport?.isConnected);
      els.downloadGroupCsvBtn.disabled = busy || !(transport?.isConnected && groupRows.length);
    },
    timeoutMs: 12000,
    appendCR: APPEND_CR,
    appendLF: APPEND_LF,
  });
}

// -----------------------
// Tabs
// -----------------------
const tabs = createTabs(els, "groups");
els.tabTasksBtn?.addEventListener("click", () => tabs.setActiveTab("tasks"));
els.tabGroupsBtn?.addEventListener("click", () => tabs.setActiveTab("groups"));
els.tabTaglistBtn?.addEventListener("click", () => tabs.setActiveTab("taglist"));

// -----------------------
// Modal Editor
// -----------------------
const editor = createModalEditor(els, {
  getRow: (mode, idx) => {
    if (mode === "taglist") return [tagRows[idx]?.eid ?? "", tagRows[idx]?.vid ?? "", tagRows[idx]?.alertNo ?? "0"];
    if (mode === "alerts") return [alertRows[idx]?.alertNo ?? "", alertRows[idx]?.alertText ?? ""];
    return mode === "groups" ? groupRows[idx] : taskRows[idx];
  },

  setRow: (mode, idx, updated) => {
    if (mode === "taglist") {
      tagRows[idx] = { eid: updated[0] ?? "", vid: updated[1] ?? "", alertNo: updated[2] ?? "0" };
      return;
    }
    if (mode === "alerts") {
      alertRows[idx] = { alertNo: updated[0] ?? "", alertText: updated[1] ?? "" };
      return;
    }

    // existing tasks/groups logic stays as-is...
    const headers = mode === "groups" ? getGroupHeaders(groupHeaders, groupRows) : getTaskHeaders(taskHeaders, taskRows);
    const formatted = formatRow(updated, headers);
    if (mode === "groups") groupRows[idx] = formatted;
    else taskRows[idx] = formatted;
  },

  deleteRow: (mode, idx) => {
    if (mode === "taglist") { tagRows.splice(idx, 1); return; }
    if (mode === "alerts") { alertRows.splice(idx, 1); return; }
    if (mode === "groups") groupRows.splice(idx, 1);
    else taskRows.splice(idx, 1);
  },

  getHeaders: (mode) => {
    if (mode === "taglist") return TAGLIST_HEADERS;
    if (mode === "alerts") return ALERT_HEADERS;
    return mode === "groups" ? getGroupHeaders(groupHeaders, groupRows) : getTaskHeaders(taskHeaders, taskRows);
  },

  getSubtitle: (mode, realIndex) => {
    if (mode === "taglist") return `Taglist — Row ${realIndex + 1}`;
    if (mode === "alerts") return `Alerts — Row ${realIndex + 1}`;
    // existing...
    if (mode === "groups") {
      const g = selectedGroup;
      return g ? `Group ${g.id}: ${g.name} — Row ${realIndex + 1}` : `Group row ${realIndex + 1}`;
    }
    return selectedTask
      ? `Task ${selectedTask.idx}: ${selectedTask.name} — Row ${realIndex + 1}`
      : `Row ${realIndex + 1}`;
  },

  onAfterChange: (mode) => {
    if (mode === "taglist") rerenderTaglist();
    else if (mode === "alerts") rerenderAlerts();
    else if (mode === "groups") rerenderGroups();
    else rerenderTasks();
  },
});


// -----------------------
// Render wrappers
// -----------------------
function rerenderTasks() {
  renderTasksDropdown(els, tasks, { isConnected: !!transport?.isConnected });

  const q = (taskFilterEl?.value || "").trim().toLowerCase();

  let view = taskRows.map((r, i) => ({ r, realIndex: i }));

  if (q) {
    view = view.filter(({ r }) =>
      r.join(" ").toLowerCase().includes(q)
    );
  }

  renderTaskPreview(els, {
    selectedTask,
    taskHeaders,
    taskRows,
    view,  // ✅ pass filtered view
    isConnected: !!transport?.isConnected,
    onEditRow: (realIndex) => editor.openEditor("tasks", realIndex),
    onDeleteRow: (realIndex) => {
      if (!confirm(`Delete row #${realIndex + 1}?`)) return;
      taskRows.splice(realIndex, 1);
      rerenderTasks();
    },
  });

  if (taskFilterEl) {
    taskFilterEl.disabled = !(transport?.isConnected && taskRows.length);
  }
}


function rerenderGroups() {
  renderGroupsDropdown(els, groups, { isConnected: !!transport?.isConnected });

  const q = (groupFilterEl?.value || "").trim().toLowerCase();

  let view = groupRows.map((r, i) => ({ r, realIndex: i }));

  if (q) {
    view = view.filter(({ r }) =>
      r.join(" ").toLowerCase().includes(q)
    );
  }

  renderGroupPreview(els, {
    selectedGroup,
    groupHeaders,
    groupRows,
    view,  // ✅ filtered view
    isConnected: !!transport?.isConnected,
    onEditRow: (realIndex) => editor.openEditor("groups", realIndex),
    onDeleteRow: (realIndex) => {
      if (!confirm(`Delete row #${realIndex + 1}?`)) return;
      groupRows.splice(realIndex, 1);
      rerenderGroups();
    },
  });

  if (groupFilterEl) {
    groupFilterEl.disabled = !(transport?.isConnected && groupRows.length);
  }
}

function rerenderTaglist() {
  const isConn = !!transport?.isConnected;

  // enable buttons
  els.syncTaglistBtn.disabled = !isConn;
  els.eraseTaglistBtn.disabled = !isConn;
  els.downloadTaglistCsvBtn.disabled = !(isConn && tagRows.length);

  els.taglistFile.disabled = !isConn;
  els.uploadTaglistBtn.disabled = !(isConn && tagRowsLoaded.length);

  const q = (els.taglistFilter?.value || "").trim().toLowerCase();
  els.taglistFilter.disabled = !(isConn && tagRows.length);

  let view = tagRows.map((r, i) => ({ r, realIndex: i }));
  if (q) {
    view = view.filter(({ r }) => `${r.eid} ${r.vid} ${r.alertNo}`.toLowerCase().includes(q));
  }

  renderTaglistPreview(els, {
    rows: tagRows,
    view,
    isConnected: isConn,
    onEditRow: (idx) => editor.openEditor("taglist", idx),
    onDeleteRow: (idx) => {
      if (!confirm(`Delete tag row #${idx + 1}?`)) return;
      tagRows.splice(idx, 1);
      rerenderTaglist();
    },
    statusText: tagRowsLoaded.length
      ? `Taglist — ${tagRows.length} on device. ${tagRowsLoaded.length} loaded from CSV (ready to upload).`
      : `Taglist — ${tagRows.length} on device.`,
  });
}

function rerenderAlerts() {
  const isConn = !!transport?.isConnected;

  els.syncAlertsBtn.disabled = !isConn;
  els.eraseAlertsBtn.disabled = !isConn;
  els.downloadAlertsCsvBtn.disabled = !(isConn && alertRows.length);

  els.alertsFile.disabled = !isConn;
  els.uploadAlertsBtn.disabled = !(isConn && alertRowsLoaded.length);

  const q = (els.alertsFilter?.value || "").trim().toLowerCase();
  els.alertsFilter.disabled = !(isConn && alertRows.length);

  let view = alertRows.map((r, i) => ({ r, realIndex: i }));
  if (q) {
    view = view.filter(({ r }) => `${r.alertNo} ${r.alertText}`.toLowerCase().includes(q));
  }

  renderAlertsPreview(els, {
    rows: alertRows,
    view,
    isConnected: isConn,
    onEditRow: (idx) => editor.openEditor("alerts", idx),
    onDeleteRow: (idx) => {
      if (!confirm(`Delete alert row #${idx + 1}?`)) return;
      alertRows.splice(idx, 1);
      rerenderAlerts();
    },
    statusText: alertRowsLoaded.length
      ? `Alerts — ${alertRows.length} on device. ${alertRowsLoaded.length} loaded from CSV (ready to upload).`
      : `Alerts — ${alertRows.length} on device.`,
  });
}



// -----------------------
// Connect / Disconnect
// -----------------------
async function connect() {
  try {
    setStatus(els, "Connecting…", false);
    setBusy(els, "connecting");

    // reset state
    tasks = []; selectedTask = null; taskHeaders = []; taskRows = [];
    groups = []; selectedGroup = null; groupHeaders = []; groupRows = [];
    tagRows = []; tagRowsLoaded = [];
    alertRows = []; alertRowsLoaded = [];

    rerenderTasks();
    rerenderGroups();
    rerenderTaglist();
    rerenderAlerts();

    els.connectBtn.disabled = true;
    els.disconnectBtn.disabled = false;
    els.connType.disabled = true;

    if (isMobileUI()) els.connType.value = "ble";
    const kind = els.connType.value;

    transport = (kind === "serial")
      ? new SerialTransport({ baudRate: SERIAL_BAUD, onTextChunk: (chunk) => session?.onTextChunk(chunk) })
      : new BleTransport({ onTextChunk: (chunk) => session?.onTextChunk(chunk) });

    buildSession();
    await transport.connect();

    if (kind === "ble") {
      els.deviceNameEl.textContent = transport.device?.name
        ? `Selected: ${transport.device.name}`
        : `Selected: (BLE device)`;
    } else {
      const info = transport.port?.getInfo?.() ?? null;
      if (info && (info.usbVendorId || info.usbProductId)) {
        els.deviceNameEl.textContent = `Serial: USB VID ${info.usbVendorId || "?"} PID ${info.usbProductId || "?"} @ ${SERIAL_BAUD}`;
      } else {
        els.deviceNameEl.textContent = `Serial: Connected @ ${SERIAL_BAUD}`;
      }
    }

    setStatus(els, "Connected", true);
    setBusy(els, "idle");

    els.syncTasksBtn.disabled = false;
    els.syncGroupsBtn.disabled = false;

    tabs.setActiveTab("groups");
    rerenderTasks();
    rerenderGroups();
    rerenderTaglist();
    rerenderAlerts();
  } catch (e) {
    alert(`Connect failed: ${e?.message || e}`);
    await cleanup();
  }
}

async function cleanup() {
  editor.closeEditor(false);

  try { await transport?.disconnect?.(); } catch {}
  transport = null;
  session = null;

  els.connectBtn.disabled = false;
  els.disconnectBtn.disabled = true;
  els.connType.disabled = false;

  els.deviceNameEl.textContent = "";
  els.syncedAtEl.textContent = "";
  els.groupsSyncedAtEl.textContent = "";

  tasks = []; selectedTask = null; taskHeaders = []; taskRows = [];
  groups = []; selectedGroup = null; groupHeaders = []; groupRows = [];

  tagRows = []; tagRowsLoaded = [];
  tagRowsLoaded = [];
  
  alertRows = [];
  alertRowsLoaded = [];

  rerenderTasks();
  rerenderGroups();
  rerenderTaglist();
  rerenderAlerts();

  setStatus(els, "Disconnected", false);
  setBusy(els, "idle");
}

// -----------------------
// UI wiring
// -----------------------
setConnDetailsDefault(els);
window.addEventListener("resize", () => setConnDetailsDefault(els));

enforceBLEOnMobile(els);
window.addEventListener("resize", () => enforceBLEOnMobile(els));

updateConnHint(els);
els.connType.addEventListener("change", () => {
  enforceBLEOnMobile(els);
  updateConnHint(els);
});

els.connectBtn.addEventListener("click", connect);
els.disconnectBtn.addEventListener("click", cleanup);

els.preferGroupXEl?.addEventListener("change", () => {
  preferGroupX = !!els.preferGroupXEl.checked;
});

// Sync Tasks
els.syncTasksBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncTasksBtn.disabled = true;

    tasks = await fetchTasks(session);
    els.syncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;

    rerenderTasks();
  } catch (e) {
    alert(`Failed to sync tasks: ${e?.message || e}`);
  } finally {
    els.syncTasksBtn.disabled = !(transport?.isConnected);
  }
});

// Select Task
els.taskSelect.addEventListener("change", async () => {
  if (taskFilterEl) taskFilterEl.value = "";
  try {
    if (!transport?.isConnected || !session) return;
    const idx = els.taskSelect.value;
    if (!idx) return;

    selectedTask = tasks.find((t) => String(t.idx) === String(idx)) || { idx, name: "(unknown)" };
    taskHeaders = [];
    taskRows = [];
    rerenderTasks();

    taskHeaders = await fetchTaskHeaders(session, idx);
    const rawRows = await fetchTaskRows(session, idx);

    const headers = getTaskHeaders(taskHeaders, rawRows);
    taskRows = rawRows.map((r) => formatRow(r, headers));

    rerenderTasks();
  } catch (e) {
    alert(`Failed to load task: ${e?.message || e}`);
  }
});

// Sync Groups
els.syncGroupsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncGroupsBtn.disabled = true;

    groups = await fetchGroups(session);
    els.groupsSyncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;

    rerenderGroups();
  } catch (e) {
    alert(`Failed to sync groups: ${e?.message || e}`);
  } finally {
    els.syncGroupsBtn.disabled = !(transport?.isConnected);
  }
});

// Select Group
els.groupSelect.addEventListener("change", async () => {
  if (groupFilterEl) groupFilterEl.value = "";
  try {
    if (!transport?.isConnected || !session) return;
    const id = els.groupSelect.value;
    if (!id) return;

    selectedGroup = groups.find((g) => String(g.id) === String(id)) || { id, name: "(unknown)" };
    groupHeaders = [];
    groupRows = [];
    rerenderGroups();

    const out = await fetchGroupRows(session, id, { preferX: preferGroupX });
    groupHeaders = out.headers;
    groupRows = out.rows;

    rerenderGroups();
  } catch (e) {
    alert(`Failed to load group: ${e?.message || e}`);
  }
});

// --- Taglist ---
els.syncTaglistBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncTaglistBtn.disabled = true;
    tagRows = await fetchTaglist(session);
  } catch (e) {
    alert(`Failed to sync taglist: ${e?.message || e}`);
  } finally {
    els.syncTaglistBtn.disabled = !(transport?.isConnected);
    rerenderTaglist();
  }
});

els.eraseTaglistBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!confirm("Erase ALL taglist entries on the wand?")) return;
    els.eraseTaglistBtn.disabled = true;
    await eraseTaglist(session);
    tagRows = [];
  } catch (e) {
    alert(`Failed to erase taglist: ${e?.message || e}`);
  } finally {
    els.eraseTaglistBtn.disabled = !(transport?.isConnected);
    rerenderTaglist();
  }
});

els.downloadTaglistCsvBtn.addEventListener("click", () => {
  const headers = TAGLIST_HEADERS;
  const rows = tagRows.map((r) => [r.eid ?? "", r.vid ?? "", r.alertNo ?? "0"]);
  downloadText(`taglist.csv`, toCSV(headers, rows));
});

els.taglistFile.addEventListener("change", async () => {
  const f = els.taglistFile.files?.[0];
  if (!f) return;

  const text = await f.text();
  const rows = parseCSV(text);

  // Expect headers row: EID,VID,AlertNo (case-insensitive)
  const head = (rows[0] || []).map((s) => s.toLowerCase());
  const iE = head.indexOf("eid");
  const iV = head.indexOf("vid");
  const iA = head.indexOf("alertno");

  const data = rows.slice(1).map((r) => ({
    eid: r[iE] ?? r[0] ?? "",
    vid: r[iV] ?? r[1] ?? "",
    alertNo: r[iA] ?? r[2] ?? "0",
  })).filter((r) => String(r.eid).trim() !== "");

  tagRowsLoaded = data;
  rerenderTaglist();
});

els.uploadTaglistBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!tagRowsLoaded.length) return;

    if (!confirm(`Upload ${tagRowsLoaded.length} tags to the wand?\n\n(They will be appended; existing taglist stays unless you erase first.)`)) {
      return;
    }

    els.uploadTaglistBtn.disabled = true;

    await uploadTaglist(session, tagRowsLoaded, {
      onProgress: ({ i, total }) => {
        els.taglistMeta.textContent = `Uploading taglist… ${i}/${total}`;
      }
    });

    els.taglistMeta.textContent = `Upload complete. (Tip: re-sync taglist to confirm.)`;
  } catch (e) {
    alert(`Failed to upload taglist: ${e?.message || e}`);
  } finally {
    els.uploadTaglistBtn.disabled = !(transport?.isConnected && tagRowsLoaded.length);
    rerenderTaglist();
  }
});

// Filter typing
els.taglistFilter?.addEventListener("input", () => rerenderTaglist());


// --- Alerts ---
els.syncAlertsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncAlertsBtn.disabled = true;
    alertRows = await fetchAlerts(session);
  } catch (e) {
    alert(`Failed to sync alerts: ${e?.message || e}`);
  } finally {
    els.syncAlertsBtn.disabled = !(transport?.isConnected);
    rerenderAlerts();
  }
});

els.eraseAlertsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!confirm("Erase ALL alert strings on the wand?")) return;
    els.eraseAlertsBtn.disabled = true;
    await eraseAlerts(session);
    alertRows = [];
  } catch (e) {
    alert(`Failed to erase alerts: ${e?.message || e}`);
  } finally {
    els.eraseAlertsBtn.disabled = !(transport?.isConnected);
    rerenderAlerts();
  }
});

els.downloadAlertsCsvBtn.addEventListener("click", () => {
  const headers = ALERT_HEADERS;
  const rows = alertRows.map((r) => [r.alertNo ?? "", r.alertText ?? ""]);
  downloadText(`alerts.csv`, toCSV(headers, rows));
});

els.alertsFile.addEventListener("change", async () => {
  const f = els.alertsFile.files?.[0];
  if (!f) return;

  const text = await f.text();
  const rows = parseCSV(text);

  const head = (rows[0] || []).map((s) => s.toLowerCase());
  const iN = head.indexOf("alertno");
  const iT = head.indexOf("alerttext");

  const data = rows.slice(1).map((r) => ({
    alertNo: r[iN] ?? r[0] ?? "",
    alertText: r[iT] ?? r[1] ?? "",
  })).filter((r) => String(r.alertNo).trim() !== "");

  alertRowsLoaded = data;
  rerenderAlerts();
});

els.uploadAlertsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!alertRowsLoaded.length) return;

    if (!confirm(`Upload ${alertRowsLoaded.length} alert strings to the wand?`)) return;

    els.uploadAlertsBtn.disabled = true;

    await uploadAlerts(session, alertRowsLoaded, {
      onProgress: ({ i, total }) => {
        els.alertsMeta.textContent = `Uploading alerts… ${i}/${total}`;
      }
    });

    els.alertsMeta.textContent = `Upload complete. (Tip: re-sync alerts to confirm.)`;
  } catch (e) {
    alert(`Failed to upload alerts: ${e?.message || e}`);
  } finally {
    els.uploadAlertsBtn.disabled = !(transport?.isConnected && alertRowsLoaded.length);
    rerenderAlerts();
  }
});

els.alertsFilter?.addEventListener("input", () => rerenderAlerts());


// Download CSVs
els.downloadCsvBtn.addEventListener("click", () => {
  if (!selectedTask) return;
  const safeName = String(selectedTask.name || `task_${selectedTask.idx}`).replace(/[^\w\-]+/g, "_").slice(0, 60);

  const headers = getTaskHeaders(taskHeaders, taskRows);
  downloadText(`${safeName}.csv`, toCSV(headers, taskRows));
});

els.downloadGroupCsvBtn.addEventListener("click", () => {
  if (!selectedGroup) return;
  const safeName = String(selectedGroup.name || `group_${selectedGroup.id}`).replace(/[^\w\-]+/g, "_").slice(0, 60);

  const headers = getGroupHeaders(groupHeaders, groupRows);
  downloadText(`${safeName}.csv`, toCSV(headers, groupRows));
});

// Init
setStatus(els, "Disconnected", false);
setBusy(els, "idle");
tabs.setActiveTab("groups");

rerenderTasks();
rerenderGroups();
rerenderTaglist();
rerenderAlerts();

taskFilterEl?.addEventListener("input", () => rerenderTasks());
groupFilterEl?.addEventListener("input", () => rerenderGroups());

