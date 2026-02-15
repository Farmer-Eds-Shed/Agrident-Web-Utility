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

// -----------------------
// Modal Editor
// -----------------------
const editor = createModalEditor(els, {
  getRow: (mode, idx) => (mode === "groups" ? groupRows[idx] : taskRows[idx]),
  setRow: (mode, idx, updated) => {
    const headers = mode === "groups"
      ? getGroupHeaders(groupHeaders, groupRows)
      : getTaskHeaders(taskHeaders, taskRows);

    const formatted = formatRow(updated, headers);
    if (mode === "groups") groupRows[idx] = formatted;
    else taskRows[idx] = formatted;
  },
  deleteRow: (mode, idx) => {
    if (mode === "groups") groupRows.splice(idx, 1);
    else taskRows.splice(idx, 1);
  },
  getHeaders: (mode) => (mode === "groups"
    ? getGroupHeaders(groupHeaders, groupRows)
    : getTaskHeaders(taskHeaders, taskRows)
  ),
  getSubtitle: (mode, realIndex) => {
    if (mode === "groups") {
      const g = selectedGroup;
      return g ? `Group ${g.id}: ${g.name} — Row ${realIndex + 1}` : `Group row ${realIndex + 1}`;
    }
    return selectedTask
      ? `Task ${selectedTask.idx}: ${selectedTask.name} — Row ${realIndex + 1}`
      : `Row ${realIndex + 1}`;
  },
  onAfterChange: (mode) => {
    if (mode === "groups") rerenderGroups();
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
    rerenderTasks();
    rerenderGroups();

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

  rerenderTasks();
  rerenderGroups();

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

taskFilterEl?.addEventListener("input", () => rerenderTasks());
groupFilterEl?.addEventListener("input", () => rerenderGroups());

