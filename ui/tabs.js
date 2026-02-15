// ui/tabs.js
export function createTabs(els, initialTab = "groups") {
  let activeTab = initialTab === "tasks" ? "tasks" : "groups";

  function setActiveTab(tab) {
    activeTab = tab === "tasks" ? "tasks" : "groups";

    if (els.panelTasks) els.panelTasks.style.display = (activeTab === "tasks") ? "" : "none";
    if (els.panelGroups) els.panelGroups.style.display = (activeTab === "groups") ? "" : "none";

    els.tabTasksBtn?.classList.toggle("btnPrimary", activeTab === "tasks");
    els.tabGroupsBtn?.classList.toggle("btnPrimary", activeTab === "groups");

    if (els.activeTabHint) els.activeTabHint.textContent = (activeTab === "tasks") ? "Tasks" : "Groups";
  }

  setActiveTab(activeTab);

  return { getActiveTab: () => activeTab, setActiveTab };
}
