// ui/tabs.js
export function createTabs(els, defaultTab = "groups") {
  const map = {
    tasks: { btn: els.tabTasksBtn, panel: els.panelTasks, hint: "Tasks" },
    groups: { btn: els.tabGroupsBtn, panel: els.panelGroups, hint: "Groups" },
    taglist: { btn: els.tabTaglistBtn, panel: els.panelTaglist, hint: "Taglist" },
    settings: { btn: els.tabSettingsBtn, panel: els.panelSettings, hint: "Settings" },
  };

  function setActiveTab(tabKey) {
    const keys = Object.keys(map);

    for (const k of keys) {
      const isActive = k === tabKey;
      const entry = map[k];

      if (entry.btn) entry.btn.classList.toggle("btnPrimary", isActive);
      if (entry.panel) entry.panel.style.display = isActive ? "" : "none";
    }

    if (els.activeTabHint) els.activeTabHint.textContent = map[tabKey]?.hint ?? tabKey;
  }

  // initial
  setActiveTab(defaultTab);

  return { setActiveTab };
}
