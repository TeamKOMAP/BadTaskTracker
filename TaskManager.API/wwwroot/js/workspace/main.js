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
  flowScene,
  flowLinks,
  flowNodesLayer,
  flowDropzone,
  flowListItems,
  flowAddTaskBtn,
  flowClearBtn,
  flowClearMenu,
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
  userAddSection,
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
  notificationsList,
  notificationsEmpty,
  notificationsMarkAllBtn,
  logoutBtn,
  settingsNicknameInput,
  settingsNicknameSaveBtn,
  settingsNicknameCooldownEl,
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
  taskDetailHistoryToggleBtn,
  taskDetailHistoryClearBtn,
  taskAttachBtn,
  taskAttachmentsInput,
  taskBgInput,
  confirmModal,
  confirmModalKickerEl,
  confirmModalTitleEl,
  confirmModalMessageEl,
  confirmModalCancelBtn,
  confirmModalAcceptBtn
} from "./dom.js?v=authflow12";

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
import { normalizeToken, toInitials, toWorkspaceRole, clampValue } from "../shared/utils.js";
import { getRoleLabel } from "../shared/roles.js?v=auth1";
import { createNotificationsPanelController } from "../shared/notifications.js?v=notif3";
import {
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
} from "./helpers.js?v=authflow7";
import {
  getPreferredTheme,
  setTheme,
  getStoredTaskMeta,
  setStoredTaskMeta,
  getStoredTaskBg,
  appendStoredTaskHistory,
  clearStoredTaskArtifacts,
  getStoredWorkspaceColumns,
  setStoredWorkspaceColumns,
  getStoredWorkspaceFlowMap,
  setStoredWorkspaceFlowMap
} from "./storage.js?v=authflow7";
import { createBoardViewController } from "./board-view.js?v=perf2";
import { createCalendarViewController } from "./calendar-view.js?v=perf2";
import { createPriorityViewController } from "./priority-view.js?v=perf3";
import { createFlowEditorController } from "./flow-editor.js?v=perf6";
import { createTaskDetailController } from "./task-detail.js?v=perf14";
import { createInviteControls } from "./invite-controls.js?v=invctrl1";
import { createProfileModalsController } from "./profile-modals.js?v=profile2";

let lastNormalizedTasks = [];

let currentAssigneeIdFilter = null;
let currentUserId = null;
let currentWorkspaceId = null;
let currentWorkspaceRole = "Member";

const notificationsController = createNotificationsPanelController({
  toggleBtn: notificationsToggleBtn,
  listEl: notificationsList,
  emptyEl: notificationsEmpty,
  markAllBtn: notificationsMarkAllBtn,
  returnTo: "workspace",
  resolveWorkspaceId: () => currentWorkspaceId
});

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
let nicknameSaveInFlight = false;
let nicknameCooldownEndsAt = 0;
let nicknameCooldownTimerHandle = null;
let nicknameStatusMessage = "";
let nicknameStatusIsError = false;

let workspaceMembers = [];

let inviteControls = null;
let taskDetailController = null;

const refreshInviteControlsState = () => {
  inviteControls?.refresh();
};

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

  const match = (Array.isArray(workspaceMembers) ? workspaceMembers : []).find((m) => Number(m?.id) === id);
  if (!match) return "";
  return normalizeToken(match.name) || "";
};

const PRIORITY_HISTORY_LABELS = {
  1: "Низкий",
  2: "Средний",
  3: "Высокий"
};

const formatPriorityForHistory = (value) => {
  const key = toPriorityValue(value);
  return PRIORITY_HISTORY_LABELS[key] || "Средний";
};

const formatDueForHistory = (iso) => {
  const token = normalizeToken(iso);
  if (!token) return "Без срока";
  const date = new Date(token);
  if (Number.isNaN(date.getTime())) return "Без срока";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const buildTaskHistoryLines = (before, after) => {
  const lines = [];
  if (!before || !after) return lines;

  const beforeTitle = normalizeToken(before.title);
  const afterTitle = normalizeToken(after.title);
  if (beforeTitle !== afterTitle && (beforeTitle || afterTitle)) {
    lines.push(`Название: ${beforeTitle || "-"} -> ${afterTitle || "-"}`);
  }

  const beforeDesc = normalizeToken(before.description);
  const afterDesc = normalizeToken(after.description);
  if (beforeDesc !== afterDesc) {
    lines.push("Описание: изменено");
  }

  const beforeStatus = toStatusValue(before.statusValue ?? before.status);
  const afterStatus = toStatusValue(after.statusValue ?? after.status);
  if (beforeStatus !== afterStatus) {
    lines.push(`Статус: ${(STATUS_LABELS[beforeStatus] || "-")} -> ${(STATUS_LABELS[afterStatus] || "-")}`);
  }

  const beforePriority = toPriorityValue(before.priorityValue ?? before.priority);
  const afterPriority = toPriorityValue(after.priorityValue ?? after.priority);
  if (beforePriority !== afterPriority) {
    lines.push(`Приоритет: ${formatPriorityForHistory(beforePriority)} -> ${formatPriorityForHistory(afterPriority)}`);
  }

  const beforeAssigneeId = Number.parseInt(String(before.assigneeId ?? ""), 10);
  const afterAssigneeId = Number.parseInt(String(after.assigneeId ?? ""), 10);
  const beforeAssigneeLabel = Number.isFinite(beforeAssigneeId) && beforeAssigneeId > 0 ? getAssigneeLabelById(beforeAssigneeId) : "Все";
  const afterAssigneeLabel = Number.isFinite(afterAssigneeId) && afterAssigneeId > 0 ? getAssigneeLabelById(afterAssigneeId) : "Все";
  if (beforeAssigneeId !== afterAssigneeId) {
    lines.push(`Исполнитель: ${beforeAssigneeLabel || "-"} -> ${afterAssigneeLabel || "-"}`);
  }

  const beforeDue = normalizeToken(before.dueDate);
  const afterDue = normalizeToken(after.dueDate);
  if (beforeDue !== afterDue) {
    lines.push(`Срок: ${formatDueForHistory(beforeDue)} -> ${formatDueForHistory(afterDue)}`);
  }

  const beforeTags = new Set((Array.isArray(before.tags) ? before.tags : []).map((t) => normalizeToken(t)).filter(Boolean));
  const afterTags = new Set((Array.isArray(after.tags) ? after.tags : []).map((t) => normalizeToken(t)).filter(Boolean));
  const added = Array.from(afterTags).filter((t) => !beforeTags.has(t));
  const removed = Array.from(beforeTags).filter((t) => !afterTags.has(t));
  if (added.length || removed.length) {
    if (added.length) lines.push(`Теги: +${added.join(", ")}`);
    if (removed.length) lines.push(`Теги: -${removed.join(", ")}`);
  }

  const beforeAttach = Number(before.attachmentCount) || 0;
  const afterAttach = Number(after.attachmentCount) || 0;
  if (beforeAttach !== afterAttach) {
    lines.push(`Вложения: ${beforeAttach} -> ${afterAttach}`);
  }

  return lines;
};

const recordTaskHistory = (taskId, entry) => {
  const id = Number.parseInt(String(taskId ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return;
  appendStoredTaskHistory(id, entry);
  if (typeof taskDetailController?.notifyTaskHistoryChanged === "function") {
    taskDetailController.notifyTaskHistoryChanged(id);
  }
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
    const fullLabel = normalizeToken(m.name) || normalizeToken(m.email) || "Без имени";
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

const getFlowStatusLabel = (statusValue) => STATUS_LABELS[toStatusValue(statusValue)] || STATUS_LABELS[1];

let dragColumn = null;
let lastAfter = null;
let dragTask = null;
let dragTaskColumn = null;
let lastTaskAfter = null;
let lastTaskContainer = null;
let dragTrashTaskId = null;
let dragTrashTaskTitle = "";
let activeTaskColumn = null;
let editingTaskId = null;
let editingTaskCard = null;
let isAddColumnMenuOpen = false;
let isFlowClearMenuOpen = false;


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
      styleToggle.setAttribute("aria-label", "Переключить на колонки");
      styleToggle.setAttribute("title", "Переключить на колонки");
    } else {
      styleToggle.setAttribute("aria-label", "Переключить на карту потока");
      styleToggle.setAttribute("title", "Переключить на карту потока");
    }
  }

  if (styleSwitch) {
    styleSwitch.classList.toggle("is-flow", nextStyle === "flow");
  }

  if (styleToggleTitleEl) {
    styleToggleTitleEl.textContent = nextStyle === "flow" ? "Карта потока" : "Колонки";
  }

  if (styleToggleSubEl) {
    styleToggleSubEl.textContent = "Нажмите, чтобы переключить";
  }

  if (nextStyle === "flow" && calendarLayout) {
    calendarLayout.setAttribute("aria-hidden", "true");
    calendarLayout.innerHTML = "";
  }

  if (nextStyle !== "flow") {
    setFlowClearMenuOpen(false);
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
  const avatarPath = normalizeToken(user?.avatarPath);

  const item = buildUserItem(name, email, { role });
  item.dataset.userId = Number.isFinite(id) ? String(id) : "";
  item.dataset.userRole = role;
  item.dataset.userKey = `${id} ${name} ${email} ${role}`.toLowerCase();
  if (options?.isCurrent) item.classList.add("is-current");

  const avatarEl = item.querySelector(".user-avatar");
  if (avatarEl) {
    const letter = (name || "U").trim().charAt(0) || "U";
    applyAccountAvatarToElement(avatarEl, null, letter.toUpperCase(), avatarPath);
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

  refreshInviteControlsState();

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
      name: normalizeToken(u.name) || normalizeToken(u.email) || "Без имени",
      email: normalizeToken(u.email),
      avatarPath: normalizeToken(u.avatarPath),
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

const updateMyMemberItem = (displayName, email, avatarPath) => {
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
    applyAccountAvatarToElement(avatar, null, letter.toUpperCase(), normalizeToken(avatarPath));
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
        email: safeEmail,
        avatarPath: normalizeToken(avatarPath)
      };
    });
    workspaceMembers = nextMembers;
    renderAssigneeOptions();
  }
};

const parseApiErrorMessage = async (response, fallback) => {
  try {
    const payload = await response.json();
    const message = normalizeToken(payload?.error || payload?.title);
    if (message) return message;
  } catch {
    // ignore parse errors
  }
  return fallback;
};

const getActorDisplayName = () => {
  const apiName = normalizeToken(actorUser?.name);
  if (apiName && apiName.toLowerCase() !== "system") {
    return apiName;
  }
  return "Без имени";
};

const formatCooldownTime = (totalSeconds) => {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const getNicknameCooldownRemainingSeconds = () => {
  if (!Number.isFinite(nicknameCooldownEndsAt) || nicknameCooldownEndsAt <= 0) return 0;
  return Math.max(0, Math.ceil((nicknameCooldownEndsAt - Date.now()) / 1000));
};

const stopNicknameCooldownTimer = () => {
  if (nicknameCooldownTimerHandle) {
    window.clearInterval(nicknameCooldownTimerHandle);
    nicknameCooldownTimerHandle = null;
  }
};

const setNicknameStatusMessage = (message, isError = false) => {
  nicknameStatusMessage = normalizeToken(message);
  nicknameStatusIsError = !!isError;
};

const clearNicknameStatusMessage = () => {
  nicknameStatusMessage = "";
  nicknameStatusIsError = false;
};

const renderNicknameStatus = () => {
  if (!settingsNicknameCooldownEl) return;

  const remaining = getNicknameCooldownRemainingSeconds();
  if (remaining > 0) {
    settingsNicknameCooldownEl.textContent = `Следующая смена ника через ${formatCooldownTime(remaining)}`;
    settingsNicknameCooldownEl.classList.remove("is-error");
    settingsNicknameCooldownEl.removeAttribute("hidden");
    return;
  }

  if (nicknameStatusMessage) {
    settingsNicknameCooldownEl.textContent = nicknameStatusMessage;
    settingsNicknameCooldownEl.classList.toggle("is-error", nicknameStatusIsError);
    settingsNicknameCooldownEl.removeAttribute("hidden");
    return;
  }

  settingsNicknameCooldownEl.textContent = "";
  settingsNicknameCooldownEl.classList.remove("is-error");
  settingsNicknameCooldownEl.setAttribute("hidden", "");
};

const refreshNicknameControls = () => {
  const canUseNicknameSettings = Number.isFinite(Number(getActorUserId()));
  const remaining = getNicknameCooldownRemainingSeconds();
  const isCooldownActive = remaining > 0;
  const currentDisplayName = getActorDisplayName();
  const draftNickname = normalizeToken(settingsNicknameInput?.value);
  const isDirty = draftNickname !== normalizeToken(currentDisplayName);
  const hasDraft = draftNickname.length > 0;

  if (settingsNicknameInput) {
    settingsNicknameInput.disabled = !canUseNicknameSettings || nicknameSaveInFlight || isCooldownActive;
  }

  if (settingsNicknameSaveBtn) {
    settingsNicknameSaveBtn.disabled = !canUseNicknameSettings
      || nicknameSaveInFlight
      || isCooldownActive
      || !hasDraft
      || !isDirty;
    settingsNicknameSaveBtn.textContent = nicknameSaveInFlight ? "Сохраняем..." : "Сохранить";
  }

  renderNicknameStatus();
};

const syncNicknameCooldownFromActor = () => {
  const raw = normalizeToken(actorUser?.nicknameChangeAvailableAtUtc);
  const nextAllowedAt = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(nextAllowedAt) && nextAllowedAt > Date.now()) {
    nicknameCooldownEndsAt = nextAllowedAt;
  } else {
    nicknameCooldownEndsAt = 0;
  }

  if (getNicknameCooldownRemainingSeconds() > 0) {
    if (!nicknameCooldownTimerHandle) {
      nicknameCooldownTimerHandle = window.setInterval(() => {
        if (getNicknameCooldownRemainingSeconds() <= 0) {
          nicknameCooldownEndsAt = 0;
          stopNicknameCooldownTimer();
          clearNicknameStatusMessage();
        }
        refreshNicknameControls();
      }, 1000);
    }
  } else {
    stopNicknameCooldownTimer();
  }
};

const updateActorUi = () => {
  const email = actorUser?.email || "account@example.com";
  const id = getActorUserId();
  const displayName = getActorDisplayName();
  const initials = toInitials(displayName, email);
  const avatarPath = normalizeToken(actorUser?.avatarPath);

  if (userNameEl) {
    userNameEl.textContent = displayName || email;
    if (displayName && displayName !== email) {
      userNameEl.setAttribute("title", email);
    } else {
      userNameEl.removeAttribute("title");
    }
  }

  applyAccountAvatarToElement(accountAvatarEl, accountAvatarTextEl, initials, avatarPath);
  applyAccountAvatarToElement(settingsAvatarPreview, settingsAvatarPreviewTextEl, initials, avatarPath);

  updateMyMemberItem(displayName, email, avatarPath);

  if (settingsNicknameInput && document.activeElement !== settingsNicknameInput) {
    settingsNicknameInput.value = displayName;
  }

  refreshNicknameControls();
};

const setActorUser = (user) => {
  if (!user) return;
  const id = Number(user.id);
  if (!Number.isFinite(id) || id <= 0) return;
  actorUser = {
    id,
    name: normalizeToken(user.name) || `Пользователь ${id}`,
    email: normalizeToken(user.email) || `user${id}@local`,
    avatarPath: normalizeToken(user.avatarPath),
    nicknameChangeAvailableAtUtc: normalizeToken(user.nicknameChangeAvailableAtUtc)
  };

  syncNicknameCooldownFromActor();
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

  refreshInviteControlsState();

  if (panelWorkspaceEditBtn) {
    panelWorkspaceEditBtn.hidden = !isAdmin();
    panelWorkspaceEditBtn.disabled = false;
    panelWorkspaceEditBtn.title = "Редактировать";
  }

  if (userAddSection) {
    userAddSection.hidden = !isAdmin();
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
  nicknameCooldownEndsAt = 0;
  stopNicknameCooldownTimer();
  clearNicknameStatusMessage();
  updateActorUi();
};

const migrateLegacyAvatarIfNeeded = async () => {
  const id = getActorUserId();
  if (!id) return;

  if (normalizeToken(actorUser?.avatarPath)) {
    setStoredAccountAvatar(id, "");
    return;
  }

  const legacyAvatar = getStoredAccountAvatar(id);
  if (!legacyAvatar || !legacyAvatar.startsWith("data:image/")) {
    return;
  }

  try {
    const legacyBlob = await fetch(legacyAvatar).then((response) => response.blob());
    if (!legacyBlob || legacyBlob.size <= 0) return;

    const ext = legacyBlob.type === "image/png"
      ? "png"
      : legacyBlob.type === "image/webp"
        ? "webp"
        : "jpg";

    const form = new FormData();
    form.append("file", legacyBlob, `legacy-avatar.${ext}`);

    const response = await apiFetch(buildApiUrl("/auth/avatar"), {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      return;
    }

    const updated = await response.json();
    if (updated?.id) {
      setActorUser(updated);
      setStoredAccountAvatar(id, "");
      await loadUsersFromApi();
    }
  } catch {
    // ignore one-time migration errors
  }
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

  if (flowEditorController && typeof flowEditorController.applyTaskPhoto === "function") {
    flowEditorController.applyTaskPhoto(id, dataUrl || "");
  }
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

const profileModalsController = createProfileModalsController({
  getWorkspaceId: () => currentWorkspaceId,
  buildApiUrl,
  apiFetch,
  handleApiError,
  normalizeToken,
  toInitials,
  applyAccountAvatarToElement,
  getRoleLabel,
  statusLabels: STATUS_LABELS,
  toStatusValue
});

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
    profileModalsController.openProfileModal(member);
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

const isOwner = () => String(currentWorkspaceRole || "") === "Owner";

const shouldShowTrashZone = () => {
  if (!taskTrashZone || !board) return false;
  if (!isAdmin()) return false;
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
  if (boardToolbar) {
    boardToolbar.classList.toggle("is-trash-mode", show);
  }
  if (!show) {
    taskTrashZone.classList.remove("is-over");
  }
};

const setTrashZoneOver = (over) => {
  if (!taskTrashZone) return;
  taskTrashZone.classList.toggle("is-over", Boolean(over));
};

const parseTrashDragInfo = (dataTransfer) => {
  if (!dataTransfer) return { id: null, title: "" };
  const raw = String(dataTransfer.getData("text/plain") || "").trim();
  if (!raw) return { id: null, title: "" };

  try {
    const payload = JSON.parse(raw);
    if (payload && typeof payload === "object") {
      const id = Number.parseInt(String(payload.taskId ?? payload.id ?? ""), 10);
      const title = normalizeToken(payload.title);
      return {
        id: Number.isFinite(id) && id > 0 ? id : null,
        title
      };
    }
  } catch {
    // ignore
  }

  const id = Number.parseInt(raw, 10);
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    title: ""
  };
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

const setFlowClearMenuOpen = (open) => {
  if (!flowClearMenu || !flowClearBtn) {
    isFlowClearMenuOpen = false;
    return;
  }

  isFlowClearMenuOpen = Boolean(open);
  flowClearMenu.toggleAttribute("hidden", !isFlowClearMenuOpen);
  flowClearBtn.setAttribute("aria-expanded", isFlowClearMenuOpen ? "true" : "false");
};

const runFlowClearAction = async (action) => {
  const type = normalizeToken(action).toLowerCase();
  if (!type) return;

  if (type === "all") {
    const confirmed = await openConfirmModal({
      kicker: "Карта потока",
      title: "Очистить всю карту потока?",
      message: "Будут удалены все узлы и связи на карте. Задачи в проекте останутся.",
      confirmText: "Очистить карту"
    });
    if (confirmed === true) {
      clearFlowBoard();
    }
    return;
  }

  if (type === "links") {
    const confirmed = await openConfirmModal({
      kicker: "Карта потока",
      title: "Удалить все стрелки?",
      message: "Узлы останутся на месте. Будут удалены только связи между ними.",
      confirmText: "Удалить стрелки"
    });
    if (confirmed === true) {
      clearFlowLinks();
    }
  }
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

const toFlowDueDateIso = (value) => {
  const token = normalizeToken(value);
  if (!token) return "";
  const date = new Date(token);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const buildFlowNodeDetailNote = (taskData, statusValue) => {
  const description = normalizeToken(taskData?.description);
  const duePart = `Срок: ${formatDueLabel(taskData?.dueDate, statusValue) || "Без срока"}`;
  if (!description) {
    return duePart;
  }
  return `${description} • ${duePart}`;
};

const buildFlowTaskPayloadFromTask = (taskData) => {
  const statusValue = toStatusValue(taskData?.statusValue ?? taskData?.status);
  const statusLabel = getFlowStatusLabel(statusValue);
  const note = buildFlowNote(taskData);
  const title = normalizeToken(taskData?.title) || "Новая задача";
  const parsedTaskId = Number.parseInt(String(taskData?.id ?? ""), 10);
  const taskId = Number.isFinite(parsedTaskId) && parsedTaskId > 0 ? parsedTaskId : null;
  const taskPhoto = taskId ? normalizeToken(getStoredTaskBg(taskId)) : "";

  return {
    title,
    tag: statusLabel,
    note,
    detailNote: buildFlowNodeDetailNote(taskData, statusValue),
    description: taskData?.description ? String(taskData.description) : "",
    dueDate: toFlowDueDateIso(taskData?.dueDate),
    statusValue,
    taskId: taskId ? String(taskId) : "",
    taskKey: taskId
      ? `task:${taskId}`
      : buildTaskKey({ title, tag: statusLabel, note }),
    taskPhoto
  };
};

const openTaskDetailsById = (taskId, sourceElement = null) => {
  const id = Number.parseInt(String(taskId ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return;
  if (!taskDetailController || typeof taskDetailController.openTaskDetailModalForTask !== "function") return;
  const taskCard = document.querySelector(`.task-card[data-task-id="${id}"]`) || sourceElement || null;
  void taskDetailController.openTaskDetailModalForTask(id, taskCard);
};

const createFlowTaskItem = (taskData) => {
  const payload = buildFlowTaskPayloadFromTask(taskData);
  const item = document.createElement("div");
  item.className = "flow-task";
  item.setAttribute("draggable", "true");
  item.dataset.taskTitle = payload.title;
  item.dataset.taskTag = payload.tag;
  item.dataset.taskNote = payload.note;
  item.dataset.taskDetailNote = payload.detailNote;
  item.dataset.taskDescription = payload.description;
  item.dataset.taskStatus = String(payload.statusValue);
  if (payload.taskId) {
    item.dataset.taskId = payload.taskId;
  }
  item.dataset.taskKey = payload.taskKey;
  if (payload.dueDate) item.dataset.taskDueDate = payload.dueDate;
  item.dataset.taskUrgency = getUrgency(payload.dueDate, payload.statusValue);

  if (payload.taskPhoto) {
    item.classList.add("has-photo");
    item.dataset.taskPhoto = payload.taskPhoto;
    item.style.setProperty("--task-photo", `url('${payload.taskPhoto.replace(/'/g, "%27")}')`);
  }

  const tag = document.createElement("span");
  tag.className = "flow-task-tag";
  tag.textContent = payload.tag;
  const title = document.createElement("span");
  title.className = "flow-task-title";
  title.textContent = payload.title;
  const noteEl = document.createElement("span");
  noteEl.className = "flow-task-note";
  noteEl.textContent = payload.note;

  item.append(tag, title, noteEl);
  return item;
};

const flowEditorController = createFlowEditorController({
  flowCanvas,
  flowScene,
  flowLinks,
  flowNodesLayer,
  flowDropzone,
  flowListItems,
  clampValue,
  normalizeToken,
  buildTaskKey,
  buildFlowNote,
  getFlowStatusLabel,
  getTasks: () => lastNormalizedTasks,
  buildFlowTaskPayloadFromTask,
  createFlowTaskItem,
  getStoredFlowState: () => {
    if (!currentWorkspaceId) return null;
    return getStoredWorkspaceFlowMap(currentWorkspaceId);
  },
  setStoredFlowState: (state) => {
    if (!currentWorkspaceId) return;
    setStoredWorkspaceFlowMap(currentWorkspaceId, state);
  },
  onFlowTaskOpenDetails: (taskId, source) => {
    openTaskDetailsById(taskId, source);
  },
  onFlowTaskDragStart: (payload) => {
    const id = Number.parseInt(String(payload?.taskId ?? ""), 10);
    dragTrashTaskId = Number.isFinite(id) && id > 0 ? id : null;
    dragTrashTaskTitle = normalizeToken(payload?.title) || "";
    setTrashZoneVisible(true);
  },
  onFlowTaskDragEnd: () => {
    dragTrashTaskId = null;
    dragTrashTaskTitle = "";
    setTrashZoneOver(false);
    setTrashZoneVisible(false);
  }
});

const {
  updateFlowEmptyState,
  updateFlowLines,
  initFlowTask,
  rebuildFlowPool,
  updateFlowNodesForTask,
  removeFlowNodesByTaskId,
  clearFlowBoard,
  clearFlowLinks,
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
    void sweepAutoOverdueTasks();
  }, 60 * 1000);
};

const applyAutoOverdueToTask = (task) => {
  const id = Number.parseInt(String(task?.id ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return;

  const before = lastNormalizedTasks.find((t) => Number(t?.id) === Number(id)) || null;
  const next = {
    ...task,
    status: 4,
    statusValue: 4
  };

  const historyLines = buildTaskHistoryLines(before, next);
  recordTaskHistory(id, {
    at: Date.now(),
    title: "Задача просрочена",
    source: "Авто",
    lines: historyLines.length ? historyLines : ["Статус: Просрочено"]
  });

  if (isTaskVisibleWithCurrentFilters(next)) {
    upsertTaskInState(next);
    applyTaskUpsertToUi(next);
  } else {
    removeTaskFromState(id);
    applyTaskRemovalToUi(id);
  }
};

const sweepAutoOverdueTasks = async (maxCount = 10_000) => {
  const list = Array.isArray(lastNormalizedTasks) ? lastNormalizedTasks : [];
  if (!list.length) return;

  const now = Date.now();
  const candidates = [];

  list.forEach((task) => {
    const id = Number.parseInt(String(task?.id ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return;

    const statusValue = toStatusValue(task?.statusValue ?? task?.status);
    if (statusValue === 3 || statusValue === 4) return;

    const dueDate = normalizeToken(task?.dueDate);
    if (!dueDate) return;
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return;
    if (due.getTime() >= now) return;

    candidates.push(task);
  });

  // Keep the sweep cheap.
  const limit = Number.isFinite(Number(maxCount)) && Number(maxCount) > 0 ? Number(maxCount) : 10_000;
  candidates.slice(0, limit).forEach((task) => {
    applyAutoOverdueToTask(task);
  });
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
  updateFlowNodesForTask(taskData);

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
  removeFlowNodesByTaskId(taskId);

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

  recordTaskHistory(createdId, {
    at: Date.now(),
    title: "Создана задача",
    source: "Создание",
    lines: [normalizeToken(taskData.title) ? `Название: ${normalizeToken(taskData.title)}` : ""]
      .filter(Boolean)
  });

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

  const before = lastNormalizedTasks.find((t) => Number(t?.id) === Number(updatedId)) || null;
  const historyLines = buildTaskHistoryLines(before, normalizedTask);
  if (historyLines.length) {
    recordTaskHistory(updatedId, {
      at: Date.now(),
      title: "Изменение задачи",
      source: "Редактирование",
      lines: historyLines
    });
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
  const before = lastNormalizedTasks.find((t) => Number(t?.id) === Number(id)) || null;
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

  const historyLines = buildTaskHistoryLines(before, normalizedTask);
  if (historyLines.length) {
    recordTaskHistory(id, {
      at: Date.now(),
      title: "Изменение задачи",
      source: "Перетаскивание",
      lines: historyLines
    });
  }

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
  void sweepAutoOverdueTasks();
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

const canDragTaskCard = () => {
  if (!board) return false;
  const view = board.dataset.view || "board";
  const style = board.dataset.style || "columns";
  const overlay = board.dataset.overlay || "";

  if (style !== "columns") {
    return shouldShowTrashZone();
  }

  if (overlay === "grid") {
    return shouldShowTrashZone();
  }

  if (view === "calendar" || view === "priority") {
    return shouldShowTrashZone();
  }

  return true;
};

const initTaskCard = (card) => {
  if (!card || card.classList.contains("is-empty")) return;
  card.setAttribute("draggable", "true");
  card.addEventListener("dragstart", onTaskDragStart);
  card.addEventListener("dragend", onTaskDragEnd);
  card.addEventListener("dblclick", () => {
    const id = Number.parseInt(card.dataset.taskId || "", 10);
    if (!Number.isFinite(id)) return;
    openTaskDetailsById(id, card);
  });
};

const onTaskDragStart = (event) => {
  if (!canDragTaskCard()) {
    event.preventDefault();
    return;
  }
  const card = event.currentTarget;
  if (!(card instanceof Element)) return;
  dragTask = card;
  dragTaskColumn = card.closest(".column");
  dragTrashTaskId = Number.parseInt(card.dataset.taskId || "", 10);
  dragTrashTaskTitle = card.querySelector("h3")?.textContent?.trim() || "";
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
  dragTrashTaskId = null;
  dragTrashTaskTitle = "";
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

const canMoveTasksBetweenColumns = () => {
  if (!board) return false;
  if (board.dataset.overlay === "grid") return false;
  if (board.dataset.style !== "columns") return false;
  const view = board.dataset.view || "board";
  return view === "board" || view === "list";
};

const onTaskDragOver = (event) => {
  if (!canMoveTasksBetweenColumns()) return;
  if (!dragTask) return;
  event.preventDefault();
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
  if (!canMoveTasksBetweenColumns()) return;
  if (!dragTask) return;
  event.preventDefault();
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
    if (!shouldShowTrashZone()) return;
    const parsed = parseTrashDragInfo(event.dataTransfer);
    const id = Number.isFinite(dragTrashTaskId) && dragTrashTaskId > 0 ? dragTrashTaskId : parsed.id;
    if (!id) return;
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
    if (!shouldShowTrashZone()) return;
    event.preventDefault();
    event.stopPropagation();
    setTrashZoneOver(false);
    const parsed = parseTrashDragInfo(event.dataTransfer);
    const id = Number.isFinite(dragTrashTaskId) && dragTrashTaskId > 0 ? dragTrashTaskId : parsed.id;
    const title = dragTrashTaskTitle || parsed.title || "";
    if (!Number.isFinite(Number(id)) || Number(id) <= 0) {
      setTrashZoneVisible(false);
      syncTaskStateToUi();
      return;
    }
    const confirmed = await openConfirmModal({
      kicker: "Удаление задачи",
      title: title ? `Удалить "${title}"?` : "Удалить эту задачу?",
      message: "Эта задача и ее метаданные будут удалены с доски.",
      confirmText: "Удалить задачу"
    });
    if (confirmed !== true) {
      setTrashZoneVisible(false);
      dragTrashTaskId = null;
      dragTrashTaskTitle = "";
      syncTaskStateToUi();
      return;
    }
    void (async () => {
      const deleted = await deleteTaskViaApi(id);
      setTrashZoneVisible(false);
      dragTrashTaskId = null;
      dragTrashTaskTitle = "";
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

inviteControls = createInviteControls({
  inputEl: userAddInput,
  buttonEl: userAddBtn,
  canManageInvites: () => isAdmin() && Number.isFinite(Number(currentWorkspaceId)) && Number(currentWorkspaceId) > 0,
  getWorkspaceId: () => currentWorkspaceId,
  sendInvite: async (workspaceId, email) => {
    return await fetchJsonOrNull(buildApiUrl(`/spaces/${workspaceId}/invites`), "Отправка приглашения", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email, role: 1 })
    });
  },
  onInviteSent: async () => {
    await notificationsController.refreshUnreadCount();
  }
});
inviteControls.bind();

if (openSpacesHomeBtn) {
  openSpacesHomeBtn.addEventListener("click", () => {
    navigateToSpacesPage();
  });
}

refreshInviteControlsState();

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

if (flowClearBtn) {
  flowClearBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setFlowClearMenuOpen(!isFlowClearMenuOpen);
  });
}

if (flowClearMenu) {
  flowClearMenu.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".flow-clear-menu-item[data-flow-clear]")
      : null;
    if (!(target instanceof HTMLButtonElement)) return;

    event.preventDefault();
    event.stopPropagation();
    const action = normalizeToken(target.dataset.flowClear).toLowerCase();
    setFlowClearMenuOpen(false);
    void runFlowClearAction(action);
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
  if (!isFlowClearMenuOpen) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    setFlowClearMenuOpen(false);
    return;
  }
  if (target.closest("#flow-clear-task") || target.closest("#flow-clear-menu")) {
    return;
  }
  setFlowClearMenuOpen(false);
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
  if (!target || !profileModalsController.isProfileModalOpen()) return;
  if (target.closest("[data-close-profile]")) {
    profileModalsController.closeProfileModal();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !profileModalsController.isAvatarModalOpen()) return;
  if (target.closest("[data-close-avatar]")) {
    profileModalsController.closeAvatarModal();
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

taskDetailController = createTaskDetailController({
  canEditTask: isAdmin,
  ensureTagsLoaded,
  getTagNameById: (id) => tagById.get(Number(id)) || "",
  getAssigneeNameById: (id) => {
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
    if (isFlowClearMenuOpen) {
      setFlowClearMenuOpen(false);
      return;
    }
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
    if (profileModalsController.closeAvatarModal()) {
      return;
    }
    if (profileModalsController.closeProfileModal()) {
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
    if (!isOwner()) return;

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
    clearNicknameStatusMessage();
    refreshNicknameControls();
  });

  settingsNicknameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    settingsNicknameSaveBtn?.click();
  });
}

if (settingsNicknameSaveBtn) {
  settingsNicknameSaveBtn.addEventListener("click", () => {
    void (async () => {
      const actorUserId = getActorUserId();
      if (!actorUserId) return;
      if (nicknameSaveInFlight) return;
      if (getNicknameCooldownRemainingSeconds() > 0) {
        refreshNicknameControls();
        return;
      }

      const nickname = normalizeToken(settingsNicknameInput?.value);
      const currentDisplayName = normalizeToken(getActorDisplayName());
      if (!nickname || nickname === currentDisplayName) {
        refreshNicknameControls();
        return;
      }

      nicknameSaveInFlight = true;
      clearNicknameStatusMessage();
      refreshNicknameControls();

      const response = await apiFetch(buildApiUrl("/auth/nickname"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ nickname })
      });

      if (!response.ok) {
        const message = await parseApiErrorMessage(response, "Не удалось изменить ник.");
        setNicknameStatusMessage(message, true);
        if (response.status === 400) {
          await loadCurrentUserFromApi();
        }
        nicknameSaveInFlight = false;
        refreshNicknameControls();
        return;
      }

      let updatedUser = null;
      try {
        updatedUser = await response.json();
      } catch {
        updatedUser = null;
      }

      if (updatedUser?.id) {
        setActorUser(updatedUser);
      } else {
        await loadCurrentUserFromApi();
      }

      clearNicknameStatusMessage();
      nicknameSaveInFlight = false;
      refreshNicknameControls();
    })();
  });
}

if (settingsAvatarBtn && settingsAvatarInput) {
  settingsAvatarBtn.addEventListener("click", () => {
    settingsAvatarInput.click();
  });
}

if (settingsAvatarInput) {
  settingsAvatarInput.addEventListener("change", () => {
    void (async () => {
      const file = settingsAvatarInput.files && settingsAvatarInput.files[0];
      settingsAvatarInput.value = "";
      if (!getActorUserId() || !file) return;

      const form = new FormData();
      form.append("file", file);

      const response = await apiFetch(buildApiUrl("/auth/avatar"), {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        await handleApiError(response, "Обновление аватара аккаунта");
        return;
      }

      try {
        const updated = await response.json();
        if (updated?.id) {
          setActorUser(updated);
        } else {
          await loadCurrentUserFromApi();
        }
      } catch {
        await loadCurrentUserFromApi();
      }

      await loadUsersFromApi();
    })();
  });
}

if (settingsAvatarClearBtn) {
  settingsAvatarClearBtn.addEventListener("click", () => {
    void (async () => {
      if (!getActorUserId()) return;

      const response = await apiFetch(buildApiUrl("/auth/avatar"), {
        method: "DELETE"
      });

      if (!response.ok) {
        await handleApiError(response, "Очистка аватара аккаунта");
        return;
      }

      if (settingsAvatarInput) settingsAvatarInput.value = "";

      try {
        const updated = await response.json();
        if (updated?.id) {
          setActorUser(updated);
        } else {
          await loadCurrentUserFromApi();
        }
      } catch {
        await loadCurrentUserFromApi();
      }

      await loadUsersFromApi();
    })();
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

if (taskDetailHistoryToggleBtn) {
  taskDetailHistoryToggleBtn.addEventListener("click", taskDetailController.onHistoryToggleClick);
}

if (taskDetailHistoryClearBtn) {
  taskDetailHistoryClearBtn.addEventListener("click", taskDetailController.onHistoryClearClick);
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
  await migrateLegacyAvatarIfNeeded();
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
  await notificationsController.refreshUnreadCount();
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
    void notificationsController.onPanelOpened();
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
