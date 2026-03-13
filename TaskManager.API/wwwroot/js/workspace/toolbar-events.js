export const bindWorkspaceToolbarEvents = (deps = {}) => {
  const boardTagsToggleBtn = deps.boardTagsToggleBtn ?? null;
  const boardTagsClearBtn = deps.boardTagsClearBtn ?? null;
  const boardTagsList = deps.boardTagsList ?? null;
  const boardSearchInput = deps.boardSearchInput ?? null;
  const boardSearchClearBtn = deps.boardSearchClearBtn ?? null;
  const boardSortToggleBtn = deps.boardSortToggleBtn ?? null;
  const boardSortMenu = deps.boardSortMenu ?? null;
  const boardFilterToggleBtn = deps.boardFilterToggleBtn ?? null;
  const boardFilterResetBtn = deps.boardFilterResetBtn ?? null;
  const boardFilterPanel = deps.boardFilterPanel ?? null;

  const normalizeToken = typeof deps.normalizeToken === "function" ? deps.normalizeToken : (value) => String(value || "").trim();
  const normalizeTag = typeof deps.normalizeTag === "function" ? deps.normalizeTag : (value) => normalizeToken(value).toLowerCase();
  const closeToolbarPopovers = typeof deps.closeToolbarPopovers === "function" ? deps.closeToolbarPopovers : () => false;
  const refreshToolbarUiState = typeof deps.refreshToolbarUiState === "function" ? deps.refreshToolbarUiState : () => {};
  const syncTaskStateToUi = typeof deps.syncTaskStateToUi === "function" ? deps.syncTaskStateToUi : () => {};
  const toggleBoardTagsMenu = typeof deps.toggleBoardTagsMenu === "function" ? deps.toggleBoardTagsMenu : () => {};
  const toggleBoardSortMenu = typeof deps.toggleBoardSortMenu === "function" ? deps.toggleBoardSortMenu : () => {};
  const toggleBoardFilterPanel = typeof deps.toggleBoardFilterPanel === "function" ? deps.toggleBoardFilterPanel : () => {};
  const setToolbarQuery = typeof deps.setToolbarQuery === "function" ? deps.setToolbarQuery : () => {};
  const setToolbarSort = typeof deps.setToolbarSort === "function" ? deps.setToolbarSort : () => {};
  const getToolbarSearchDebounceId = typeof deps.getToolbarSearchDebounceId === "function" ? deps.getToolbarSearchDebounceId : () => null;
  const setToolbarSearchDebounceId = typeof deps.setToolbarSearchDebounceId === "function"
    ? deps.setToolbarSearchDebounceId
    : () => {};

  const toolbarTagFilter = deps.toolbarTagFilter instanceof Set ? deps.toolbarTagFilter : new Set();
  const toolbarStatusFilter = deps.toolbarStatusFilter instanceof Set ? deps.toolbarStatusFilter : new Set();
  const toolbarPriorityFilter = deps.toolbarPriorityFilter instanceof Set ? deps.toolbarPriorityFilter : new Set();

  if (boardTagsToggleBtn) {
    boardTagsToggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBoardTagsMenu();
    });
  }

  if (boardTagsClearBtn) {
    boardTagsClearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toolbarTagFilter.clear();
      refreshToolbarUiState();
      syncTaskStateToUi();
    });
  }

  if (boardTagsList) {
    boardTagsList.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest(".board-popover-item[data-tag]")
        : null;
      if (!(target instanceof HTMLButtonElement)) return;

      event.preventDefault();
      event.stopPropagation();

      const tag = normalizeTag(target.dataset.tag);
      if (!tag) return;

      if (toolbarTagFilter.has(tag)) {
        toolbarTagFilter.delete(tag);
      } else {
        toolbarTagFilter.add(tag);
      }

      refreshToolbarUiState();
      syncTaskStateToUi();
    });
  }

  if (boardSearchInput) {
    boardSearchInput.addEventListener("input", () => {
      const prevTimer = getToolbarSearchDebounceId();
      if (prevTimer) {
        window.clearTimeout(prevTimer);
      }

      const nextTimer = window.setTimeout(() => {
        setToolbarQuery(normalizeToken(boardSearchInput.value));
        syncTaskStateToUi();
      }, 120);

      setToolbarSearchDebounceId(nextTimer);
    });
  }

  if (boardSearchClearBtn) {
    boardSearchClearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setToolbarQuery("");
      toolbarTagFilter.clear();
      if (boardSearchInput) {
        boardSearchInput.value = "";
      }
      syncTaskStateToUi();
    });
  }

  if (boardSortToggleBtn) {
    boardSortToggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBoardSortMenu();
    });
  }

  if (boardSortMenu) {
    boardSortMenu.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest(".board-popover-item[data-sort]")
        : null;
      if (!(target instanceof HTMLButtonElement)) return;

      event.preventDefault();
      event.stopPropagation();

      const nextSort = normalizeToken(target.dataset.sort) || "smart";
      setToolbarSort(nextSort);
      closeToolbarPopovers();
      syncTaskStateToUi();
    });
  }

  if (boardFilterToggleBtn) {
    boardFilterToggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBoardFilterPanel();
    });
  }

  if (boardFilterResetBtn) {
    boardFilterResetBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toolbarStatusFilter.clear();
      toolbarPriorityFilter.clear();
      toolbarTagFilter.clear();
      refreshToolbarUiState();
      syncTaskStateToUi();
    });
  }

  if (boardFilterPanel) {
    boardFilterPanel.addEventListener("change", (event) => {
      const input = event.target instanceof Element
        ? event.target.closest('input[type="checkbox"][data-filter]')
        : null;
      if (!(input instanceof HTMLInputElement)) return;

      const kind = normalizeToken(input.dataset.filter);
      const value = Number.parseInt(normalizeToken(input.value), 10);
      if (!Number.isFinite(value)) return;

      const set = kind === "status"
        ? toolbarStatusFilter
        : (kind === "priority" ? toolbarPriorityFilter : null);
      if (!set) return;

      if (input.checked) {
        set.add(value);
      } else {
        set.delete(value);
      }

      syncTaskStateToUi();
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      closeToolbarPopovers();
      return;
    }

    if (target.closest("#board-sort-menu")
      || target.closest("#board-filter-panel")
      || target.closest("#board-tags-menu")
      || target.closest("#board-sort-toggle")
      || target.closest("#board-filter-toggle")
      || target.closest("#board-tags-toggle")) {
      return;
    }

    closeToolbarPopovers();
  });
};
