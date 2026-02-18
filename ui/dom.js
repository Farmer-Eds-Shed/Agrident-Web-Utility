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

    // tabs
    tabTasksBtn: document.getElementById("tabTasksBtn"),
    tabGroupsBtn: document.getElementById("tabGroupsBtn"),
    tabTaglistBtn: document.getElementById("tabTaglistBtn"),
    tabSettingsBtn: document.getElementById("tabSettingsBtn"),
    activeTabHint: document.getElementById("activeTabHint"),

    panelTasks: document.getElementById("panelTasks"),
    panelGroups: document.getElementById("panelGroups"),
    panelTaglist: document.getElementById("panelTaglist"),
    panelSettings: document.getElementById("panelSettings"),

    // tasks UI
    syncTasksBtn: document.getElementById("syncTasksBtn"),
    taskSelect: document.getElementById("taskSelect"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    previewMeta: document.getElementById("previewMeta"),
    previewHead: document.getElementById("previewHead"),
    previewBody: document.getElementById("previewBody"),

    // groups UI
    syncGroupsBtn: document.getElementById("syncGroupsBtn"),
    groupSelect: document.getElementById("groupSelect"),
    preferGroupXEl: document.getElementById("preferGroupX"),
    downloadGroupCsvBtn: document.getElementById("downloadGroupCsvBtn"),
    groupPreviewMeta: document.getElementById("groupPreviewMeta"),
    groupPreviewHead: document.getElementById("groupPreviewHead"),
    groupPreviewBody: document.getElementById("groupPreviewBody"),
    groupsSyncedAtEl: document.getElementById("groupsSyncedAt"),

    // modal
    overlay: document.getElementById("overlay"),
    modalTitle: document.getElementById("modalTitle"),
    modalSubtitle: document.getElementById("modalSubtitle"),
    modalGrid: document.getElementById("modalGrid"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
    modalCancelBtn: document.getElementById("modalCancelBtn"),
    modalDeleteBtn: document.getElementById("modalDeleteBtn"),
    modalSaveBtn: document.getElementById("modalSaveBtn"),

    // Taglist UI
    syncTaglistBtn: document.getElementById("syncTaglistBtn"),
    useDeviceAsDraftBtn: document.getElementById("useDeviceAsDraftBtn"),
    eraseTaglistBtn: document.getElementById("eraseTaglistBtn"),
    downloadTaglistCsvBtn: document.getElementById("downloadTaglistCsvBtn"),
    taglistFile: document.getElementById("taglistFile"),
    uploadTaglistBtn: document.getElementById("uploadTaglistBtn"),
    addTagRowBtn: document.getElementById("addTagRowBtn"),
    taglistFilter: document.getElementById("taglistFilter"),
    taglistUploadMode: document.getElementById("taglistUploadMode"),
    taglistMeta: document.getElementById("taglistMeta"),
    taglistHead: document.getElementById("taglistHead"),
    taglistBody: document.getElementById("taglistBody"),

    // Alerts UI
    syncAlertsBtn: document.getElementById("syncAlertsBtn"),
    useAlertsAsDraftBtn: document.getElementById("useAlertsAsDraftBtn"),
    eraseAlertsBtn: document.getElementById("eraseAlertsBtn"),
    downloadAlertsCsvBtn: document.getElementById("downloadAlertsCsvBtn"),
    alertsFile: document.getElementById("alertsFile"),
    uploadAlertsBtn: document.getElementById("uploadAlertsBtn"),
    addAlertRowBtn: document.getElementById("addAlertRowBtn"),
    alertsFilter: document.getElementById("alertsFilter"),
    alertsUploadMode: document.getElementById("alertsUploadMode"),
    alertsMeta: document.getElementById("alertsMeta"),
    alertsHead: document.getElementById("alertsHead"),
    alertsBody: document.getElementById("alertsBody"),

    // Settings UI
    syncSettingsBtn: document.getElementById("syncSettingsBtn"),
    useSettingsAsDraftBtn: document.getElementById("useSettingsAsDraftBtn"),
    downloadSettingsBtn: document.getElementById("downloadSettingsBtn"),
    settingsFile: document.getElementById("settingsFile"),
    uploadSettingsBtn: document.getElementById("uploadSettingsBtn"),
    addSettingRowBtn: document.getElementById("addSettingRowBtn"),
    settingsFilter: document.getElementById("settingsFilter"),
    settingsMeta: document.getElementById("settingsMeta"),
    settingsHead: document.getElementById("settingsHead"),
    settingsBody: document.getElementById("settingsBody"),
    settingsInfo: document.getElementById("settingsInfo"),
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

export function setConnDetailsDefault(els) {
  if (!els.connMore) return;
  if (window.matchMedia("(min-width: 641px)").matches) els.connMore.open = true;
  else els.connMore.open = false;
}

export function isMobileUI() {
  return window.matchMedia("(max-width: 640px)").matches;
}

export function enforceBLEOnMobile(els) {
  if (!els.connType) return;

  if (isMobileUI()) {
    els.connType.value = "ble";
    els.connType.disabled = true;
  } else {
    els.connType.disabled = false;
  }
}

export function updateConnHint(els) {
  if (!els.connHint || !els.connType) return;

  els.connHint.textContent =
    els.connType.value === "serial"
      ? "USB Serial (Web Serial required)"
      : "BLE (Chrome/Edge + compatible reader)";
}
