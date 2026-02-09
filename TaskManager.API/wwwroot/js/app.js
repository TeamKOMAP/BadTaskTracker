const board = document.getElementById("board");
const appShell = document.getElementById("app-shell");
const brandToggle = document.getElementById("brand-toggle");
const userPanel = document.getElementById("user-panel");
const columnsWrap = document.getElementById("board-columns");
const addColumnBtn = document.getElementById("add-column");
const viewButtons = document.querySelectorAll(".view-btn");
const viewToggle = document.querySelector(".view-toggle");
const styleToggle = document.getElementById("style-toggle");
const flowLayout = document.getElementById("flow-layout");
const flowCanvas = document.getElementById("flow-canvas");
const flowLinks = document.getElementById("flow-links");
const flowDropzone = document.getElementById("flow-dropzone");
const flowListItems = document.querySelector(".flow-list-items");
const flowAddTaskBtn = document.getElementById("flow-add-task");
const taskModal = document.getElementById("task-modal");
const taskForm = document.getElementById("task-form");
const taskTheme = document.getElementById("task-theme");
const themeOptions = document.getElementById("theme-options");
const themeToggle = document.querySelector(".theme-toggle");
const taskTitle = document.getElementById("task-title");
const taskDescription = document.getElementById("task-description");
const taskDue = document.getElementById("task-due");
const taskAssignee = document.getElementById("task-assignee");
const taskPriority = document.getElementById("task-priority");
const taskTagsInput = document.getElementById("task-tags-input");
const tagOptions = document.getElementById("tag-options");
const tagPreview = document.getElementById("tag-preview");
const userSearch = document.getElementById("user-search");
const userList = document.getElementById("user-list");
const userEmpty = document.getElementById("user-empty");
const userAddInput = document.getElementById("user-add-input");
const userAddBtn = document.getElementById("user-add-btn");
const themeToggleBtn = document.getElementById("theme-toggle");
const taskBgInput = document.getElementById("task-bg-input");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const taskModalKicker = taskModal?.querySelector(".task-modal-kicker") || null;
const taskModalTitleEl = document.getElementById("task-modal-title");
const taskFormSubmitBtn = taskForm?.querySelector('button[type="submit"]') || null;

const API_BASE = (() => {
  const params = new URLSearchParams(window.location.search);
  const api = String(params.get("api") ?? "").trim();
  if (!api) return "/api";
  return api.endsWith("/api") ? api : `${api.replace(/\/$/, "")}/api`;
})();
const DEFAULT_ASSIGNEE_ID = 1;
const DEFAULT_DUE_DAYS = 7;
const DEFAULT_PRIORITY_VALUE = 2;

const URGENCY = {
  green: "green",
  blue: "blue",
  yellow: "yellow",
  red: "red",
  done: "done",
  none: "none"
};

const STATUS_VALUE_MAP = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  New: 1,
  InProgress: 2,
  Done: 3,
  Overdue: 4
};

const STATUS_LABELS = {
  1: "New",
  2: "In Progress",
  3: "Done",
  4: "Overdue"
};

const STATUS_LABEL_SET = new Set(Object.values(STATUS_LABELS));

const STATUS_TO_COLUMN = {
  1: "todo",
  2: "progress",
  3: "done",
  4: "archive"
};

const COLUMN_TO_STATUS = {
  todo: 1,
  progress: 2,
  done: 3,
  archive: 4
};

const PRIORITY_VALUE_MAP = {
  1: 1,
  2: 2,
  3: 3,
  Low: 1,
  Medium: 2,
  High: 3
};

const PRIORITY_LABELS = {
  1: "low",
  2: "medium",
  3: "high"
};

const extraColumnNames = ["Backlog", "Blocked", "QA", "Ideas", "Ready"];
let newColumnIndex = 0;
let dragColumn = null;
let lastAfter = null;
let dragTask = null;
let dragTaskColumn = null;
let lastTaskAfter = null;
let lastTaskContainer = null;
let selectedFlowNode = null;
const flowConnections = new Map();
let activeTaskColumn = null;
let editingTaskId = null;
let editingTaskCard = null;

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

const removeColumn = (column) => {
  if (!column) return;
  const finalize = () => {
    column.remove();
    setColumnDelays();
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
  const nextStyle = style === "flow" ? "flow" : "columns";
  board.dataset.style = nextStyle;

  if (flowLayout) {
    flowLayout.setAttribute("aria-hidden", nextStyle !== "flow");
  }

  if (styleToggle) {
    const title = styleToggle.querySelector(".style-toggle-title");
    const sub = styleToggle.querySelector(".style-toggle-sub");
    styleToggle.classList.toggle("is-flow", nextStyle === "flow");
    styleToggle.setAttribute("aria-pressed", nextStyle === "flow" ? "true" : "false");
    if (title && sub) {
      if (nextStyle === "flow") {
        title.textContent = "Flow Map";
        sub.textContent = "Back to Columns Board";
      } else {
        title.textContent = "Columns Board";
        sub.textContent = "Switch to Flow Map";
      }
    }
  }

  if (viewToggle) {
    viewToggle.toggleAttribute("hidden", nextStyle === "flow");
  }

  requestAnimationFrame(() => {
    updateFlowLines();
  });
};

const updateFlowEmptyState = () => {
  if (!flowCanvas || !flowDropzone) return;
  const hasNodes = Boolean(flowCanvas.querySelector(".flow-node"));
  flowDropzone.classList.toggle("is-hidden", hasNodes);
};

const isPanelOpen = () => appShell?.classList.contains("is-panel-open");

const setPanelOpen = (open) => {
  if (!appShell) return;
  appShell.classList.toggle("is-panel-open", open);
  if (brandToggle) {
    brandToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (userPanel) {
    userPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }
};

const getDefaultColumn = () =>
  document.querySelector('.column[data-column-id="todo"]') || document.querySelector(".column");

const normalizeToken = (value) => String(value || "").trim();

const normalizeEmail = (value) => {
  const raw = normalizeToken(value);
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  return `${raw.toLowerCase()}@goodtask.com`;
};

const toStatusValue = (status) => {
  if (status === null || status === undefined) return 1;
  if (typeof status === "number") {
    return STATUS_VALUE_MAP[status] ?? 1;
  }
  return STATUS_VALUE_MAP[String(status)] ?? 1;
};

const toPriorityValue = (priority) => {
  if (priority === null || priority === undefined) return DEFAULT_PRIORITY_VALUE;
  if (typeof priority === "number") {
    return PRIORITY_VALUE_MAP[priority] ?? DEFAULT_PRIORITY_VALUE;
  }
  return PRIORITY_VALUE_MAP[String(priority)] ?? DEFAULT_PRIORITY_VALUE;
};

const getPriorityLabel = (priorityValue) => PRIORITY_LABELS[priorityValue] || "medium";

const getColumnIdForStatus = (statusValue) => STATUS_TO_COLUMN[statusValue] || "todo";

const getStatusForColumnId = (columnId) => COLUMN_TO_STATUS[columnId] || null;

const pad2 = (value) => String(value).padStart(2, "0");

const formatDateTimeLocal = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const toDateTimeLocalValue = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTimeLocal(date);
};

const getDefaultDueDateLocalValue = () => {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_DUE_DAYS);
  date.setSeconds(0, 0);
  return formatDateTimeLocal(date);
};

const getDefaultDueDateIso = () => {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_DUE_DAYS);
  return date.toISOString();
};

const formatShortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
};

const getUrgency = (dueDateIso, statusValue) => {
  if (statusValue === 3) return URGENCY.done;
  if (!dueDateIso) return URGENCY.none;
  const due = new Date(dueDateIso);
  if (Number.isNaN(due.getTime())) return URGENCY.none;
  const remainingMs = due.getTime() - Date.now();
  if (remainingMs < 0) return URGENCY.red;
  if (remainingMs <= 24 * 60 * 60 * 1000) return URGENCY.yellow;
  if (remainingMs <= 3 * 24 * 60 * 60 * 1000) return URGENCY.blue;
  return URGENCY.green;
};

const formatDurationShort = (ms) => {
  const absMs = Math.abs(ms);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  if (absMs < minuteMs) return "<1m";

  const days = Math.floor(absMs / dayMs);
  const hours = Math.floor((absMs % dayMs) / hourMs);

  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`;
    return `${days}d`;
  }

  if (hours > 0) {
    const minutes = Math.floor((absMs % hourMs) / minuteMs);
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }

  const minutes = Math.max(1, Math.floor(absMs / minuteMs));
  return `${minutes}m`;
};

const formatDueLabel = (dueDate, statusValue) => {
  if (!dueDate) return "No due date";
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "No due date";
  if (statusValue === 3) return "Completed";

  const diffMs = date.getTime() - Date.now();
  const duration = formatDurationShort(diffMs);
  const short = formatShortDate(dueDate);
  const withDate = Math.abs(diffMs) >= 24 * 60 * 60 * 1000 && short ? ` · ${short}` : "";

  if (diffMs >= 0) return `In ${duration}${withDate}`;
  return `Overdue by ${duration}${withDate}`;
};

const parseTagIds = (raw) => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
};

// Theme
const getPreferredTheme = () => {
  try {
    const saved = localStorage.getItem("gtt-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const setTheme = (theme) => {
  const next = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = next;
  try {
    localStorage.setItem("gtt-theme", next);
  } catch {
    // ignore
  }
};

const toggleTheme = () => {
  const current = document.body.dataset.theme || "dark";
  setTheme(current === "dark" ? "light" : "dark");
};

// Task background images
const taskBgKey = (id) => `gtt-taskbg:${id}`;

const taskMetaKey = (id) => `gtt-taskmeta:${id}`;

const getStoredTaskMeta = (id) => {
  try {
    const raw = localStorage.getItem(taskMetaKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const theme = typeof parsed.theme === "string" ? parsed.theme : "";
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [];
    return {
      theme: theme.trim(),
      tags: tags.map((t) => t.trim()).filter(Boolean)
    };
  } catch {
    return null;
  }
};

const setStoredTaskMeta = (id, meta) => {
  try {
    if (!meta || typeof meta !== "object") return;
    const theme = typeof meta.theme === "string" ? meta.theme.trim() : "";
    const tags = Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string") : [];
    localStorage.setItem(taskMetaKey(id), JSON.stringify({ theme, tags }));
  } catch {
    // ignore
  }
};

const getStoredTaskBg = (id) => {
  try {
    return localStorage.getItem(taskBgKey(id)) || "";
  } catch {
    return "";
  }
};

const setStoredTaskBg = (id, dataUrl) => {
  try {
    localStorage.setItem(taskBgKey(id), dataUrl);
  } catch {
    // ignore
  }
};

const clearStoredTaskBg = (id) => {
  try {
    localStorage.removeItem(taskBgKey(id));
  } catch {
    // ignore
  }
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

const buildUserItem = (nickname, email) => {
  const item = document.createElement("div");
  const safeNickname = nickname || "UnnamedUser";
  const letter = safeNickname.trim().charAt(0) || "U";
  item.className = "user-item";
  item.dataset.userKey = `${safeNickname} ${email}`.toLowerCase();
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
  info.append(nick, mail);

  item.append(avatar, info);
  return item;
};

const refreshUserFilter = () => {
  if (!userList) return;
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

const addUniqueToken = (map, value) => {
  const cleaned = normalizeToken(value).replace(/^#/, "");
  if (!cleaned) return;
  const key = cleaned.toLowerCase();
  if (!map.has(key)) {
    map.set(key, cleaned);
  }
};

const collectThemeOptions = () => {
  const map = new Map();
  document.querySelectorAll(".task-tag").forEach((el) => {
    if (el.closest(".task-card.is-empty")) return;
    addUniqueToken(map, el.textContent);
  });
  document.querySelectorAll(".flow-task-tag").forEach((el) => {
    addUniqueToken(map, el.textContent);
  });
  if (map.size === 0) {
    map.set("general", "General");
  }
  return Array.from(map.values());
};

const collectTagOptions = () => {
  const map = new Map();
  document.querySelectorAll(".task-chip").forEach((chip) => {
    addUniqueToken(map, chip.textContent);
  });
  document.querySelectorAll(".flow-task").forEach((task) => {
    const note = normalizeToken(task.dataset.taskNote);
    if (!note || note.toLowerCase() === "no tags") return;
    note.split("•").forEach((token) => addUniqueToken(map, token));
  });
  return Array.from(map.values());
};

const parseTags = (value) => {
  const tags = [];
  const regex = /#([^\s#]+)/g;
  let match = null;
  while ((match = regex.exec(value)) !== null) {
    tags.push(match[1]);
  }
  const map = new Map();
  tags.forEach((tag) => addUniqueToken(map, tag));
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

const renderThemeOptions = () => {
  if (!themeOptions || !taskTheme) return;
  const currentValue = normalizeToken(taskTheme.value);
  const themes = collectThemeOptions();
  const lowerThemes = themes.map((theme) => theme.toLowerCase());
  if (currentValue && !lowerThemes.includes(currentValue.toLowerCase())) {
    themes.unshift(currentValue);
  }

  themeOptions.innerHTML = "";
  if (!themes.length) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = "No themes yet";
    themeOptions.appendChild(empty);
  } else {
    themes.forEach((theme) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-option";
      if (currentValue && theme.toLowerCase() === currentValue.toLowerCase()) {
        button.classList.add("is-selected");
      }
      button.textContent = theme;
      button.addEventListener("click", () => {
        taskTheme.value = theme;
        renderThemeOptions();
        closeThemeOptions();
        taskTheme.focus();
      });
      themeOptions.appendChild(button);
    });
  }

  if (!currentValue) {
    taskTheme.value = themes[0] || "";
  }
};

const renderTagOptions = () => {
  if (!tagOptions) return;
  const tags = collectTagOptions();
  tagOptions.innerHTML = "";
  if (!tags.length) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = "No tags yet";
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

const setThemeOptionsOpen = (isOpen) => {
  if (!themeOptions) return;
  if (isOpen) {
    themeOptions.removeAttribute("hidden");
  } else {
    themeOptions.setAttribute("hidden", "");
  }
};

const openThemeOptions = () => setThemeOptionsOpen(true);
const closeThemeOptions = () => setThemeOptionsOpen(false);

const setTaskModalMode = (mode, title) => {
  const isEdit = mode === "edit";
  if (taskModalKicker) {
    taskModalKicker.textContent = isEdit ? "Edit Task" : "Create Task";
  }
  if (taskModalTitleEl) {
    if (isEdit) {
      taskModalTitleEl.textContent = normalizeToken(title) || "Edit Task";
    } else {
      taskModalTitleEl.textContent = "New Task";
    }
  }
  if (taskFormSubmitBtn) {
    taskFormSubmitBtn.textContent = isEdit ? "Save Changes" : "Save Task";
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
  renderThemeOptions();
  renderTagOptions();
  renderTagPreview([]);
  closeThemeOptions();
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
  const theme = normalizeToken(meta?.theme || card.querySelector(".task-tag")?.textContent);
  const title = normalizeToken(card.querySelector("h3")?.textContent);
  const description = normalizeToken(card.querySelector(".task-text")?.textContent);
  const tags = Array.isArray(meta?.tags) && meta.tags.length
    ? meta.tags
    : Array.from(card.querySelectorAll(".task-chip"))
      .map((chip) => normalizeToken(chip.textContent))
      .filter(Boolean);

  if (taskTheme) taskTheme.value = theme;
  if (taskTitle) taskTitle.value = title;
  if (taskDescription) taskDescription.value = description;

  const dueLocal = toDateTimeLocalValue(card.dataset.dueDate) || getDefaultDueDateLocalValue();
  if (taskDue) taskDue.value = dueLocal;

  if (taskAssignee) {
    taskAssignee.value = normalizeToken(card.dataset.assigneeId);
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

  renderThemeOptions();
  renderTagOptions();
  renderTagPreview(tags);
  closeThemeOptions();
  setTaskModalMode("edit", title);

  taskModal.removeAttribute("hidden");
  window.setTimeout(() => {
    taskTitle?.focus();
  }, 0);
};

const closeTaskModal = () => {
  if (!taskModal) return;
  taskModal.setAttribute("hidden", "");
  closeThemeOptions();
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
  tag.textContent = taskData.theme || STATUS_LABELS[statusValue] || "Task";
  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = formatDueLabel(card.dataset.dueDate || taskData.dueDate, statusValue);
  head.append(tag, time);

  const title = document.createElement("h3");
  title.textContent = taskData.title || "Untitled task";
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

  if (taskData.id !== undefined && taskData.id !== null) {
    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "task-action-btn";
    editBtn.textContent = "Edit";
    editBtn.dataset.action = "task-edit";
    editBtn.dataset.taskId = String(taskData.id);

    const photoBtn = document.createElement("button");
    photoBtn.type = "button";
    photoBtn.className = "task-action-btn";
    photoBtn.textContent = "Photo";
    photoBtn.dataset.action = "task-photo";
    photoBtn.dataset.taskId = String(taskData.id);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "task-action-btn";
    clearBtn.textContent = "Clear";
    clearBtn.dataset.action = "task-photo-clear";
    clearBtn.dataset.taskId = String(taskData.id);

    actions.append(editBtn, photoBtn, clearBtn);
    footer.appendChild(actions);
  }

  card.append(head, title, text, footer);
  initTaskCard(card);
  return card;
};

const createFlowTaskItem = (taskData) => {
  const item = document.createElement("div");
  item.className = "flow-task";
  item.setAttribute("draggable", "true");
  const tags = Array.isArray(taskData.tags) ? taskData.tags : [];
  const statusValue = toStatusValue(taskData.statusValue ?? taskData.status);
  const dueShort = formatShortDate(taskData.dueDate);
  const noteParts = [];
  if (dueShort) noteParts.push(`Due ${dueShort}`);
  if (tags.length) noteParts.push(tags.join(" • "));
  const note = noteParts.length ? noteParts.join(" • ") : formatDueLabel(taskData.dueDate, statusValue);
  item.dataset.taskTitle = taskData.title || "New task";
  item.dataset.taskTag = taskData.theme || "Task";
  item.dataset.taskNote = note;
  item.dataset.taskDescription = taskData.description || "";
  if (taskData.id !== undefined && taskData.id !== null) {
    item.dataset.taskId = String(taskData.id);
  }
  if (taskData.dueDate) item.dataset.taskDueDate = taskData.dueDate;
  item.dataset.taskUrgency = getUrgency(taskData.dueDate, statusValue);

  const tag = document.createElement("span");
  tag.className = "flow-task-tag";
  tag.textContent = taskData.theme || "Task";
  const title = document.createElement("span");
  title.className = "flow-task-title";
  title.textContent = taskData.title || "New task";
  const noteEl = document.createElement("span");
  noteEl.className = "flow-task-note";
  noteEl.textContent = note;

  item.append(tag, title, noteEl);
  return item;
};

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
      <span class="task-tag">New</span>
      <span class="task-time">Empty</span>
    </div>
    <h3>Start with a new task</h3>
    <p class="task-text">Drop ideas here or create a task to keep the column moving.</p>
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
    time.textContent = formatDueLabel(card.dataset.dueDate, statusValue);
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
    time.textContent = formatDueLabel(dueIso, statusValue);
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
  const metaTheme = meta?.theme ? meta.theme : "";
  const metaTags = meta?.tags && meta.tags.length ? meta.tags : null;
  return {
    id: task?.id,
    title: task?.title || "Untitled task",
    description: task?.description || "",
    statusValue,
    priorityValue,
    assigneeId: task?.assigneeId ?? null,
    dueDate: task?.dueDate,
    theme: metaTheme || STATUS_LABELS[statusValue] || "Task",
    tags: metaTags || tagIds.map((id) => `Tag-${id}`),
    tagIds
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
  const flowItem = createFlowTaskItem(taskData);
  if (flowListItems) {
    flowListItems.appendChild(flowItem);
    if (typeof initFlowTask === "function") {
      initFlowTask(flowItem);
    }
  }
};

const clearExistingTasks = () => {
  document.querySelectorAll(".column .task-card").forEach((card) => card.remove());
  if (flowListItems) {
    flowListItems.querySelectorAll(".flow-task").forEach((item) => item.remove());
  }
  if (flowCanvas) {
    flowCanvas.querySelectorAll(".flow-node").forEach((node) => node.remove());
  }
  if (flowLinks) {
    flowLinks.querySelectorAll(".flow-line").forEach((line) => line.remove());
  }
  flowConnections.clear();
};

const handleApiError = async (response, context) => {
  let details = "";
  try {
    details = await response.text();
  } catch (error) {
    details = "";
  }
  console.error(`${context} failed: ${response.status} ${response.statusText}`, details);
};

const fetchTasks = async () => {
  const response = await fetch(`${API_BASE}/tasks`, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    await handleApiError(response, "Load tasks");
    return null;
  }
  return response.json();
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

  const response = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await handleApiError(response, "Create task");
    return;
  }

  const createdTask = await response.json();
  const taskData = normalizeApiTask(createdTask);
  const createdId = taskData.id;
  const theme = normalizeToken(uiTaskData.theme);
  const tags = Array.isArray(uiTaskData.tags) ? uiTaskData.tags.filter((t) => typeof t === "string" && t.trim()) : [];
  if (createdId !== undefined && createdId !== null) {
    setStoredTaskMeta(createdId, { theme, tags });
  }
  if (theme) taskData.theme = theme;
  if (tags.length) taskData.tags = tags;
  addTaskToBoard(taskData);
  closeTaskModal();
};

const upsertTaskChips = (footer, tags) => {
  if (!(footer instanceof Element)) return;
  footer.querySelectorAll(".task-chip").forEach((chip) => chip.remove());
  const actions = footer.querySelector(".task-actions");
  const fragment = document.createDocumentFragment();
  (Array.isArray(tags) ? tags : []).forEach((item) => {
    const value = normalizeToken(item);
    if (!value) return;
    const chip = document.createElement("span");
    chip.className = "task-chip";
    chip.textContent = value;
    fragment.appendChild(chip);
  });
  if (actions) {
    footer.insertBefore(fragment, actions);
  } else {
    footer.appendChild(fragment);
  }
};

const updateFlowTaskItemForId = (id, taskData) => {
  if (!flowListItems) return;
  const item = flowListItems.querySelector(`.flow-task[data-task-id="${id}"]`);
  if (!item) return;

  const tags = Array.isArray(taskData.tags) ? taskData.tags : [];
  const statusValue = toStatusValue(taskData.statusValue ?? taskData.status);
  const dueShort = formatShortDate(taskData.dueDate);
  const noteParts = [];
  if (dueShort) noteParts.push(`Due ${dueShort}`);
  if (tags.length) noteParts.push(tags.join(" • "));
  const note = noteParts.length ? noteParts.join(" • ") : formatDueLabel(taskData.dueDate, statusValue);

  item.dataset.taskTitle = taskData.title || "New task";
  item.dataset.taskTag = taskData.theme || "Task";
  item.dataset.taskNote = note;
  item.dataset.taskDescription = taskData.description || "";
  if (taskData.dueDate) {
    item.dataset.taskDueDate = taskData.dueDate;
  } else {
    delete item.dataset.taskDueDate;
  }
  item.dataset.taskUrgency = getUrgency(taskData.dueDate, statusValue);

  const tagEl = item.querySelector(".flow-task-tag");
  if (tagEl) tagEl.textContent = taskData.theme || "Task";
  const titleEl = item.querySelector(".flow-task-title");
  if (titleEl) titleEl.textContent = taskData.title || "New task";
  const noteEl = item.querySelector(".flow-task-note");
  if (noteEl) noteEl.textContent = note;
};

const updateTaskViaApi = async (id, uiTaskData) => {
  const card = editingTaskCard
    || document.querySelector(`.task-card[data-task-id="${id}"]`);
  if (!(card instanceof Element)) return;

  const statusValue = toStatusValue(card.dataset.taskStatus);
  const tagIds = parseTagIds(card.dataset.tagIds);

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

  const response = await fetch(`${API_BASE}/tasks/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await handleApiError(response, "Update task");
    return;
  }

  const theme = normalizeToken(uiTaskData.theme);
  const tags = Array.isArray(uiTaskData.tags)
    ? uiTaskData.tags.filter((t) => typeof t === "string" && t.trim())
    : [];
  setStoredTaskMeta(id, { theme, tags });

  const tagEl = card.querySelector(".task-tag");
  if (tagEl) tagEl.textContent = theme || tagEl.textContent;
  const titleEl = card.querySelector("h3");
  if (titleEl) titleEl.textContent = uiTaskData.title || titleEl.textContent;
  const textEl = card.querySelector(".task-text");
  if (textEl) textEl.textContent = uiTaskData.description || "";

  if (assigneeId) {
    card.dataset.assigneeId = String(assigneeId);
  } else {
    delete card.dataset.assigneeId;
  }
  card.dataset.dueDate = dueDate;
  card.dataset.priorityValue = String(priority);
  card.dataset.priority = getPriorityLabel(priority);

  const footer = card.querySelector(".task-footer");
  upsertTaskChips(footer, tags);
  refreshTaskCardTiming(card);

  updateFlowTaskItemForId(id, {
    id,
    title: uiTaskData.title,
    description: uiTaskData.description,
    dueDate,
    statusValue,
    theme,
    tags
  });

  closeTaskModal();
};

let pendingPhotoTaskId = null;

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("File read failed"));
  reader.readAsDataURL(file);
});

const buildUpdatePayloadFromCard = (card, statusValue) => {
  const id = Number.parseInt(card.dataset.taskId || "", 10);
  const title = card.querySelector("h3")?.textContent?.trim() || "Untitled task";
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
  const response = await fetch(`${API_BASE}/tasks/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await handleApiError(response, "Update task");
  }
};

const loadTasksFromApi = async () => {
  const tasks = await fetchTasks();
  if (!Array.isArray(tasks)) return;
  clearExistingTasks();
  tasks.forEach((task) => {
    addTaskToBoard(normalizeApiTask(task));
  });
  document.querySelectorAll(".column").forEach((column) => {
    updateColumnCount(column);
    ensureColumnPlaceholder(column);
  });
  updateFlowEmptyState();
  setColumnDelays();
  refreshAllTaskTimings();
};

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

const clampNodePosition = (node, left, top) => {
  if (!flowCanvas) return { left, top };
  const padding = 16;
  const maxLeft = flowCanvas.clientWidth - node.offsetWidth - padding;
  const maxTop = flowCanvas.clientHeight - node.offsetHeight - padding;
  return {
    left: clampValue(left, padding, Math.max(padding, maxLeft)),
    top: clampValue(top, padding, Math.max(padding, maxTop))
  };
};

const buildTaskKey = (taskData) => [taskData.title, taskData.tag, taskData.note]
  .map((value) => String(value || "").trim().toLowerCase())
  .join("|");

const highlightDuplicateNode = (node) => {
  if (!node) return;
  node.classList.add("is-duplicate");
  window.setTimeout(() => {
    node.classList.remove("is-duplicate");
  }, 500);
};

const updateFlowLines = () => {
  if (!flowCanvas || !flowLinks) return;
  const canvasRect = flowCanvas.getBoundingClientRect();

  const getEdgePoint = (center, size, dx, dy, padding) => {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 0.001 && absDy < 0.001) {
      return { x: center.x, y: center.y };
    }
    let t = 0;
    if (absDx === 0) {
      t = (size.h / 2) / absDy;
    } else if (absDy === 0) {
      t = (size.w / 2) / absDx;
    } else {
      t = Math.min((size.w / 2) / absDx, (size.h / 2) / absDy);
    }
    const len = Math.hypot(dx, dy);
    const nx = dx / len;
    const ny = dy / len;
    return {
      x: center.x + dx * t + nx * padding,
      y: center.y + dy * t + ny * padding
    };
  };

  for (const [key, line] of flowConnections.entries()) {
    const fromNode = flowCanvas.querySelector(`[data-node-id="${line.dataset.from}"]`);
    const toNode = flowCanvas.querySelector(`[data-node-id="${line.dataset.to}"]`);
    if (!fromNode || !toNode) {
      line.remove();
      flowConnections.delete(key);
      continue;
    }

    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();
    const fromCenter = {
      x: fromRect.left + fromRect.width / 2 - canvasRect.left,
      y: fromRect.top + fromRect.height / 2 - canvasRect.top
    };
    const toCenter = {
      x: toRect.left + toRect.width / 2 - canvasRect.left,
      y: toRect.top + toRect.height / 2 - canvasRect.top
    };
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    const start = getEdgePoint(
      fromCenter,
      { w: fromRect.width, h: fromRect.height },
      dx,
      dy,
      4
    );
    const end = getEdgePoint(
      toCenter,
      { w: toRect.width, h: toRect.height },
      -dx,
      -dy,
      8
    );
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
  }
};

const connectFlowNodes = (fromNode, toNode) => {
  if (!flowLinks) return;
  const fromId = fromNode.dataset.nodeId;
  const toId = toNode.dataset.nodeId;
  if (!fromId || !toId || fromId === toId) return;
  const key = `${fromId}=>${toId}`;
  if (flowConnections.has(key)) return;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.classList.add("flow-line");
  line.dataset.from = fromId;
  line.dataset.to = toId;
  flowLinks.appendChild(line);
  flowConnections.set(key, line);
  updateFlowLines();
};

const removeOutgoingConnectionsForNode = (node) => {
  const nodeId = node.dataset.nodeId;
  if (!nodeId) return;
  const keysToRemove = [];
  for (const [key, line] of flowConnections.entries()) {
    if (line.dataset.from === nodeId) {
      line.remove();
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => flowConnections.delete(key));
  updateFlowLines();
};

const removeAllConnectionsForNode = (node) => {
  const nodeId = node.dataset.nodeId;
  if (!nodeId) return;
  const keysToRemove = [];
  for (const [key, line] of flowConnections.entries()) {
    if (line.dataset.from === nodeId || line.dataset.to === nodeId) {
      line.remove();
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => flowConnections.delete(key));
  updateFlowLines();
};

const clearFlowSelection = () => {
  if (selectedFlowNode) {
    selectedFlowNode.classList.remove("is-selected");
  }
  selectedFlowNode = null;
};

const removeFlowNode = (node) => {
  if (!node) return;
  if (selectedFlowNode === node) {
    clearFlowSelection();
  }
  removeAllConnectionsForNode(node);
  node.remove();
  updateFlowEmptyState();
};

const handleFlowNodeSelect = (node) => {
  if (!selectedFlowNode) {
    selectedFlowNode = node;
    node.classList.add("is-selected");
    return;
  }
  if (selectedFlowNode === node) {
    clearFlowSelection();
    return;
  }
  connectFlowNodes(selectedFlowNode, node);
  clearFlowSelection();
};

const initFlowNode = (node) => {
  node.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Element && event.target.closest(".flow-node-remove")) {
      return;
    }
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = parseFloat(node.style.left) || 0;
    const startTop = parseFloat(node.style.top) || 0;
    let moved = false;

    node.setPointerCapture(event.pointerId);

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        moved = true;
      }
      if (!moved) return;
      const next = clampNodePosition(node, startLeft + dx, startTop + dy);
      node.style.left = `${next.left}px`;
      node.style.top = `${next.top}px`;
      updateFlowLines();
    };

    const onUp = (upEvent) => {
      node.releasePointerCapture(upEvent.pointerId);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      if (!moved) {
        handleFlowNodeSelect(node);
      }
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
  });

  const removeBtn = node.querySelector(".flow-node-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      removeOutgoingConnectionsForNode(node);
    });
  }

  node.addEventListener("dblclick", (event) => {
    if (event.target instanceof Element && event.target.closest(".flow-node-remove")) {
      return;
    }
    event.stopPropagation();
    removeFlowNode(node);
  });
};

const createFlowNode = (taskData, position) => {
  if (!flowCanvas) return null;
  const node = document.createElement("div");
  node.className = "flow-node";
  node.dataset.nodeId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  node.dataset.taskKey = buildTaskKey(taskData);
  node.innerHTML = `
    <button class="flow-node-remove" type="button" aria-label="Clear outgoing links">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </button>
    <span class="flow-node-tag">${taskData.tag || "Task"}</span>
    <h4 class="flow-node-title">${taskData.title || "New task"}</h4>
    <p class="flow-node-note">${taskData.note || ""}</p>
  `;
  flowCanvas.appendChild(node);

  const adjustedLeft = position.x - node.offsetWidth / 2;
  const adjustedTop = position.y - node.offsetHeight / 2;
  const next = clampNodePosition(node, adjustedLeft, adjustedTop);
  node.style.left = `${next.left}px`;
  node.style.top = `${next.top}px`;
  initFlowNode(node);
  updateFlowEmptyState();
  updateFlowLines();
  return node;
};

const initColumn = (column) => {
  const title = column.querySelector(".column-title");
  if (title) {
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        title.blur();
      }
    });

    title.addEventListener("blur", () => {
      if (!title.textContent.trim()) {
        title.textContent = "Untitled";
      }
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
  const column = document.createElement("section");
  column.className = "column";
  column.dataset.columnId = `column-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  column.innerHTML = `
    <header class="column-header">
      <button class="column-handle" type="button" draggable="true" aria-label="Drag column">
        <span></span><span></span><span></span>
      </button>
      <div class="column-title" contenteditable="true" spellcheck="false">${name}</div>
      <span class="column-count">0</span>
      <button class="column-delete" type="button" aria-label="Delete column">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm2 7h2v8h-2v-8zm-4 0h2v8H7v-8zm8 0h2v8h-2v-8z" />
        </svg>
      </button>
    </header>
    <div class="column-body">
    </div>
    <button class="add-task" type="button">Create New Task</button>
  `;
  const body = column.querySelector(".column-body");
  if (body) {
    body.appendChild(createEmptyTaskCard());
  }
  initColumn(column);
  return column;
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
    const nextStatus = getStatusForColumnId(targetColumn.dataset.columnId);
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
  addColumnBtn.addEventListener("click", () => {
    if (!columnsWrap) return;
    const name = extraColumnNames[newColumnIndex % extraColumnNames.length];
    newColumnIndex += 1;
    const column = createColumn(name || `Column ${columnsWrap.children.length + 1}`);
    column.style.setProperty("--delay", "0ms");
    columnsWrap.appendChild(column);
    column.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      inline: "end",
      block: "nearest"
    });
  });
}

if (styleToggle) {
  styleToggle.addEventListener("click", () => {
    if (!board) return;
    const nextStyle = board.dataset.style === "flow" ? "columns" : "flow";
    setLayoutStyle(nextStyle);
  });
}

const initFlowTask = (task) => {
  if (!task) return;
  task.addEventListener("dragstart", (event) => {
    const payload = {
      title: task.dataset.taskTitle || task.textContent.trim(),
      tag: task.dataset.taskTag || "Task",
      note: task.dataset.taskDescription || task.dataset.taskNote || ""
    };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      event.dataTransfer.setDragImage(task, 20, 20);
    }
  });
};

document.querySelectorAll(".flow-task").forEach(initFlowTask);

if (taskTagsInput) {
  taskTagsInput.addEventListener("input", () => {
    renderTagPreview(parseTags(taskTagsInput.value));
  });
}

if (brandToggle) {
  brandToggle.addEventListener("click", () => {
    const nextState = !isPanelOpen();
    setPanelOpen(nextState);
    if (nextState) {
      userSearch?.focus();
    }
  });
}

if (userSearch) {
  userSearch.addEventListener("input", refreshUserFilter);
}

if (userAddBtn) {
  userAddBtn.addEventListener("click", () => {
    if (!userList || !userAddInput) return;
    const email = normalizeEmail(userAddInput.value);
    if (!email) return;
    const existing = userList.querySelector(`[data-user-email="${email}"]`);
    if (!existing) {
      const item = buildUserItem("UnnamedUser", email);
      userList.appendChild(item);
    }
    userAddInput.value = "";
    refreshUserFilter();
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

if (taskTheme) {
  taskTheme.addEventListener("focus", () => {
    renderThemeOptions();
    openThemeOptions();
  });

  taskTheme.addEventListener("input", () => {
    renderThemeOptions();
    openThemeOptions();
  });
}

if (themeToggle) {
  themeToggle.addEventListener("click", (event) => {
    event.preventDefault();
    if (!themeOptions) return;
    if (themeOptions.hasAttribute("hidden")) {
      renderThemeOptions();
      openThemeOptions();
    } else {
      closeThemeOptions();
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

if (flowAddTaskBtn) {
  flowAddTaskBtn.addEventListener("click", () => {
    openTaskModal(getDefaultColumn());
  });
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !taskModal || taskModal.hasAttribute("hidden")) return;
  if (target.closest("[data-close-modal]")) {
    closeTaskModal();
    return;
  }
  if (themeOptions && !themeOptions.hasAttribute("hidden")) {
    if (!target.closest(".theme-picker") && !target.closest("#theme-options")) {
      closeThemeOptions();
    }
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !isPanelOpen()) return;
  if (target.closest("#user-panel") || target.closest("#brand-toggle")) return;
  setPanelOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (isPanelOpen()) {
      setPanelOpen(false);
    }
    closeTaskModal();
  }
});

if (taskForm) {
  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const theme = normalizeToken(taskTheme?.value);
    const title = normalizeToken(taskTitle?.value);
    const description = normalizeToken(taskDescription?.value);
    if (!theme || !title) return;
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
    const taskData = {
      theme,
      title,
      description,
      tags,
      dueDateIso,
      assigneeId,
      priorityValue,
      tagIds: []
    };
    if (editingTaskId) {
      await updateTaskViaApi(editingTaskId, taskData);
    } else {
      await createTaskViaApi(taskData);
    }
  });
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    toggleTheme();
  });
}

setTheme(getPreferredTheme());

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionBtn = target.closest("[data-action]");
  if (!actionBtn) return;
  const action = actionBtn.getAttribute("data-action");
  const idRaw = actionBtn.getAttribute("data-task-id") || "";
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return;

  if (action === "task-edit") {
    const card = actionBtn.closest(".task-card")
      || document.querySelector(`.task-card[data-task-id="${id}"]`);
    if (card) {
      openTaskModalForEdit(card);
    }
    return;
  }

  if (action === "task-photo") {
    pendingPhotoTaskId = id;
    taskBgInput?.click();
    return;
  }
  if (action === "task-photo-clear") {
    clearStoredTaskBg(id);
    applyTaskBgToCards(id, "");
    return;
  }
});

if (taskBgInput) {
  taskBgInput.addEventListener("change", async () => {
    const id = pendingPhotoTaskId;
    pendingPhotoTaskId = null;
    const file = taskBgInput.files && taskBgInput.files[0] ? taskBgInput.files[0] : null;
    taskBgInput.value = "";
    if (!file || !Number.isFinite(Number(id))) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl) return;
      setStoredTaskBg(id, dataUrl);
      applyTaskBgToCards(id, dataUrl);
    } catch (error) {
      console.error("Photo load failed", error);
    }
  });
}

if (flowCanvas) {
  flowCanvas.addEventListener("dragover", (event) => {
    event.preventDefault();
    flowCanvas.classList.add("is-dragging-over");
  });

  flowCanvas.addEventListener("dragleave", () => {
    flowCanvas.classList.remove("is-dragging-over");
  });

  flowCanvas.addEventListener("drop", (event) => {
    event.preventDefault();
    flowCanvas.classList.remove("is-dragging-over");
    if (!event.dataTransfer) return;
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      payload = { title: raw, tag: "Task", note: "" };
    }

    const taskKey = buildTaskKey(payload);
    const existing = Array.from(flowCanvas.querySelectorAll(".flow-node")).find(
      (node) => node.dataset.taskKey === taskKey
    );
    if (existing) {
      highlightDuplicateNode(existing);
      return;
    }

    const rect = flowCanvas.getBoundingClientRect();
    const position = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    createFlowNode(payload, position);
  });

  flowCanvas.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".flow-node")) {
      return;
    }
    clearFlowSelection();
  });

  flowCanvas.addEventListener("transitionend", (event) => {
    const target = event.target;
    if (target instanceof Element && target.classList.contains("flow-node-note")) {
      updateFlowLines();
    }
  });
}

window.addEventListener("resize", () => {
  updateFlowLines();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    viewButtons.forEach((btn) => {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
    });
    button.classList.add("is-active");
    button.setAttribute("aria-pressed", "true");
    if (board) {
      board.dataset.view = button.dataset.view || "board";
    }
  });
});

refreshUserFilter();
setLayoutStyle(board?.dataset.style || "columns");
updateFlowEmptyState();
startTaskTimingTicker();
void loadTasksFromApi();
