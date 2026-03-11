export const bindWorkspacePanelEvents = (deps = {}) => {
  const brandToggle = deps.brandToggle ?? null;
  const brandMarkEl = deps.brandMarkEl ?? null;
  const settingsToggleBtn = deps.settingsToggleBtn ?? null;
  const notificationsToggleBtn = deps.notificationsToggleBtn ?? null;
  const notificationsCloseBtn = deps.notificationsCloseBtn ?? null;
  const userSearch = deps.userSearch ?? null;

  const isPanelOpen = typeof deps.isPanelOpen === "function"
    ? deps.isPanelOpen
    : () => false;
  const setPanelOpen = typeof deps.setPanelOpen === "function"
    ? deps.setPanelOpen
    : () => {};
  const isSettingsOpen = typeof deps.isSettingsOpen === "function"
    ? deps.isSettingsOpen
    : () => false;
  const setSettingsOpen = typeof deps.setSettingsOpen === "function"
    ? deps.setSettingsOpen
    : () => {};
  const isNotificationsOpen = typeof deps.isNotificationsOpen === "function"
    ? deps.isNotificationsOpen
    : () => false;
  const setNotificationsOpen = typeof deps.setNotificationsOpen === "function"
    ? deps.setNotificationsOpen
    : () => {};

  if (brandToggle) {
    brandToggle.addEventListener("click", () => {
      const nextState = !isPanelOpen();
      setSettingsOpen(false);
      setPanelOpen(nextState);
      if (nextState) {
        userSearch?.focus();
      }
    });
  }

  if (brandMarkEl) {
    brandMarkEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      brandToggle?.click();
    });
  }

  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener("click", () => {
      const next = !isSettingsOpen();
      setSettingsOpen(next);
    });
  }

  if (notificationsToggleBtn) {
    notificationsToggleBtn.addEventListener("click", () => {
      const next = !isNotificationsOpen();
      setNotificationsOpen(next);
    });
  }

  if (notificationsCloseBtn) {
    notificationsCloseBtn.addEventListener("click", () => {
      setNotificationsOpen(false);
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isPanelOpen()) return;
    if (target.closest("#user-panel") || target.closest("#brand-toggle") || target.closest("#workspace-avatar")) return;
    setPanelOpen(false);
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isSettingsOpen()) return;
    if (target.closest("#settings-panel") || target.closest("#settings-toggle")) return;
    setSettingsOpen(false);
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isNotificationsOpen()) return;
    if (target.closest("#notifications-panel") || target.closest("#notifications-toggle")) return;
    setNotificationsOpen(false);
  });
};
