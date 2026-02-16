// ui/tabs.js

export function createTabs(els, defaultTab = "groups") {
  const map = {
    tasks: { btn: els.tabTasksBtn, panel: els.panelTasks, hint: "Tasks" },
    groups: { btn: els.tabGroupsBtn, panel: els.panelGroups, hint: "Groups" },
    taglist: { btn: els.tabTaglistBtn, panel: els.panelTaglist, hint: "Taglist" },
  };

  function setActiveTab(tabKey) {
    const keys = Object.keys(map);

    for (const k of keys) {
      const { btn, panel } = map[k];
      if (!btn || !panel) continue;

      const active = (k === tabKey);
      btn.classList.toggle("btnPrimary", active);
      panel.style.display = active ? "" : "none";
    }

    if (els.activeTabHint) els.activeTabHint.textContent = map[tabKey]?.hint ?? tabKey;
  }

  setActiveTab(defaultTab);

  return { setActiveTab };
}
