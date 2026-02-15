
import { createFrameExtractor, CommandQueue } from "./wand/protocol.js";
import { SerialTransport, BleTransport } from "./wand/transport.js";
import { toCSV, downloadText } from "./parsers/csv.js";
import { readTextFile, parseTskCommands } from "./configs/tsk.js";


// BLE UUIDs
  const UUID_BATT_SVC = "battery_service";
  const UUID_BATT_CHR = "battery_level"; // 0x2A19

  // Serial defaults (you said 9600 is default)
  const SERIAL_BAUD = 9600;

  // Defaults
  const APPEND_CR = false;
  const APPEND_LF = false;

  // UI
  const connType = document.getElementById("connType");
  const connHint = document.getElementById("connHint");

  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const statusEl = document.getElementById("status");
  const busyEl = document.getElementById("busy");
  const deviceNameEl = document.getElementById("deviceName");
  const syncedAtEl = document.getElementById("syncedAt");
  const connMore = document.getElementById("connMore");

  const taskSelect = document.getElementById("taskSelect");
  const syncTasksBtn = document.getElementById("syncTasksBtn");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");

  const previewMeta = document.getElementById("previewMeta");
  const previewHead = document.getElementById("previewHead");
  const previewBody = document.getElementById("previewBody");

  // Tabs + Groups UI
  const tabTasksBtn = document.getElementById("tabTasksBtn");
  const tabGroupsBtn = document.getElementById("tabGroupsBtn");
  const panelTasks = document.getElementById("panelTasks");
  const panelGroups = document.getElementById("panelGroups");
  const activeTabHint = document.getElementById("activeTabHint");

  const syncGroupsBtn = document.getElementById("syncGroupsBtn");
  const groupSelect = document.getElementById("groupSelect");
  const preferGroupXEl = document.getElementById("preferGroupX");
  const downloadGroupCsvBtn = document.getElementById("downloadGroupCsvBtn");

  const groupPreviewMeta = document.getElementById("groupPreviewMeta");
  const groupPreviewHead = document.getElementById("groupPreviewHead");
  const groupPreviewBody = document.getElementById("groupPreviewBody");
  const groupsSyncedAtEl = document.getElementById("groupsSyncedAt");

  // Modal elements
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalSubtitle = document.getElementById("modalSubtitle");
  const modalGrid = document.getElementById("modalGrid");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalDeleteBtn = document.getElementById("modalDeleteBtn");
  const modalSaveBtn = document.getElementById("modalSaveBtn");

  // Open details by default on desktop, collapsed on mobile
  function setConnDetailsDefault() {
    if (!connMore) return;
    if (window.matchMedia("(min-width: 641px)").matches) connMore.open = true;
    else connMore.open = false;
  }
  setConnDetailsDefault();
  window.addEventListener("resize", () => setConnDetailsDefault());

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.classList.toggle("ok", !!ok);
    statusEl.classList.toggle("bad", !ok);
  }
  function setBusy(text) { busyEl.textContent = text; }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  function u8FromDV(dv) { return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength); }

  // Stream buffer for bracket frames
  let rxText = "";
  const MAX_TEXT = 60000;

  // Command control
  let currentCommand = null;
  let cmdTimer = null;

  // Shared write queue
  const writeQueue = [];
  let writing = false;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

  const GROUP_HEADERS_BASE = [
  "Date",
  "Time",
  "Type",
  "EID",
  "VID",
  "Alert"
];
  const GROUP_HEADERS_X = [...GROUP_HEADERS_BASE, "Weight"];

  // Modal state
  let editingMode = "tasks"; // "tasks" | "groups"

  let editingRealIndex = null;
  let editingHeaders = [];
  let editingInputs = [];
  let lastFocusEl = null;

  function isMobileUI() {
    return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 640px)").matches;
  }

  function enforceBLEOnMobile() {
    const mobile = isMobileUI();
    const row = document.getElementById("connTypeRow");

    if (mobile) {
      connType.value = "ble";
      connType.disabled = true;
      if (row) row.style.display = "none";
      if (connHint) connHint.textContent = "Bluetooth (BLE)";
    } else {
      connType.disabled = false;
      if (row) row.style.display = "";
      updateConnHint();
    }
  }
  enforceBLEOnMobile();
  window.addEventListener("resize", enforceBLEOnMobile);


  // ---- Tabs: Tasks / Groups ----
  let activeTab = "groups"; // "tasks" | "groups"
  function setActiveTab(tab) {
    activeTab = tab === "groups" ? "groups" : "tasks";
    if (panelTasks) panelTasks.style.display = (activeTab === "tasks") ? "" : "none";
    if (panelGroups) panelGroups.style.display = (activeTab === "groups") ? "" : "none";

    // button styling
    tabTasksBtn?.classList.toggle("btnPrimary", activeTab === "tasks");
    tabGroupsBtn?.classList.toggle("btnPrimary", activeTab === "groups");

    if (activeTabHint) activeTabHint.textContent = (activeTab === "tasks") ? "Tasks" : "Groups";
  }

  // ---- Modal editor ----
  function openEditor(mode, realIndex) {
    const row = (mode === "groups" ? groupRows[realIndex] : taskRows[realIndex]);
    if (!row) return;

    lastFocusEl = document.activeElement;
    editingMode = (mode === "groups") ? "groups" : "tasks";
    editingRealIndex = realIndex;
    editingHeaders = (editingMode === "groups") ? getHeadersForGroupPreview() : getHeadersForPreview();
    editingInputs = [];

    modalTitle.textContent = "Edit Row";
    if (mode === "groups") {
      const g = selectedGroup;
      modalSubtitle.textContent = g
        ? `Group ${g.id}: ${g.name} — Row ${realIndex + 1}`
        : `Group row ${realIndex + 1}`;
    } else {
      modalSubtitle.textContent = selectedTask
        ? `Task ${selectedTask.idx}: ${selectedTask.name} — Row ${realIndex + 1}`
        : `Row ${realIndex + 1}`;
    }

    modalGrid.innerHTML = "";

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

      modalGrid.appendChild(wrap);
      editingInputs.push(inp);
    }

    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      const first = editingInputs.find(el => el && typeof el.focus === "function");
      if (first) first.focus();
      else modalCloseBtn?.focus?.();
    }, 0);
  }

  function closeEditor(keepFocus = true) {
    // Move focus out of modal BEFORE hiding (fixes aria-hidden warning)
    const target = (keepFocus && lastFocusEl && typeof lastFocusEl.focus === "function")
      ? lastFocusEl
      : connectBtn;

    try { target?.focus?.(); } catch {}

    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");

    editingRealIndex = null;
    editingHeaders = [];
    editingInputs = [];
    modalGrid.innerHTML = "";
    lastFocusEl = null;
  }

  function saveEditor() {
    if (editingRealIndex === null) return;
    const idx = editingRealIndex;

    const updated = editingHeaders.map((h, i) => editingInputs[i]?.value ?? "");
    if (editingMode === "groups") groupRows[idx] = formatRow(updated, editingHeaders);
    else taskRows[idx] = formatRow(updated, editingHeaders);

    closeEditor(true);
    (editingMode === "groups") ? renderGroupsPreview() : renderPreview();
  }

  function deleteEditorRow() {
    if (editingRealIndex === null) return;
    const idx = editingRealIndex;
    if (!confirm(`Delete row #${idx + 1}?`)) return;

    if (editingMode === "groups") groupRows.splice(idx, 1);
    else taskRows.splice(idx, 1);
    closeEditor(true);
    (editingMode === "groups") ? renderGroupsPreview() : renderPreview();
  }

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeEditor(true);
  });

  modalCloseBtn.addEventListener("click", () => closeEditor(true));
  modalCancelBtn.addEventListener("click", () => closeEditor(true));
  modalSaveBtn.addEventListener("click", saveEditor);
  modalDeleteBtn.addEventListener("click", deleteEditorRow);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && overlay.classList.contains("show")) {
      ev.preventDefault();
      closeEditor(true);
    }
  });

  // ---- Transport abstraction ----
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
      deviceNameEl.textContent = dev.name ? `Selected: ${dev.name}` : `Selected: (BLE device)`;
      dev.addEventListener("gattserverdisconnected", () => cleanup());

      const server = await dev.gatt.connect();
      const svc = await server.getPrimaryService(UUID_BATT_SVC);
      const chr = await svc.getCharacteristic(UUID_BATT_CHR);
      this.ble.char = chr;

      await chr.startNotifications();
      const onNotify = (ev) => {
        const u8 = u8FromDV(ev.target.value);
        const chunk = dec.decode(u8);
        onTextChunk(chunk);
      };
      chr.addEventListener("characteristicvaluechanged", onNotify);
      this.ble.onNotify = onNotify;

      this.isConnected = true;
    },

    async _disconnectBLE() {
      try {
        if (this.ble.char && this.ble.onNotify) {
          this.ble.char.removeEventListener("characteristicvaluechanged", this.ble.onNotify);
        }
      } catch {}
      try { await this.ble.char?.stopNotifications?.().catch(()=>{}); } catch {}
      try { if (this.ble.device?.gatt?.connected) this.ble.device.gatt.disconnect(); } catch {}

      this.ble.device = null;
      this.ble.char = null;
      this.ble.onNotify = null;
    },

    async _writeBLE(str) {
      if (!this.ble.char) throw new Error("BLE characteristic missing");
      await this.ble.char.writeValue(enc.encode(str));
      await sleep(35);
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
        deviceNameEl.textContent = `Serial: USB VID ${info.usbVendorId || "?"} PID ${info.usbProductId || "?"} @ ${SERIAL_BAUD}`;
      } else {
        deviceNameEl.textContent = `Serial: Connected @ ${SERIAL_BAUD}`;
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
              onTextChunk(chunk);
            }
          }
        } catch (e) {
          cleanup();
        }
      })();
    },

    async _disconnectSerial() {
      this.serial.keepReading = false;

      try { await this.serial.reader?.cancel?.(); } catch {}
      try { this.serial.reader?.releaseLock?.(); } catch {}
      this.serial.reader = null;

      try { await this.serial.port?.close?.(); } catch {}
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
      await sleep(20);
    }
  };

  function onTextChunk(chunk) {
    rxText += chunk;
    if (rxText.length > MAX_TEXT) rxText = rxText.slice(-MAX_TEXT);
    consumeFrames();
  }

  // ---- Frame extraction ----
  const isBracketFrame = (s) => s.startsWith("[") && s.endsWith("]");
  const isCmdFrame = (s, cmd) => s.startsWith("[" + cmd);
  const isOkFrame = (s, okToken) => s.includes(okToken);
  const parsePipeFrame = (frameStr) => frameStr.slice(1, -1).split("|");

  function consumeFrames() {
    while (true) {
      const open = rxText.indexOf("[");
      if (open === -1) {
        if (rxText.length > 1024) rxText = rxText.slice(-256);
        return;
      }
      const close = rxText.indexOf("]", open);
      if (close === -1) return;

      const raw = rxText.slice(open, close + 1);
      rxText = rxText.slice(close + 1);

      const cleaned = raw.replace(/\r/g,"").replace(/\n/g,"");
      onFrame(cleaned);
    }
  }

  // ---- Command plumbing ----
  function beginCommand(name, okToken) {
    if (currentCommand) throw new Error(`Busy running ${currentCommand.name}`);

    let resolve, reject;
    const p = new Promise((res, rej) => { resolve = res; reject = rej; });

    currentCommand = { name, okToken, frames: [], resolve, reject };
    setBusy(name);

    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    connType.disabled = true;
    taskSelect.disabled = true;
    if (syncTasksBtn) syncTasksBtn.disabled = true;
groupSelect.disabled = true;
    syncGroupsBtn.disabled = true;
    downloadCsvBtn.disabled = true;
    downloadGroupCsvBtn.disabled = true;

    if (cmdTimer) clearTimeout(cmdTimer);
    cmdTimer = setTimeout(() => {
      const done = currentCommand;
      currentCommand = null;
  setBusy("idle");
      if (done) done.reject(new Error("Timeout"));
      taskSelect.disabled = !(transport.isConnected && tasks.length);
    if (syncTasksBtn) syncTasksBtn.disabled = !(transport.isConnected);
groupSelect.disabled = !(transport.isConnected && groups.length);
      syncGroupsBtn.disabled = !(transport.isConnected);
      downloadCsvBtn.disabled = !(transport.isConnected && taskRows.length);
      downloadGroupCsvBtn.disabled = !(transport.isConnected && groupRows.length);
    }, 12000);

    return p;
  }

  function finishCommand(ok, err) {
    if (!currentCommand) return;
    if (cmdTimer) clearTimeout(cmdTimer);
    cmdTimer = null;

    const done = currentCommand;
    currentCommand = null;
  setBusy("idle");
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    connType.disabled = true;
    taskSelect.disabled = !(transport.isConnected && tasks.length);
    if (syncTasksBtn) syncTasksBtn.disabled = !(transport.isConnected);
groupSelect.disabled = !(transport.isConnected && groups.length);
    syncGroupsBtn.disabled = !(transport.isConnected);
    downloadCsvBtn.disabled = !(transport.isConnected && taskRows.length);
    downloadGroupCsvBtn.disabled = !(transport.isConnected && groupRows.length);

    if (ok) done.resolve(done);
    else done.reject(err || new Error("Command failed"));
  }

  function onFrame(f) {
    if (!currentCommand) return;
    currentCommand.frames.push(f);
    if (isOkFrame(f, currentCommand.okToken)) finishCommand(true);
  }

  async function enqueueWrite(str) {
    writeQueue.push(str);
    pumpWrites();
  }

  async function pumpWrites() {
    if (writing) return;
    writing = true;
    try {
      while (writeQueue.length) {
        const s = writeQueue.shift();
        await transport.write(s);
      }
    } catch (e) {
      if (currentCommand) finishCommand(false, e);
      throw e;
    } finally {
      writing = false;
    }
  }

  async function send(cmd, structured = null) {
    if (!transport.isConnected) throw new Error("Not connected");

    let out = String(cmd).trim();
    if (!out) return null;

    if (!out.startsWith("[")) out = "[" + out;
    if (!out.endsWith("]")) out += "]";

    if (APPEND_CR) out += "\r";
    if (APPEND_LF) out += "\n";

    let p = null;
    if (structured) p = beginCommand(structured.name, structured.okToken);

    await enqueueWrite(out);
    if (p) return await p;
    return null;
  }

  // ---- Formatting helpers ----
  function pad2(n) { return String(n).padStart(2, "0"); }

  function isValidDMY(dd, mm, yyyy) {
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    if (!(y >= 1900 && y <= 2100)) return false;
    if (!(m >= 1 && m <= 12)) return false;
    if (!(d >= 1 && d <= 31)) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d;
  }

  function formatDateMaybe(v) {
    const s = String(v ?? "").trim();
    if (!s) return s;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

    let m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) {
      const dd = m[1], mm = m[2], yyyy = m[3];
      if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
      return s;
    }

    m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (m) {
      const dd = m[1], mm = m[2], yy = m[3];
      const yyyy = String(2000 + Number(yy));
      if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
      return s;
    }

    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
    if (m) {
      const dd = pad2(m[1]), mm = pad2(m[2]);
      let yyyy = m[3];
      if (yyyy.length === 2) yyyy = String(2000 + Number(yyyy));
      if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
      return s;
    }

    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (m) {
      const dd = pad2(m[1]), mm = pad2(m[2]);
      const yyyy = String(2000 + Number(m[3]));
      if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
      return s;
    }

    m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (m) {
      const yyyy = m[1], mm = pad2(m[2]), dd = pad2(m[3]);
      if (isValidDMY(dd, mm, yyyy)) return `${dd}/${mm}/${yyyy}`;
      return s;
    }

    if (/^\d{10}$/.test(s) || /^\d{13}$/.test(s)) {
      const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
      }
    }

    return s;
  }

  function trimLeadingZerosNumberMaybe(v) {
    const s = String(v ?? "").trim();
    if (!s) return s;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s;

    const neg = s.startsWith("-");
    const core = neg ? s.slice(1) : s;

    if (core.includes(".")) {
      const [ip, fp] = core.split(".");
      const ip2 = ip.replace(/^0+(?=\d)/, "");
      return (neg ? "-" : "") + (ip2 === "" ? "0" : ip2) + "." + fp;
    } else {
      const core2 = core.replace(/^0+(?=\d)/, "");
      return (neg ? "-" : "") + (core2 === "" ? "0" : core2);
    }
  }

  function formatRow(row, headers) {
    return row.map((v, i) => {
      const raw = String(v ?? "").trim();
      const h = String(headers?.[i] ?? "").toLowerCase();
      if (h.includes("date")) return formatDateMaybe(raw);
      if (h.includes("weight") || h.includes("kg") || h === "wgt") return trimLeadingZerosNumberMaybe(raw);
      return raw;
    });
  }

  function getHeadersForPreview() {
    return taskHeaders.length
      ? taskHeaders
      : (taskRows.length ? Array.from({length: Math.max(...taskRows.map(r => r.length))}, (_,i)=>`Field${i+1}`) : []);
  }


  function getHeadersForGroupPreview() {
    return groupHeaders.length
      ? groupHeaders
      : (groupRows.length ? Array.from({length: Math.max(...groupRows.map(r => r.length))}, (_,i)=>`Field${i+1}`) : []);
  }

  function renderGroupsDropdown() {
    groupSelect.innerHTML = "";
    if (!groups.length) {
      groupSelect.appendChild(new Option("(no groups found)", ""));
      groupSelect.disabled = true;
      return;
    }
    groupSelect.appendChild(new Option("(select a group…)", "", true, false));
    for (const g of groups) {
      groupSelect.appendChild(new Option(`${g.id}: ${g.name}`, String(g.id)));
    }
    groupSelect.disabled = false;
  }

  function renderGroupsPreview() {
    groupPreviewHead.innerHTML = "";
    groupPreviewBody.innerHTML = "";

    const headers = getHeadersForGroupPreview();
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      groupPreviewHead.appendChild(th);
    }

    const thActions = document.createElement("th");
    thActions.textContent = "Actions";
    groupPreviewHead.appendChild(thActions);

    const rowsToShow = groupRows.slice(0, 200);

    for (let visIndex = 0; visIndex < rowsToShow.length; visIndex++) {
      const realIndex = visIndex;
      const r = rowsToShow[visIndex];

      const tr = document.createElement("tr");
      for (let i = 0; i < headers.length; i++) {
        const td = document.createElement("td");
        td.textContent = r[i] ?? "";
        if (headers[i]?.toLowerCase?.().includes("transponder") || headers[i]?.toLowerCase?.().includes("eid")) td.classList.add("mono");
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
      editBtn.addEventListener("click", () => openEditor("groups", realIndex));

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

      groupPreviewBody.appendChild(tr);
    }

    if (!selectedGroup) {
      groupPreviewMeta.textContent = "No group selected.";
    } else {
      groupPreviewMeta.textContent =
        `Group ${selectedGroup.id}: ${selectedGroup.name} — ${groupRows.length} record(s), ${headers.length} column(s).`;
    }

    downloadGroupCsvBtn.disabled = !(transport.isConnected && groupRows.length);
  }

  // ---- UI rendering ----
  function renderTasksDropdown() {
    taskSelect.innerHTML = "";
    if (!tasks.length) {
      taskSelect.appendChild(new Option("(no tasks found)", ""));
      taskSelect.disabled = true;
    if (syncTasksBtn) syncTasksBtn.disabled = true;
return;
    }
    taskSelect.appendChild(new Option("(select a task…)", "", true, false));
    for (const t of tasks) {
      taskSelect.appendChild(new Option(`${t.idx}: ${t.name} (${t.count})`, String(t.idx)));
    }
    taskSelect.disabled = false;
  }

  function renderPreview() {
    previewHead.innerHTML = "";
    previewBody.innerHTML = "";

    const headers = getHeadersForPreview();

    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      previewHead.appendChild(th);
    }

    const thActions = document.createElement("th");
    thActions.textContent = "Actions";
    previewHead.appendChild(thActions);

    const rowsToShow = taskRows.slice(0, 200);

    for (let visIndex = 0; visIndex < rowsToShow.length; visIndex++) {
      const realIndex = visIndex;
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
      editBtn.addEventListener("click", () => openEditor("tasks", realIndex));

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

      previewBody.appendChild(tr);
    }

    if (!selectedTask) {
      previewMeta.textContent = "No task selected.";
    } else {
      previewMeta.textContent =
        `Task ${selectedTask.idx}: ${selectedTask.name} — ${taskRows.length} record(s), ${headers.length} column(s).`;
    }

    downloadCsvBtn.disabled = !(transport.isConnected && taskRows.length);
  }

  // ---- Agrident commands ----
  async function runXGTASK() {
    const done = await send("[XGTASK]", { name: "Sync tasks", okToken: "XGTASKOK" });

    const rows = done.frames
      .filter(isBracketFrame)
      .filter(fr => fr !== "[XGTASK]" && fr !== "[XGTASKOK]")
      .filter(fr => fr.includes("|"));

    tasks = rows.map(parsePipeFrame)
      .filter(a => a.length >= 2 && a[0] !== "")
      .map(a => ({
        idx: a[0] ?? "",
        name: a[1] ?? "",
        prefix: a[2] ?? "",
        suffix: a[3] ?? "",
        count: a[4] ?? "",
      }));

    renderTasksDropdown();
    const now = new Date();
    syncedAtEl.textContent = `Synced: ${now.toLocaleString()}`;
  }

  async function runXSH(idx) {
    const done = await send(`[XSH|${idx}]`, { name: "Get headers", okToken: "XSHOK" });

    const headerFrame = done.frames.find(fr =>
      isBracketFrame(fr) &&
      !isCmdFrame(fr, "XSH") &&
      fr !== "[XSHOK]" &&
      fr.includes("|")
    );

    taskHeaders = headerFrame ? parsePipeFrame(headerFrame) : [];
  }

  async function runCSW(idx) {
    const done = await send(`[CSW|${idx}]`, { name: "Get data", okToken: "CSWOK" });

    const dataFrames = done.frames
      .filter(isBracketFrame)
      .filter(fr => !isCmdFrame(fr, "CSW"))
      .filter(fr => fr !== "[CSWOK]");

    const datasetFrames = dataFrames.filter(fr => fr.includes("|"));
    const rawRows = datasetFrames.map(parsePipeFrame);

    const headers = taskHeaders.length
      ? taskHeaders
      : Array.from({ length: Math.max(0, ...rawRows.map(r => r.length)) }, (_, i) => `Field${i + 1}`);

    taskRows = rawRows.map(r => formatRow(r, headers));
  }


  // ---- Agrident commands: Groups ----
  async function runXGGROUPS() {
    const done = await send("[XGGROUPS]", { name: "Sync groups", okToken: "XGGROUPSOK" });

    const rows = done.frames
      .filter(isBracketFrame)
      .filter(fr => fr !== "[XGGROUPS]" && fr !== "[XGGROUPSOK]")
      .filter(fr => fr.includes("|"));

    // [pos|groupId|label|type]
    groups = rows
      .map(parsePipeFrame)
      .filter(a => a.length >= 3 && (a[1] ?? "") !== "")
      .map(a => ({
        pos: a[0] ?? "",
        id: a[1] ?? "",
        name: a[2] ?? "",
        type: a[3] ?? "",
      }));

    renderGroupsDropdown();
    const now = new Date();
    if (groupsSyncedAtEl) groupsSyncedAtEl.textContent = `Synced: ${now.toLocaleString()}`;
  }

  async function runXGGROUP(id) {
    const done = await send(`[XGGROUP|${id}]`, { name: "Get group data", okToken: "XGGROUPOK" });

    const dataFrames = done.frames
      .filter(isBracketFrame)
      .filter(fr => !isCmdFrame(fr, "XGGROUP"))
      .filter(fr => fr !== "[XGGROUPOK]");

    const datasetFrames = dataFrames.filter(fr => fr.includes("|"));
    const rawRows = datasetFrames.map(parsePipeFrame);

    groupHeaders = GROUP_HEADERS_BASE;

    // Ensure every row is at least header-length (preserve empty VID/alert fields)
    groupRows = rawRows.map(r => {
  const date = r[1] ?? "";
  const timeRaw = r[2] ?? "";
  const time = timeRaw.length === 6
    ? `${timeRaw.slice(0,2)}:${timeRaw.slice(2,4)}:${timeRaw.slice(4,6)}`
    : timeRaw;
  const type = r[5] ?? "";
  const eid = r[6] ?? "";
  const vid = r[7] ?? "";
  const alert = r[8] ?? "";
  const weight = r[9] ?? "";

  if (groupHeaders.includes("Weight")) {
    return [date, time, type, eid, vid, alert, weight];
  }
  return [date, time, type, eid, vid, alert];
});
  }

  async function runXGGROUPX(id) {
    const done = await send(`[XGGROUPX|${id}]`, { name: "Get group data (with weight)", okToken: "XGGROUPXOK" });

    const dataFrames = done.frames
      .filter(isBracketFrame)
      .filter(fr => !isCmdFrame(fr, "XGGROUPX"))
      .filter(fr => fr !== "[XGGROUPXOK]");

    const datasetFrames = dataFrames.filter(fr => fr.includes("|"));
    const rawRows = datasetFrames.map(parsePipeFrame);

    groupHeaders = GROUP_HEADERS_X;

    // Rows may not include weight; pad to header-length
    groupRows = rawRows.map(r => {
  const date = r[1] ?? "";
  const timeRaw = r[2] ?? "";
  const time = timeRaw.length === 6
    ? `${timeRaw.slice(0,2)}:${timeRaw.slice(2,4)}:${timeRaw.slice(4,6)}`
    : timeRaw;
  const type = r[5] ?? "";
  const eid = r[6] ?? "";
  const vid = r[7] ?? "";
  const alert = r[8] ?? "";
  const weight = r[9] ?? "";

  if (groupHeaders.includes("Weight")) {
    return [date, time, type, eid, vid, alert, weight];
  }
  return [date, time, type, eid, vid, alert];
});
  }

  // Wrapper: prefer X, fallback to base if it errors
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

  async function loadSelectedTask(idx) {
    selectedTask = tasks.find(t => String(t.idx) === String(idx)) || { idx, name: "(unknown)" };
    taskHeaders = [];
    taskRows = [];
    renderPreview();

    await runXSH(idx);
    await runCSW(idx);
    renderPreview();
  }

// ---- Connect / Disconnect ----
async function connect() {
  try {
    setStatus("Connecting…", false);
    setBusy("connecting");

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

    rxText = "";

    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    connType.disabled = true;

    if (isMobileUI()) connType.value = "ble";
    const kind = connType.value;

    await transport.connect(kind);

    setStatus("Connected", true);
    setBusy("idle");

    // enable top-level actions
    if (syncTasksBtn) syncTasksBtn.disabled = false;
    if (syncGroupsBtn) syncGroupsBtn.disabled = false;

    // default tab
    setActiveTab("groups");
  } catch (e) {
    alert(`Connect failed: ${e?.message || e}`);
    await cleanup();
  }
}

async function cleanup() {
  closeEditor(false);

  try { await transport.disconnect(); } catch {}

  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  connType.disabled = false;

  taskSelect.disabled = true;
    if (syncTasksBtn) syncTasksBtn.disabled = true;
  downloadCsvBtn.disabled = true;

  groupSelect.disabled = true;
  if (syncGroupsBtn) syncGroupsBtn.disabled = true;
  downloadGroupCsvBtn.disabled = true;

  deviceNameEl.textContent = "";
  syncedAtEl.textContent = "";
  if (groupsSyncedAtEl) groupsSyncedAtEl.textContent = "";

  rxText = "";

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

  setStatus("Disconnected", false);
  setBusy("idle");
}

// ---- Connection type hints ----
function updateConnHint() {
  if (connType.value === "serial") {
    connHint.textContent = ("serial" in navigator)
      ? "Chrome/Edge desktop (Web Serial)"
      : "Serial not supported in this browser";
  } else {
    connHint.textContent = ("bluetooth" in navigator)
      ? "Chrome/Edge/Android (Web Bluetooth)"
      : "Bluetooth not supported in this browser";
  }
}
connType.addEventListener("change", () => { enforceBLEOnMobile(); updateConnHint(); });
updateConnHint();

// ---- Events ----
connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", cleanup);

tabTasksBtn?.addEventListener("click", () => setActiveTab("tasks"));
tabGroupsBtn?.addEventListener("click", () => setActiveTab("groups"));

syncTasksBtn?.addEventListener("click", async () => {
  try {
    if (!transport.isConnected) return;
    if (syncTasksBtn) syncTasksBtn.disabled = true;
    await runXGTASK();
  } catch (e) {
    alert(`Failed to sync tasks: ${e?.message || e}`);
  } finally {
    if (syncTasksBtn) syncTasksBtn.disabled = !(transport.isConnected);
  }
});

taskSelect.addEventListener("change", async () => {
  try {
    const idx = taskSelect.value;
    if (!idx) return;
    await loadSelectedTask(idx);
  } catch (e) {
    alert(`Failed to load task: ${e?.message || e}`);
  }
});

// Groups
preferGroupXEl?.addEventListener("change", () => {
  preferGroupX = !!preferGroupXEl.checked;
});

syncGroupsBtn?.addEventListener("click", async () => {
  try {
    if (!transport.isConnected) return;
    await runXGGROUPS();
  } catch (e) {
    alert(`Failed to sync groups: ${e?.message || e}`);
  }
});

groupSelect?.addEventListener("change", async () => {
  try {
    const id = groupSelect.value;
    if (!id) return;
    selectedGroup = groups.find(g => String(g.id) === String(id)) || { id, name: "(unknown)" };
    groupRows = [];
    groupHeaders = [];
    renderGroupsPreview();
    await loadSelectedGroup(id);
    renderGroupsPreview();
  } catch (e) {
    alert(`Failed to load group: ${e?.message || e}`);
  }
});

downloadGroupCsvBtn?.addEventListener("click", () => {
  if (!selectedGroup) return;
  const safeName = String(selectedGroup.name || `group_${selectedGroup.id}`)
    .replace(/[^\w\-]+/g,"_")
    .slice(0, 60);

  const headers = getHeadersForGroupPreview();
  const csv = toCSV(headers, groupRows);
  downloadText(`${safeName}.csv`, csv);
});

downloadCsvBtn.addEventListener("click", () => {
  if (!selectedTask) return;

  const safeName = String(selectedTask.name || `task_${selectedTask.idx}`)
    .replace(/[^\w\-]+/g,"_")
    .slice(0, 60);

  const headers = getHeadersForPreview();
  const csv = toCSV(headers, taskRows);
  downloadText(`${safeName}.csv`, csv);
});

// ---- Init ----
setStatus("Disconnected", false);
setActiveTab("groups");
setBusy("idle");
