// ui/dom.js
export function getEls() {
  const els = {
    // connection UI
    connType: document.getElementById("connType"),
    connHint: document.getElementById("connHint"),
    connMore: document.getElementById("connMore"),
    connectBtn: document.getElementById("connectBtn"),
    disconnectBtn: document.getElementById("disconnectBtn"),
    statusEl: document.getElementById("status"),
    busyEl: document.getElementById("busy"),
    deviceNameEl: document.getElementById("deviceName"),
    syncedAtEl: document.getElementById("syncedAt"),

    // tasks
    taskSelect: document.getElementById("taskSelect"),
    syncTasksBtn: document.getElementById("syncTasksBtn"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    previewMeta: document.getElementById("previewMeta"),
    previewHead: document.getElementById("previewHead"),
    previewBody: document.getElementById("previewBody"),

    // tabs + groups
    tabTasksBtn: document.getElementById("tabTasksBtn"),
    tabGroupsBtn: document.getElementById("tabGroupsBtn"),
    panelTasks: document.getElementById("panelTasks"),
    panelGroups: document.getElementById("panelGroups"),
    activeTabHint: document.getElementById("activeTabHint"),

    syncGroupsBtn: document.getElementById("syncGroupsBtn"),
    groupSelect: document.getElementById("groupSelect"),
    preferGroupXEl: document.getElementById("preferGroupX"),
    downloadGroupCsvBtn: document.getElementById("downloadGroupCsvBtn"),
    groupPreviewMeta: document.getElementById("groupPreviewMeta"),
    groupPreviewHead: document.getElementById("groupPreviewHead"),
    groupPreviewBody: document.getElementById("groupPreviewBody"),
    groupsSyncedAtEl: document.getElementById("groupsSyncedAt"),

    tabTaglistBtn: document.getElementById("tabTaglistBtn"),
    panelTaglist: document.getElementById("panelTaglist"),

    // Taglist UI
    syncTaglistBtn: document.getElementById("syncTaglistBtn"),
    eraseTaglistBtn: document.getElementById("eraseTaglistBtn"),
    downloadTaglistCsvBtn: document.getElementById("downloadTaglistCsvBtn"),
    taglistFile: document.getElementById("taglistFile"),
    uploadTaglistBtn: document.getElementById("uploadTaglistBtn"),
    taglistFilter: document.getElementById("taglistFilter"),
    taglistMeta: document.getElementById("taglistMeta"),
    taglistHead: document.getElementById("taglistHead"),
    taglistBody: document.getElementById("taglistBody"),

    // Alerts UI
    syncAlertsBtn: document.getElementById("syncAlertsBtn"),
    eraseAlertsBtn: document.getElementById("eraseAlertsBtn"),
    downloadAlertsCsvBtn: document.getElementById("downloadAlertsCsvBtn"),
    alertsFile: document.getElementById("alertsFile"),
    uploadAlertsBtn: document.getElementById("uploadAlertsBtn"),
    alertsFilter: document.getElementById("alertsFilter"),
    alertsMeta: document.getElementById("alertsMeta"),
    alertsHead: document.getElementById("alertsHead"),
    alertsBody: document.getElementById("alertsBody"),


    // modal
    overlay: document.getElementById("overlay"),
    modalTitle: document.getElementById("modalTitle"),
    modalSubtitle: document.getElementById("modalSubtitle"),
    modalGrid: document.getElementById("modalGrid"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
    modalCancelBtn: document.getElementById("modalCancelBtn"),
    modalDeleteBtn: document.getElementById("modalDeleteBtn"),
    modalSaveBtn: document.getElementById("modalSaveBtn"),
  };

  return els;
}

export function setStatus(els, text, ok) {
  els.statusEl.textContent = text;
  els.statusEl.classList.toggle("ok", !!ok);
  els.statusEl.classList.toggle("bad", !ok);
}

export function setBusy(els, text) {
  els.busyEl.textContent = text;
}

export function isMobileUI() {
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 640px)").matches;
}

export function setConnDetailsDefault(els) {
  if (!els.connMore) return;
  if (window.matchMedia("(min-width: 641px)").matches) els.connMore.open = true;
  else els.connMore.open = false;
}

export function updateConnHint(els) {
  if (!els.connType || !els.connHint) return;
  if (els.connType.value === "serial") {
    els.connHint.textContent = ("serial" in navigator)
      ? "Chrome/Edge desktop (Web Serial)"
      : "Serial not supported in this browser";
  } else {
    els.connHint.textContent = ("bluetooth" in navigator)
      ? "Chrome/Edge/Android (Web Bluetooth)"
      : "Bluetooth not supported in this browser";
  }
}

export function enforceBLEOnMobile(els) {
  const mobile = isMobileUI();
  const row = document.getElementById("connTypeRow");

  if (mobile) {
    els.connType.value = "ble";
    els.connType.disabled = true;
    if (row) row.style.display = "none";
    if (els.connHint) els.connHint.textContent = "Bluetooth (BLE)";
  } else {
    els.connType.disabled = false;
    if (row) row.style.display = "";
    updateConnHint(els);
  }
}
