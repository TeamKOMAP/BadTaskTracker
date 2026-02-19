export const board = document.getElementById("board");
export const openSpacesHomeBtn = document.getElementById("open-spaces-home");

export const appShell = document.getElementById("app-shell");
export const topbar = document.querySelector(".topbar");
export const brandToggle = document.getElementById("brand-toggle");
export const userPanel = document.getElementById("user-panel");

export const columnsWrap = document.getElementById("board-columns");
export const addColumnControl = document.getElementById("add-column-control");
export const addColumnBtn = document.getElementById("add-column");
export const addColumnMenu = document.getElementById("add-column-menu");

export const viewButtons = document.querySelectorAll(".view-btn");
export const viewToggle = document.querySelector(".view-toggle");
export const styleToggle = document.getElementById("style-toggle");
export const styleSwitch = document.getElementById("style-switch");
export const styleToggleTitleEl = document.getElementById("style-toggle-title");
export const styleToggleSubEl = document.getElementById("style-toggle-sub");

export const boardToolbar = document.getElementById("board-toolbar");
export const boardSearchInput = document.getElementById("board-search");
export const boardSearchTags = document.getElementById("board-search-tags");
export const boardSearchClearBtn = document.getElementById("board-search-clear");
export const boardSortToggleBtn = document.getElementById("board-sort-toggle");
export const boardFilterToggleBtn = document.getElementById("board-filter-toggle");
export const boardSortMenu = document.getElementById("board-sort-menu");
export const boardFilterPanel = document.getElementById("board-filter-panel");
export const boardFilterResetBtn = document.getElementById("board-filter-reset");
export const boardTaskCreateBtn = document.getElementById("board-task-create");

export const taskGrid = document.getElementById("task-grid");
export const taskGridItems = document.getElementById("task-grid-items");
export const taskGridEmptyEl = document.getElementById("task-grid-empty");
export const taskGridSubEl = document.getElementById("task-grid-sub");

export const taskTrashZone = document.getElementById("task-trash-zone");

export const flowLayout = document.getElementById("flow-layout");
export const flowCanvas = document.getElementById("flow-canvas");
export const flowLinks = document.getElementById("flow-links");
export const flowDropzone = document.getElementById("flow-dropzone");
export const flowListItems = document.querySelector(".flow-list-items");
export const flowAddTaskBtn = document.getElementById("flow-add-task");

export const calendarLayout = document.getElementById("calendar-layout");

export const taskModal = document.getElementById("task-modal");
export const taskForm = document.getElementById("task-form");
export const taskStatus = document.getElementById("task-status");
export const taskTitle = document.getElementById("task-title");
export const taskDescription = document.getElementById("task-description");
export const taskDue = document.getElementById("task-due");
export const taskAssignee = document.getElementById("task-assignee");
export const taskPriority = document.getElementById("task-priority");
export const taskTagsInput = document.getElementById("task-tags-input");
export const tagOptions = document.getElementById("tag-options");
export const tagPreview = document.getElementById("tag-preview");

export const userSearch = document.getElementById("user-search");
export const userList = document.getElementById("user-list");
export const userEmpty = document.getElementById("user-empty");
export const userAddInput = document.getElementById("user-add-input");
export const userAddBtn = document.getElementById("user-add-btn");

export const panelWorkspace = document.getElementById("panel-workspace");
export const panelWorkspaceNameEl = document.getElementById("panel-workspace-name");
export const panelWorkspaceEditBtn = document.getElementById("panel-workspace-edit");
export const panelWorkspaceAvatarEl = document.getElementById("panel-workspace-avatar");
export const panelWorkspaceAvatarInput = document.getElementById("panel-workspace-avatar-input");

export const taskBgInput = document.getElementById("task-bg-input");
export const taskAttachmentsInput = document.getElementById("task-attachments-input");

export const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const brandTitleEl = document.querySelector(".brand-title");
export const brandMarkEl = document.querySelector(".brand-mark");
export const userNameEl = document.querySelector(".user-name");

export const accountAvatarEl = document.querySelector(".avatar");
export const accountAvatarTextEl = accountAvatarEl?.querySelector("span") || null;

export const settingsPanel = document.getElementById("settings-panel");
export const settingsToggleBtn = document.getElementById("settings-toggle");

export const notificationsPanel = document.getElementById("notifications-panel");
export const notificationsToggleBtn = document.getElementById("notifications-toggle");
export const notificationsCloseBtn = document.getElementById("notifications-close");

export const logoutBtn = document.getElementById("logout-btn");
export const settingsNicknameInput = document.getElementById("settings-nickname");
export const settingsAvatarPreview = document.getElementById("settings-avatar-preview");
export const settingsAvatarPreviewTextEl = settingsAvatarPreview?.querySelector("span") || null;
export const settingsAvatarInput = document.getElementById("settings-avatar-input");
export const settingsAvatarBtn = document.getElementById("settings-avatar-btn");
export const settingsAvatarClearBtn = document.getElementById("settings-avatar-clear");
export const settingsThemeDarkBtn = document.getElementById("settings-theme-dark");
export const settingsThemeLightBtn = document.getElementById("settings-theme-light");

export const taskModalKicker = taskModal?.querySelector(".task-modal-kicker") || null;
export const taskModalTitleEl = document.getElementById("task-modal-title");
export const taskFormSubmitBtn = taskForm?.querySelector('button[type="submit"]') || null;

export const taskDetailModal = document.getElementById("task-detail-modal");
export const taskDetailTitleEl = document.getElementById("task-detail-title");
export const taskDetailEditBtn = document.getElementById("task-detail-edit");
export const taskDetailStatusBadge = document.getElementById("task-detail-status-badge");
export const taskDetailPriorityBadge = document.getElementById("task-detail-priority-badge");
export const taskDetailDueBadge = document.getElementById("task-detail-due-badge");
export const taskDetailStatusEl = document.getElementById("task-detail-status");
export const taskDetailPriorityEl = document.getElementById("task-detail-priority");
export const taskDetailIdEl = document.getElementById("task-detail-id");
export const taskDetailAssigneeEl = document.getElementById("task-detail-assignee");
export const taskDetailDueEl = document.getElementById("task-detail-due");
export const taskDetailCreatedEl = document.getElementById("task-detail-created");
export const taskDetailUpdatedEl = document.getElementById("task-detail-updated");
export const taskDetailCompletedEl = document.getElementById("task-detail-completed");
export const taskDetailTagsEl = document.getElementById("task-detail-tags");
export const taskDetailDescriptionEl = document.getElementById("task-detail-description");
export const taskDetailPhotoWrap = document.getElementById("task-detail-photo");
export const taskDetailPhotoImg = document.getElementById("task-detail-photo-img");
export const taskDetailPhotoBtn = document.getElementById("task-detail-photo-btn");
export const taskDetailPhotoClearBtn = document.getElementById("task-detail-photo-clear-btn");

export const taskDetailHistoryPanel = document.getElementById("task-detail-history-panel");
export const taskDetailHistoryToggleBtn = document.getElementById("task-detail-history-toggle");

export const taskDetailHistoryList = document.getElementById("task-detail-history");
export const taskDetailHistoryEmpty = document.getElementById("task-detail-history-empty");
export const taskDetailHistoryClearBtn = document.getElementById("task-detail-history-clear");

export const taskAttachBtn = document.getElementById("task-attach-btn");
export const taskAttachmentsList = document.getElementById("task-attachments-list");
export const taskAttachmentsEmpty = document.getElementById("task-attachments-empty");

export const confirmModal = document.getElementById("confirm-modal");
export const confirmModalKickerEl = document.getElementById("confirm-modal-kicker");
export const confirmModalTitleEl = document.getElementById("confirm-modal-title");
export const confirmModalMessageEl = document.getElementById("confirm-modal-message");
export const confirmModalCancelBtn = document.getElementById("confirm-modal-cancel");
export const confirmModalAcceptBtn = document.getElementById("confirm-modal-accept");
