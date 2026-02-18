import {
  board,
  openSpacesHomeBtn,
  appShell,
  topbar,
  brandToggle,
  userPanel,
  columnsWrap,
  addColumnControl,
  addColumnBtn,
  addColumnMenu,
  viewButtons,
  viewToggle,
  styleToggle,
  styleSwitch,
  styleToggleTitleEl,
  styleToggleSubEl,
  boardToolbar,
  boardSearchInput,
  boardSearchTags,
  boardSearchClearBtn,
  boardSortToggleBtn,
  boardFilterToggleBtn,
  boardSortMenu,
  boardFilterPanel,
  boardFilterResetBtn,
  boardTaskCreateBtn,
  taskGrid,
  taskGridItems,
  taskGridEmptyEl,
  taskGridSubEl,
  taskTrashZone,
  flowLayout,
  flowCanvas,
  flowLinks,
  flowDropzone,
  flowListItems,
  flowAddTaskBtn,
  calendarLayout,
  taskModal,
  taskForm,
  taskStatus,
  taskTitle,
  taskDescription,
  taskDue,
  taskAssignee,
  taskPriority,
  taskTagsInput,
  tagOptions,
  tagPreview,
  userSearch,
  userList,
  userEmpty,
  userAddInput,
  userAddBtn,
  panelWorkspace,
  panelWorkspaceNameEl,
  panelWorkspaceEditBtn,
  panelWorkspaceAvatarEl,
  panelWorkspaceAvatarInput,
  accountAvatarEl,
  accountAvatarTextEl,
  settingsPanel,
  settingsToggleBtn,
  notificationsPanel,
  notificationsToggleBtn,
  notificationsCloseBtn,
  logoutBtn,
  settingsNicknameInput,
  settingsAvatarPreview,
  settingsAvatarPreviewTextEl,
  settingsAvatarInput,
  settingsAvatarBtn,
  settingsAvatarClearBtn,
  settingsThemeDarkBtn,
  settingsThemeLightBtn,
  prefersReducedMotion,
  brandTitleEl,
  brandMarkEl,
  userNameEl,
  taskModalKicker,
  taskModalTitleEl,
  taskFormSubmitBtn,
  taskDetailModal,
  taskDetailEditBtn,
  taskDetailPhotoBtn,
  taskDetailPhotoClearBtn,
  taskAttachBtn,
  taskAttachmentsInput,
  taskBgInput,
  confirmModal,
  confirmModalKickerEl,
  confirmModalTitleEl,
  confirmModalMessageEl,
  confirmModalCancelBtn,
  confirmModalAcceptBtn
} from "./dom.js?v=authflow7";

import {
  buildApiUrl,
  apiFetch,
  fetchJsonOrNull,
  handleApiError,
  ensureAuthOrRedirect,
  redirectToAuthPage,
  hasAccessToken,
  setAccessToken,
  clearAccessToken
} from "../shared/api.js?v=auth5";
import {
  DEFAULT_PRIORITY_VALUE,
  STORAGE_WORKSPACE_ID,
  MANAGE_ROLES,
  STATUS_LABELS,
  STATUS_LABEL_SET,
  URGENCY
} from "../shared/constants.js";
import { navigateToSpacesPage } from "../shared/navigation.js";
import { normalizeToken, normalizeEmail, toInitials, toWorkspaceRole, clampValue } from "../shared/utils.js";
import { getRoleLabel } from "../shared/roles.js?v=auth1";
import {
  getStoredAccountNickname,
  setStoredAccountNickname,
  getStoredAccountAvatar,
  setStoredAccountAvatar,
  applyAccountAvatarToElement
} from "../shared/account-prefs.js?v=auth1";
import {
  toStatusValue,
  toPriorityValue,
  getPriorityLabel,
  getColumnIdForStatus,
  getStatusForColumnId,
  formatDateTimeLocal,
  toDateTimeLocalValue,
  getDefaultDueDateLocalValue,
  getDefaultDueDateIso,
  formatShortDate,
  getUrgency,
  formatDurationShort,
  formatDueLabel,
  formatCardDueLabel,
  parseTagIds,
  addUniqueToken,
  parseTags,
  buildTaskKey,
  buildFlowNote,
  getCalendarBucketId
} from "./helpers.js?v=authflow5";
import {
  getPreferredTheme,
  setTheme,
  getStoredTaskMeta,
  setStoredTaskMeta,
  getStoredTaskBg,
  clearStoredTaskArtifacts,
  getStoredWorkspaceColumns,
  setStoredWorkspaceColumns
} from "./storage.js?v=authflow2";
import { createBoardViewController } from "./board-view.js?v=perf2";
import { createCalendarViewController } from "./calendar-view.js?v=perf2";
import { createPriorityViewController } from "./priority-view.js?v=perf3";
import { createFlowEditorController } from "./flow-editor.js?v=perf1";
import { createTaskDetailController } from "./task-detail.js?v=perf11";

let lastNormalizedTasks = [];

let currentAssigneeIdFilter = null;
let currentUserId = null;
let currentWorkspaceId = null;
let currentWorkspaceRole = "Member";

let toolbarQuery = "";
let toolbarSort = "smart";
const toolbarStatusFilter = new Set();
const toolbarPriorityFilter = new Set();
const toolbarTagFilter = new Set();
let toolbarSearchDebounceId = null;

let panelWorkspaceEditing = false;

const setWorkspaceEditing = (editing) => {
  panelWorkspaceEditing = !!editing;
  if (!panelWorkspaceNameEl || !panelWorkspaceEditBtn) return;

  if (panelWorkspaceEditing) {
    panelWorkspaceNameEl.setAttribute("contenteditable", "true");
    panelWorkspaceNameEl.setAttribute("role", "textbox");
    panelWorkspaceNameEl.setAttribute("aria-label", "Название проекта");
    panelWorkspaceNameEl.dataset.original = panelWorkspaceNameEl.textContent || "";
    window.setTimeout(() => {
      panelWorkspaceNameEl.focus();
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(panelWorkspaceNameEl);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
        // ignore
      }
    }, 0);
  } else {
    panelWorkspaceNameEl.removeAttribute("contenteditable");
    panelWorkspaceNameEl.removeAttribute("role");
    panelWorkspaceNameEl.removeAttribute("aria-label");
    delete panelWorkspaceNameEl.dataset.original;
  }
};
let actorUser = null;

let workspaceMembers = [];

const truncateLabel = (value, maxLen) => {
  const text = String(value || "");
  const max = Number.isFinite(Number(maxLen)) ? Number(maxLen) : 24;
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, 1);
  return `${text.slice(0, Math.max(1, max - 3)).trim()}...`;
};

let tagsLoaded = false;
let tagList = [];
const tagById = new Map();
const tagByName = new Map();

const getActorUserId = () => {
  const raw = actorUser?.id;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const getToolbarQueryTokens = () => {
  return normalizeToken(toolbarQuery)
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
};

const normalizeTag = (value) => {
  const raw = normalizeToken(value);
  if (!raw) return "";
  return raw.replace(/^#+/, "").trim().toLowerCase();
};

const getTaskNormalizedTags = (taskData) => {
  const tags = Array.isArray(taskData?.tags) ? taskData.tags : [];
  const set = new Set();
  tags.forEach((t) => {
    const token = normalizeTag(t);
    if (token) set.add(token);
  });
  return set;
};

const getAssigneeLabelById = (assigneeId) => {
  const id = Number.parseInt(String(assigneeId ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return "";

  const storedNickname = normalizeToken(getStoredAccountNickname(id));
  if (storedNickname) return storedNickname;

  const match = (Array.isArray(workspaceMembers) ? workspaceMembers : []).find((m) => Number(m?.id) === id);
  if (!match) return "";
  return normalizeToken(match.name) || "";
};

const isTaskMatchingToolbarFilters = (taskData) => {
  if (!taskData) return false;

  const tokens = getToolbarQueryTokens();
  if (tokens.length) {
    const title = normalizeToken(taskData.title).toLowerCase();
    const description = normalizeToken(taskData.description).toLowerCase();
    const tags = (Array.isArray(taskData.tags) ? taskData.tags : [])
      .map((t) => normalizeToken(t).toLowerCase())
      .filter(Boolean)
      .join(" ");
    const assignee = getAssigneeLabelById(taskData.assigneeId).toLowerCase();
    const haystack = `${title} ${description} ${tags} ${assignee}`.trim();
    const matches = tokens.every((token) => haystack.includes(token));
    if (!matches) return false;
  }

  if (toolbarTagFilter.size) {
    const tagSet = getTaskNormalizedTags(taskData);
    for (const tag of toolbarTagFilter) {
      if (!tagSet.has(tag)) {
        return false;
      }
    }
  }

  const statusValue = toStatusValue(taskData.statusValue ?? taskData.status);
  if (toolbarStatusFilter.size && !toolbarStatusFilter.has(statusValue)) {
    return false;
  }

  const priorityValue = toPriorityValue(taskData.priorityValue ?? taskData.priority);
  if (toolbarPriorityFilter.size && !toolbarPriorityFilter.has(priorityValue)) {
    return false;
  }

  return true;
};

const isToolbarFilteringActive = () => {
  return Boolean(getToolbarQueryTokens().length)
    || toolbarStatusFilter.size > 0
    || toolbarPriorityFilter.size > 0
    || toolbarTagFilter.size > 0
    || (normalizeToken(toolbarSort) && toolbarSort !== "smart");
};

const isToolbarSearchOrFilterActive = () => {
  return Boolean(getToolbarQueryTokens().length)
    || toolbarStatusFilter.size > 0
    || toolbarPriorityFilter.size > 0
    || toolbarTagFilter.size > 0;
};

const renderToolbarTagFilterUi = () => {
  if (!boardSearchTags) return;
  boardSearchTags.innerHTML = "";
  const tags = Array.from(toolbarTagFilter.values());
  if (!tags.length) return;

  const fragment = document.createDocumentFragment();
  tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "board-search-tag";
    pill.dataset.tag = tag;
    const label = document.createElement("span");
    label.textContent = tag;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "board-search-tag-remove";
    remove.setAttribute("aria-label", `Убрать тег ${tag}`);
    remove.title = "Убрать";
    remove.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    `;
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toolbarTagFilter.delete(tag);
      syncTaskStateToUi();
    });

    pill.append(label, remove);
    fragment.appendChild(pill);
  });
  boardSearchTags.appendChild(fragment);
};

const refreshSearchClearUi = () => {
  if (!boardSearchClearBtn) return;
  const active = Boolean(normalizeToken(boardSearchInput?.value))
    || toolbarTagFilter.size > 0;
  boardSearchClearBtn.toggleAttribute("hidden", !active);
};

const setGridOverlayActive = (active) => {
  if (!board) return;
  const next = Boolean(active);
  if (next) {
    board.dataset.overlay = "grid";
    if (taskGrid) taskGrid.removeAttribute("hidden");
  } else {
    delete board.dataset.overlay;
    if (taskGrid) taskGrid.setAttribute("hidden", "");
  }
};

const renderTaskGridView = (tasks) => {
  if (!taskGridItems || !taskGridEmptyEl) return;
  taskGridItems.innerHTML = "";
  taskGridEmptyEl.hidden = true;

  const list = Array.isArray(tasks) ? tasks : [];
  if (taskGridSubEl) {
    taskGridSubEl.textContent = `${list.length} задач`;
  }
  if (!list.length) {
    taskGridEmptyEl.hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((taskData) => {
    const card = createTaskCard(taskData);
    if (!(card instanceof Element)) return;
    card.setAttribute("draggable", "false");
    fragment.appendChild(card);
  });
  taskGridItems.appendChild(fragment);
};

const getDueTime = (task) => {
  const due = task?.dueDate ? new Date(task.dueDate) : null;
  const time = due && !Number.isNaN(due.getTime()) ? due.getTime() : Number.POSITIVE_INFINITY;
  return time;
};

const compareTasks = (a, b, sortId) => {
  const mode = normalizeToken(sortId) || "smart";
  if (mode === "title") {
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  }

  if (mode === "priority") {
    const ap = toPriorityValue(a?.priorityValue ?? a?.priority);
    const bp = toPriorityValue(b?.priorityValue ?? b?.priority);
    if (ap !== bp) return bp - ap;
    const ad = getDueTime(a);
    const bd = getDueTime(b);
    if (ad !== bd) return ad - bd;
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  }

  if (mode === "due") {
    const ad = getDueTime(a);
    const bd = getDueTime(b);
    if (ad !== bd) return ad - bd;
    const ap = toPriorityValue(a?.priorityValue ?? a?.priority);
    const bp = toPriorityValue(b?.priorityValue ?? b?.priority);
    if (ap !== bp) return bp - ap;
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  }

  // smart
  const ad = getDueTime(a);
  const bd = getDueTime(b);
  if (ad !== bd) return ad - bd;
  const ap = toPriorityValue(a?.priorityValue ?? a?.priority);
  const bp = toPriorityValue(b?.priorityValue ?? b?.priority);
  if (ap !== bp) return bp - ap;
  return String(a?.title || "").localeCompare(String(b?.title || ""));
};

const compareTasksForToolbar = (a, b) => compareTasks(a, b, toolbarSort);

const getVisibleSortedTasks = (tasks) => {
  const source = Array.isArray(tasks) ? tasks : lastNormalizedTasks;
  const filtered = source
    .filter((task) => isTaskVisibleWithCurrentFilters(task))
    .filter((task) => isTaskMatchingToolbarFilters(task));
  return filtered.slice().sort(compareTasksForToolbar);
};

const closeToolbarPopovers = () => {
  let closed = false;

  if (boardSortMenu && !boardSortMenu.hasAttribute("hidden")) {
    boardSortMenu.setAttribute("hidden", "");
    closed = true;
  }
  if (boardFilterPanel && !boardFilterPanel.hasAttribute("hidden")) {
    boardFilterPanel.setAttribute("hidden", "");
    closed = true;
  }

  if (boardSortToggleBtn) {
    boardSortToggleBtn.setAttribute("aria-expanded", "false");
  }
  if (boardFilterToggleBtn) {
    boardFilterToggleBtn.setAttribute("aria-expanded", "false");
  }

  return closed;
};

const refreshToolbarUiState = () => {
  renderToolbarTagFilterUi();
  refreshSearchClearUi();
  if (boardSortMenu) {
    Array.from(boardSortMenu.querySelectorAll(".board-popover-item[data-sort]")).forEach((btn) => {
      const id = normalizeToken(btn.dataset.sort) || "smart";
      btn.classList.toggle("is-selected", id === toolbarSort);
    });
  }

  if (boardFilterPanel) {
    Array.from(boardFilterPanel.querySelectorAll('input[type="checkbox"][data-filter]')).forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const kind = normalizeToken(input.dataset.filter);
      const value = Number.parseInt(normalizeToken(input.value), 10);
      if (!Number.isFinite(value)) return;
      if (kind === "status") {
        input.checked = toolbarStatusFilter.has(value);
      } else if (kind === "priority") {
        input.checked = toolbarPriorityFilter.has(value);
      }
    });
  }
};

const renderAssigneeOptions = (options) => {
  if (!taskAssignee) return;
  if (!(taskAssignee instanceof HTMLSelectElement)) return;

  const selected = normalizeToken(options?.selectedValue ?? taskAssignee.value);
  const defaultToActor = options?.defaultToActor === true;
  const actorId = getActorUserId();

  const list = Array.isArray(workspaceMembers) ? workspaceMembers : [];
  const members = list
    .filter((item) => Number.isFinite(Number(item?.id)) && Number(item.id) > 0)
    .map((item) => ({
      id: Number(item.id),
      name: normalizeToken(item.name),
      email: normalizeToken(item.email),
      role: normalizeToken(item.role)
    }))
    .filter((item) => item.email);

  members.sort((a, b) => {
    if (actorId && a.id === actorId) return -1;
    if (actorId && b.id === actorId) return 1;
    const an = a.name || a.email;
    const bn = b.name || b.email;
    return String(an).localeCompare(String(bn));
  });

  const values = new Set([""]);
  members.forEach((m) => values.add(String(m.id)));

  taskAssignee.innerHTML = "";

  const unassignedOption = document.createElement("option");
  unassignedOption.value = "";
  unassignedOption.textContent = "Все";
  taskAssignee.appendChild(unassignedOption);

  members.forEach((m) => {
    const storedNickname = normalizeToken(getStoredAccountNickname(m.id));
    const fullLabel = storedNickname || normalizeToken(m.name) || "Без имени";
    const label = truncateLabel(fullLabel, 24);
    const option = document.createElement("option");
    option.value = String(m.id);
    option.textContent = label;
    option.title = fullLabel;
    taskAssignee.appendChild(option);
  });

  if (selected && !values.has(selected)) {
    const unknown = document.createElement("option");
    unknown.value = selected;
    unknown.textContent = "Неизвестный участник";
    taskAssignee.appendChild(unknown);
    values.add(selected);
  }

  if (defaultToActor && actorId && values.has(String(actorId))) {
    taskAssignee.value = String(actorId);
    return;
  }

  taskAssignee.value = values.has(selected) ? selected : "";
};

const COLUMN_CREATE_VARIANTS = {
  new: {
    title: "New",
    columnId: null,
    specialized: false
  },
  inprogress: {
    title: "In progress",
    columnId: "progress",
    specialized: true
  },
  done: {
    title: "Done",
    columnId: "done",
    specialized: true
  },
  overdue: {
    title: "Overdue",
    columnId: "overdue",
    specialized: true
  }
};

const FLOW_STATUS_LABELS = {
  1: "New",
  2: "In Progress",
  3: "Done",
  4: "Overdue"
};

const getFlowStatusLabel = (statusValue) => FLOW_STATUS_LABELS[toStatusValue(statusValue)] || FLOW_STATUS_LABELS[1];

let dragColumn = null;
let lastAfter = null;
let dragTask = null;
let dragTaskColumn = null;
let lastTaskAfter = null;
let lastTaskContainer = null;
let activeTaskColumn = null;
let editingTaskId = null;
let editingTaskCard = null;
let isAddColumnMenuOpen = false;

const setColumnDelays = () => {
  if (!columnsWrap) return;
  const columns = Array.from(columnsWrap.querySelectorAll(".column"));
  columns.forEach((column, index) => {
    column.style.setProperty("--delay", `${index * 80}ms`);
  });
};

const updateColumnCount = (column) => {
  const countElement = column.querySelector(".column-count");
  if (!countElement) return;
  const count = column.querySelectorAll(".task-card:not(.is-empty)").length;
  countElement.textContent = count;
};

const getColumnCreateVariant = (type) => {
  const key = normalizeToken(type).toLowerCase();
  return COLUMN_CREATE_VARIANTS[key] || COLUMN_CREATE_VARIANTS.new;
};

const RESERVED_STATUS_COLUMN_IDS = new Set(["progress", "done", "overdue"]);

const generateColumnId = () => `column-${Date.now()}-${Math.floor(Math.random() * 1000)}-${Math.floor(Math.random() * 1000)}`;

const getColumnTypeFromColumnId = (columnId) => {
  const id = normalizeToken(columnId).toLowerCase();
  if (id === "progress") return "inprogress";
  if (id === "done") return "done";
  if (id === "overdue") return "overdue";
  return "new";
};

const inferColumnType = (column) => {
  const explicitType = normalizeToken(column?.dataset?.columnType).toLowerCase();
  if (COLUMN_CREATE_VARIANTS[explicitType]) {
    return explicitType;
  }
  return getColumnTypeFromColumnId(column?.dataset?.columnId);
};

const getExistingColumnByType = (type) => {
  if (!columnsWrap) return null;
  const token = normalizeToken(type).toLowerCase();
  const normalizedType = COLUMN_CREATE_VARIANTS[token] ? token : "new";

  return Array.from(columnsWrap.querySelectorAll(".column")).find((column) => {
    return inferColumnType(column) === normalizedType;
  }) || null;
};

const ensureColumnMetadata = (column) => {
  if (!(column instanceof Element)) {
    return { columnType: "new", columnId: "" };
  }

  const columnType = inferColumnType(column);
  const variant = getColumnCreateVariant(columnType);
  column.dataset.columnType = columnType;

  if (variant.specialized && variant.columnId) {
    column.dataset.columnId = variant.columnId;
    return { columnType, columnId: variant.columnId };
  }

  let columnId = normalizeToken(column.dataset.columnId);
  if (!columnId || RESERVED_STATUS_COLUMN_IDS.has(columnId.toLowerCase())) {
    columnId = generateColumnId();
    column.dataset.columnId = columnId;
  }

  return { columnType, columnId };
};

const normalizeStoredColumnType = (rawType, rawColumnId) => {
  const type = normalizeToken(rawType).toLowerCase();
  if (COLUMN_CREATE_VARIANTS[type]) {
    return type;
  }
  return getColumnTypeFromColumnId(rawColumnId);
};

const buildColumnLayoutSnapshot = () => {
  if (!columnsWrap) return [];

  return Array.from(columnsWrap.querySelectorAll(".column"))
    .map((column) => {
      const { columnType, columnId } = ensureColumnMetadata(column);
      const titleEl = column.querySelector(".column-title");
      const fallbackTitle = getColumnCreateVariant(columnType).title || "Untitled";
      const title = normalizeToken(titleEl?.textContent) || fallbackTitle;
      if (titleEl) {
        titleEl.textContent = title;
      }
      return {
        columnId,
        columnType,
        title
      };
    })
    .filter((item) => normalizeToken(item?.title));
};

const saveBoardColumnsLayout = () => {
  if (!currentWorkspaceId || !columnsWrap) return;
  const snapshot = buildColumnLayoutSnapshot();
  setStoredWorkspaceColumns(currentWorkspaceId, snapshot);
};

const restoreBoardColumnsLayout = () => {
  if (!columnsWrap || !currentWorkspaceId) return;

  const stored = getStoredWorkspaceColumns(currentWorkspaceId);
  if (!Array.isArray(stored) || stored.length === 0) {
    Array.from(columnsWrap.querySelectorAll(".column")).forEach((column) => {
      ensureColumnMetadata(column);
    });
    setColumnDelays();
    refreshAddColumnMenuState();
    saveBoardColumnsLayout();
    return;
  }

  Array.from(columnsWrap.querySelectorAll(".column")).forEach((column) => column.remove());

  const usedColumnIds = new Set();
  const seenSpecialColumnTypes = new Set();

  stored.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;

    const columnType = normalizeStoredColumnType(entry.columnType, entry.columnId);
    const variant = getColumnCreateVariant(columnType);
    if (variant.specialized) {
      if (seenSpecialColumnTypes.has(columnType)) {
        return;
      }
      seenSpecialColumnTypes.add(columnType);
    }
    const fallbackTitle = variant.title || "Untitled";
    const title = normalizeToken(entry.title) || fallbackTitle;

    let columnId = "";
    if (variant.specialized && variant.columnId) {
      columnId = variant.columnId;
    } else {
      const candidate = normalizeToken(entry.columnId);
      if (candidate && !RESERVED_STATUS_COLUMN_IDS.has(candidate.toLowerCase())) {
        columnId = candidate;
      }
      if (!columnId || usedColumnIds.has(columnId)) {
        columnId = generateColumnId();
      }
    }

    usedColumnIds.add(columnId);

    const column = createColumn({
      title,
      columnId,
      columnType
    });
    column.style.setProperty("--delay", "0ms");
    columnsWrap.appendChild(column);
  });

  if (!columnsWrap.querySelector(".column")) {
    const fallback = createColumn({
      title: "To do",
      columnId: "todo",
      columnType: "new"
    });
    fallback.style.setProperty("--delay", "0ms");
    columnsWrap.appendChild(fallback);
  }

  setColumnDelays();
  refreshAddColumnMenuState();
  saveBoardColumnsLayout();
};

const refreshAddColumnMenuState = () => {
  if (!addColumnMenu) return;

  const options = Array.from(addColumnMenu.querySelectorAll(".board-add-column-option[data-column-type]"));
  options.forEach((option) => {
    const type = normalizeToken(option.dataset.columnType).toLowerCase();
    const variant = getColumnCreateVariant(type);
    const exists = variant.specialized ? Boolean(getExistingColumnByType(type)) : false;
    option.hidden = false;
    option.disabled = exists;
    option.setAttribute("aria-disabled", exists ? "true" : "false");
    option.classList.toggle("is-disabled", exists);
  });
};

const closeAddColumnMenu = () => {
  if (addColumnMenu) {
    addColumnMenu.setAttribute("hidden", "");
  }
  if (addColumnBtn) {
    addColumnBtn.setAttribute("aria-expanded", "false");
  }
  isAddColumnMenuOpen = false;
};

const openAddColumnMenu = () => {
  if (!addColumnMenu) return;
  refreshAddColumnMenuState();
  addColumnMenu.removeAttribute("hidden");
  if (addColumnBtn) {
    addColumnBtn.setAttribute("aria-expanded", "true");
  }
  isAddColumnMenuOpen = true;
};

const toggleAddColumnMenu = () => {
  if (isAddColumnMenuOpen) {
    closeAddColumnMenu();
    return;
  }
  openAddColumnMenu();
};

const removeColumn = (column) => {
  if (!column) return;
  const finalize = () => {
    column.remove();
    setColumnDelays();
    refreshAddColumnMenuState();
    saveBoardColumnsLayout();
  };

  if (prefersReducedMotion) {
    finalize();
    return;
  }

  const animation = column.animate(
    [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.96)" }
    ],
    { duration: 200, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
  );
  animation.addEventListener("finish", finalize);
};

const setLayoutStyle = (style) => {
  if (!board) return;
  closeAddColumnMenu();
  const nextStyle = style === "flow" ? "flow" : "columns";
  board.dataset.style = nextStyle;

  if (flowLayout) {
    flowLayout.setAttribute("aria-hidden", nextStyle !== "flow");
  }

  if (styleToggle) {
    styleToggle.setAttribute("aria-pressed", nextStyle === "flow" ? "true" : "false");
    if (nextStyle === "flow") {
      styleToggle.setAttribute("aria-label", "Переключить на Columns Board");
      styleToggle.setAttribute("title", "Переключить на Columns Board");
    } else {
      styleToggle.setAttribute("aria-label", "Переключить на Flow Map");
      styleToggle.setAttribute("title", "Переключить на Flow Map");
    }
  }

  if (styleSwitch) {
    styleSwitch.classList.toggle("is-flow", nextStyle === "flow");
  }

  if (styleToggleTitleEl) {
    styleToggleTitleEl.textContent = nextStyle === "flow" ? "Flow Map" : "Columns Board";
  }

  if (styleToggleSubEl) {
    styleToggleSubEl.textContent = "Нажмите, чтобы переключить";
  }

  if (nextStyle === "flow" && calendarLayout) {
    calendarLayout.setAttribute("aria-hidden", "true");
    calendarLayout.innerHTML = "";
  }

  requestAnimationFrame(() => {
    updateFlowLines();
  });
};

const setBoardView = (view) => {
  if (!board) return;
  closeAddColumnMenu();

  const next = view === "calendar"
    ? "calendar"
    : (view === "priority" ? "priority" : (view === "list" ? "list" : (view === "flow" ? "flow" : "board")));

  if (next === "flow") {
    setLayoutStyle("flow");
    board.dataset.view = "flow";
  } else {
    setLayoutStyle("columns");
    board.dataset.view = next;
  }

  viewButtons.forEach((btn) => {
    const isActive = (btn.dataset.view || "board") === next;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  closeToolbarPopovers();
  syncTaskStateToUi();
};

const isPanelOpen = () => appShell?.classList.contains("is-panel-open");

const setPanelOpen = (open) => {
  if (!appShell) return;
  appShell.classList.toggle("is-panel-open", open);
  if (!open) {
    closeUserMiniMenu();
  }
  if (!open && panelWorkspaceEditing && panelWorkspaceNameEl) {
    panelWorkspaceNameEl.blur();
  }
  if (brandToggle) {
    brandToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (userPanel) {
    userPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }
};

const getDefaultColumn = () =>
  document.querySelector('.column[data-column-id="todo"]') || document.querySelector(".column");

const upsertTagCache = (tag) => {
  const id = Number(tag?.id);
  const name = normalizeToken(tag?.name);
  if (!Number.isFinite(id) || !name) return;
  tagById.set(id, name);
  tagByName.set(name.toLowerCase(), { id, name });
};

const loadTagsFromApi = async () => {
  if (!currentWorkspaceId) {
    tagList = [];
    tagById.clear();
    tagByName.clear();
    tagsLoaded = true;
    return;
  }

  const tags = await fetchJsonOrNull(buildApiUrl("/tags"), "Загрузка тегов", {
    headers: { Accept: "application/json" }
  });
  if (!Array.isArray(tags)) return;

  tagList = tags
    .map((t) => ({ id: Number(t.id), name: normalizeToken(t.name) }))
    .filter((t) => Number.isFinite(t.id) && t.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  tagById.clear();
  tagByName.clear();
  tagList.forEach((t) => upsertTagCache(t));
  tagsLoaded = true;
};

const ensureTagsLoaded = async () => {
  if (tagsLoaded) return;
  await loadTagsFromApi();
};

const ensureTagId = async (name) => {
  const cleaned = normalizeToken(name).replace(/^#/, "");
  if (!cleaned) return null;

  await ensureTagsLoaded();
  const cached = tagByName.get(cleaned.toLowerCase());
  if (cached) return cached.id;

  const created = await fetchJsonOrNull(buildApiUrl("/tags"), "Создание тега", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ name: cleaned })
  });

  if (created && created.id) {
    upsertTagCache(created);
    tagList = Array.from(tagById.entries())
      .map(([id, tagName]) => ({ id, name: tagName }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return Number(created.id);
  }

  await loadTagsFromApi();
  const again = tagByName.get(cleaned.toLowerCase());
  return again ? again.id : null;
};

const resolveTagIdsForTask = async (tags) => {
  const names = [];
  const add = (value) => {
    const cleaned = normalizeToken(value).replace(/^#/, "");
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (!names.some((n) => n.toLowerCase() === key)) names.push(cleaned);
  };
  (Array.isArray(tags) ? tags : []).forEach(add);

  const ids = [];
  for (const tagName of names) {
    // eslint-disable-next-line no-await-in-loop
    const id = await ensureTagId(tagName);
    if (Number.isFinite(Number(id))) ids.push(Number(id));
  }
  return ids;
};

const buildUserItemFromApi = (user, options) => {
  const id = Number(user?.userId ?? user?.id);
  const name = normalizeToken(user?.name) || "Без имени";
  const email = normalizeToken(user?.email);
  const role = toWorkspaceRole(user?.role);

  const item = buildUserItem(name, email, { role });
  item.dataset.userId = Number.isFinite(id) ? String(id) : "";
  item.dataset.userRole = role;
  item.dataset.userKey = `${id} ${name} ${email} ${role}`.toLowerCase();
  if (options?.isCurrent) item.classList.add("is-current");

  const avatarEl = item.querySelector(".user-avatar");
  if (avatarEl) {
    const letter = (name || "U").trim().charAt(0) || "U";
    const storedAvatar = getStoredAccountAvatar(id);
    applyAccountAvatarToElement(avatarEl, null, letter.toUpperCase(), storedAvatar);
  }

  return item;
};

const setCurrentUser = (user) => {
  const id = user && Number.isFinite(Number(user.id)) ? Number(user.id) : null;
  currentUserId = id;
  currentAssigneeIdFilter = id;

  if (userList) {
    Array.from(userList.querySelectorAll(".user-item")).forEach((el) => {
      const elId = el.dataset.userId ? Number.parseInt(el.dataset.userId, 10) : null;
      const isCurrent = id !== null && Number.isFinite(elId) && elId === id;
      el.classList.toggle("is-current", isCurrent);
    });
  }
};

const setAllUsersMode = () => {
  currentUserId = null;
  currentAssigneeIdFilter = null;

  if (userList) {
    Array.from(userList.querySelectorAll(".user-item")).forEach((el) => {
      el.classList.toggle("is-current", el.dataset.userId === "");
    });
  }
};

const loadUsersFromApi = async () => {
  if (!currentWorkspaceId) {
    closeUserMiniMenu();
    if (userList) userList.innerHTML = "";
    return;
  }

  const users = await fetchJsonOrNull(buildApiUrl(`/spaces/${currentWorkspaceId}/members`), "Загрузка участников проекта", {
    headers: { Accept: "application/json" }
  });
  if (!Array.isArray(users) || !userList) return;

  if (userAddBtn) userAddBtn.disabled = !isAdmin();
  if (userAddInput) userAddInput.disabled = !isAdmin();

  userList.innerHTML = "";
  closeUserMiniMenu();

  const allItem = buildUserItem("Все участники", "Все задачи");
  allItem.dataset.userId = "";
  allItem.classList.add("is-current");
  allItem.addEventListener("click", async () => {
    closeUserMiniMenu();
    setAllUsersMode();
    await loadTasksFromApi();
  });
  userList.appendChild(allItem);

  const members = users
    .map((u) => ({
      id: Number(u.userId ?? u.id),
      name: (() => {
        const id = Number(u.userId ?? u.id);
        const apiName = normalizeToken(u.name);
        if (id === getActorUserId()) {
          const storedNickname = normalizeToken(getStoredAccountNickname(id));
          const fallbackName = apiName && apiName.toLowerCase() !== "system" ? apiName : "Без имени";
          return storedNickname || fallbackName;
        }
        return apiName;
      })(),
      email: normalizeToken(u.email),
      role: toWorkspaceRole(u.role),
      taskCount: Number(u.taskCount || 0)
    }))
    .filter((u) => Number.isFinite(u.id) && u.name && u.email)
    .sort((a, b) => a.name.localeCompare(b.name));

  workspaceMembers = members;
  renderAssigneeOptions();

  if (taskModal && !taskModal.hasAttribute("hidden") && !editingTaskId && taskAssignee instanceof HTMLSelectElement) {
    if (!normalizeToken(taskAssignee.value)) {
      renderAssigneeOptions({ defaultToActor: true });
    }
  }

  members.forEach((u) => {
    const item = buildUserItemFromApi(u);
    item.addEventListener("click", () => {
      setCurrentUser(u);
      void loadTasksFromApi();

      const actorId = getActorUserId();
      const canManage = isAdmin()
        && Number.isFinite(Number(actorId))
        && Number(u.id) !== Number(actorId)
        && u.role !== "Owner";

      openUserMiniMenu(item, u, {
        canToggleAdmin: canManage,
        canRemove: canManage
      });
    });
    userList.appendChild(item);
  });

  refreshUserFilter();
  const preservedId = Number(currentUserId);
  if (Number.isFinite(preservedId) && preservedId > 0) {
    const preservedItem = userList.querySelector(`.user-item[data-user-id="${preservedId}"]`);
    if (preservedItem instanceof Element) {
      Array.from(userList.querySelectorAll(".user-item")).forEach((el) => {
        el.classList.toggle("is-current", el === preservedItem);
      });
    } else {
      setAllUsersMode();
    }
  } else {
    setAllUsersMode();
  }
};

const updateMyMemberItem = (displayName, email) => {
  const actorId = getActorUserId();
  if (!Number.isFinite(Number(actorId))) return;
  if (!userList) return;
  const item = userList.querySelector(`.user-item[data-user-id="${actorId}"]`);
  if (!item) return;

  const safeName = normalizeToken(displayName) || "Без имени";
  const safeEmail = normalizeToken(email) || item.dataset.userEmail || "";

  const nick = item.querySelector(".user-nick");
  if (nick) nick.textContent = safeName;

  const avatar = item.querySelector(".user-avatar");
  if (avatar) {
    const letter = safeName.trim().charAt(0) || "U";
    const storedAvatar = getStoredAccountAvatar(actorId);
    applyAccountAvatarToElement(avatar, null, letter.toUpperCase(), storedAvatar);
  }

  const role = item.dataset.userRole || "";
  item.dataset.userKey = `${actorId} ${safeName} ${safeEmail} ${role}`.toLowerCase();
  refreshUserFilter();

  if (Array.isArray(workspaceMembers) && Number.isFinite(Number(actorId))) {
    const nextMembers = workspaceMembers.map((member) => {
      const id = Number(member?.id);
      if (!Number.isFinite(id) || id !== Number(actorId)) return member;
      return {
        ...member,
        name: safeName,
        email: safeEmail
      };
    });
    workspaceMembers = nextMembers;
    renderAssigneeOptions();
  }
};

const updateActorUi = () => {
  const email = actorUser?.email || "account@example.com";
  const id = getActorUserId();
  const storedNickname = id ? normalizeToken(getStoredAccountNickname(id)) : "";
  const apiName = normalizeToken(actorUser?.name);
  const fallbackName = apiName && apiName.toLowerCase() !== "system" ? apiName : "Без имени";
  const displayName = storedNickname || fallbackName;
  const initials = toInitials(displayName, email);
  const avatarDataUrl = id ? getStoredAccountAvatar(id) : "";

  if (userNameEl) {
    userNameEl.textContent = displayName || email;
    if (displayName && displayName !== email) {
      userNameEl.setAttribute("title", email);
    } else {
      userNameEl.removeAttribute("title");
    }
  }

  applyAccountAvatarToElement(accountAvatarEl, accountAvatarTextEl, initials, avatarDataUrl);
  applyAccountAvatarToElement(settingsAvatarPreview, settingsAvatarPreviewTextEl, initials, avatarDataUrl);

  updateMyMemberItem(displayName, email);

  if (settingsNicknameInput && document.activeElement !== settingsNicknameInput) {
    settingsNicknameInput.value = storedNickname;
  }
};

const setActorUser = (user) => {
  if (!user) return;
  const id = Number(user.id);
  if (!Number.isFinite(id) || id <= 0) return;
  actorUser = {
    id,
    name: normalizeToken(user.name) || `Пользователь ${id}`,
    email: normalizeToken(user.email) || `user${id}@local`
  };
  updateActorUi();
};

const setWorkspaceContext = (space) => {
  const nextWorkspaceId = Number(space?.id);
  const changed = currentWorkspaceId !== nextWorkspaceId;
  currentWorkspaceId = Number.isFinite(nextWorkspaceId) && nextWorkspaceId > 0 ? nextWorkspaceId : null;
  currentWorkspaceRole = toWorkspaceRole(space?.currentUserRole);
  const workspaceName = normalizeToken(space?.name) || "Проект";
  const avatarPath = normalizeToken(space?.avatarPath);

  if (currentWorkspaceId) {
    try {
      localStorage.setItem(STORAGE_WORKSPACE_ID, String(currentWorkspaceId));
    } catch {
      // ignore
    }
  }

  if (brandTitleEl) {
    brandTitleEl.textContent = workspaceName;
  }

  if (panelWorkspaceNameEl && !panelWorkspaceEditing) {
    panelWorkspaceNameEl.textContent = workspaceName;
  }

  if (panelWorkspaceAvatarEl) {
    if (avatarPath) {
      panelWorkspaceAvatarEl.classList.add("has-image");
      panelWorkspaceAvatarEl.style.backgroundImage = `url("${encodeURI(avatarPath).replace(/"/g, "%22")}")`;
      panelWorkspaceAvatarEl.textContent = "";
    } else {
      panelWorkspaceAvatarEl.classList.remove("has-image");
      panelWorkspaceAvatarEl.style.backgroundImage = "";
      panelWorkspaceAvatarEl.textContent = toInitials(workspaceName, "GT");
    }
  }

  if (brandMarkEl) {
    if (avatarPath) {
      brandMarkEl.classList.add("has-image");
      brandMarkEl.style.backgroundImage = `url("${encodeURI(avatarPath).replace(/"/g, "%22")}")`;
      brandMarkEl.textContent = "";
    } else {
      brandMarkEl.classList.remove("has-image");
      brandMarkEl.style.backgroundImage = "";
      brandMarkEl.textContent = toInitials(workspaceName, "GT");
    }
  }

  if (userAddBtn) userAddBtn.disabled = !isAdmin();
  if (userAddInput) userAddInput.disabled = !isAdmin();

  if (panelWorkspaceEditBtn) {
    panelWorkspaceEditBtn.disabled = !isAdmin();
    panelWorkspaceEditBtn.title = isAdmin() ? "Редактировать" : "Только администраторы могут редактировать";
  }


  if (changed) {
    tagsLoaded = false;
    tagList = [];
    tagById.clear();
    tagByName.clear();
    currentUserId = null;
    currentAssigneeIdFilter = null;
  }
};

const setAppScreen = (screen) => {
  const showBoard = screen === "board";
  if (topbar) topbar.hidden = !showBoard;
  if (board) board.hidden = !showBoard;
  if (brandToggle) brandToggle.hidden = !showBoard;
  if (viewToggle) viewToggle.hidden = !showBoard;
  if (styleSwitch) styleSwitch.hidden = !showBoard;
  if (openSpacesHomeBtn) openSpacesHomeBtn.hidden = !showBoard;
  if (!showBoard) {
    setPanelOpen(false);
  }
};

const loadCurrentUserFromApi = async () => {
  const me = await fetchJsonOrNull(buildApiUrl("/auth/me"), "Загрузка аккаунта", {
    headers: { Accept: "application/json" }
  });

  if (me && Number.isFinite(Number(me.id))) {
    setActorUser(me);
    return;
  }

  actorUser = null;
  updateActorUi();
};

const openWorkspace = async (space) => {
  if (!space) return;

  const workspaceId = Number(space?.id);
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) return;

  setWorkspaceContext(space);
  restoreBoardColumnsLayout();
  setAppScreen("board");
  await loadTagsFromApi();
  await loadUsersFromApi();
  await loadTasksFromApi();
};

const applyTaskBgToCards = (id, dataUrl) => {
  document.querySelectorAll(`.task-card[data-task-id="${id}"]`).forEach((card) => {
    if (!dataUrl) {
      card.classList.remove("has-photo");
      card.style.removeProperty("--task-photo");
      return;
    }
    card.classList.add("has-photo");
    card.style.setProperty("--task-photo", `url('${dataUrl.replace(/'/g, "%27")}')`);
  });
};

const buildUserItem = (nickname, email, options) => {
  const item = document.createElement("div");
  const safeNickname = nickname || "Без имени";
  const letter = safeNickname.trim().charAt(0) || "U";
  item.className = "user-item";
  const role = normalizeToken(options?.role);
  item.dataset.userKey = `${safeNickname} ${email} ${role}`.toLowerCase();
  item.dataset.userEmail = email;

  const avatar = document.createElement("div");
  avatar.className = "user-avatar";
  avatar.textContent = letter.toUpperCase();

  const info = document.createElement("div");
  info.className = "user-info";
  const nick = document.createElement("span");
  nick.className = "user-nick";
  nick.textContent = safeNickname;
  const mail = document.createElement("span");
  mail.className = "user-email";
  mail.textContent = email;
  mail.title = email;
  info.append(nick, mail);

  item.append(avatar, info);

  const actions = document.createElement("div");
  actions.className = "user-item-actions";

  if (role) {
    const roleEl = document.createElement("span");
    roleEl.className = "user-role";
    roleEl.textContent = getRoleLabel(role);
    actions.appendChild(roleEl);
  }

  if (actions.childElementCount > 0) {
    item.appendChild(actions);
  }

  return item;
};

let activeUserMiniMenu = null;
let activeUserMiniMenuUserId = null;
let activeUserMiniMenuAnchor = null;

const closeUserMiniMenu = () => {
  if (activeUserMiniMenuAnchor) {
    activeUserMiniMenuAnchor.classList.remove("is-menu-open");
  }
  if (activeUserMiniMenu instanceof Element) {
    activeUserMiniMenu.remove();
  }
  activeUserMiniMenu = null;
  activeUserMiniMenuUserId = null;
  activeUserMiniMenuAnchor = null;
};

const profileModal = document.getElementById("profile-modal");
const profileUserNameEl = document.getElementById("profile-user-name");
const profileAvatarEl = document.getElementById("profile-avatar");
const profileAvatarTextEl = document.getElementById("profile-avatar-text");
const profileUserEmailEl = document.getElementById("profile-user-email");
const profileUserRoleEl = document.getElementById("profile-user-role");

const profileStatusesChartEl = document.getElementById("profile-statuses-chart");
const profileStatusesRoot = document.getElementById("profile-statuses");
const profileStatusesEmptyEl = document.getElementById("profile-statuses-empty");

const profileOverdueRoot = document.getElementById("profile-overdue");
const profileOverdueEmptyEl = document.getElementById("profile-overdue-empty");
const profileOverdueNoteEl = document.getElementById("profile-overdue-note");

const profileAvgValueEl = document.getElementById("profile-avg-value");
const profileAvgSubEl = document.getElementById("profile-avg-sub");
const profileAvgChartEl = document.getElementById("profile-avg-chart");

let profileReportsRequestSeq = 0;

const avatarModal = document.getElementById("avatar-modal");
const avatarModalTitleEl = document.getElementById("avatar-modal-title");
const avatarModalAvatarEl = document.getElementById("avatar-modal-avatar");
const avatarModalAvatarTextEl = document.getElementById("avatar-modal-avatar-text");

let activeProfileMember = null;

const isProfileModalOpen = () => Boolean(profileModal && !profileModal.hasAttribute("hidden"));

const closeProfileModal = () => {
  if (!isProfileModalOpen()) return false;
  profileModal.setAttribute("hidden", "");
  activeProfileMember = null;
  profileReportsRequestSeq += 1;
  return true;
};

const formatDurationCompact = (ms) => {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "0м";
  const totalMinutes = Math.floor(value / 60000);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}м`);
  return parts.join(" ") || "0м";
};

const formatShortDateTimeRu = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  try {
    return d.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toISOString();
  }
};

const renderProfileStatusChart = (countsByStatus) => {
  if (!profileStatusesChartEl) return;
  profileStatusesChartEl.innerHTML = "";

  const entries = Array.from(countsByStatus.entries())
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((acc, [, count]) => acc + Number(count || 0), 0);
  if (!total) return;

  const width = 520;
  const height = 22;
  const pad = 2;
  const innerWidth = width - pad * 2;
  const gap = 3;
  const segCount = entries.length;
  const available = Math.max(0, innerWidth - (segCount > 1 ? gap * (segCount - 1) : 0));
  if (!available) return;

  const colors = {
    1: "rgba(120, 182, 255, 0.92)",
    2: "rgba(250, 204, 21, 0.92)",
    3: "rgba(74, 222, 128, 0.92)",
    4: "rgba(248, 113, 113, 0.92)"
  };

  const base = entries.map(([statusValue, count]) => {
    const value = Number(count || 0);
    const raw = (value / total) * available;
    return {
      statusValue,
      count: value,
      raw,
      frac: raw - Math.floor(raw),
      width: 0,
      color: colors[statusValue] || "rgba(185, 196, 216, 0.82)"
    };
  });

  const minWidth = available >= segCount ? 1 : 0;
  base.forEach((s) => {
    s.width = Math.max(minWidth, Math.floor(s.raw));
  });
  const sumWidth = base.reduce((acc, s) => acc + s.width, 0);
  let remainder = available - sumWidth;
  if (remainder > 0) {
    base.slice().sort((a, b) => b.frac - a.frac).slice(0, remainder).forEach((s) => { s.width += 1; });
  } else if (remainder < 0) {
    let toRemove = -remainder;
    const ordered = base.slice().sort((a, b) => a.frac - b.frac);
    for (const s of ordered) {
      if (toRemove <= 0) break;
      const canRemove = Math.max(0, s.width - minWidth);
      const delta = Math.min(canRemove, toRemove);
      s.width -= delta;
      toRemove -= delta;
    }
  }

  const segments = base.filter((s) => s.width > 0);
  let cursor = pad;
  segments.forEach((s, idx) => {
    s.x = cursor;
    cursor += s.width;
    if (idx !== segments.length - 1) cursor += gap;
  });

  const segRects = segments.map((s) => {
    const title = `${STATUS_LABELS[s.statusValue] || "Статус"}: ${s.count}`;
    return `<rect x="${s.x}" y="${pad}" width="${s.width}" height="${height - pad * 2}" rx="10" fill="${s.color}"><title>${title}</title></rect>`;
  }).join("");

  profileStatusesChartEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма статусов">
      <defs>
        <clipPath id="profile-status-bar-clip">
          <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${height - pad * 2}" rx="10" />
        </clipPath>
      </defs>
      <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${height - pad * 2}" rx="10" fill="rgba(255, 255, 255, 0.06)" />
      <g clip-path="url(#profile-status-bar-clip)">
        ${segRects}
      </g>
    </svg>
  `;
};

const clearProfileReportsUi = () => {
  if (profileStatusesChartEl) profileStatusesChartEl.innerHTML = "";
  if (profileStatusesRoot) profileStatusesRoot.innerHTML = "";
  if (profileStatusesEmptyEl) profileStatusesEmptyEl.hidden = true;

  if (profileOverdueRoot) profileOverdueRoot.innerHTML = "";
  if (profileOverdueEmptyEl) profileOverdueEmptyEl.hidden = true;
  if (profileOverdueNoteEl) {
    profileOverdueNoteEl.textContent = "";
    profileOverdueNoteEl.hidden = true;
  }

  if (profileAvgValueEl) profileAvgValueEl.textContent = "-";
  if (profileAvgSubEl) profileAvgSubEl.textContent = "-";
  if (profileAvgChartEl) profileAvgChartEl.innerHTML = "";
};

const renderProfileReportsLoading = () => {
  clearProfileReportsUi();
  if (profileStatusesEmptyEl) {
    profileStatusesEmptyEl.textContent = "Загрузка...";
    profileStatusesEmptyEl.hidden = false;
  }
  if (profileOverdueEmptyEl) {
    profileOverdueEmptyEl.textContent = "Загрузка...";
    profileOverdueEmptyEl.hidden = false;
  }
  if (profileAvgValueEl) profileAvgValueEl.textContent = "Загрузка...";
  if (profileAvgSubEl) profileAvgSubEl.textContent = "";
};

const fetchTasksForAssignee = async (assigneeId) => {
  if (!currentWorkspaceId) return null;
  const id = Number.parseInt(String(assigneeId ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return [];

  const response = await apiFetch(buildApiUrl("/tasks", { assigneeId: id }), {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    await handleApiError(response, "Загрузка задач пользователя");
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const renderProfileReports = async (member) => {
  const memberId = Number(member?.id);
  if (!Number.isFinite(memberId) || memberId <= 0) return;

  profileReportsRequestSeq += 1;
  const seq = profileReportsRequestSeq;
  renderProfileReportsLoading();

  const tasks = await fetchTasksForAssignee(memberId);
  if (seq !== profileReportsRequestSeq || !isProfileModalOpen()) return;
  if (!Array.isArray(tasks)) {
    clearProfileReportsUi();
    if (profileStatusesEmptyEl) {
      profileStatusesEmptyEl.textContent = "Не удалось загрузить";
      profileStatusesEmptyEl.hidden = false;
    }
    if (profileOverdueEmptyEl) {
      profileOverdueEmptyEl.textContent = "Не удалось загрузить";
      profileOverdueEmptyEl.hidden = false;
    }
    if (profileAvgValueEl) profileAvgValueEl.textContent = "Недостаточно данных для расчёта";
    if (profileAvgSubEl) profileAvgSubEl.textContent = "";
    return;
  }

  // Statuses
  const counts = new Map();
  tasks.forEach((task) => {
    const statusValue = toStatusValue(task?.status ?? task?.statusValue);
    counts.set(statusValue, (counts.get(statusValue) || 0) + 1);
  });

  if (profileStatusesRoot) {
    profileStatusesRoot.innerHTML = "";
    const present = Array.from(counts.entries()).filter(([, c]) => Number(c) > 0).sort((a, b) => a[0] - b[0]);
    if (!present.length) {
      if (profileStatusesEmptyEl) {
        profileStatusesEmptyEl.textContent = "Нет задач.";
        profileStatusesEmptyEl.hidden = false;
      }
    } else {
      if (profileStatusesEmptyEl) profileStatusesEmptyEl.hidden = true;
      present.forEach(([statusValue, count]) => {
        const el = document.createElement("div");
        el.className = "profile-status-pill";
        el.dataset.kind = String(statusValue);
        el.innerHTML = `
          <div class="profile-status-title">${STATUS_LABELS[statusValue] || "Статус"}</div>
          <div class="profile-status-value">${Number(count)}</div>
        `;
        profileStatusesRoot.appendChild(el);
      });
    }
  }
  renderProfileStatusChart(counts);

  // Overdue
  const now = Date.now();
  const overdueAll = tasks.filter((task) => {
    const statusValue = toStatusValue(task?.status ?? task?.statusValue);
    if (statusValue === 3) return false;
    if (statusValue === 4) return true;
    if (task?.isOverdue === true) return true;
    const due = task?.dueDate ? new Date(task.dueDate) : null;
    if (!due || Number.isNaN(due.getTime())) return false;
    return due.getTime() < now;
  });

  let missingDueCount = 0;
  const overdueWithDue = overdueAll
    .map((task) => {
      const due = task?.dueDate ? new Date(task.dueDate) : null;
      if (!due || Number.isNaN(due.getTime())) {
        missingDueCount += 1;
        return null;
      }
      const overdueMs = Math.max(0, now - due.getTime());
      return {
        id: Number(task?.id),
        title: normalizeToken(task?.title) || "Задача",
        dueDate: task?.dueDate,
        overdueMs
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.overdueMs - a.overdueMs);

  if (profileOverdueRoot) {
    profileOverdueRoot.innerHTML = "";
    if (!overdueAll.length) {
      if (profileOverdueEmptyEl) {
        profileOverdueEmptyEl.textContent = "Нет просроченных задач.";
        profileOverdueEmptyEl.hidden = false;
      }
    } else if (!overdueWithDue.length) {
      if (profileOverdueEmptyEl) {
        profileOverdueEmptyEl.textContent = "Недостаточно данных для расчёта";
        profileOverdueEmptyEl.hidden = false;
      }
      if (profileOverdueNoteEl) {
        profileOverdueNoteEl.textContent = "Есть просроченные задачи, но у них не указан корректный срок.";
        profileOverdueNoteEl.hidden = false;
      }
    } else {
      if (profileOverdueEmptyEl) profileOverdueEmptyEl.hidden = true;
      if (missingDueCount > 0 && profileOverdueNoteEl) {
        profileOverdueNoteEl.textContent = `Недостаточно данных для расчёта для ${missingDueCount} задач без срока.`;
        profileOverdueNoteEl.hidden = false;
      }

      overdueWithDue.slice(0, 8).forEach((task) => {
        const item = document.createElement("div");
        item.className = "profile-overdue-item";
        const safeTitle = task.title;
        item.innerHTML = `
          <div class="profile-overdue-title" title="${safeTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}">${safeTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <div class="profile-overdue-meta">
            <span class="profile-overdue-late">${formatDurationCompact(task.overdueMs)}</span>
            <span>${formatShortDateTimeRu(task.dueDate)}</span>
          </div>
        `;
        profileOverdueRoot.appendChild(item);
      });
    }
  }

  // Avg completion
  const samples = tasks
    .map((task) => {
      const createdAt = task?.createdAt ? new Date(task.createdAt) : null;
      const completedAt = task?.completedAt ? new Date(task.completedAt) : null;
      if (!createdAt || !completedAt) return null;
      if (Number.isNaN(createdAt.getTime()) || Number.isNaN(completedAt.getTime())) return null;
      const ms = completedAt.getTime() - createdAt.getTime();
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return ms;
    })
    .filter((ms) => Number.isFinite(ms));

  if (!samples.length) {
    if (profileAvgValueEl) profileAvgValueEl.textContent = "Недостаточно данных для расчёта";
    if (profileAvgSubEl) profileAvgSubEl.textContent = "Нет завершённых задач";
    if (profileAvgChartEl) {
      profileAvgChartEl.innerHTML = `
        <svg viewBox="0 0 520 42" width="100%" height="42" role="img" aria-label="Диаграмма времени выполнения">
          <text x="0" y="28" font-size="13" fill="rgba(127, 139, 161, 0.92)">Недостаточно данных для диаграммы</text>
        </svg>
      `;
    }
  } else {
    const avg = samples.reduce((acc, ms) => acc + ms, 0) / samples.length;
    if (profileAvgValueEl) profileAvgValueEl.textContent = formatDurationCompact(avg);
    if (profileAvgSubEl) profileAvgSubEl.textContent = `Завершённых задач: ${samples.length}`;

    if (profileAvgChartEl) {
      const bins = [
        { title: "<1д", from: 0, to: 24 * 60 * 60 * 1000 },
        { title: "1-2д", from: 24 * 60 * 60 * 1000, to: 2 * 24 * 60 * 60 * 1000 },
        { title: "2-3д", from: 2 * 24 * 60 * 60 * 1000, to: 3 * 24 * 60 * 60 * 1000 },
        { title: "3-5д", from: 3 * 24 * 60 * 60 * 1000, to: 5 * 24 * 60 * 60 * 1000 },
        { title: "5-7д", from: 5 * 24 * 60 * 60 * 1000, to: 7 * 24 * 60 * 60 * 1000 },
        { title: "7-14д", from: 7 * 24 * 60 * 60 * 1000, to: 14 * 24 * 60 * 60 * 1000 },
        { title: ">14д", from: 14 * 24 * 60 * 60 * 1000, to: Number.POSITIVE_INFINITY }
      ];
      const counts = bins.map((bin) => samples.filter((ms) => ms >= bin.from && ms < bin.to).length);
      const maxCount = Math.max(...counts, 1);

      const width = 520;
      const height = 86;
      const pad = 8;
      const chartHeight = 50;
      const gap = 8;
      const barWidth = Math.floor((width - pad * 2 - gap * (bins.length - 1)) / bins.length);
      const baseY = pad + chartHeight;

      const bars = bins.map((bin, idx) => {
        const count = counts[idx];
        const h = Math.round((count / maxCount) * chartHeight);
        const x = pad + idx * (barWidth + gap);
        const y = baseY - h;
        const title = `${bin.title}: ${count}`;
        return `
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="8" fill="rgba(68, 210, 199, 0.92)"><title>${title}</title></rect>
          <text x="${x + barWidth / 2}" y="${pad + chartHeight + 22}" text-anchor="middle" font-size="11" fill="rgba(127, 139, 161, 0.92)">${bin.title}</text>
        `;
      }).join("");

      profileAvgChartEl.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма времени выполнения">
          ${bars}
        </svg>
      `;
    }
  }
};

const isAvatarModalOpen = () => Boolean(avatarModal && !avatarModal.hasAttribute("hidden"));

const closeAvatarModal = () => {
  if (!isAvatarModalOpen()) return false;
  avatarModal.setAttribute("hidden", "");
  return true;
};

const openAvatarModal = (member) => {
  if (!avatarModal || !avatarModalAvatarEl) return;

  const id = Number(member?.id);
  const name = normalizeToken(member?.name) || "Пользователь";
  const email = normalizeToken(member?.email) || "";
  const initials = toInitials(name || email, "U");
  const storedAvatar = getStoredAccountAvatar(id);

  if (avatarModalTitleEl) avatarModalTitleEl.textContent = name;
  applyAccountAvatarToElement(avatarModalAvatarEl, avatarModalAvatarTextEl, initials, storedAvatar);

  avatarModal.removeAttribute("hidden");
  window.setTimeout(() => {
    const btn = avatarModal.querySelector("button[data-close-avatar]");
    if (btn instanceof HTMLElement) {
      btn.focus();
    }
  }, 0);
};

const openProfileModal = (member) => {
  if (!profileModal) {
    const name = normalizeToken(member?.name) || "Пользователь";
    const email = normalizeToken(member?.email) || "-";
    const role = normalizeToken(member?.role) || "Member";
    window.alert(`${name}\n\nПочта: ${email}\nРоль: ${getRoleLabel(role)}`);
    return;
  }

  const id = Number(member?.id);
  const name = normalizeToken(member?.name) || "Пользователь";
  const email = normalizeToken(member?.email) || "-";
  const role = normalizeToken(member?.role) || "Member";
  const initials = toInitials(name || email, "U");
  const storedAvatar = getStoredAccountAvatar(id);

  activeProfileMember = {
    id,
    name,
    email,
    role
  };

  if (profileUserNameEl) profileUserNameEl.textContent = name;
  if (profileUserEmailEl) profileUserEmailEl.textContent = email;
  if (profileUserRoleEl) profileUserRoleEl.textContent = getRoleLabel(role);
  applyAccountAvatarToElement(profileAvatarEl, profileAvatarTextEl, initials, storedAvatar);

  profileModal.removeAttribute("hidden");
  void renderProfileReports(activeProfileMember);
  window.setTimeout(() => {
    const btn = profileModal.querySelector("button[data-close-profile]");
    if (btn instanceof HTMLElement) {
      btn.focus();
    }
  }, 0);
};

if (profileAvatarEl) {
  profileAvatarEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeProfileMember) return;
    openAvatarModal(activeProfileMember);
  });
}

const WORKSPACE_ROLE_VALUES = {
  Member: 1,
  Admin: 2,
  Owner: 3
};

const setUserMiniMenuBusy = (menu, busy) => {
  if (!(menu instanceof Element)) return;
  menu.classList.toggle("is-busy", Boolean(busy));
  menu.querySelectorAll("button").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    if (btn.dataset.keepEnabled === "true") return;
    btn.disabled = Boolean(busy);
  });
};

const buildUserMiniMenu = (member, options) => {
  const menu = document.createElement("div");
  menu.className = "user-mini-menu";
  menu.setAttribute("role", "menu");
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const header = document.createElement("div");
  header.className = "user-mini-menu-header";

  const meta = document.createElement("div");
  meta.className = "user-mini-menu-meta";
  const nameEl = document.createElement("div");
  nameEl.className = "user-mini-menu-name";
  nameEl.textContent = normalizeToken(member?.name) || "Пользователь";
  const emailEl = document.createElement("div");
  emailEl.className = "user-mini-menu-email";
  emailEl.textContent = normalizeToken(member?.email) || "";
  meta.append(nameEl, emailEl);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn user-mini-menu-close";
  closeBtn.dataset.keepEnabled = "true";
  closeBtn.setAttribute("aria-label", "Закрыть меню");
  closeBtn.title = "Закрыть";
  closeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  `;
  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeUserMiniMenu();
  });

  header.append(meta, closeBtn);

  const actions = document.createElement("div");
  actions.className = "user-mini-menu-actions";

  const profileBtn = document.createElement("button");
  profileBtn.type = "button";
  profileBtn.className = "ghost-btn";
  profileBtn.textContent = "Открыть профиль";
  profileBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeUserMiniMenu();
    openProfileModal(member);
  });
  actions.appendChild(profileBtn);

  const toggleAdminBtn = document.createElement("button");
  toggleAdminBtn.type = "button";
  toggleAdminBtn.className = "ghost-btn";
  const currentRole = normalizeToken(member?.role) || "Member";
  toggleAdminBtn.textContent = currentRole === "Admin" ? "Забрать администратора" : "Дать администратора";

  if (!options?.canToggleAdmin) {
    toggleAdminBtn.disabled = true;
    toggleAdminBtn.title = "Недоступно";
  }

  toggleAdminBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (toggleAdminBtn.disabled) return;
    void (async () => {
      const userId = Number(member?.id);
      if (!Number.isFinite(userId) || !currentWorkspaceId) return;
      const nextRoleValue = currentRole === "Admin" ? WORKSPACE_ROLE_VALUES.Member : WORKSPACE_ROLE_VALUES.Admin;

      setUserMiniMenuBusy(menu, true);
      const updated = await fetchJsonOrNull(buildApiUrl(`/spaces/${currentWorkspaceId}/members`), "Изменение роли участника", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ userId, role: nextRoleValue })
      });
      setUserMiniMenuBusy(menu, false);

      if (!updated) {
        return;
      }
      closeUserMiniMenu();
      await loadUsersFromApi();
    })();
  });
  actions.appendChild(toggleAdminBtn);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "danger-btn";
  removeBtn.textContent = "Удалить";

  if (!options?.canRemove) {
    removeBtn.disabled = true;
    removeBtn.title = "Недоступно";
  }

  removeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (removeBtn.disabled) return;
    void (async () => {
      const userId = Number(member?.id);
      if (!Number.isFinite(userId) || !currentWorkspaceId) return;

      const displayName = normalizeToken(member?.name) || normalizeToken(member?.email) || `#${userId}`;
      const confirmed = await openConfirmModal({
        kicker: "Удаление участника",
        title: `Удалить "${displayName}"?`,
        message: "Пользователь потеряет доступ к задачам этого проекта.",
        confirmText: "Удалить"
      });
      if (confirmed !== true) return;

      setUserMiniMenuBusy(menu, true);
      const response = await apiFetch(buildApiUrl(`/spaces/${currentWorkspaceId}/members/${userId}`), {
        method: "DELETE"
      });
      setUserMiniMenuBusy(menu, false);

      if (!response.ok) {
        await handleApiError(response, "Удаление участника");
        return;
      }

      closeUserMiniMenu();
      await loadUsersFromApi();
      await loadTasksFromApi();
    })();
  });
  actions.appendChild(removeBtn);

  menu.append(header, actions);
  return menu;
};

const openUserMiniMenu = (anchor, member, options) => {
  const userId = Number(member?.id);
  if (!Number.isFinite(userId) || !(anchor instanceof Element)) return;

  if (activeUserMiniMenuUserId === userId && activeUserMiniMenu instanceof Element) {
    closeUserMiniMenu();
    return;
  }

  closeUserMiniMenu();

  anchor.classList.add("is-menu-open");
  const menu = buildUserMiniMenu(member, options);
  anchor.after(menu);

  activeUserMiniMenu = menu;
  activeUserMiniMenuUserId = userId;
  activeUserMiniMenuAnchor = anchor;
};

const refreshUserFilter = () => {
  if (!userList) return;
  closeUserMiniMenu();
  const query = normalizeToken(userSearch?.value).toLowerCase();
  const items = Array.from(userList.querySelectorAll(".user-item"));
  let visible = 0;
  items.forEach((item) => {
    const key = item.dataset.userKey || "";
    const match = !query || key.includes(query);
    item.style.display = match ? "" : "none";
    if (match) visible += 1;
  });
  if (userEmpty) {
    userEmpty.hidden = visible > 0;
  }
};

const setTaskCardAttachmentCount = (card, count) => {
  if (!card) return;
  const indicator = card.querySelector(".task-attachment-indicator");
  const countEl = card.querySelector(".task-attachment-count");
  const n = Number(count);
  const has = Number.isFinite(n) && n > 0;
  if (indicator) {
    indicator.hidden = !has;
    indicator.title = has ? `Вложений: ${n}` : "";
  }
  if (countEl) {
    countEl.textContent = has ? String(n) : "";
  }
  card.dataset.attachmentCount = has ? String(n) : "0";
};

const applyAttachmentCountToCards = (id, count) => {
  const taskId = Number.parseInt(String(id || ""), 10);
  const normalizedCount = Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : 0;
  if (Number.isFinite(taskId)) {
    lastNormalizedTasks = lastNormalizedTasks.map((task) => {
      const currentId = Number.parseInt(String(task?.id ?? ""), 10);
      if (!Number.isFinite(currentId) || currentId !== taskId) return task;
      return {
        ...task,
        attachmentCount: normalizedCount
      };
    });
  }

  document.querySelectorAll(`.task-card[data-task-id="${id}"]`).forEach((card) => {
    setTaskCardAttachmentCount(card, normalizedCount);
  });
};

const isAdmin = () => MANAGE_ROLES.has(String(currentWorkspaceRole || ""));

const shouldShowTrashZone = () => {
  if (!taskTrashZone || !board) return false;
  if (!isAdmin()) return false;
  if (board.dataset.style !== "columns") return false;
  if (board.dataset.view === "calendar" || board.dataset.view === "priority") return false;
  return true;
};

const setTrashZoneVisible = (visible) => {
  if (!taskTrashZone) return;
  const show = Boolean(visible && shouldShowTrashZone());
  taskTrashZone.classList.toggle("is-visible", show);
  taskTrashZone.setAttribute("aria-hidden", show ? "false" : "true");
  if (styleSwitch) {
    styleSwitch.classList.toggle("has-trash-zone", show);
  }
  if (!show) {
    taskTrashZone.classList.remove("is-over");
  }
};

const setTrashZoneOver = (over) => {
  if (!taskTrashZone) return;
  taskTrashZone.classList.toggle("is-over", Boolean(over));
};

let confirmResolve = null;

const isConfirmModalOpen = () => Boolean(confirmModal && !confirmModal.hasAttribute("hidden"));

const closeConfirmModal = (result = false) => {
  if (!isConfirmModalOpen()) return false;
  confirmModal.setAttribute("hidden", "");
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(Boolean(result));
  }
  return true;
};

const openConfirmModal = (options) => {
  const title = normalizeToken(options?.title) || "Вы уверены?";
  const message = normalizeToken(options?.message) || "Это действие нельзя отменить.";
  const kicker = normalizeToken(options?.kicker) || "Подтвердите действие";
  const confirmText = normalizeToken(options?.confirmText) || "Удалить";

  if (!confirmModal || !confirmModalTitleEl || !confirmModalMessageEl || !confirmModalAcceptBtn || !confirmModalCancelBtn) {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(false);
  }

  if (confirmModalKickerEl) {
    confirmModalKickerEl.textContent = kicker;
  }
  confirmModalTitleEl.textContent = title;
  confirmModalMessageEl.textContent = message;
  confirmModalAcceptBtn.textContent = confirmText;
  confirmModal.removeAttribute("hidden");

  window.setTimeout(() => {
    if (isConfirmModalOpen()) {
      confirmModalCancelBtn.focus();
    }
  }, 0);

  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
};

const collectTagOptions = () => {
  const map = new Map();
  tagList.forEach((t) => addUniqueToken(map, t.name));
  return Array.from(map.values());
};

const renderTagPreview = (tags) => {
  if (!tagPreview) return;
  tagPreview.innerHTML = "";
  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "task-chip";
    chip.textContent = tag;
    tagPreview.appendChild(chip);
  });
};

const renderTagOptions = () => {
  if (!tagOptions) return;
  const tags = collectTagOptions();
  tagOptions.innerHTML = "";
  if (!tags.length) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = "Пока нет тегов";
    tagOptions.appendChild(empty);
    return;
  }
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-option";
    button.textContent = tag;
    button.addEventListener("click", () => {
      if (!taskTagsInput) return;
      const existing = parseTags(taskTagsInput.value);
      const map = new Map();
      existing.forEach((value) => addUniqueToken(map, value));
      addUniqueToken(map, tag);
      const nextTags = Array.from(map.values());
      taskTagsInput.value = nextTags.map((value) => `#${value}`).join(" ");
      renderTagPreview(nextTags);
    });
    tagOptions.appendChild(button);
  });
};

const setTaskStatusMode = (mode, statusValue) => {
  if (!taskStatus) return;
  const nextStatus = toStatusValue(statusValue);
  taskStatus.value = String(nextStatus);
  taskStatus.disabled = mode !== "edit";
};

const setTaskModalMode = (mode, title) => {
  const isEdit = mode === "edit";
  if (taskModalKicker) {
    taskModalKicker.textContent = isEdit ? "Редактирование задачи" : "Создание задачи";
  }
  if (taskModalTitleEl) {
    if (isEdit) {
      taskModalTitleEl.textContent = normalizeToken(title) || "Редактирование задачи";
    } else {
      taskModalTitleEl.textContent = "Новая задача";
    }
  }
  if (taskFormSubmitBtn) {
    taskFormSubmitBtn.textContent = isEdit ? "Сохранить изменения" : "Сохранить задачу";
  }
};

const openTaskModal = (column) => {
  if (!taskModal || !taskForm) return;
  editingTaskId = null;
  editingTaskCard = null;
  setTaskModalMode("create");
  activeTaskColumn = column || getDefaultColumn();
  taskForm.reset();
  if (taskTagsInput) {
    taskTagsInput.value = "";
  }
  if (taskDue) {
    taskDue.value = getDefaultDueDateLocalValue();
  }
  if (taskAssignee) {
    renderAssigneeOptions({ defaultToActor: true });
  }
  setTaskStatusMode("create", 1);
  renderTagOptions();
  renderTagPreview([]);
  taskModal.removeAttribute("hidden");
  window.setTimeout(() => {
    taskTitle?.focus();
  }, 0);
};

const openTaskModalForEdit = (card) => {
  if (!taskModal || !taskForm) return;
  if (!(card instanceof Element) || card.classList.contains("is-empty")) return;
  const id = Number.parseInt(card.dataset.taskId || "", 10);
  if (!Number.isFinite(id)) return;

  editingTaskId = id;
  editingTaskCard = card;
  activeTaskColumn = card.closest(".column") || getDefaultColumn();

  taskForm.reset();

  const meta = getStoredTaskMeta(id);
  const title = normalizeToken(card.querySelector("h3")?.textContent);
  const description = normalizeToken(card.querySelector(".task-text")?.textContent);
  const tags = Array.isArray(meta?.tags) && meta.tags.length
    ? meta.tags
    : Array.from(card.querySelectorAll(".task-chip"))
      .map((chip) => normalizeToken(chip.textContent))
      .filter(Boolean);

  const statusValue = toStatusValue(card.dataset.taskStatus);
  setTaskStatusMode("edit", statusValue);
  if (taskTitle) taskTitle.value = title;
  if (taskDescription) taskDescription.value = description;

  const dueLocal = toDateTimeLocalValue(card.dataset.dueDate) || getDefaultDueDateLocalValue();
  if (taskDue) taskDue.value = dueLocal;

  if (taskAssignee) {
    renderAssigneeOptions({ selectedValue: normalizeToken(card.dataset.assigneeId) });
  }
  if (taskPriority) {
    taskPriority.value = normalizeToken(card.dataset.priorityValue) || `${DEFAULT_PRIORITY_VALUE}`;
  }
  if (taskTagsInput) {
    taskTagsInput.value = tags
      .map((value) => normalizeToken(value).replace(/\s+/g, "-"))
      .filter(Boolean)
      .map((value) => `#${value}`)
      .join(" ");
  }

  renderTagOptions();
  renderTagPreview(tags);
  setTaskModalMode("edit", title);

  taskModal.removeAttribute("hidden");
  window.setTimeout(() => {
    taskTitle?.focus();
  }, 0);
};

const closeTaskModal = () => {
  if (!taskModal) return;
  taskModal.setAttribute("hidden", "");
  setTaskStatusMode("create", 1);
  activeTaskColumn = null;
  editingTaskId = null;
  editingTaskCard = null;
  setTaskModalMode("create");
};

const createTaskCard = (taskData) => {
  const card = document.createElement("article");
  card.className = "task-card";
  card.style.setProperty("--delay", "0ms");

  const statusValue = toStatusValue(taskData.statusValue ?? taskData.status);
  const priorityValue = toPriorityValue(taskData.priorityValue ?? taskData.priority);
  card.dataset.priority = getPriorityLabel(priorityValue);
  card.dataset.priorityValue = String(priorityValue);
  card.dataset.taskStatus = String(statusValue);
  if (taskData.id !== undefined && taskData.id !== null) {
    card.dataset.taskId = String(taskData.id);
  }
  if (taskData.assigneeId !== undefined && taskData.assigneeId !== null) {
    card.dataset.assigneeId = String(taskData.assigneeId);
  }
  if (taskData.dueDate) {
    const dueDate = new Date(taskData.dueDate);
    if (!Number.isNaN(dueDate.getTime())) {
      card.dataset.dueDate = dueDate.toISOString();
    }
  }
  if (Array.isArray(taskData.tagIds)) {
    card.dataset.tagIds = taskData.tagIds.join(",");
  } else {
    card.dataset.tagIds = "";
  }

  const attachmentCount = Number(taskData?.attachmentCount);
  card.dataset.attachmentCount = Number.isFinite(attachmentCount) && attachmentCount > 0
    ? String(attachmentCount)
    : "0";

  const dueIso = card.dataset.dueDate || taskData.dueDate;
  const urgency = getUrgency(dueIso, statusValue);
  if (urgency && urgency !== URGENCY.none) {
    card.dataset.urgency = urgency;
  } else {
    delete card.dataset.urgency;
  }

  if (taskData.id !== undefined && taskData.id !== null) {
    const storedBg = getStoredTaskBg(taskData.id);
    if (storedBg) {
      card.classList.add("has-photo");
      card.style.setProperty("--task-photo", `url('${storedBg.replace(/'/g, "%27")}')`);
    }
  }

  const head = document.createElement("div");
  head.className = "task-head";
  const tag = document.createElement("span");
  tag.className = "task-tag";
  tag.textContent = STATUS_LABELS[statusValue] || "Новая";
  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = formatCardDueLabel(card.dataset.dueDate || taskData.dueDate, statusValue);

  const meta = document.createElement("div");
  meta.className = "task-head-meta";

  const attachments = document.createElement("span");
  attachments.className = "task-attachment-indicator";
  attachments.hidden = true;
  attachments.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a6 6 0 0 1-8.5-8.5l9.2-9.2a4.5 4.5 0 0 1 6.4 6.4l-9.2 9.2a3 3 0 0 1-4.2-4.2l8.6-8.6" />
    </svg>
    <span class="task-attachment-count"></span>
  `;

  meta.append(time, attachments);
  head.append(tag, meta);

  const title = document.createElement("h3");
  title.textContent = taskData.title || "Задача без названия";
  const text = document.createElement("p");
  text.className = "task-text";
  text.textContent = taskData.description || "";

  const footer = document.createElement("div");
  footer.className = "task-footer";
  const tags = Array.isArray(taskData.tags) ? taskData.tags : [];
  tags.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "task-chip";
    chip.textContent = item;
    footer.appendChild(chip);
  });

  card.append(head, title, text, footer);
  initTaskCard(card);
  if (taskData.id !== undefined && taskData.id !== null) {
    setTaskCardAttachmentCount(card, Number(card.dataset.attachmentCount || 0));
  }
  return card;
};

const createFlowTaskItem = (taskData) => {
  const item = document.createElement("div");
  item.className = "flow-task";
  item.setAttribute("draggable", "true");
  const statusValue = toStatusValue(taskData?.statusValue ?? taskData?.status);
  const note = buildFlowNote(taskData);
  const statusLabel = getFlowStatusLabel(statusValue);
  item.dataset.taskTitle = taskData.title || "New task";
  item.dataset.taskTag = statusLabel;
  item.dataset.taskNote = note;
  item.dataset.taskDescription = taskData.description || "";
  if (taskData.id !== undefined && taskData.id !== null) {
    item.dataset.taskId = String(taskData.id);
  }
  item.dataset.taskKey = buildTaskKey({
    title: item.dataset.taskTitle,
    tag: item.dataset.taskTag,
    note: item.dataset.taskNote
  });
  if (taskData.dueDate) item.dataset.taskDueDate = taskData.dueDate;
  item.dataset.taskUrgency = getUrgency(taskData.dueDate, statusValue);

  const tag = document.createElement("span");
  tag.className = "flow-task-tag";
  tag.textContent = statusLabel;
  const title = document.createElement("span");
  title.className = "flow-task-title";
  title.textContent = taskData.title || "New task";
  const noteEl = document.createElement("span");
  noteEl.className = "flow-task-note";
  noteEl.textContent = note;

  item.append(tag, title, noteEl);
  return item;
};

const flowEditorController = createFlowEditorController({
  flowCanvas,
  flowLinks,
  flowDropzone,
  flowListItems,
  clampValue,
  normalizeToken,
  buildTaskKey,
  buildFlowNote,
  getFlowStatusLabel,
  getTasks: () => lastNormalizedTasks,
  createFlowTaskItem
});

const {
  updateFlowEmptyState,
  updateFlowLines,
  initFlowTask,
  rebuildFlowPool,
  bindCanvasInteractions
} = flowEditorController;

const addTaskToColumn = (column, taskCard) => {
  if (!column || !taskCard) return;
  const body = column.querySelector(".column-body");
  if (!body) return;
  const emptyCard = body.querySelector(".task-card.is-empty");
  if (emptyCard) {
    emptyCard.remove();
  }
  body.appendChild(taskCard);
  updateColumnCount(column);
};

const createEmptyTaskCard = () => {
  const card = document.createElement("article");
  card.className = "task-card is-empty";
  card.dataset.priority = "low";
  card.innerHTML = `
    <div class="task-head">
      <span class="task-tag">Новая</span>
      <span class="task-time">Пусто</span>
    </div>
    <h3>Начните с новой задачи</h3>
    <p class="task-text">Перетащите идеи сюда или создайте задачу, чтобы работа двигалась.</p>
  `;
  return card;
};

const ensureColumnPlaceholder = (column) => {
  if (!column) return;
  const body = column.querySelector(".column-body");
  if (!body) return;
  const tasks = body.querySelectorAll(".task-card:not(.is-empty)");
  const emptyCard = body.querySelector(".task-card.is-empty");
  if (tasks.length === 0) {
    if (!emptyCard) {
      body.appendChild(createEmptyTaskCard());
    }
  } else if (emptyCard) {
    emptyCard.remove();
  }
};

const updateTaskCardStatus = (card, statusValue) => {
  if (!card) return;
  card.dataset.taskStatus = String(statusValue);
  const tag = card.querySelector(".task-tag");
  if (tag) {
    const current = tag.textContent?.trim() || "";
    if (!current || STATUS_LABEL_SET.has(current)) {
      tag.textContent = STATUS_LABELS[statusValue] || current;
    }
  }
  const time = card.querySelector(".task-time");
  if (time) {
    time.textContent = formatCardDueLabel(card.dataset.dueDate, statusValue);
  }

  const urgency = getUrgency(card.dataset.dueDate, statusValue);
  if (urgency && urgency !== URGENCY.none) {
    card.dataset.urgency = urgency;
  } else {
    delete card.dataset.urgency;
  }
};

const refreshTaskCardTiming = (card) => {
  if (!(card instanceof Element) || card.classList.contains("is-empty")) return;
  const statusValue = toStatusValue(card.dataset.taskStatus);
  const dueIso = card.dataset.dueDate;
  const time = card.querySelector(".task-time");
  if (time) {
    time.textContent = formatCardDueLabel(dueIso, statusValue);
  }
  const urgency = getUrgency(dueIso, statusValue);
  if (urgency && urgency !== URGENCY.none) {
    card.dataset.urgency = urgency;
  } else {
    delete card.dataset.urgency;
  }
};

const refreshAllTaskTimings = () => {
  document.querySelectorAll(".task-card:not(.is-empty)").forEach((card) => {
    refreshTaskCardTiming(card);
  });
};

const startTaskTimingTicker = () => {
  window.setInterval(() => {
    if (document.hidden) return;
    refreshAllTaskTimings();
  }, 60 * 1000);
};

const normalizeApiTask = (task) => {
  const statusValue = toStatusValue(task?.status);
  const priorityValue = toPriorityValue(task?.priority);
  const tagIds = Array.isArray(task?.tagIds) ? task.tagIds : [];
  const meta = task?.id !== undefined && task?.id !== null ? getStoredTaskMeta(task.id) : null;
  const metaTags = meta?.tags && meta.tags.length ? meta.tags : null;
  const apiTagNames = tagIds
    .map((id) => tagById.get(Number(id)) || "")
    .map((name) => normalizeToken(name))
    .filter(Boolean);
  return {
    id: task?.id,
    title: task?.title || "Задача без названия",
    description: task?.description || "",
    statusValue,
    priorityValue,
    assigneeId: task?.assigneeId ?? null,
    dueDate: task?.dueDate,
    tags: metaTags || (apiTagNames.length ? apiTagNames : tagIds.map((id) => `Tag-${id}`)),
    tagIds,
    attachmentCount: Number.isFinite(Number(task?.attachmentCount)) && Number(task.attachmentCount) > 0
      ? Number(task.attachmentCount)
      : 0
  };
};

const addTaskToBoard = (taskData) => {
  const statusValue = toStatusValue(taskData?.statusValue ?? taskData?.status);
  const columnId = getColumnIdForStatus(statusValue);
  const column = document.querySelector(`.column[data-column-id="${columnId}"]`) || getDefaultColumn();
  const taskCard = createTaskCard(taskData);
  addTaskToColumn(column, taskCard);
  ensureColumnPlaceholder(column);
  updateColumnCount(column);
};

const clearBoardTasks = () => {
  document.querySelectorAll(".column .task-card").forEach((card) => card.remove());
};

const fetchTasks = async () => {
  if (!currentWorkspaceId) return [];

  const response = await apiFetch(buildApiUrl("/tasks", {
    assigneeId: currentAssigneeIdFilter
  }), {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    await handleApiError(response, "Загрузка задач");
    return null;
  }
  return response.json();
};

const isTaskVisibleWithCurrentFilters = (taskData) => {
  const filterId = Number.parseInt(String(currentAssigneeIdFilter ?? ""), 10);
  if (!Number.isFinite(filterId) || filterId <= 0) {
    return true;
  }

  const assigneeId = Number.parseInt(String(taskData?.assigneeId ?? ""), 10);
  return Number.isFinite(assigneeId) && assigneeId === filterId;
};

const upsertTaskInState = (taskData) => {
  const taskId = Number.parseInt(String(taskData?.id ?? ""), 10);
  if (!Number.isFinite(taskId) || taskId <= 0) return;

  let replaced = false;
  lastNormalizedTasks = lastNormalizedTasks.map((item) => {
    const itemId = Number.parseInt(String(item?.id ?? ""), 10);
    if (!Number.isFinite(itemId) || itemId !== taskId) {
      return item;
    }

    replaced = true;
    return {
      ...item,
      ...taskData
    };
  });

  if (!replaced) {
    lastNormalizedTasks = [...lastNormalizedTasks, taskData];
  }
};

const removeTaskFromState = (taskId) => {
  const normalizedId = Number.parseInt(String(taskId ?? ""), 10);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;

  lastNormalizedTasks = lastNormalizedTasks.filter((task) => {
    const itemId = Number.parseInt(String(task?.id ?? ""), 10);
    return !Number.isFinite(itemId) || itemId !== normalizedId;
  });
};

const syncTaskStateToUi = () => {
  refreshToolbarUiState();
  const visibleTasks = getVisibleSortedTasks(lastNormalizedTasks);
  rebuildFlowPool(visibleTasks);

  if (isToolbarSearchOrFilterActive()) {
    setGridOverlayActive(true);
    renderTaskGridView(visibleTasks);
    return;
  }

  setGridOverlayActive(false);
  renderCurrentView(visibleTasks);
};

const isCalendarViewActive = () => (board?.dataset.view || "board") === "calendar";

const isPriorityViewActive = () => (board?.dataset.view || "board") === "priority";

const boardViewController = createBoardViewController({
  calendarLayout,
  clearBoardTasks,
  addTaskToBoard,
  addTaskToColumn,
  getDefaultColumn,
  createTaskCard,
  ensureColumnPlaceholder,
  updateColumnCount,
  updateFlowEmptyState,
  refreshAllTaskTimings,
  setColumnDelays,
  updateTaskCardStatus,
  refreshTaskCardTiming,
  setTaskCardAttachmentCount,
  toStatusValue,
  toPriorityValue,
  getColumnIdForStatus,
  getPriorityLabel,
  compareTasks: compareTasksForToolbar
});

const {
  renderBoardView,
  upsertTaskInBoard,
  removeTaskFromBoard
} = boardViewController;

const calendarViewController = createCalendarViewController({
  calendarLayout,
  board,
  clearBoardTasks,
  createTaskCard,
  getCalendarBucketId,
  toPriorityValue,
  compareTasks: compareTasksForToolbar
});

const {
  renderCalendarView,
  upsertTaskInCalendar,
  removeTaskFromCalendar
} = calendarViewController;

const priorityViewController = createPriorityViewController({
  calendarLayout,
  board,
  clearBoardTasks,
  createTaskCard,
  toPriorityValue,
  compareTasks: compareTasksForToolbar
});

const {
  renderPriorityView,
  upsertTaskInPriority,
  removeTaskFromPriority
} = priorityViewController;

const upsertFlowTaskItem = (taskData) => {
  if (!flowListItems) return;
  const taskId = Number.parseInt(String(taskData?.id ?? ""), 10);
  if (!Number.isFinite(taskId) || taskId <= 0) return;

  const existing = flowListItems.querySelector(`.flow-task[data-task-id="${taskId}"]`);
  if (existing) {
    existing.remove();
  }

  const flowItem = createFlowTaskItem(taskData);
  flowListItems.appendChild(flowItem);
  initFlowTask(flowItem);
};

const removeFlowTaskItem = (taskId) => {
  if (!flowListItems) return;
  const normalizedId = Number.parseInt(String(taskId ?? ""), 10);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
  const existing = flowListItems.querySelector(`.flow-task[data-task-id="${normalizedId}"]`);
  if (existing) {
    existing.remove();
  }
};

const applyTaskUpsertToUi = (taskData) => {
  if (!taskData) return;

  if (isToolbarFilteringActive()) {
    syncTaskStateToUi();
    return;
  }

  upsertFlowTaskItem(taskData);

  if (isCalendarViewActive()) {
    const updated = upsertTaskInCalendar(taskData);
    if (!updated) {
      syncTaskStateToUi();
    }
    return;
  }

  if (isPriorityViewActive()) {
    const updated = upsertTaskInPriority(taskData);
    if (!updated) {
      syncTaskStateToUi();
    }
    return;
  }

  upsertTaskInBoard(taskData);
};

const applyTaskRemovalToUi = (taskId) => {
  if (isToolbarFilteringActive()) {
    syncTaskStateToUi();
    return;
  }

  removeFlowTaskItem(taskId);

  if (isCalendarViewActive()) {
    const removed = removeTaskFromCalendar(taskId);
    if (!removed) {
      syncTaskStateToUi();
    }
    return;
  }

  if (isPriorityViewActive()) {
    const removed = removeTaskFromPriority(taskId);
    if (!removed) {
      syncTaskStateToUi();
    }
    return;
  }

  removeTaskFromBoard(taskId);
};

const createTaskViaApi = async (uiTaskData) => {
  const assigneeIdParsed = Number.parseInt(String(uiTaskData.assigneeId ?? ""), 10);
  const assigneeId = Number.isFinite(assigneeIdParsed) && assigneeIdParsed > 0 ? assigneeIdParsed : null;
  const priorityParsed = Number.parseInt(String(uiTaskData.priorityValue ?? DEFAULT_PRIORITY_VALUE), 10);
  const priority = Number.isFinite(priorityParsed) ? clampValue(priorityParsed, 1, 3) : DEFAULT_PRIORITY_VALUE;
  const due = new Date(String(uiTaskData.dueDateIso || ""));
  const dueDate = Number.isNaN(due.getTime()) ? getDefaultDueDateIso() : due.toISOString();
  const tagIds = Array.isArray(uiTaskData.tagIds) ? uiTaskData.tagIds : [];
  const payload = {
    title: uiTaskData.title,
    description: uiTaskData.description,
    assigneeId,
    dueDate,
    priority,
    tagIds
  };

  const response = await apiFetch(buildApiUrl("/tasks"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await handleApiError(response, "Создание задачи");
    return;
  }

  let createdTask = null;
  try {
    createdTask = await response.json();
  } catch {
    createdTask = null;
  }

  const createdId = Number.parseInt(String(createdTask?.id ?? ""), 10);
  if (!Number.isFinite(createdId) || createdId <= 0) {
    closeTaskModal();
    await loadTasksFromApi();
    return;
  }

  clearStoredTaskArtifacts(createdId);

  const tags = Array.isArray(uiTaskData.tags) ? uiTaskData.tags.filter((t) => typeof t === "string" && t.trim()) : [];
  if (Number.isFinite(createdId) && createdId > 0) {
    setStoredTaskMeta(createdId, { tags });
  }

  const taskData = normalizeApiTask(createdTask);
  if (tags.length) taskData.tags = tags;

  if (isTaskVisibleWithCurrentFilters(taskData)) {
    upsertTaskInState(taskData);
    applyTaskUpsertToUi(taskData);
  } else {
    removeTaskFromState(createdId);
    applyTaskRemovalToUi(createdId);
  }

  closeTaskModal();
};

const updateTaskViaApi = async (id, uiTaskData) => {
  const statusValue = toStatusValue(uiTaskData.statusValue);
  const tagIds = Array.isArray(uiTaskData.tagIds) ? uiTaskData.tagIds : [];

  const assigneeIdParsed = Number.parseInt(String(uiTaskData.assigneeId ?? ""), 10);
  const assigneeId = Number.isFinite(assigneeIdParsed) && assigneeIdParsed > 0 ? assigneeIdParsed : null;
  const priorityParsed = Number.parseInt(String(uiTaskData.priorityValue ?? DEFAULT_PRIORITY_VALUE), 10);
  const priority = Number.isFinite(priorityParsed) ? clampValue(priorityParsed, 1, 3) : DEFAULT_PRIORITY_VALUE;
  const due = new Date(String(uiTaskData.dueDateIso || ""));
  const dueDate = Number.isNaN(due.getTime()) ? getDefaultDueDateIso() : due.toISOString();

  const payload = {
    id,
    title: uiTaskData.title,
    description: uiTaskData.description,
    status: statusValue,
    assigneeId,
    dueDate,
    priority,
    tagIds
  };

  const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await handleApiError(response, "Обновление задачи");
    return;
  }

  let updatedTask = null;
  try {
    updatedTask = await response.json();
  } catch {
    updatedTask = null;
  }

  const updatedId = Number.parseInt(String(updatedTask?.id ?? id), 10);
  if (!Number.isFinite(updatedId) || updatedId <= 0) {
    closeTaskModal();
    await loadTasksFromApi();
    return;
  }

  const tags = Array.isArray(uiTaskData.tags)
    ? uiTaskData.tags.filter((t) => typeof t === "string" && t.trim())
    : [];
  setStoredTaskMeta(updatedId, { tags });

  const normalizedTask = normalizeApiTask(updatedTask || {
    id: updatedId,
    title: uiTaskData.title,
    description: uiTaskData.description,
    status: statusValue,
    assigneeId,
    dueDate,
    priority,
    tagIds,
    attachmentCount: 0
  });

  if (tags.length) {
    normalizedTask.tags = tags;
  }

  if (isTaskVisibleWithCurrentFilters(normalizedTask)) {
    upsertTaskInState(normalizedTask);
    applyTaskUpsertToUi(normalizedTask);
  } else {
    removeTaskFromState(updatedId);
    applyTaskRemovalToUi(updatedId);
  }

  closeTaskModal();
};

const buildUpdatePayloadFromCard = (card, statusValue) => {
  const id = Number.parseInt(card.dataset.taskId || "", 10);
  const title = card.querySelector("h3")?.textContent?.trim() || "Задача без названия";
  const description = card.querySelector(".task-text")?.textContent?.trim() || "";
  const assigneeIdParsed = Number.parseInt(normalizeToken(card.dataset.assigneeId), 10);
  const assigneeId = Number.isFinite(assigneeIdParsed) && assigneeIdParsed > 0 ? assigneeIdParsed : null;
  const dueDate = card.dataset.dueDate || getDefaultDueDateIso();
  const priorityParsed = Number.parseInt(card.dataset.priorityValue || `${DEFAULT_PRIORITY_VALUE}`, 10);
  const priority = Number.isFinite(priorityParsed) ? clampValue(priorityParsed, 1, 3) : DEFAULT_PRIORITY_VALUE;
  const tagIds = parseTagIds(card.dataset.tagIds);
  return {
    id,
    title,
    description,
    status: statusValue,
    assigneeId,
    dueDate,
    priority,
    tagIds
  };
};

const updateTaskStatus = async (card, statusValue) => {
  const id = Number.parseInt(card.dataset.taskId || "", 10);
  if (!Number.isFinite(id)) return;
  const payload = buildUpdatePayloadFromCard(card, statusValue);
  const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await handleApiError(response, "Обновление задачи");
    syncTaskStateToUi();
    return;
  }

  let updatedTask = null;
  try {
    updatedTask = await response.json();
  } catch {
    updatedTask = null;
  }

  if (!updatedTask || !Number.isFinite(Number(updatedTask.id))) {
    await loadTasksFromApi();
    return;
  }

  const normalizedTask = normalizeApiTask(updatedTask);
  if (isTaskVisibleWithCurrentFilters(normalizedTask)) {
    upsertTaskInState(normalizedTask);
    applyTaskUpsertToUi(normalizedTask);
  } else {
    removeTaskFromState(normalizedTask.id);
    applyTaskRemovalToUi(normalizedTask.id);
  }
};

const deleteTaskViaApi = async (id) => {
  if (!Number.isFinite(Number(id))) return false;
  const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    await handleApiError(response, "Удаление задачи");
    return false;
  }

  clearStoredTaskArtifacts(id);
  return true;
};

const loadTasksFromApi = async () => {
  await ensureTagsLoaded();
  const tasks = await fetchTasks();
  if (!Array.isArray(tasks)) return;
  lastNormalizedTasks = tasks.map(normalizeApiTask);
  syncTaskStateToUi();
};

const renderCurrentView = (tasks) => {
  const view = board?.dataset.view || "board";
  const list = Array.isArray(tasks) ? tasks : getVisibleSortedTasks(lastNormalizedTasks);
  if (isToolbarSearchOrFilterActive()) {
    return;
  }
  if (view === "flow") {
    return;
  }
  if (view === "calendar") {
    renderCalendarView(list);
    return;
  }
  if (view === "priority") {
    renderPriorityView(list);
    return;
  }
  renderBoardView(list);
};

const initColumn = (column) => {
  ensureColumnMetadata(column);

  const title = column.querySelector(".column-title");
  if (title) {
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        title.blur();
      }
    });

    title.addEventListener("blur", () => {
      const { columnType } = ensureColumnMetadata(column);
      const fallbackTitle = getColumnCreateVariant(columnType).title || "Untitled";
      const nextTitle = normalizeToken(title.textContent) || fallbackTitle;
      if (title.textContent !== nextTitle) {
        title.textContent = nextTitle;
      }
      saveBoardColumnsLayout();
    });
  }

  const handle = column.querySelector(".column-handle");
  if (handle) {
    handle.addEventListener("dragstart", onDragStart);
    handle.addEventListener("dragend", onDragEnd);
  }

  const deleteBtn = column.querySelector(".column-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => removeColumn(column));
  }

  const body = column.querySelector(".column-body");
  if (body) {
    body.addEventListener("dragover", onTaskDragOver);
    body.addEventListener("drop", onTaskDrop);
    Array.from(body.querySelectorAll(".task-card:not(.is-empty)")).forEach(initTaskCard);
  }

  updateColumnCount(column);
};

const createColumn = (name) => {
  const config = name && typeof name === "object"
    ? name
    : { title: normalizeToken(name) };

  const title = normalizeToken(config.title) || "Untitled";
  const columnId = normalizeToken(config.columnId) || generateColumnId();
  const columnType = normalizeToken(config.columnType).toLowerCase();

  const column = document.createElement("section");
  column.className = "column";
  column.dataset.columnId = columnId;
  if (columnType) {
    column.dataset.columnType = columnType;
  }
  column.innerHTML = `
    <header class="column-header">
      <button class="column-handle" type="button" draggable="true" aria-label="Перетащить колонку">
        <span></span><span></span><span></span>
      </button>
      <div class="column-title" contenteditable="true" spellcheck="false">${title}</div>
      <span class="column-count">0</span>
      <button class="column-delete" type="button" aria-label="Удалить колонку">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm2 7h2v8h-2v-8zm-4 0h2v8H7v-8zm8 0h2v8h-2v-8z" />
        </svg>
      </button>
    </header>
    <div class="column-body">
    </div>
    <button class="add-task" type="button">Создать задачу</button>
  `;
  const body = column.querySelector(".column-body");
  if (body) {
    body.appendChild(createEmptyTaskCard());
  }
  initColumn(column);
  return column;
};

const createColumnFromType = (type) => {
  if (!columnsWrap) return;

  const variant = getColumnCreateVariant(type);
  const existing = variant.specialized ? getExistingColumnByType(type) : null;
  if (existing instanceof Element) {
    existing.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      inline: "center",
      block: "nearest"
    });
    closeAddColumnMenu();
    return;
  }

  const column = createColumn({
    title: variant.title,
    columnId: variant.columnId,
    columnType: normalizeToken(type).toLowerCase()
  });

  column.style.setProperty("--delay", "0ms");
  columnsWrap.appendChild(column);
  setColumnDelays();
  refreshAddColumnMenuState();
  saveBoardColumnsLayout();
  closeAddColumnMenu();

  column.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    inline: "end",
    block: "nearest"
  });
};

const onDragStart = (event) => {
  const handle = event.currentTarget;
  const column = handle.closest(".column");
  if (!column) return;
  dragColumn = column;
  column.classList.add("is-dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column.dataset.columnId || "");
    event.dataTransfer.setDragImage(column, 24, 24);
  }
};

const onDragEnd = () => {
  if (dragColumn) {
    dragColumn.classList.remove("is-dragging");
    saveBoardColumnsLayout();
  }
  dragColumn = null;
  lastAfter = null;
};

const getDragAfterElement = (container, x) => {
  const elements = Array.from(container.querySelectorAll(".column:not(.is-dragging)"));
  return elements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
};

const flip = (elements, mutate) => {
  if (prefersReducedMotion) {
    mutate();
    return;
  }

  const first = new Map(elements.map((el) => [el, el.getBoundingClientRect()]));
  mutate();

  requestAnimationFrame(() => {
    elements.forEach((el) => {
      const last = el.getBoundingClientRect();
      const firstRect = first.get(el);
      if (!firstRect) return;
      const dx = firstRect.left - last.left;
      const dy = firstRect.top - last.top;
      if (dx || dy) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" }
          ],
          {
            duration: 260,
            easing: "cubic-bezier(0.2, 0.7, 0.2, 1)"
          }
        );
      }
    });
  });
};

const initTaskCard = (card) => {
  if (!card || card.classList.contains("is-empty")) return;
  card.setAttribute("draggable", "true");
  card.addEventListener("dragstart", onTaskDragStart);
  card.addEventListener("dragend", onTaskDragEnd);
  card.addEventListener("dblclick", () => {
    const id = Number.parseInt(card.dataset.taskId || "", 10);
    if (!Number.isFinite(id)) return;
    void taskDetailController.openTaskDetailModalForTask(id, card);
  });
};

const onTaskDragStart = (event) => {
  const card = event.currentTarget;
  if (!(card instanceof Element)) return;
  dragTask = card;
  dragTaskColumn = card.closest(".column");
  card.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.taskId || "");
  }
  setTrashZoneVisible(true);
};

const onTaskDragEnd = () => {
  if (dragTask) {
    dragTask.classList.remove("is-dragging");
  }
  const currentColumn = dragTask?.closest(".column");
  if (dragTaskColumn) {
    ensureColumnPlaceholder(dragTaskColumn);
    updateColumnCount(dragTaskColumn);
  }
  if (currentColumn && currentColumn !== dragTaskColumn) {
    ensureColumnPlaceholder(currentColumn);
    updateColumnCount(currentColumn);
  }
  dragTask = null;
  dragTaskColumn = null;
  lastTaskAfter = null;
  lastTaskContainer = null;
  setTrashZoneOver(false);
  setTrashZoneVisible(false);
};

const getTaskDragAfterElement = (container, y) => {
  const elements = Array.from(container.querySelectorAll(".task-card:not(.is-dragging):not(.is-empty)"));
  return elements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
};

const getTaskFlipElements = (sourceContainer, targetContainer) => {
  const elements = [];
  if (sourceContainer) {
    elements.push(...sourceContainer.querySelectorAll(".task-card:not(.is-dragging)"));
  }
  if (targetContainer && targetContainer !== sourceContainer) {
    elements.push(...targetContainer.querySelectorAll(".task-card:not(.is-dragging)"));
  }
  return Array.from(new Set(elements));
};

const onTaskDragOver = (event) => {
  event.preventDefault();
  if (!dragTask) return;
  const container = event.currentTarget;
  if (!(container instanceof Element)) return;
  const afterElement = getTaskDragAfterElement(container, event.clientY);
  if (afterElement === lastTaskAfter && container === lastTaskContainer) return;
  lastTaskAfter = afterElement;
  lastTaskContainer = container;
  const sourceContainer = dragTask.parentElement;
  const sourceColumn = sourceContainer instanceof Element ? sourceContainer.closest(".column") : null;
  const targetColumn = container.closest(".column");
  const flipElements = getTaskFlipElements(sourceContainer, container);
  flip(flipElements, () => {
    if (!afterElement) {
      container.appendChild(dragTask);
    } else if (afterElement !== dragTask) {
      container.insertBefore(dragTask, afterElement);
    }

    const columnsToSync = new Set([sourceColumn, targetColumn].filter(Boolean));
    columnsToSync.forEach((column) => {
      ensureColumnPlaceholder(column);
      updateColumnCount(column);
    });
  });
};

const onTaskDrop = (event) => {
  event.preventDefault();
  if (!dragTask) return;
  const targetContainer = event.currentTarget instanceof Element ? event.currentTarget : null;
  const targetColumn = targetContainer?.closest(".column") || null;
  if (dragTaskColumn && targetColumn && dragTaskColumn !== targetColumn) {
    const nextStatus =
      getStatusForColumnId(targetColumn.dataset.columnId)
      || getStatusForColumnId(getColumnCreateVariant(targetColumn.dataset.columnType).columnId);
    if (nextStatus && dragTask.dataset.taskId) {
      updateTaskCardStatus(dragTask, nextStatus);
      void updateTaskStatus(dragTask, nextStatus);
    }
  }
  if (dragTaskColumn) {
    ensureColumnPlaceholder(dragTaskColumn);
    updateColumnCount(dragTaskColumn);
  }
  if (targetColumn) {
    ensureColumnPlaceholder(targetColumn);
    updateColumnCount(targetColumn);
  }
};

if (taskTrashZone) {
  taskTrashZone.addEventListener("dragover", (event) => {
    if (!dragTask || !shouldShowTrashZone()) return;
    event.preventDefault();
    setTrashZoneOver(true);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  taskTrashZone.addEventListener("dragleave", () => {
    setTrashZoneOver(false);
  });

  taskTrashZone.addEventListener("drop", async (event) => {
    if (!dragTask || !shouldShowTrashZone()) return;
    event.preventDefault();
    event.stopPropagation();
    setTrashZoneOver(false);
    const id = Number.parseInt(dragTask.dataset.taskId || "", 10);
    const title = dragTask.querySelector("h3")?.textContent?.trim();
    const confirmed = await openConfirmModal({
      kicker: "Удаление задачи",
      title: title ? `Удалить "${title}"?` : "Удалить эту задачу?",
      message: "Эта задача и ее метаданные будут удалены с доски.",
      confirmText: "Удалить задачу"
    });
    if (confirmed !== true) {
      setTrashZoneVisible(false);
      syncTaskStateToUi();
      return;
    }
    void (async () => {
      const deleted = await deleteTaskViaApi(id);
      setTrashZoneVisible(false);
      if (!deleted) {
        syncTaskStateToUi();
        return;
      }

      removeTaskFromState(id);
      applyTaskRemovalToUi(id);
    })();
  });
}

if (columnsWrap) {
  Array.from(columnsWrap.querySelectorAll(".column")).forEach(initColumn);
  setColumnDelays();

  columnsWrap.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!dragColumn) return;
    const afterElement = getDragAfterElement(columnsWrap, event.clientX);
    if (afterElement === lastAfter) return;
    lastAfter = afterElement || null;
    const elements = Array.from(columnsWrap.children);
    flip(elements, () => {
      if (!afterElement) {
        columnsWrap.appendChild(dragColumn);
      } else if (afterElement !== dragColumn) {
        columnsWrap.insertBefore(dragColumn, afterElement);
      }
    });
  });
}

if (addColumnBtn) {
  addColumnBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!columnsWrap) return;
    toggleAddColumnMenu();
  });
}

if (addColumnMenu) {
  addColumnMenu.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".board-add-column-option[data-column-type]")
      : null;
    if (!(target instanceof HTMLButtonElement)) return;

    event.preventDefault();
    event.stopPropagation();
    const type = normalizeToken(target.dataset.columnType).toLowerCase() || "new";
    createColumnFromType(type);
  });
}

if (styleToggle) {
  styleToggle.addEventListener("click", () => {
    if (!board) return;
    const nextStyle = board.dataset.style === "flow" ? "columns" : "flow";
    setLayoutStyle(nextStyle);
  });
}

document.querySelectorAll(".flow-task").forEach(initFlowTask);

if (taskTagsInput) {
  taskTagsInput.addEventListener("input", () => {
    renderTagPreview(parseTags(taskTagsInput.value));
  });
}

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
    // Prevent global "click outside" handler from instantly closing the panel.
    event.preventDefault();
    event.stopPropagation();
    brandToggle?.click();
  });
}

if (userSearch) {
  userSearch.addEventListener("input", refreshUserFilter);
}

if (userAddBtn) {
  userAddBtn.addEventListener("click", () => {
    if (!userAddInput) return;
    void (async () => {
      if (!currentWorkspaceId) return;
      if (!isAdmin()) return;
      const email = normalizeEmail(userAddInput.value);
      if (!email) return;
      const name = email.split("@")[0] || "Без имени";
      const created = await fetchJsonOrNull(buildApiUrl(`/spaces/${currentWorkspaceId}/members`), "Добавление участника", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ name, email })
      });

      userAddInput.value = "";
      await loadUsersFromApi();
      if (created && created.userId) {
        setCurrentUser({ id: Number(created.userId), name: created.name, email: created.email });
        await loadTasksFromApi();
      }
    })();
  });
}

if (openSpacesHomeBtn) {
  openSpacesHomeBtn.addEventListener("click", () => {
    navigateToSpacesPage();
  });
}

if (userAddInput) {
  userAddInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      userAddBtn?.click();
    }
  });
}

if (board) {
  board.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest(".add-task")
      : null;
    if (!button) return;
    const column = button.closest(".column");
    openTaskModal(column);
  });
}

document.addEventListener("click", (event) => {
  const chip = event.target instanceof Element
    ? event.target.closest(".task-card .task-chip")
    : null;
  if (!(chip instanceof Element)) return;
  if (chip.closest(".task-modal")) return;

  const tag = normalizeTag(chip.textContent);
  if (!tag) return;
  event.preventDefault();
  event.stopPropagation();

  toolbarTagFilter.add(tag);
  closeToolbarPopovers();
  if (boardSearchInput instanceof HTMLInputElement) {
    boardSearchInput.focus();
  }
  syncTaskStateToUi();
});

if (flowAddTaskBtn) {
  flowAddTaskBtn.addEventListener("click", () => {
    openTaskModal(getDefaultColumn());
  });
}

if (boardTaskCreateBtn) {
  boardTaskCreateBtn.addEventListener("click", () => {
    openTaskModal(getDefaultColumn());
  });
}

document.addEventListener("click", (event) => {
  if (!isAddColumnMenuOpen) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    closeAddColumnMenu();
    return;
  }
  if (addColumnControl && addColumnControl.contains(target)) {
    return;
  }
  closeAddColumnMenu();
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !taskModal || taskModal.hasAttribute("hidden")) return;
  if (target.closest("[data-close-modal]")) {
    closeTaskModal();
    return;
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !profileModal || profileModal.hasAttribute("hidden")) return;
  if (target.closest("[data-close-profile]")) {
    closeProfileModal();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !avatarModal || avatarModal.hasAttribute("hidden")) return;
  if (target.closest("[data-close-avatar]")) {
    closeAvatarModal();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!(activeUserMiniMenu instanceof Element)) return;
  if (!target) {
    closeUserMiniMenu();
    return;
  }
  if (target.closest(".user-mini-menu")) return;
  if (target.closest(".user-item")) return;
  closeUserMiniMenu();
});

if (confirmModal) {
  confirmModal.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-close-confirm]")) {
      closeConfirmModal(false);
    }
  });

  confirmModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeConfirmModal(false);
    }
  });
}

if (confirmModalCancelBtn) {
  confirmModalCancelBtn.addEventListener("click", () => {
    closeConfirmModal(false);
  });
}

if (confirmModalAcceptBtn) {
  confirmModalAcceptBtn.addEventListener("click", () => {
    closeConfirmModal(true);
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

const taskDetailController = createTaskDetailController({
  isAdmin,
  ensureTagsLoaded,
  getTagNameById: (id) => tagById.get(Number(id)) || "",
  getAssigneeNameById: (id) => {
    const storedNickname = normalizeToken(getStoredAccountNickname(Number(id)));
    if (storedNickname) return storedNickname;
    const match = (Array.isArray(workspaceMembers) ? workspaceMembers : []).find((m) => Number(m?.id) === Number(id));
    return normalizeToken(match?.name);
  },
  openTaskModalForEdit,
  applyTaskBgToCards,
  applyAttachmentCountToCards,
  confirmDestructiveAction: openConfirmModal
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (isAddColumnMenuOpen) {
      closeAddColumnMenu();
      return;
    }
    if (closeConfirmModal(false)) {
      return;
    }
    if (closeToolbarPopovers()) {
      return;
    }
    if (closeAvatarModal()) {
      return;
    }
    if (closeProfileModal()) {
      return;
    }
    if (activeUserMiniMenu instanceof Element) {
      closeUserMiniMenu();
      return;
    }
    if (isNotificationsOpen()) {
      setNotificationsOpen(false);
    }
    if (isSettingsOpen()) {
      setSettingsOpen(false);
    }
    if (isPanelOpen()) {
      setPanelOpen(false);
    }
    closeTaskModal();
    taskDetailController.closeTaskDetailModal();
  }
});

if (taskForm) {
  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = normalizeToken(taskTitle?.value);
    const description = normalizeToken(taskDescription?.value);
    if (!title) return;
    const tags = parseTags(taskTagsInput?.value || "");
    const dueValue = normalizeToken(taskDue?.value);
    let dueDateIso = getDefaultDueDateIso();
    if (dueValue) {
      const parsed = new Date(dueValue);
      if (!Number.isNaN(parsed.getTime())) {
        dueDateIso = parsed.toISOString();
      }
    }
    const assigneeId = normalizeToken(taskAssignee?.value);
    const priorityValue = normalizeToken(taskPriority?.value) || `${DEFAULT_PRIORITY_VALUE}`;
    const statusValue = editingTaskId
      ? toStatusValue(taskStatus?.value)
      : 1;
    const tagIds = await resolveTagIdsForTask(tags);
    const taskData = {
      title,
      description,
      statusValue,
      tags,
      dueDateIso,
      assigneeId,
      priorityValue,
      tagIds
    };
    if (editingTaskId) {
      await updateTaskViaApi(editingTaskId, taskData);
    } else {
      await createTaskViaApi(taskData);
    }
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

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAccessToken();
    redirectToAuthPage();
  });
}

const saveWorkspaceName = async () => {
  if (!currentWorkspaceId) return;
  if (!isAdmin()) return;
  if (!panelWorkspaceNameEl) return;

  const name = normalizeToken(panelWorkspaceNameEl.textContent);
  if (!name) {
    const original = normalizeToken(panelWorkspaceNameEl.dataset.original);
    panelWorkspaceNameEl.textContent = original || "Проект";
    setWorkspaceEditing(false);
    return;
  }

  const response = await apiFetch(buildApiUrl(`/spaces/${currentWorkspaceId}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    await handleApiError(response, "Обновление проекта");
    const original = normalizeToken(panelWorkspaceNameEl.dataset.original);
    panelWorkspaceNameEl.textContent = original || "Проект";
    setWorkspaceEditing(false);
    return;
  }

  const updated = await response.json();
  setWorkspaceEditing(false);
  setWorkspaceContext(updated);
};

if (panelWorkspaceEditBtn) {
  panelWorkspaceEditBtn.addEventListener("click", () => {
    if (!isAdmin()) return;
    if (!panelWorkspaceNameEl) return;
    if (panelWorkspaceEditing) return;
    setWorkspaceEditing(true);
  });
}

if (panelWorkspaceNameEl) {
  panelWorkspaceNameEl.addEventListener("keydown", (event) => {
    if (!panelWorkspaceEditing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      panelWorkspaceNameEl.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const original = panelWorkspaceNameEl.dataset.original || "";
      panelWorkspaceNameEl.textContent = original;
      setWorkspaceEditing(false);
    }
  });

  panelWorkspaceNameEl.addEventListener("blur", () => {
    if (!panelWorkspaceEditing) return;
    void saveWorkspaceName();
  });
}

if (panelWorkspaceAvatarInput) {
  panelWorkspaceAvatarInput.addEventListener("change", () => {
    const file = panelWorkspaceAvatarInput.files && panelWorkspaceAvatarInput.files[0];
    // Allow re-selecting the same file.
    panelWorkspaceAvatarInput.value = "";
    if (!file) return;
    if (!currentWorkspaceId) return;
    if (!isAdmin()) return;

    const form = new FormData();
    form.append("file", file);

    void (async () => {
      const response = await apiFetch(buildApiUrl(`/spaces/${currentWorkspaceId}/avatar`), {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        await handleApiError(response, "Установка аватара проекта");
        return;
      }

      const updated = await response.json();
      setWorkspaceContext(updated);
    })();
  });
}

if (settingsNicknameInput) {
  settingsNicknameInput.addEventListener("input", () => {
    const id = getActorUserId();
    if (!id) return;
    setStoredAccountNickname(id, settingsNicknameInput.value);
    updateActorUi();
  });
}

if (settingsAvatarBtn && settingsAvatarInput) {
  settingsAvatarBtn.addEventListener("click", () => {
    settingsAvatarInput.click();
  });
}

if (settingsAvatarInput) {
  settingsAvatarInput.addEventListener("change", () => {
    const file = settingsAvatarInput.files && settingsAvatarInput.files[0];
    // Allow re-selecting the same file.
    settingsAvatarInput.value = "";
    const id = getActorUserId();
    if (!id || !file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      setStoredAccountAvatar(id, dataUrl);
      updateActorUi();
    });
    reader.readAsDataURL(file);
  });
}

if (settingsAvatarClearBtn) {
  settingsAvatarClearBtn.addEventListener("click", () => {
    const id = getActorUserId();
    if (!id) return;
    setStoredAccountAvatar(id, "");
    if (settingsAvatarInput) settingsAvatarInput.value = "";
    updateActorUi();
  });
}

if (settingsThemeDarkBtn) {
  settingsThemeDarkBtn.addEventListener("click", () => {
    setTheme("dark");
    refreshSettingsThemeState();
  });
}

if (settingsThemeLightBtn) {
  settingsThemeLightBtn.addEventListener("click", () => {
    setTheme("light");
    refreshSettingsThemeState();
  });
}

setTheme(getPreferredTheme());
refreshSettingsThemeState();

if (taskDetailModal) {
  taskDetailModal.addEventListener("click", taskDetailController.onDetailModalClick);
}

if (taskDetailEditBtn) {
  taskDetailEditBtn.addEventListener("click", taskDetailController.onDetailEditClick);
}

if (taskDetailPhotoBtn) {
  taskDetailPhotoBtn.addEventListener("click", taskDetailController.onDetailPhotoClick);
}

if (taskDetailPhotoClearBtn) {
  taskDetailPhotoClearBtn.addEventListener("click", taskDetailController.onDetailPhotoClearClick);
}

if (taskAttachBtn) {
  taskAttachBtn.addEventListener("click", taskDetailController.onAttachClick);
}

if (taskAttachmentsInput) {
  taskAttachmentsInput.addEventListener("change", taskDetailController.onAttachmentsInputChange);
}

if (taskBgInput) {
  taskBgInput.addEventListener("change", taskDetailController.onTaskBgInputChange);
}

bindCanvasInteractions();

window.addEventListener("resize", () => {
  updateFlowLines();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setBoardView(button.dataset.view || "board");
  });
});

const openBoardSortMenu = () => {
  if (!boardSortMenu || !boardSortToggleBtn) return;
  if (boardFilterPanel) boardFilterPanel.setAttribute("hidden", "");
  if (boardFilterToggleBtn) boardFilterToggleBtn.setAttribute("aria-expanded", "false");
  refreshToolbarUiState();
  boardSortMenu.removeAttribute("hidden");
  boardSortToggleBtn.setAttribute("aria-expanded", "true");
};

const toggleBoardSortMenu = () => {
  if (!boardSortMenu || !boardSortToggleBtn) return;
  const open = !boardSortMenu.hasAttribute("hidden");
  if (open) {
    closeToolbarPopovers();
  } else {
    openBoardSortMenu();
  }
};

const openBoardFilterPanel = () => {
  if (!boardFilterPanel || !boardFilterToggleBtn) return;
  if (boardSortMenu) boardSortMenu.setAttribute("hidden", "");
  if (boardSortToggleBtn) boardSortToggleBtn.setAttribute("aria-expanded", "false");
  refreshToolbarUiState();
  boardFilterPanel.removeAttribute("hidden");
  boardFilterToggleBtn.setAttribute("aria-expanded", "true");
};

const toggleBoardFilterPanel = () => {
  if (!boardFilterPanel || !boardFilterToggleBtn) return;
  const open = !boardFilterPanel.hasAttribute("hidden");
  if (open) {
    closeToolbarPopovers();
  } else {
    openBoardFilterPanel();
  }
};

if (boardSearchInput) {
  boardSearchInput.addEventListener("input", () => {
    if (toolbarSearchDebounceId) {
      window.clearTimeout(toolbarSearchDebounceId);
    }
    toolbarSearchDebounceId = window.setTimeout(() => {
      toolbarQuery = normalizeToken(boardSearchInput.value);
      syncTaskStateToUi();
    }, 120);
  });
}

if (boardSearchClearBtn) {
  boardSearchClearBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toolbarQuery = "";
    toolbarTagFilter.clear();
    if (boardSearchInput) boardSearchInput.value = "";
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
    const next = normalizeToken(target.dataset.sort) || "smart";
    toolbarSort = next;
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
    || target.closest("#board-sort-toggle")
    || target.closest("#board-filter-toggle")) {
    return;
  }
  closeToolbarPopovers();
});

refreshUserFilter();
setLayoutStyle(board?.dataset.style || "columns");
refreshAddColumnMenuState();
updateFlowEmptyState();
startTaskTimingTicker();

const resolveWorkspaceIdForWorkspacePage = () => {
  const fromQuery = Number.parseInt(new URLSearchParams(window.location.search).get("workspaceId") || "", 10);
  if (Number.isFinite(fromQuery) && fromQuery > 0) {
    return fromQuery;
  }

  const fromStorage = Number.parseInt(localStorage.getItem(STORAGE_WORKSPACE_ID) || "", 10);
  if (Number.isFinite(fromStorage) && fromStorage > 0) {
    return fromStorage;
  }

  return null;
};

const switchWorkspaceToken = async (workspaceId) => {
  const response = await apiFetch(buildApiUrl("/auth/switch-workspace"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ workspaceId })
  });

  if (!response.ok) {
    await handleApiError(response, "Переключение проекта");
    return false;
  }

  try {
    const data = await response.json();
    const token = String(data?.accessToken || "").trim();
    if (token) {
      setAccessToken(token);
    }
    if (data?.user?.id) {
      setActorUser(data.user);
    }
  } catch {
    // ignore malformed json
  }

  return true;
};

const bootstrapWorkspacePage = async () => {
  if (!ensureAuthOrRedirect() || !hasAccessToken()) {
    return;
  }

  setAppScreen("board");
  await loadCurrentUserFromApi();
  updateActorUi();

  if (!getActorUserId()) {
    redirectToAuthPage();
    return;
  }

  const workspaceId = resolveWorkspaceIdForWorkspacePage();
  if (!workspaceId) {
    navigateToSpacesPage();
    return;
  }

  currentWorkspaceId = workspaceId;
  try {
    localStorage.setItem(STORAGE_WORKSPACE_ID, String(workspaceId));
  } catch {
    // ignore
  }

  const switched = await switchWorkspaceToken(workspaceId);
  if (!switched) {
    navigateToSpacesPage();
    return;
  }

  const workspace = await fetchJsonOrNull(buildApiUrl(`/spaces/${workspaceId}`), "Загрузка проекта", {
    headers: { Accept: "application/json" }
  });

  if (!workspace || !workspace.id) {
    navigateToSpacesPage();
    return;
  }

  await openWorkspace(workspace);
};

void (async () => {
  if (!board) {
    navigateToSpacesPage();
    return;
  }
  await bootstrapWorkspacePage();
})();

function refreshSettingsThemeState() {
  const theme = document.body.dataset.theme === "light" ? "light" : "dark";
  settingsThemeDarkBtn?.classList.toggle("is-selected", theme === "dark");
  settingsThemeLightBtn?.classList.toggle("is-selected", theme === "light");
}

function isNotificationsOpen() {
  return appShell?.classList.contains("is-notifications-open");
}

function setNotificationsOpen(open) {
  if (!appShell) return;
  appShell.classList.toggle("is-notifications-open", open);

  if (notificationsToggleBtn) {
    notificationsToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (notificationsPanel) {
    notificationsPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }

  if (open) {
    // Avoid two panels fighting for width.
    setPanelOpen(false);
    setSettingsOpen(false);
    window.setTimeout(() => notificationsCloseBtn?.focus(), 0);
  }
}

function isSettingsOpen() {
  return appShell?.classList.contains("is-settings-open");
}

function setSettingsOpen(open) {
  if (!appShell) return;
  appShell.classList.toggle("is-settings-open", open);
  if (settingsToggleBtn) {
    settingsToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (settingsPanel) {
    settingsPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }

  if (open) {
    // Avoid two panels fighting for width.
    setPanelOpen(false);
    setNotificationsOpen(false);
    refreshSettingsThemeState();
    window.setTimeout(() => settingsNicknameInput?.focus(), 0);
  }
}
