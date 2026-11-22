// app.js
// Main app wiring (UI + session + commands)

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

import { fetchTasks, fetchTaskHeaders, fetchTaskRows, fetchTaskRowsVerified } from "./wand/commands/tasks.js";
import { fetchGroups, fetchGroupRows } from "./wand/commands/groups.js";

import { parseCSV } from "./parsers/csv_import.js";
import { readTextFile, parseTskCommands, uploadTskCommands, getTskSlot, setTskSlot } from "./configs/tsk.js";

import { fetchTaglist, eraseTaglist, uploadTaglist } from "./wand/commands/taglist.js";
import { fetchAlerts, eraseAlerts, uploadAlerts } from "./wand/commands/alerts.js";

import { renderTaglistPreview, TAGLIST_HEADERS } from "./ui/renderTaglist.js";
import { renderAlertsPreview, ALERT_HEADERS } from "./ui/renderAlerts.js";

import {
  fetchSettings,
  applySettings,
  SETTINGS_HEADERS,
  SETTINGS_DEFAULT_DEFS,
  fetchDeviceInfo,
} from "./wand/commands/settings.js";


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

let tagDeviceRows = [];   // last synced from wand
let tagDraftRows = [];    // what user edits / exports / uploads
let tagDraftSource = "none"; // "device" | "csv" | "none"

let alertDeviceRows = [];   // last synced from wand
let alertDraftRows = [];    // what user edits / exports / uploads
let alertDraftSource = "none"; // "device" | "csv" | "none"

let settingsDeviceRows = [];   // last synced from wand
let settingsDraftRows = [];    // what user edits / exports / uploads
let settingsDraftSource = "none"; // "device" | "json" | "none"
let settingsInfo = null;       // bt/mac versions etc

let sessionBusy = false;
let taskDefinitionCommands = [];
let taskDefinitionName = "";
let taskDefinitionUploading = false;
let taskCatalogueLoaded = false;
let repositoryTaskTemplates = [];

function refreshTaskSlotOptions() {
  const selected = els.taskDefinitionSlot.value;
  const occupied = new Map(tasks.map(t => [Number(t.idx), t]));
  els.taskDefinitionSlot.replaceChildren();
  for (let slot = 1; slot <= 20; slot++) {
    const task = occupied.get(slot - 1);
    els.taskDefinitionSlot.add(new Option(task
      ? `Task ${slot} — ${task.name} (occupied)`
      : `Task ${slot} — Empty`, String(slot)));
  }
  if (selected) els.taskDefinitionSlot.value = selected;
}
refreshTaskSlotOptions();


function rerenderTaskDefinition() {
  const connected = !!transport?.isConnected;
  els.openTaskUploadBtn.disabled = !connected || !taskCatalogueLoaded || sessionBusy || taskDefinitionUploading;
  els.initialiseAllTasksBtn.disabled = !connected || !taskCatalogueLoaded || sessionBusy || taskDefinitionUploading;
  els.taskDefinitionFile.disabled = !connected || sessionBusy || taskDefinitionUploading;
  els.taskTemplateSelect.disabled = !connected || sessionBusy || taskDefinitionUploading;
  els.refreshTaskTemplatesBtn.disabled = sessionBusy || taskDefinitionUploading;
  els.taskDefinitionSlot.disabled = !connected || !taskCatalogueLoaded || sessionBusy || taskDefinitionUploading || !taskDefinitionCommands.length;
  els.uploadTaskDefinitionBtn.disabled = !connected || !taskCatalogueLoaded || sessionBusy || taskDefinitionUploading || !taskDefinitionCommands.length;
  const slot = Number(els.taskDefinitionSlot.value);
  els.taskDefinitionPreview.textContent = taskDefinitionCommands.length
    ? setTskSlot(taskDefinitionCommands, slot).join("\n") : "";
  els.taskDefinitionMeta.textContent = taskDefinitionCommands.length
    ? `${taskDefinitionName} — ${taskDefinitionCommands.length} commands loaded. Review before uploading.`
    : "No task definition loaded.";
}


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
      sessionBusy = !!busy;

      // connection basics
      els.connectBtn.disabled = true;
      els.disconnectBtn.disabled = false;
      els.connType.disabled = true;

      // tasks
      els.taskSelect.disabled = busy || !(transport?.isConnected && tasks.length);
      els.syncTasksBtn.disabled = busy || !(transport?.isConnected);
      els.downloadCsvBtn.disabled = busy || !(transport?.isConnected && taskRows.length);

      rerenderTaskDefinition();

      // groups
      els.groupSelect.disabled = busy || !(transport?.isConnected && groups.length);
      els.syncGroupsBtn.disabled = busy || !(transport?.isConnected);
      els.downloadGroupCsvBtn.disabled = busy || !(transport?.isConnected && groupRows.length);

      // keep other panels in sync
      rerenderTaglist();
      rerenderAlerts();
      rerenderSettings();
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
els.tabSettingsBtn?.addEventListener("click", () => tabs.setActiveTab("settings"));

// -----------------------
// Modal Editor
// -----------------------
const editor = createModalEditor(els, {
  getRow: (mode, idx) => {
    if (mode === "taglist") {
      const r = tagDraftRows[idx] || {};
      return [r.eid ?? "", r.vid ?? "", r.alertNo ?? "0"];
    }
    if (mode === "alerts") {
      const r = alertDraftRows[idx] || {};
      return [r.alertNo ?? "", r.alertText ?? ""];
    }
    if (mode === "settings") {
      const r = settingsDraftRows[idx] || {};
      return [r.key ?? "", r.label ?? "", r.value ?? ""];
    }

    return mode === "groups" ? groupRows[idx] : taskRows[idx];
  },

  setRow: (mode, idx, updated) => {
    if (mode === "taglist") {
      tagDraftRows[idx] = { eid: updated[0] ?? "", vid: updated[1] ?? "", alertNo: updated[2] ?? "0" };
      return;
    }
    if (mode === "alerts") {
      alertDraftRows[idx] = { alertNo: updated[0] ?? "", alertText: updated[1] ?? "" };
      return;
    }
    if (mode === "settings") {
      const prev = settingsDraftRows[idx] || {};
      settingsDraftRows[idx] = {
        ...prev,
        key: updated[0] ?? "",
        label: updated[1] ?? "",
        value: updated[2] ?? "",
      };
      return;
    }

    const headers = mode === "groups" ? getGroupHeaders(groupHeaders, groupRows) : getTaskHeaders(taskHeaders, taskRows);
    const formatted = formatRow(updated, headers);
    if (mode === "groups") groupRows[idx] = formatted;
    else taskRows[idx] = formatted;
  },

  deleteRow: (mode, idx) => {
    if (mode === "taglist") { tagDraftRows.splice(idx, 1); return; }
    if (mode === "alerts") { alertDraftRows.splice(idx, 1); return; }
    if (mode === "settings") { settingsDraftRows.splice(idx, 1); return; }
    if (mode === "groups") groupRows.splice(idx, 1);
    else taskRows.splice(idx, 1);
  },

  getHeaders: (mode) => {
    if (mode === "taglist") return TAGLIST_HEADERS;
    if (mode === "alerts") return ALERT_HEADERS;
    if (mode === "settings") return SETTINGS_HEADERS;
    return mode === "groups" ? getGroupHeaders(groupHeaders, groupRows) : getTaskHeaders(taskHeaders, taskRows);
  },

  getSubtitle: (mode, realIndex) => {
    if (mode === "taglist") return `Taglist Draft — Row ${realIndex + 1}`;
    if (mode === "alerts") return `Alerts Draft — Row ${realIndex + 1}`;
    if (mode === "settings") return `Settings Draft — Row ${realIndex + 1}`;

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
    else if (mode === "settings") rerenderSettings();
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
    view,
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
    view,
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
  const busy = !!sessionBusy;

  const mode = (els.taglistUploadMode?.value || "append");

  els.syncTaglistBtn.disabled = !isConn || busy;
  els.eraseTaglistBtn.disabled = !isConn || busy;
  els.useDeviceAsDraftBtn.disabled = busy || !(isConn && tagDeviceRows.length);

  els.taglistFile.disabled = !isConn || busy;
  els.taglistUploadMode.disabled = !isConn || busy;
  els.addTagRowBtn.disabled = !isConn || busy;

  const hasDraft = tagDraftRows.length > 0;
  els.downloadTaglistCsvBtn.disabled = busy || !(isConn && hasDraft);
  els.uploadTaglistBtn.disabled = busy || !(isConn && hasDraft);

  const q = (els.taglistFilter?.value || "").trim().toLowerCase();
  els.taglistFilter.disabled = busy || !(isConn && hasDraft);

  let view = tagDraftRows.map((r, i) => ({ r, realIndex: i }));
  if (q) {
    view = view.filter(({ r }) =>
      `${r.eid} ${r.vid} ${r.alertNo}`.toLowerCase().includes(q)
    );
  }

  const sourceLabel =
    tagDraftSource === "device" ? "Draft from Device" :
    tagDraftSource === "csv" ? "Draft from CSV" :
    "No Draft";

  els.taglistMeta.textContent =
    `${sourceLabel} — ${tagDraftRows.length} row(s). ` +
    `Device snapshot — ${tagDeviceRows.length} row(s). ` +
    `Upload mode: ${mode.toUpperCase()}.`;

  renderTaglistPreview(els, {
    rows: tagDraftRows,
    view,
    isConnected: isConn,
    onEditRow: (idx) => editor.openEditor("taglist", idx),
    onDeleteRow: (idx) => {
      if (!confirm(`Delete draft row #${idx + 1}?`)) return;
      tagDraftRows.splice(idx, 1);
      rerenderTaglist();
    },
  });
}

function rerenderAlerts() {
  const isConn = !!transport?.isConnected;
  const busy = !!sessionBusy;

  const mode = (els.alertsUploadMode?.value || "append");

  els.syncAlertsBtn.disabled = !isConn || busy;
  els.eraseAlertsBtn.disabled = !isConn || busy;
  els.useAlertsAsDraftBtn.disabled = busy || !(isConn && alertDeviceRows.length);

  els.alertsFile.disabled = !isConn || busy;
  els.alertsUploadMode.disabled = !isConn || busy;
  els.addAlertRowBtn.disabled = !isConn || busy;

  const hasDraft = alertDraftRows.length > 0;
  els.downloadAlertsCsvBtn.disabled = busy || !(isConn && hasDraft);
  els.uploadAlertsBtn.disabled = busy || !(isConn && hasDraft);

  const q = (els.alertsFilter?.value || "").trim().toLowerCase();
  els.alertsFilter.disabled = busy || !(isConn && hasDraft);

  let view = alertDraftRows.map((r, i) => ({ r, realIndex: i }));
  if (q) {
    view = view.filter(({ r }) =>
      `${r.alertNo} ${r.alertText}`.toLowerCase().includes(q)
    );
  }

  const sourceLabel =
    alertDraftSource === "device" ? "Draft from Device" :
    alertDraftSource === "csv" ? "Draft from CSV" :
    "No Draft";

  els.alertsMeta.textContent =
    `${sourceLabel} — ${alertDraftRows.length} row(s). ` +
    `Device snapshot — ${alertDeviceRows.length} row(s). ` +
    `Upload mode: ${mode.toUpperCase()}.`;

  renderAlertsPreview(els, {
    rows: alertDraftRows,
    view,
    isConnected: isConn,
    onEditRow: (idx) => editor.openEditor("alerts", idx),
    onDeleteRow: (idx) => {
      if (!confirm(`Delete draft row #${idx + 1}?`)) return;
      alertDraftRows.splice(idx, 1);
      rerenderAlerts();
    },
  });
}

function rerenderSettings() {
  const isConn = !!transport?.isConnected;
  const busy = !!sessionBusy;

  els.syncSettingsBtn.disabled = !isConn || busy;
  els.useSettingsAsDraftBtn.disabled = busy || !(isConn && settingsDeviceRows.length);

  els.settingsFile.disabled = !isConn || busy;
  els.addSettingRowBtn.disabled = !isConn || busy;

  const hasDraft = settingsDraftRows.length > 0;
  els.downloadSettingsBtn.disabled = busy || !(isConn && hasDraft);
  els.uploadSettingsBtn.disabled = busy || !(isConn && hasDraft);

  const q = (els.settingsFilter?.value || "").trim().toLowerCase();
  els.settingsFilter.disabled = busy || !(isConn && hasDraft);

  let view = settingsDraftRows.map((r, i) => ({ r, realIndex: i }));
  if (q) {
    view = view.filter(({ r }) =>
      `${r.key} ${r.label} ${r.value}`.toLowerCase().includes(q)
    );
  }

  const sourceLabel =
    settingsDraftSource === "device" ? "Draft from Device" :
    settingsDraftSource === "json" ? "Draft from JSON" :
    "No Draft";

  els.settingsMeta.textContent =
    `${sourceLabel} — ${settingsDraftRows.length} row(s). ` +
    `Device snapshot — ${settingsDeviceRows.length} row(s).`;

  // Head
  els.settingsHead.innerHTML = "";
  for (const h of [...SETTINGS_HEADERS, "Actions"]) {
    const th = document.createElement("th");
    th.textContent = h;
    els.settingsHead.appendChild(th);
  }

  // Body
  els.settingsBody.innerHTML = "";
  for (const { r, realIndex } of view) {
    const tr = document.createElement("tr");

    const tdKey = document.createElement("td");
    tdKey.textContent = r.key ?? "";
    tdKey.className = "mono";

    const tdLabel = document.createElement("td");
    tdLabel.textContent = r.label ?? "";

    const tdValue = document.createElement("td");
    tdValue.textContent = r.value ?? "";
    tdValue.className = "mono";

    const tdAct = document.createElement("td");
    tdAct.style.minWidth = "140px";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btnSmall";
    editBtn.textContent = "Edit";
    editBtn.disabled = !isConn || busy;
    editBtn.addEventListener("click", () => editor.openEditor("settings", realIndex));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btnSmall btnDanger";
    delBtn.style.marginLeft = "8px";
    delBtn.textContent = "Delete";
    delBtn.disabled = !isConn || busy;
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete draft row #${realIndex + 1}?`)) return;
      settingsDraftRows.splice(realIndex, 1);
      rerenderSettings();
    });

    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);

    tr.appendChild(tdKey);
    tr.appendChild(tdLabel);
    tr.appendChild(tdValue);
    tr.appendChild(tdAct);
    els.settingsBody.appendChild(tr);
  }

  if (els.settingsInfo) {
    if (settingsInfo) {
      const { btVer, btAdr, wAdr, wVer } = settingsInfo;
      els.settingsInfo.textContent =
        `BT Ver: ${btVer || "?"} — BT Addr: ${btAdr || "?"} — WLAN MAC: ${wAdr || "?"} — WLAN Ver: ${wVer || "?"}`;
    } else {
      els.settingsInfo.textContent = "";
    }
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
    taskDefinitionCommands = []; taskDefinitionName = "";
  taskCatalogueLoaded = false;
    taskCatalogueLoaded = false;
    groups = []; selectedGroup = null; groupHeaders = []; groupRows = [];
    tagDeviceRows = []; tagDraftRows = []; tagDraftSource = "none";
    alertDeviceRows = []; alertDraftRows = []; alertDraftSource = "none";
    settingsDeviceRows = []; settingsDraftRows = []; settingsDraftSource = "none"; settingsInfo = null;

    rerenderTasks();
    rerenderTaskDefinition();
    rerenderGroups();
    rerenderTaglist();
    rerenderAlerts();
    rerenderSettings();

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

    // enable initial syncs
    els.syncTasksBtn.disabled = false;
    els.syncGroupsBtn.disabled = false;

    tabs.setActiveTab("groups");
    rerenderTasks();
    rerenderGroups();
    rerenderTaglist();
    rerenderAlerts();
    rerenderSettings();
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
  sessionBusy = false;

  els.connectBtn.disabled = false;
  els.disconnectBtn.disabled = true;
  els.connType.disabled = false;

  els.deviceNameEl.textContent = "";
  els.syncedAtEl.textContent = "";
  els.groupsSyncedAtEl.textContent = "";

  tasks = []; selectedTask = null; taskHeaders = []; taskRows = [];
  taskDefinitionCommands = []; taskDefinitionName = "";
  groups = []; selectedGroup = null; groupHeaders = []; groupRows = [];

  tagDeviceRows = []; tagDraftRows = []; tagDraftSource = "none";
  alertDeviceRows = []; alertDraftRows = []; alertDraftSource = "none";
  settingsDeviceRows = []; settingsDraftRows = []; settingsDraftSource = "none"; settingsInfo = null;

  rerenderTasks();
  rerenderTaskDefinition();
  rerenderGroups();
  rerenderTaglist();
  rerenderAlerts();
  rerenderSettings();

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

// The Tasks panel stays compact; upload configuration lives in a separate dialog.
function setTaskUploadOpen(open) {
  if (taskDefinitionUploading && !open) return;
  els.taskUploadOverlay.classList.toggle("show", open);
  els.taskUploadOverlay.setAttribute("aria-hidden", String(!open));
  if (open) {
    rerenderTaskDefinition();
    if (!repositoryTaskTemplates.length) refreshRepositoryTaskTemplates();
    els.taskTemplateSelect.focus();
  } else {
    els.openTaskUploadBtn.focus();
  }
}

els.openTaskUploadBtn.addEventListener("click", () => setTaskUploadOpen(true));
els.closeTaskUploadBtn.addEventListener("click", () => setTaskUploadOpen(false));
els.cancelTaskUploadBtn.addEventListener("click", () => setTaskUploadOpen(false));
els.taskUploadOverlay.addEventListener("click", (event) => {
  if (event.target === els.taskUploadOverlay) setTaskUploadOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.taskUploadOverlay.classList.contains("show")) {
    event.preventDefault();
    setTaskUploadOpen(false);
  }
});

// Repository templates are served as static assets alongside this web utility.
// A manifest avoids relying on GitHub API calls, credentials, or directory listing.
async function refreshRepositoryTaskTemplates() {
  els.taskTemplateStatus.textContent = "Loading repository templates…";
  els.refreshTaskTemplatesBtn.disabled = true;
  try {
    const response = await fetch("./task-definitions/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.templates)) throw new Error("Invalid task template manifest.");
    repositoryTaskTemplates = manifest.templates.filter(t =>
      typeof t.name === "string" && typeof t.file === "string" &&
      /^[a-zA-Z0-9_-]+\.tsk$/.test(t.file));
    els.taskTemplateSelect.replaceChildren(new Option("Choose a repository template…", ""));
    for (const template of repositoryTaskTemplates) {
      els.taskTemplateSelect.add(new Option(template.name, template.file));
    }
    els.taskTemplateStatus.textContent = repositoryTaskTemplates.length
      ? `${repositoryTaskTemplates.length} repository template(s) available. Or choose a local file.`
      : "No repository templates listed yet. You can still choose a local file.";
  } catch (e) {
    els.taskTemplateStatus.textContent = `Repository templates unavailable: ${e.message}. Local files still work.`;
  } finally {
    els.refreshTaskTemplatesBtn.disabled = sessionBusy || taskDefinitionUploading;
  }
}
els.refreshTaskTemplatesBtn.addEventListener("click", refreshRepositoryTaskTemplates);
els.taskTemplateSelect.addEventListener("change", async () => {
  const file = els.taskTemplateSelect.value;
  if (!file) return;
  taskDefinitionCommands = [];
  taskDefinitionName = "";
  rerenderTaskDefinition();
  try {
    if (!/^[a-zA-Z0-9_-]+\.tsk$/.test(file) || !repositoryTaskTemplates.some(t => t.file === file)) {
      throw new Error("Invalid repository template selection.");
    }
    const response = await fetch(`./task-definitions/${file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error("Task definition exceeds 1 MB.");
    const commands = parseTskCommands(text);
    const originalSlot = getTskSlot(commands);
    taskDefinitionCommands = commands;
    taskDefinitionName = repositoryTaskTemplates.find(t => t.file === file).name;
    els.taskDefinitionSlot.value = String(originalSlot);
    els.taskDefinitionFile.value = "";
  } catch (e) {
    alert(`Cannot load repository template: ${e.message}`);
    els.taskTemplateSelect.value = "";
  }
  rerenderTaskDefinition();
});

// Task definition files are command streams, not exported task data.
els.taskDefinitionFile.addEventListener("change", async () => {
  taskDefinitionCommands = [];
  taskDefinitionName = "";
  els.taskTemplateSelect.value = "";
  const file = els.taskDefinitionFile.files?.[0];
  if (!file) { rerenderTaskDefinition(); return; }
  try {
    if (file.size > 1024 * 1024) throw new Error("Task definition exceeds 1 MB");
    const commands = parseTskCommands(await readTextFile(file));
    const originalSlot = getTskSlot(commands);
    taskDefinitionCommands = commands;
    taskDefinitionName = file.name;
    els.taskDefinitionSlot.value = String(originalSlot);
  } catch (e) {
    alert(`Cannot load task definition: ${e?.message || e}`);
    els.taskDefinitionFile.value = "";
  }
  rerenderTaskDefinition();
});

els.taskDefinitionSlot.addEventListener("change", rerenderTaskDefinition);

els.uploadTaskDefinitionBtn.addEventListener("click", async () => {
  if (!transport?.isConnected || !session || !taskCatalogueLoaded || sessionBusy || taskDefinitionUploading) return;
  if (!taskDefinitionCommands.length) return;
  const destinationSlot = Number(els.taskDefinitionSlot.value);
  const commands = setTskSlot(taskDefinitionCommands, destinationSlot);
  const risks = commands.filter((c) => /^\[(?:XE|RESET|FORMAT)/i.test(c));
  const warning = risks.length
    ? `WARNING: ${risks.length} command(s) appear destructive (erase/reset/format). Review the preview carefully.\n\n`
    : "";
  const occupied = tasks.find(t => Number(t.idx) === destinationSlot - 1);
  const overwriteWarning = occupied ? `\n\nTask ${destinationSlot} is OCCUPIED by "${occupied.name}" and may be replaced.` : "";
  if (!confirm(`${warning}Upload "${taskDefinitionName}" to Task ${destinationSlot} (wand menu)?\n\nThis may REPLACE the existing definition in Task ${destinationSlot}. The upload cannot be rolled back automatically.${overwriteWarning}`)) return;

  taskDefinitionUploading = true;
  rerenderTaskDefinition();
  try {
    await uploadTskCommands(session, commands, {
      onProgress: ({ i, total }) => {
        els.taskDefinitionMeta.textContent = `Uploading task definition… ${i}/${total} commands acknowledged`;
      }
    });
    tasks = await fetchTasks(session);
    taskCatalogueLoaded = true;
    refreshTaskSlotOptions();
    els.syncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;
    rerenderTasks();
    alert(`All task commands acknowledged. Task list refreshed; verify Task ${destinationSlot} appears in the wand menu.`);
  } catch (e) {
    alert(`Task definition upload stopped: ${e?.message || e}. The wand may have applied the commands already transmitted.`);
  } finally {
    taskDefinitionUploading = false;
    rerenderTaskDefinition();
  }
});

// Sync Tasks
els.syncTasksBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncTasksBtn.disabled = true;

    tasks = await fetchTasks(session);
    taskCatalogueLoaded = true;
    refreshTaskSlotOptions();
    els.syncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;

    rerenderTasks();
  } catch (e) {
    alert(`Failed to sync tasks: ${e?.message || e}`);
  } finally {
    els.syncTasksBtn.disabled = !(transport?.isConnected);
  }
});

// TaskTool AWR250 V2.15 capture: [CIB|1000|9] -> echo -> [CIBOK].
// Exact effect on recorded task data has not been independently verified.
els.initialiseAllTasksBtn.addEventListener("click", async () => {
  if (!transport?.isConnected || !session || !taskCatalogueLoaded || sessionBusy || taskDefinitionUploading) return;
  const confirmation = prompt(
    "DANGER: Initialise ALL tasks on the reader. This may remove every task definition and potentially recorded task data. This cannot be undone.\n\nType DELETE ALL TASKS to proceed:"
  );
  if (confirmation !== "DELETE ALL TASKS") return;
  if (!confirm("Final confirmation: send [CIB|1000|9] to initialise ALL tasks?")) return;

  taskDefinitionUploading = true;
  rerenderTaskDefinition();
  try {
    await session.send("[CIB|1000|9]", {
      name: "Initialise all tasks",
      okToken: "CIBOK",
    });
    // Never continue using the old catalogue after a destructive command.
    taskCatalogueLoaded = false;
    tasks = []; selectedTask = null; taskHeaders = []; taskRows = [];
    refreshTaskSlotOptions();
    rerenderTasks();
    try {
      tasks = await fetchTasks(session);
      taskCatalogueLoaded = true;
      refreshTaskSlotOptions();
      els.syncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;
      rerenderTasks();
      alert("Initialisation acknowledged. Task list refreshed; verify the reader's task slots.");
    } catch (refreshError) {
      alert(`Initialisation acknowledged, but Get Tasks failed: ${refreshError.message}. Run Get Tasks before uploading.`);
    }
  } catch (e) {
    taskCatalogueLoaded = false;
    alert(`Initialisation not confirmed: ${e?.message || e}. The reader may still have processed the command; run Get Tasks to inspect its state.`);
  } finally {
    taskDefinitionUploading = false;
    rerenderTaskDefinition();
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
    // Over BLE, verify and auto-retry (notifications can be dropped); serial is reliable as-is.
    const rawRows = (transport instanceof BleTransport)
      ? await fetchTaskRowsVerified(session, idx, { expectedCount: selectedTask?.count })
      : await fetchTaskRows(session, idx, { expectedCount: selectedTask?.count });

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

    const out = await fetchGroupRows(session, id, {
      preferX: preferGroupX,
      verify: transport instanceof BleTransport,
    });
    groupHeaders = out.headers;
    groupRows = out.rows;

    rerenderGroups();
  } catch (e) {
    alert(`Failed to load group: ${e?.message || e}`);
  }
});


// -----------------------
// Taglist
// -----------------------
els.syncTaglistBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncTaglistBtn.disabled = true;

    tagDeviceRows = await fetchTaglist(session);

    rerenderTaglist();
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
    tagDeviceRows = [];
    tagDraftRows = [];
    tagDraftSource = "none";
  } catch (e) {
    alert(`Failed to erase taglist: ${e?.message || e}`);
  } finally {
    els.eraseTaglistBtn.disabled = !(transport?.isConnected);
    rerenderTaglist();
  }
});

els.useDeviceAsDraftBtn.addEventListener("click", () => {
  tagDraftRows = tagDeviceRows.map((r) => ({ ...r }));
  tagDraftSource = "device";
  if (els.taglistFilter) els.taglistFilter.value = "";
  rerenderTaglist();
});

els.downloadTaglistCsvBtn.addEventListener("click", () => {
  const headers = TAGLIST_HEADERS;
  const rows = tagDraftRows.map((r) => [r.eid ?? "", r.vid ?? "", r.alertNo ?? "0"]);
  downloadText("taglist_draft.csv", toCSV(headers, rows));
});

els.taglistFile.addEventListener("change", async () => {
  const f = els.taglistFile.files?.[0];
  if (!f) return;

  const text = await f.text();
  const rows = parseCSV(text);

  const head = (rows[0] || []).map((s) => String(s || "").toLowerCase());
  const iE = head.indexOf("eid");
  const iV = head.indexOf("vid");
  const iA = head.indexOf("alertno");

  const data = rows.slice(1).map((r) => ({
    eid: r[iE] ?? r[0] ?? "",
    vid: r[iV] ?? r[1] ?? "",
    alertNo: r[iA] ?? r[2] ?? "0",
  })).filter((r) => String(r.eid).trim() !== "");

  tagDraftRows = data;
  tagDraftSource = "csv";
  if (els.taglistFilter) els.taglistFilter.value = "";
  rerenderTaglist();
});

els.uploadTaglistBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!tagDraftRows.length) return;

    const mode = (els.taglistUploadMode?.value || "append");

    if (mode === "replace") {
      if (!confirm(
        `REPLACE will ERASE the wand taglist, then upload ${tagDraftRows.length} draft rows.\n\nProceed?`
      )) return;

      els.taglistMeta.textContent = "Erasing device taglist…";
      await eraseTaglist(session);
    } else {
      if (!confirm(
        `APPEND will add ${tagDraftRows.length} rows to the existing wand taglist.\n` +
        `This can create duplicates if EIDs already exist.\n\nProceed?`
      )) return;
    }

    els.uploadTaglistBtn.disabled = true;

    await uploadTaglist(session, tagDraftRows, {
      onProgress: ({ i, total }) => {
        els.taglistMeta.textContent = `Uploading (${mode})… ${i}/${total}`;
      }
    });

    els.taglistMeta.textContent = `Upload complete (${mode}). Tip: Sync Device to confirm.`;
  } catch (e) {
    alert(`Failed to upload taglist: ${e?.message || e}`);
  } finally {
    rerenderTaglist();
  }
});

els.addTagRowBtn.addEventListener("click", () => {
  tagDraftRows.push({ eid: "", vid: "", alertNo: "0" });
  if (tagDraftSource === "none") tagDraftSource = "device";
  rerenderTaglist();
  editor.openEditor("taglist", tagDraftRows.length - 1);
});

els.taglistFilter?.addEventListener("input", () => rerenderTaglist());


// -----------------------
// Alerts
// -----------------------
els.syncAlertsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncAlertsBtn.disabled = true;

    alertDeviceRows = await fetchAlerts(session);
  } catch (e) {
    alert(`Failed to sync alerts: ${e?.message || e}`);
  } finally {
    els.syncAlertsBtn.disabled = !(transport?.isConnected);
    rerenderAlerts();
  }
});

els.useAlertsAsDraftBtn.addEventListener("click", () => {
  alertDraftRows = alertDeviceRows.map((r) => ({ ...r }));
  alertDraftSource = "device";
  if (els.alertsFilter) els.alertsFilter.value = "";
  rerenderAlerts();
});

els.eraseAlertsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!confirm("Erase ALL alert strings on the wand?")) return;

    els.eraseAlertsBtn.disabled = true;
    await eraseAlerts(session);

    alertDeviceRows = [];
    alertDraftRows = [];
    alertDraftSource = "none";
  } catch (e) {
    alert(`Failed to erase alerts: ${e?.message || e}`);
  } finally {
    els.eraseAlertsBtn.disabled = !(transport?.isConnected);
    rerenderAlerts();
  }
});

els.downloadAlertsCsvBtn.addEventListener("click", () => {
  const headers = ALERT_HEADERS;
  const rows = alertDraftRows.map((r) => [r.alertNo ?? "", r.alertText ?? ""]);
  downloadText("alerts_draft.csv", toCSV(headers, rows));
});

els.alertsFile.addEventListener("change", async () => {
  const f = els.alertsFile.files?.[0];
  if (!f) return;

  const text = await f.text();
  const rows = parseCSV(text);

  const head = (rows[0] || []).map((s) => String(s || "").toLowerCase());
  const iN = head.indexOf("alertno");
  const iT = head.indexOf("alerttext");

  const data = rows.slice(1).map((r) => ({
    alertNo: r[iN] ?? r[0] ?? "",
    alertText: r[iT] ?? r[1] ?? "",
  })).filter((r) => String(r.alertNo).trim() !== "");

  alertDraftRows = data;
  alertDraftSource = "csv";
  if (els.alertsFilter) els.alertsFilter.value = "";
  rerenderAlerts();
});

els.uploadAlertsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!alertDraftRows.length) return;

    const mode = (els.alertsUploadMode?.value || "append");

    if (mode === "replace") {
      if (!confirm(
        `REPLACE will ERASE all device alerts, then upload ${alertDraftRows.length} draft rows.\n\nProceed?`
      )) return;

      els.alertsMeta.textContent = "Erasing device alerts…";
      await eraseAlerts(session);
    } else {
      if (!confirm(
        `APPEND will add ${alertDraftRows.length} alert strings to the end of the device alerts list.\n\nProceed?`
      )) return;
    }

    els.uploadAlertsBtn.disabled = true;

    await uploadAlerts(session, alertDraftRows, {
      onProgress: ({ i, total }) => {
        els.alertsMeta.textContent = `Uploading alerts (${mode})… ${i}/${total}`;
      }
    });

    els.alertsMeta.textContent = `Upload complete (${mode}). Tip: Sync Device to confirm.`;
  } catch (e) {
    alert(`Failed to upload alerts: ${e?.message || e}`);
  } finally {
    rerenderAlerts();
  }
});

els.addAlertRowBtn.addEventListener("click", () => {
  alertDraftRows.push({ alertNo: "", alertText: "" });
  if (alertDraftSource === "none") alertDraftSource = "device";
  rerenderAlerts();
  editor.openEditor("alerts", alertDraftRows.length - 1);
});

els.alertsFilter?.addEventListener("input", () => rerenderAlerts());


// -----------------------
// Settings
// -----------------------
els.syncSettingsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    els.syncSettingsBtn.disabled = true;

    settingsDeviceRows = await fetchSettings(session, SETTINGS_DEFAULT_DEFS);
    settingsInfo = await fetchDeviceInfo(session);

    rerenderSettings();
  } catch (e) {
    alert(`Failed to sync settings: ${e?.message || e}`);
  } finally {
    els.syncSettingsBtn.disabled = !(transport?.isConnected);
    rerenderSettings();
  }
});

els.useSettingsAsDraftBtn.addEventListener("click", () => {
  settingsDraftRows = settingsDeviceRows.map((r) => ({ ...r }));
  settingsDraftSource = "device";
  if (els.settingsFilter) els.settingsFilter.value = "";
  rerenderSettings();
});

els.downloadSettingsBtn.addEventListener("click", () => {
  downloadText("settings_draft.json", JSON.stringify(settingsDraftRows, null, 2));
});

els.settingsFile.addEventListener("change", async () => {
  const f = els.settingsFile.files?.[0];
  if (!f) return;
  const text = await f.text();

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    alert("Invalid JSON file.");
    return;
  }

  const arr = Array.isArray(obj) ? obj : (obj?.rows || []);
  const data = (arr || []).map((r) => ({
    key: r.key ?? "",
    label: r.label ?? "",
    value: r.value ?? "",
    gId: r.gId,
    pId: r.pId,
  })).filter((r) => String(r.key).trim() !== "");

  settingsDraftRows = data;
  settingsDraftSource = "json";
  if (els.settingsFilter) els.settingsFilter.value = "";
  rerenderSettings();
});

els.uploadSettingsBtn.addEventListener("click", async () => {
  try {
    if (!transport?.isConnected || !session) return;
    if (!settingsDraftRows.length) return;

    if (!confirm(
      `Upload ${settingsDraftRows.length} setting value(s) to the wand?\n\n` +
      `This uses XSPARV for mapped rows, and XSTAGFORMAT for tag format.`
    )) return;

    els.uploadSettingsBtn.disabled = true;

    await applySettings(session, settingsDraftRows, {
      onProgress: ({ i, total, row }) => {
        els.settingsMeta.textContent = `Uploading… ${i}/${total} (${row.key || "?"})`;
      }
    });

    els.settingsMeta.textContent = "Upload complete. Tip: Sync Device to confirm.";
  } catch (e) {
    alert(`Failed to upload settings: ${e?.message || e}`);
  } finally {
    rerenderSettings();
  }
});

els.addSettingRowBtn.addEventListener("click", () => {
  settingsDraftRows.push({ key: "", label: "", value: "" });
  if (settingsDraftSource === "none") settingsDraftSource = "device";
  rerenderSettings();
  editor.openEditor("settings", settingsDraftRows.length - 1);
});

els.settingsFilter?.addEventListener("input", () => rerenderSettings());


// -----------------------
// Downloads for Tasks/Groups
// -----------------------
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


// -----------------------
// Init
// -----------------------
setStatus(els, "Disconnected", false);
setBusy(els, "idle");

tabs.setActiveTab("groups");

rerenderTasks();
rerenderGroups();
rerenderTaglist();
rerenderAlerts();
rerenderSettings();

taskFilterEl?.addEventListener("input", () => rerenderTasks());
groupFilterEl?.addEventListener("input", () => rerenderGroups());
