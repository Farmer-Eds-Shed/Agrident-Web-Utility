// app.js (refactored)

// Existing helpers
import { toCSV, downloadText } from "./parsers/csv.js";

// New modules (moved out of app.js)
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
import { createWandSession } from "./wand/session.js";

// BLE UUIDs (Agrident uses Battery Service notify stream)
const UUID_BATT_SVC = "battery_service";
const UUID_BATT_CHR = "battery_level"; // 0x2A19

// Serial defaults
const SERIAL_BAUD = 9600;

// Defaults
const APPEND_CR = false;
const APPEND_LF = false;

// ------------------------------------------------------------
// UI + State
// ------------------------------------------------------------
const els = getEls();

const enc = new TextEncoder();
const dec = new TextDecoder();
function u8FromDV(dv) {
  return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
}

// App state
let groups = [];
let selectedGroup = null;
let groupHeaders = [];
let groupRows = [];

let tasks = [];
let selectedTask = null;
let taskHeaders = [];
let taskRows = [];

// Groups defaults
let preferGroupX = true;

const GROUP_HEADERS_BASE = ["Date", "Time", "Type", "EID", "VID", "Alert"];
const GROUP_HEADERS_X = [...GROUP_HEADERS_BASE, "Weight"];

// ------------------------------------------------------------
// Transport abstraction (kept from legacy app.js for safety)
// ------------------------------------------------------------
const transport = {
  kind: null,
  isConnected: false,
  ble: { device: null, char: null, onNotify: null },
  serial: { port: null, reader: null, keepReading: false },

  async connect(kind) {
    if (this.isConnected) throw new Error("Already connected");
    this.kind = kind;

    if (kind === "ble") return await this._connectBLE();
    if (kind === "serial") return await this._connectSerial();
    throw new Error("Unknown transport");
  },

  async disconnect() {
    if (this.kind === "ble") await this._disconnectBLE();
    if (this.kind === "serial") await this._disconnectSerial();
    this.kind = null;
    this.isConnected = false;
  },

  async write(str) {
    if (!this.isConnected) throw new Error("Not connected");
    if (this.kind === "ble") return await this._writeBLE(str);
    if (this.kind === "serial") return await this._writeSerial(str);
    throw new Error("Unknown transport");
  },

  async _connectBLE() {
    if (!("bluetooth" in navigator)) {
      throw new Error("Web Bluetooth not supported in this browser");
    }

    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID_BATT_SVC] }],
      optionalServices: [UUID_BATT_SVC, "generic_access", "device_information"],
    });

    this.ble.device = dev;
    els.deviceNameEl.textContent = dev.name
      ? `Selected: ${dev.name}`
      : `Selected: (BLE device)`;

    dev.addEventListener("gattserverdisconnected", () => cleanup());

    const server = await dev.gatt.connect();
    const svc = await server.getPrimaryService(UUID_BATT_SVC);
    const chr = await svc.getCharacteristic(UUID_BATT_CHR);
    this.ble.char = chr;

    await chr.startNotifications();
    const onNotify = (ev) => {
      const u8 = u8FromDV(ev.target.value);
      const chunk = dec.decode(u8);
      session.onTextChunk(chunk);
    };
    chr.addEventListener("characteristicvaluechanged", onNotify);
    this.ble.onNotify = onNotify;

    this.isConnected = true;
  },

  async _disconnectBLE() {
    try {
      if (this.ble.char && this.ble.onNotify) {
        this.ble.char.removeEventListener(
          "characteristicvaluechanged",
          this.ble.onNotify
        );
      }
    } catch {}
    try {
      await this.ble.char?.stopNotifications?.().catch(() => {});
    } catch {}
    try {
      if (this.ble.device?.gatt?.connected) this.ble.device.gatt.disconnect();
    } catch {}

    this.ble.device = null;
    this.ble.char = null;
    this.ble.onNotify = null;
  },

  async _writeBLE(str) {
    if (!this.ble.char) throw new Error("BLE characteristic missing");
    await this.ble.char.writeValue(enc.encode(str));
    // small pacing: helps BLE reliability
    await new Promise((r) => setTimeout(r, 35));
  },

  async _connectSerial() {
    if (!("serial" in navigator)) {
      throw new Error("Web Serial not supported (use Chrome/Edge on desktop)");
    }

    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: SERIAL_BAUD });

    this.serial.port = port;
    this.serial.keepReading = true;

    const info = port.getInfo ? port.getInfo() : null;
    if (info && (info.usbVendorId || info.usbProductId)) {
      els.deviceNameEl.textContent = `Serial: USB VID ${
        info.usbVendorId || "?"
      } PID ${info.usbProductId || "?"} @ ${SERIAL_BAUD}`;
    } else {
      els.deviceNameEl.textContent = `Serial: Connected @ ${SERIAL_BAUD}`;
    }

    this.serial.reader = port.readable.getReader();
    this.isConnected = true;

    (async () => {
      try {
        while (this.serial.keepReading) {
          const { value, done } = await this.serial.reader.read();
          if (done) break;
          if (value) {
            const chunk = dec.decode(value);
            session.onTextChunk(chunk);
          }
        }
      } catch (e) {
        cleanup();
      }
    })();
  },

  async _disconnectSerial() {
    this.serial.keepReading = false;

    try {
      await this.serial.reader?.cancel?.();
    } catch {}
    try {
      this.serial.reader?.releaseLock?.();
    } catch {}
    this.serial.reader = null;

    try {
      await this.serial.port?.close?.();
    } catch {}
    this.serial.port = null;
  },

  async _writeSerial(str) {
    const port = this.serial.port;
    if (!port?.writable) throw new Error("Serial port not writable");

    const writer = port.writable.getWriter();
    try {
      await writer.write(enc.encode(str));
    } finally {
      writer.releaseLock();
    }
    await new Promise((r) => setTimeout(r, 20));
  },
};

// ------------------------------------------------------------
// Session (moved RX buffer + command lifecycle out of app.js)
// ------------------------------------------------------------
const session = createWandSession({
  transport,
  setBusy: (t) => setBusy(els, t),
  onCommandUIStateChange: (busy) => {
    // During a command, lock controls that mutate data or connection
    els.connectBtn.disabled = true;
    els.disconnectBtn.disabled = false;
    els.connType.disabled = true;

    // Tasks
    if (els.taskSelect) els.taskSelect.disabled = busy || !(transport.isConnected && tasks.length);
    if (els.syncTasksBtn) els.syncTasksBtn.disabled = busy || !(transport.isConnected);
    if (els.downloadCsvBtn) els.downloadCsvBtn.disabled = busy || !(transport.isConnected && taskRows.length);

    // Groups
    if (els.groupSelect) els.groupSelect.disabled = busy || !(transport.isConnected && groups.length);
    if (els.syncGroupsBtn) els.syncGroupsBtn.disabled = busy || !(transport.isConnected);
    if (els.downloadGroupCsvBtn) els.downloadGroupCsvBtn.disabled = busy || !(transport.isConnected && groupRows.length);
  },
  timeoutMs: 12000,
  appendCR: APPEND_CR,
  appendLF: APPEND_LF,
  enc,
});

const { isBracketFrame, isCmdFrame, parsePipeFrame } = session.helpers;

// ------------------------------------------------------------
// Tabs
// ------------------------------------------------------------
const tabs = createTabs(els, "groups");
els.tabTasksBtn?.addEventListener("click", () => tabs.setActiveTab("tasks"));
els.tabGroupsBtn?.addEventListener("click", () => tabs.setActiveTab("groups"));

// ------------------------------------------------------------
// Headers + Renderers
// ------------------------------------------------------------
function getHeadersForPreview() {
  return taskHeaders.length
    ? taskHeaders
    : taskRows.length
    ? Array.from(
        { length: Math.max(...taskRows.map((r) => r.length)) },
        (_, i) => `Field${i + 1}`
      )
    : [];
}

function getHeadersForGroupPreview() {
  return groupHeaders.length
    ? groupHeaders
    : groupRows.length
    ? Array.from(
        { length: Math.max(...groupRows.map((r) => r.length)) },
        (_, i) => `Field${i + 1}`
      )
    : [];
}

function renderTasksDropdown() {
  els.taskSelect.innerHTML = "";
  if (!tasks.length) {
    els.taskSelect.appendChild(new Option("(no tasks found)", ""));
    els.taskSelect.disabled = true;
    if (els.syncTasksBtn) els.syncTasksBtn.disabled = true;
    return;
  }
  els.taskSelect.appendChild(new Option("(select a task…)", "", true, false));
  for (const t of tasks) {
    els.taskSelect.appendChild(
      new Option(`${t.idx}: ${t.name} (${t.count})`, String(t.idx))
    );
  }
  els.taskSelect.disabled = false;
}

function renderGroupsDropdown() {
  els.groupSelect.innerHTML = "";
  if (!groups.length) {
    els.groupSelect.appendChild(new Option("(no groups found)", ""));
    els.groupSelect.disabled = true;
    return;
  }
  els.groupSelect.appendChild(new Option("(select a group…)", "", true, false));
  for (const g of groups) {
    els.groupSelect.appendChild(
      new Option(`${g.id}: ${g.name}`, String(g.id))
    );
  }
  els.groupSelect.disabled = false;
}

function renderPreview() {
  els.previewHead.innerHTML = "";
  els.previewBody.innerHTML = "";

  const headers = getHeadersForPreview();
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    els.previewHead.appendChild(th);
  }

  const thActions = document.createElement("th");
  thActions.textContent = "Actions";
  els.previewHead.appendChild(thActions);

  const rowsToShow = taskRows.slice(0, 200);
  for (let visIndex = 0; visIndex < rowsToShow.length; visIndex++) {
    const realIndex = visIndex; // NOTE: safe only while slice starts at 0
    const r = rowsToShow[visIndex];

    const tr = document.createElement("tr");
    for (let i = 0; i < headers.length; i++) {
      const td = document.createElement("td");
      td.textContent = r[i] ?? "";
      if (headers[i]?.toLowerCase?.().includes("eid")) td.classList.add("mono");
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
    editBtn.addEventListener("click", () => editor.openEditor("tasks", realIndex));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btnSmall btnDanger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete row #${realIndex + 1}?`)) return;
      taskRows.splice(realIndex, 1);
      renderPreview();
    });

    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    els.previewBody.appendChild(tr);
  }

  if (!selectedTask) {
    els.previewMeta.textContent = "No task selected.";
  } else {
    els.previewMeta.textContent = `Task ${selectedTask.idx}: ${selectedTask.name} — ${taskRows.length} record(s), ${headers.length} column(s).`;
  }

  els.downloadCsvBtn.disabled = !(transport.isConnected && taskRows.length);
}

function renderGroupsPreview() {
  els.groupPreviewHead.innerHTML = "";
  els.groupPreviewBody.innerHTML = "";

  const headers = getHeadersForGroupPreview();
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    els.groupPreviewHead.appendChild(th);
  }

  const thActions = document.createElement("th");
  thActions.textContent = "Actions";
  els.groupPreviewHead.appendChild(thActions);

  const rowsToShow = groupRows.slice(0, 200);
  for (let visIndex = 0; visIndex < rowsToShow.length; visIndex++) {
    const realIndex = visIndex; // NOTE: safe only while slice starts at 0
    const r = rowsToShow[visIndex];

    const tr = document.createElement("tr");
    for (let i = 0; i < headers.length; i++) {
      const td = document.createElement("td");
      td.textContent = r[i] ?? "";
      const h = headers[i]?.toLowerCase?.() || "";
      if (h.includes("transponder") || h.includes("eid")) td.classList.add("mono");
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
    editBtn.addEventListener("click", () => editor.openEditor("groups", realIndex));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btnSmall btnDanger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete row #${realIndex + 1}?`)) return;
      groupRows.splice(realIndex, 1);
      renderGroupsPreview();
    });

    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    els.groupPreviewBody.appendChild(tr);
  }

  if (!selectedGroup) {
    els.groupPreviewMeta.textContent = "No group selected.";
  } else {
    els.groupPreviewMeta.textContent = `Group ${selectedGroup.id}: ${selectedGroup.name} — ${groupRows.length} record(s), ${headers.length} column(s).`;
  }

  els.downloadGroupCsvBtn.disabled = !(transport.isConnected && groupRows.length);
}

// ------------------------------------------------------------
// Modal Editor (callback-driven; no app state inside module)
// ------------------------------------------------------------
const editor = createModalEditor(els, {
  getRow: (mode, idx) => (mode === "groups" ? groupRows[idx] : taskRows[idx]),
  setRow: (mode, idx, updated) => {
    const headers = mode === "groups" ? getHeadersForGroupPreview() : getHeadersForPreview();
    const formatted = formatRow(updated, headers);
    if (mode === "groups") groupRows[idx] = formatted;
    else taskRows[idx] = formatted;
  },
  deleteRow: (mode, idx) => {
    if (mode === "groups") groupRows.splice(idx, 1);
    else taskRows.splice(idx, 1);
  },
  getHeaders: (mode) => (mode === "groups" ? getHeadersForGroupPreview() : getHeadersForPreview()),
  getSubtitle: (mode, realIndex) => {
    if (mode === "groups") {
      const g = selectedGroup;
      return g ? `Group ${g.id}: ${g.name} — Row ${realIndex + 1}` : `Group row ${realIndex + 1}`;
    }
    return selectedTask
      ? `Task ${selectedTask.idx}: ${selectedTask.name} — Row ${realIndex + 1}`
      : `Row ${realIndex + 1}`;
  },
  onAfterChange: (mode) => (mode === "groups" ? renderGroupsPreview() : renderPreview()),
});

// ------------------------------------------------------------
// Agrident commands: Tasks
// ------------------------------------------------------------
async function runXGTASK() {
  const done = await session.send("XGTASK", { name: "Sync tasks", okToken: "XGTASKOK" });

  const rows = done.frames
    .filter(isBracketFrame)
    .filter((fr) => fr !== "[XGTASK]" && fr !== "[XGTASKOK]")
    .filter((fr) => fr.includes("|"));

  tasks = rows
    .map(parsePipeFrame)
    .filter((a) => a.length >= 2 && a[0] !== "")
    .map((a) => ({
      idx: a[0] ?? "",
      name: a[1] ?? "",
      prefix: a[2] ?? "",
      suffix: a[3] ?? "",
      count: a[4] ?? "",
    }));

  renderTasksDropdown();
  els.syncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;
}

async function runXSH(idx) {
  const done = await session.send(`XSH|${idx}`, { name: "Get headers", okToken: "XSHOK" });

  const headerFrame = done.frames.find(
    (fr) =>
      isBracketFrame(fr) &&
      !isCmdFrame(fr, "XSH") &&
      fr !== "[XSHOK]" &&
      fr.includes("|")
  );

  taskHeaders = headerFrame ? parsePipeFrame(headerFrame) : [];
}

async function runCSW(idx) {
  const done = await session.send(`CSW|${idx}`, { name: "Get data", okToken: "CSWOK" });

  const dataFrames = done.frames
    .filter(isBracketFrame)
    .filter((fr) => !isCmdFrame(fr, "CSW"))
    .filter((fr) => fr !== "[CSWOK]");

  const datasetFrames = dataFrames.filter((fr) => fr.includes("|"));
  const rawRows = datasetFrames.map(parsePipeFrame);

  const headers = taskHeaders.length
    ? taskHeaders
    : Array.from({ length: Math.max(0, ...rawRows.map((r) => r.length)) }, (_, i) => `Field${i + 1}`);

  taskRows = rawRows.map((r) => formatRow(r, headers));
}

async function loadSelectedTask(idx) {
  selectedTask = tasks.find((t) => String(t.idx) === String(idx)) || { idx, name: "(unknown)" };
  taskHeaders = [];
  taskRows = [];
  renderPreview();

  await runXSH(idx);
  await runCSW(idx);
  renderPreview();
}

// ------------------------------------------------------------
// Agrident commands: Groups
// ------------------------------------------------------------
async function runXGGROUPS() {
  const done = await session.send("XGGROUPS", { name: "Sync groups", okToken: "XGGROUPSOK" });

  const rows = done.frames
    .filter(isBracketFrame)
    .filter((fr) => fr !== "[XGGROUPS]" && fr !== "[XGGROUPSOK]")
    .filter((fr) => fr.includes("|"));

  // [pos|groupId|label|type]
  groups = rows
    .map(parsePipeFrame)
    .filter((a) => a.length >= 3 && (a[1] ?? "") !== "")
    .map((a) => ({
      pos: a[0] ?? "",
      id: a[1] ?? "",
      name: a[2] ?? "",
      type: a[3] ?? "",
    }));

  renderGroupsDropdown();
  if (els.groupsSyncedAtEl) els.groupsSyncedAtEl.textContent = `Synced: ${new Date().toLocaleString()}`;
}

async function runXGGROUP(id) {
  const done = await session.send(`XGGROUP|${id}`, { name: "Get group data", okToken: "XGGROUPOK" });

  const dataFrames = done.frames
    .filter(isBracketFrame)
    .filter((fr) => !isCmdFrame(fr, "XGGROUP"))
    .filter((fr) => fr !== "[XGGROUPOK]");

  const datasetFrames = dataFrames.filter((fr) => fr.includes("|"));
  const rawRows = datasetFrames.map(parsePipeFrame);

  groupHeaders = GROUP_HEADERS_BASE;

  groupRows = rawRows.map((r) => {
    const date = r[1] ?? "";
    const timeRaw = r[2] ?? "";
    const time =
      timeRaw.length === 6
        ? `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}:${timeRaw.slice(4, 6)}`
        : timeRaw;
    const type = r[5] ?? "";
    const eid = r[6] ?? "";
    const vid = r[7] ?? "";
    const alert = r[8] ?? "";
    return [date, time, type, eid, vid, alert];
  });
}

async function runXGGROUPX(id) {
  const done = await session.send(`XGGROUPX|${id}`, { name: "Get group data (with weight)", okToken: "XGGROUPXOK" });

  const dataFrames = done.frames
    .filter(isBracketFrame)
    .filter((fr) => !isCmdFrame(fr, "XGGROUPX"))
    .filter((fr) => fr !== "[XGGROUPXOK]");

  const datasetFrames = dataFrames.filter((fr) => fr.includes("|"));
  const rawRows = datasetFrames.map(parsePipeFrame);

  groupHeaders = GROUP_HEADERS_X;

  groupRows = rawRows.map((r) => {
    const date = r[1] ?? "";
    const timeRaw = r[2] ?? "";
    const time =
      timeRaw.length === 6
        ? `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}:${timeRaw.slice(4, 6)}`
        : timeRaw;
    const type = r[5] ?? "";
    const eid = r[6] ?? "";
    const vid = r[7] ?? "";
    const alert = r[8] ?? "";
    const weight = r[9] ?? "";
    return [date, time, type, eid, vid, alert, weight];
  });
}

async function loadSelectedGroup(id) {
  groupRows = [];
  groupHeaders = [];
  renderGroupsPreview();

  if (preferGroupX) {
    try {
      await runXGGROUPX(id);
      return;
    } catch (e) {
      console.warn("XGGROUPX failed, falling back to XGGROUP", e);
    }
  }
  await runXGGROUP(id);
}

// ------------------------------------------------------------
// Connect / Disconnect
// ------------------------------------------------------------
async function connect() {
  try {
    setStatus(els, "Connecting…", false);
    setBusy(els, "connecting");

    // reset tasks
    tasks = [];
    selectedTask = null;
    taskHeaders = [];
    taskRows = [];
    renderTasksDropdown();
    renderPreview();

    // reset groups
    groups = [];
    selectedGroup = null;
    groupHeaders = [];
    groupRows = [];
    renderGroupsDropdown();
    renderGroupsPreview();

    session.resetRx?.();

    els.connectBtn.disabled = true;
    els.disconnectBtn.disabled = false;
    els.connType.disabled = true;

    if (isMobileUI()) els.connType.value = "ble";
    const kind = els.connType.value;

    await transport.connect(kind);

    setStatus(els, "Connected", true);
    setBusy(els, "idle");

    // enable top-level actions
    if (els.syncTasksBtn) els.syncTasksBtn.disabled = false;
    if (els.syncGroupsBtn) els.syncGroupsBtn.disabled = false;

    // default tab
    tabs.setActiveTab("groups");
  } catch (e) {
    alert(`Connect failed: ${e?.message || e}`);
    await cleanup();
  }
}

async function cleanup() {
  editor.closeEditor(false);

  try {
    await transport.disconnect();
  } catch {}

  els.connectBtn.disabled = false;
  els.disconnectBtn.disabled = true;
  els.connType.disabled = false;

  els.taskSelect.disabled = true;
  if (els.syncTasksBtn) els.syncTasksBtn.disabled = true;
  els.downloadCsvBtn.disabled = true;

  els.groupSelect.disabled = true;
  if (els.syncGroupsBtn) els.syncGroupsBtn.disabled = true;
  els.downloadGroupCsvBtn.disabled = true;

  els.deviceNameEl.textContent = "";
  els.syncedAtEl.textContent = "";
  if (els.groupsSyncedAtEl) els.groupsSyncedAtEl.textContent = "";

  session.resetRx?.();

  tasks = [];
  selectedTask = null;
  taskHeaders = [];
  taskRows = [];
  renderTasksDropdown();
  renderPreview();

  groups = [];
  selectedGroup = null;
  groupHeaders = [];
  groupRows = [];
  renderGroupsDropdown();
  renderGroupsPreview();

  setStatus(els, "Disconnected", false);
  setBusy(els, "idle");
}

// ------------------------------------------------------------
// UI wiring
// ------------------------------------------------------------

// details open/close defaults
setConnDetailsDefault(els);
window.addEventListener("resize", () => setConnDetailsDefault(els));

// enforce BLE on mobile
enforceBLEOnMobile(els);
window.addEventListener("resize", () => enforceBLEOnMobile(els));

// conn hint
updateConnHint(els);
els.connType.addEventListener("change", () => {
  enforceBLEOnMobile(els);
  updateConnHint(els);
});

// connect/disconnect
els.connectBtn.addEventListener("click", connect);
els.disconnectBtn.addEventListener("click", cleanup);

// sync tasks
els.syncTasksBtn?.addEventListener("click", async () => {
  try {
    if (!transport.isConnected) return;
    if (els.syncTasksBtn) els.syncTasksBtn.disabled = true;
    await runXGTASK();
  } catch (e) {
    alert(`Failed to sync tasks: ${e?.message || e}`);
  } finally {
    if (els.syncTasksBtn) els.syncTasksBtn.disabled = !(transport.isConnected);
  }
});

// select task
els.taskSelect.addEventListener("change", async () => {
  try {
    const idx = els.taskSelect.value;
    if (!idx) return;
    await loadSelectedTask(idx);
  } catch (e) {
    alert(`Failed to load task: ${e?.message || e}`);
  }
});

// prefer groupX
els.preferGroupXEl?.addEventListener("change", () => {
  preferGroupX = !!els.preferGroupXEl.checked;
});

// sync groups
els.syncGroupsBtn?.addEventListener("click", async () => {
  try {
    if (!transport.isConnected) return;
    await runXGGROUPS();
  } catch (e) {
    alert(`Failed to sync groups: ${e?.message || e}`);
  }
});

// select group
els.groupSelect?.addEventListener("change", async () => {
  try {
    const id = els.groupSelect.value;
    if (!id) return;

    selectedGroup = groups.find((g) => String(g.id) === String(id)) || {
      id,
      name: "(unknown)",
    };

    groupRows = [];
    groupHeaders = [];
    renderGroupsPreview();

    await loadSelectedGroup(id);
    renderGroupsPreview();
  } catch (e) {
    alert(`Failed to load group: ${e?.message || e}`);
  }
});

// download group csv
els.downloadGroupCsvBtn?.addEventListener("click", () => {
  if (!selectedGroup) return;
  const safeName = String(selectedGroup.name || `group_${selectedGroup.id}`)
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 60);

  const headers = getHeadersForGroupPreview();
  const csv = toCSV(headers, groupRows);
  downloadText(`${safeName}.csv`, csv);
});

// download task csv
els.downloadCsvBtn.addEventListener("click", () => {
  if (!selectedTask) return;

  const safeName = String(selectedTask.name || `task_${selectedTask.idx}`)
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 60);

  const headers = getHeadersForPreview();
  const csv = toCSV(headers, taskRows);
  downloadText(`${safeName}.csv`, csv);
});

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
setStatus(els, "Disconnected", false);
tabs.setActiveTab("groups");
setBusy(els, "idle");

renderTasksDropdown();
renderPreview();
renderGroupsDropdown();
renderGroupsPreview();
