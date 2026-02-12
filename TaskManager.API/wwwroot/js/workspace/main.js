import {
  board,
  openSpacesHomeBtn,
  appShell,
  topbar,
  brandToggle,
  userPanel,
  columnsWrap,
  addColumnBtn,
  viewButtons,
  viewToggle,
  styleToggle,
  styleSwitch,
  styleToggleTitleEl,
  styleToggleSubEl,
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
} from "./dom.js";

import { buildApiUrl, apiFetch, fetchJsonOrNull, handleApiError, setApiContextProvider } from "../shared/api.js?v=apifix1";
import {
  DEFAULT_PRIORITY_VALUE,
  STORAGE_ACTOR_ID,
  STORAGE_WORKSPACE_ID,
  MANAGE_ROLES,
  STATUS_LABELS,
  STATUS_LABEL_SET,
  URGENCY
} from "../shared/constants.js";
import { navigateToSpacesPage } from "../shared/navigation.js";
import { normalizeToken, normalizeEmail, toInitials, toWorkspaceRole, clampValue } from "../shared/utils.js";
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
  parseTagIds,
  addUniqueToken,
  parseTags,
  buildTaskKey,
  buildFlowNote,
  getCalendarBucketId
} from "./helpers.js";
import {
  getPreferredTheme,
  setTheme,
  getStoredTaskMeta,
  setStoredTaskMeta,
  getStoredTaskBg
} from "./storage.js";
import { createTaskDetailController } from "./task-detail.js?v=perf3";

let lastNormalizedTasks = [];

let currentAssigneeIdFilter = null;
let currentUserId = null;
let currentWorkspaceId = null;
let currentWorkspaceRole = "Member";

let panelWorkspaceEditing = false;

const setWorkspaceEditing = (editing) => {
  panelWorkspaceEditing = !!editing;
  if (!panelWorkspaceNameEl || !panelWorkspaceEditBtn) return;

  if (panelWorkspaceEditing) {
    panelWorkspaceNameEl.setAttribute("contenteditable", "true");
    panelWorkspaceNameEl.setAttribute("role", "textbox");
    panelWorkspaceNameEl.setAttribute("aria-label", "Workspace name");
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
let knownUsers = [];

let tagsLoaded = false;
let tagList = [];
const tagById = new Map();
const tagByName = new Map();

const getActorUserId = () => {
  const raw = actorUser?.id;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

setApiContextProvider(() => ({
  actorUserId: getActorUserId(),
  workspaceId: currentWorkspaceId
}));

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
    styleToggle.setAttribute("aria-pressed", nextStyle === "flow" ? "true" : "false");
    if (nextStyle === "flow") {
      styleToggle.setAttribute("aria-label", "Switch to Columns Board");
      styleToggle.setAttribute("title", "Switch to Columns Board");
    } else {
      styleToggle.setAttribute("aria-label", "Switch to Flow Map");
      styleToggle.setAttribute("title", "Switch to Flow Map");
    }
  }

  if (styleSwitch) {
    styleSwitch.classList.toggle("is-flow", nextStyle === "flow");
  }

  if (styleToggleTitleEl) {
    styleToggleTitleEl.textContent = nextStyle === "flow" ? "Flow Map" : "Columns Board";
  }

  if (styleToggleSubEl) {
    styleToggleSubEl.textContent = "Click to switch";
  }

  if (viewToggle) {
    viewToggle.toggleAttribute("hidden", nextStyle === "flow");
  }

  if (nextStyle === "flow") {
    // Flow and Calendar/List share the same page; force board view so calendar doesn't linger.
    setBoardView("board");
    if (calendarLayout) {
      calendarLayout.setAttribute("aria-hidden", "true");
      calendarLayout.innerHTML = "";
    }
  }

  requestAnimationFrame(() => {
    updateFlowLines();
  });
};

const setBoardView = (view) => {
  if (!board) return;
  const next = view === "calendar" ? "calendar" : (view === "list" ? "list" : "board");
  board.dataset.view = next;
  viewButtons.forEach((btn) => {
    const isActive = (btn.dataset.view || "board") === next;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  renderCurrentView();
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

  const tags = await fetchJsonOrNull(buildApiUrl("/tags"), "Load tags", {
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

  const created = await fetchJsonOrNull(buildApiUrl("/tags"), "Create tag", {
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
  const name = normalizeToken(user?.name) || "UnnamedUser";
  const email = normalizeToken(user?.email);
  const role = toWorkspaceRole(user?.role);

  const item = buildUserItem(name, email, {
    role,
    removable: Boolean(options?.removable),
    onRemove: options?.onRemove
  });
  item.dataset.userId = Number.isFinite(id) ? String(id) : "";
  item.dataset.userRole = role;
  item.dataset.userKey = `${id} ${name} ${email} ${role}`.toLowerCase();
  if (options?.isCurrent) item.classList.add("is-current");
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
    if (userList) userList.innerHTML = "";
    return;
  }

  const users = await fetchJsonOrNull(buildApiUrl(`/spaces/${currentWorkspaceId}/members`), "Load workspace members", {
    headers: { Accept: "application/json" }
  });
  if (!Array.isArray(users) || !userList) return;

  if (userAddBtn) userAddBtn.disabled = !isAdmin();
  if (userAddInput) userAddInput.disabled = !isAdmin();

  userList.innerHTML = "";

  const allItem = buildUserItem("All members", "All tasks");
  allItem.dataset.userId = "";
  allItem.classList.add("is-current");
  allItem.addEventListener("click", async () => {
    setAllUsersMode();
    await loadTasksFromApi();
  });
  userList.appendChild(allItem);

  users
    .map((u) => ({
      id: Number(u.userId ?? u.id),
      name: (() => {
        const id = Number(u.userId ?? u.id);
        const apiName = normalizeToken(u.name);
        if (id === getActorUserId()) {
          const storedNickname = normalizeToken(getStoredAccountNickname(id));
          const fallbackName = apiName && apiName.toLowerCase() !== "system" ? apiName : "NoName";
          return storedNickname || fallbackName;
        }
        return apiName;
      })(),
      email: normalizeToken(u.email),
      role: toWorkspaceRole(u.role),
      taskCount: Number(u.taskCount || 0)
    }))
    .filter((u) => Number.isFinite(u.id) && u.name && u.email)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((u) => {
      const removable = isAdmin() && Number(u.id) !== getActorUserId();
      const item = buildUserItemFromApi(u, {
        removable,
        onRemove: async () => {
          const response = await apiFetch(buildApiUrl(`/spaces/${currentWorkspaceId}/members/${u.id}`), {
            method: "DELETE"
          });
          if (!response.ok) {
            await handleApiError(response, "Remove member");
            return;
          }
          await loadUsersFromApi();
          await loadTasksFromApi();
        }
      });
      item.addEventListener("click", async () => {
        setCurrentUser(u);
        await loadTasksFromApi();
      });
      userList.appendChild(item);
    });

  refreshUserFilter();
  setAllUsersMode();
};

const updateMyMemberItem = (displayName, email) => {
  const actorId = getActorUserId();
  if (!Number.isFinite(Number(actorId))) return;
  if (!userList) return;
  const item = userList.querySelector(`.user-item[data-user-id="${actorId}"]`);
  if (!item) return;

  const safeName = normalizeToken(displayName) || "NoName";
  const safeEmail = normalizeToken(email) || item.dataset.userEmail || "";

  const nick = item.querySelector(".user-nick");
  if (nick) nick.textContent = safeName;

  const avatar = item.querySelector(".user-avatar");
  if (avatar) {
    const letter = safeName.trim().charAt(0) || "U";
    avatar.textContent = letter.toUpperCase();
  }

  const role = item.dataset.userRole || "";
  item.dataset.userKey = `${actorId} ${safeName} ${safeEmail} ${role}`.toLowerCase();
  refreshUserFilter();
};

const updateActorUi = () => {
  const email = actorUser?.email || "account@example.com";
  const id = getActorUserId();
  const storedNickname = id ? normalizeToken(getStoredAccountNickname(id)) : "";
  const apiName = normalizeToken(actorUser?.name);
  const fallbackName = apiName && apiName.toLowerCase() !== "system" ? apiName : "NoName";
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
    name: normalizeToken(user.name) || `User ${id}`,
    email: normalizeToken(user.email) || `user${id}@local`
  };
  try {
    localStorage.setItem(STORAGE_ACTOR_ID, String(id));
  } catch {
    // ignore
  }
  updateActorUi();
};

const setWorkspaceContext = (space) => {
  const nextWorkspaceId = Number(space?.id);
  const changed = currentWorkspaceId !== nextWorkspaceId;
  currentWorkspaceId = Number.isFinite(nextWorkspaceId) && nextWorkspaceId > 0 ? nextWorkspaceId : null;
  currentWorkspaceRole = toWorkspaceRole(space?.currentUserRole);
  const workspaceName = normalizeToken(space?.name) || "Workspace";
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
    panelWorkspaceEditBtn.title = isAdmin() ? "Edit" : "Only admins can edit";
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

const loadAccountsFromApi = async () => {
  const users = await fetchJsonOrNull(buildApiUrl("/users"), "Load accounts", {
    headers: { Accept: "application/json" }
  });

  knownUsers = Array.isArray(users)
    ? users
      .map((u) => ({
        id: Number(u.id),
        name: normalizeToken(u.name),
        email: normalizeToken(u.email)
      }))
      .filter((u) => Number.isFinite(u.id) && u.name && u.email)
    : [];

  const storedActorId = Number.parseInt(localStorage.getItem(STORAGE_ACTOR_ID) || "", 10);
  const actor = knownUsers.find((u) => u.id === storedActorId) || knownUsers[0] || null;
  if (actor) {
    setActorUser(actor);
  } else {
    actorUser = null;
    updateActorUi();
  }
};

const openWorkspace = async (space) => {
  if (!space) return;

  const workspaceId = Number(space?.id);
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) return;

  setWorkspaceContext(space);
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
  const safeNickname = nickname || "UnnamedUser";
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
  info.append(nick, mail);

  item.append(avatar, info);

  const actions = document.createElement("div");
  actions.className = "user-item-actions";

  if (role) {
    const roleEl = document.createElement("span");
    roleEl.className = "user-role";
    roleEl.textContent = role;
    actions.appendChild(roleEl);
  }

  if (options?.removable) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "user-remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof options.onRemove === "function") {
        await options.onRemove();
      }
    });
    actions.appendChild(removeBtn);
  }

  if (actions.childElementCount > 0) {
    item.appendChild(actions);
  }

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

const setTaskCardAttachmentCount = (card, count) => {
  if (!card) return;
  const indicator = card.querySelector(".task-attachment-indicator");
  const countEl = card.querySelector(".task-attachment-count");
  const n = Number(count);
  const has = Number.isFinite(n) && n > 0;
  if (indicator) {
    indicator.hidden = !has;
    indicator.title = has ? `${n} attachment${n === 1 ? "" : "s"}` : "";
  }
  if (countEl) {
    countEl.textContent = has ? String(n) : "";
  }
  card.dataset.attachmentCount = has ? String(n) : "0";
};

const applyAttachmentCountToCards = (id, count) => {
  document.querySelectorAll(`.task-card[data-task-id="${id}"]`).forEach((card) => {
    setTaskCardAttachmentCount(card, count);
  });
};

const isAdmin = () => MANAGE_ROLES.has(String(currentWorkspaceRole || ""));

const shouldShowTrashZone = () => {
  if (!taskTrashZone || !board) return false;
  if (!isAdmin()) return false;
  if (board.dataset.style !== "columns") return false;
  if (board.dataset.view === "calendar") return false;
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
  const title = normalizeToken(options?.title) || "Are you sure?";
  const message = normalizeToken(options?.message) || "This action cannot be undone.";
  const kicker = normalizeToken(options?.kicker) || "Please confirm";
  const confirmText = normalizeToken(options?.confirmText) || "Delete";

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

const setTaskStatusMode = (mode, statusValue) => {
  if (!taskStatus) return;
  const nextStatus = toStatusValue(statusValue);
  taskStatus.value = String(nextStatus);
  taskStatus.disabled = mode !== "edit";
};

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
  if (taskAssignee) {
    const actorId = getActorUserId();
    taskAssignee.value = currentUserId
      ? String(currentUserId)
      : (actorId ? String(actorId) : "");
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
  tag.textContent = STATUS_LABELS[statusValue] || "New";
  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = formatDueLabel(card.dataset.dueDate || taskData.dueDate, statusValue);

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

  card.append(head, title, text, footer);
  initTaskCard(card);
  if (taskData.id !== undefined && taskData.id !== null) {
    // will be refreshed after load; keep initial hidden
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
  const statusLabel = STATUS_LABELS[statusValue] || "New";
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
  const metaTags = meta?.tags && meta.tags.length ? meta.tags : null;
  const apiTagNames = tagIds
    .map((id) => tagById.get(Number(id)) || "")
    .map((name) => normalizeToken(name))
    .filter(Boolean);
  return {
    id: task?.id,
    title: task?.title || "Untitled task",
    description: task?.description || "",
    statusValue,
    priorityValue,
    assigneeId: task?.assigneeId ?? null,
    dueDate: task?.dueDate,
    tags: metaTags || (apiTagNames.length ? apiTagNames : tagIds.map((id) => `Tag-${id}`)),
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
};

const clearBoardTasks = () => {
  document.querySelectorAll(".column .task-card").forEach((card) => card.remove());
};

const rebuildFlowPool = (tasks) => {
  if (!flowListItems) return;
  flowListItems.querySelectorAll(".flow-task").forEach((item) => item.remove());

  (Array.isArray(tasks) ? tasks : []).forEach((taskData) => {
    const flowItem = createFlowTaskItem(taskData);
    flowListItems.appendChild(flowItem);
    initFlowTask(flowItem);
  });
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

  const response = await apiFetch(buildApiUrl("/tasks"), {
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
  const tags = Array.isArray(uiTaskData.tags) ? uiTaskData.tags.filter((t) => typeof t === "string" && t.trim()) : [];
  if (createdId !== undefined && createdId !== null) {
    setStoredTaskMeta(createdId, { tags });
  }
  if (tags.length) taskData.tags = tags;
  closeTaskModal();
  await loadTasksFromApi();
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
  const statusLabel = STATUS_LABELS[statusValue] || "New";
  const dueShort = formatShortDate(taskData.dueDate);
  const noteParts = [];
  if (dueShort) noteParts.push(`Due ${dueShort}`);
  if (tags.length) noteParts.push(tags.join(" • "));
  const note = noteParts.length ? noteParts.join(" • ") : formatDueLabel(taskData.dueDate, statusValue);

  item.dataset.taskTitle = taskData.title || "New task";
  item.dataset.taskTag = statusLabel;
  item.dataset.taskNote = note;
  item.dataset.taskDescription = taskData.description || "";
  item.dataset.taskKey = buildTaskKey({
    title: item.dataset.taskTitle,
    tag: item.dataset.taskTag,
    note: item.dataset.taskNote
  });
  if (taskData.dueDate) {
    item.dataset.taskDueDate = taskData.dueDate;
  } else {
    delete item.dataset.taskDueDate;
  }
  item.dataset.taskUrgency = getUrgency(taskData.dueDate, statusValue);

  const tagEl = item.querySelector(".flow-task-tag");
  if (tagEl) tagEl.textContent = statusLabel;
  const titleEl = item.querySelector(".flow-task-title");
  if (titleEl) titleEl.textContent = taskData.title || "New task";
  const noteEl = item.querySelector(".flow-task-note");
  if (noteEl) noteEl.textContent = note;

};

const updateTaskViaApi = async (id, uiTaskData) => {
  const card = editingTaskCard
    || document.querySelector(`.task-card[data-task-id="${id}"]`);
  if (!(card instanceof Element)) return;

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
    await handleApiError(response, "Update task");
    return;
  }

  const tags = Array.isArray(uiTaskData.tags)
    ? uiTaskData.tags.filter((t) => typeof t === "string" && t.trim())
    : [];
  setStoredTaskMeta(id, { tags });

  const tagEl = card.querySelector(".task-tag");
  if (tagEl) tagEl.textContent = STATUS_LABELS[statusValue] || "New";
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
  card.dataset.taskStatus = String(statusValue);
  card.dataset.tagIds = tagIds.join(",");

  const footer = card.querySelector(".task-footer");
  upsertTaskChips(footer, tags);
  refreshTaskCardTiming(card);

  updateFlowTaskItemForId(id, {
    id,
    title: uiTaskData.title,
    description: uiTaskData.description,
    dueDate,
    statusValue,
    tags
  });

  closeTaskModal();
  await loadTasksFromApi();
};

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
  const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
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

  await loadTasksFromApi();
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
    await handleApiError(response, "Delete task");
    return false;
  }
  return true;
};

const loadTasksFromApi = async () => {
  await ensureTagsLoaded();
  const tasks = await fetchTasks();
  if (!Array.isArray(tasks)) return;
  lastNormalizedTasks = tasks.map(normalizeApiTask);
  rebuildFlowPool(lastNormalizedTasks);
  renderCurrentView();
};

const syncAttachmentIndicators = async () => {
  const cards = Array.from(document.querySelectorAll('.task-card[data-task-id]:not(.is-empty)'));
  const ids = Array.from(new Set(cards
    .map((c) => Number.parseInt(c.dataset.taskId || "", 10))
    .filter((id) => Number.isFinite(id))));
  if (!ids.length) return;

  const concurrency = 8;
  let index = 0;

  const worker = async () => {
    while (index < ids.length) {
      const id = ids[index];
      index += 1;
      const meta = await fetchJsonOrNull(buildApiUrl(`/tasks/${id}/attachments/exists`), "Attachments meta", {
        headers: { Accept: "application/json" }
      });
      const count = meta && Number.isFinite(Number(meta.count)) ? Number(meta.count) : 0;
      applyAttachmentCountToCards(id, count);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
};

const renderCalendarView = (tasks) => {
  if (!calendarLayout || !board) return;
  clearBoardTasks();
  calendarLayout.innerHTML = "";
  calendarLayout.setAttribute("aria-hidden", "false");

  const buckets = [
    { id: "high", title: "High priority" },
    { id: "today", title: "Today" },
    { id: "week", title: "Within a week" },
    { id: "gtweek", title: "More than a week" },
    { id: "gtmonth", title: "More than a month" },
    { id: "done", title: "Completed" },
    { id: "overdue", title: "Overdue" }
  ];

  const lists = new Map(buckets.map((b) => [b.id, []]));
  (Array.isArray(tasks) ? tasks : []).forEach((t) => {
    const id = getCalendarBucketId(t);
    const arr = lists.get(id);
    if (arr) arr.push(t);
  });

  const sortTasks = (a, b) => {
    const ad = a?.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b?.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const ap = toPriorityValue(a?.priorityValue ?? a?.priority);
    const bp = toPriorityValue(b?.priorityValue ?? b?.priority);
    if (ad !== bd) return ad - bd;
    if (ap !== bp) return bp - ap;
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  };

  buckets.forEach((bucket) => {
    const group = document.createElement("section");
    group.className = "calendar-group";
    group.dataset.groupId = bucket.id;

    const header = document.createElement("header");
    header.className = "calendar-group-header";
    const title = document.createElement("div");
    title.className = "calendar-group-title";
    title.textContent = bucket.title;
    const count = document.createElement("span");
    count.className = "calendar-group-count";

    const body = document.createElement("div");
    body.className = "calendar-group-body";

    const list = (lists.get(bucket.id) || []).slice().sort(sortTasks);
    count.textContent = String(list.length);

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "task-detail-attachments-empty";
      empty.textContent = "No tasks";
      body.appendChild(empty);
    } else {
      list.forEach((t) => {
        const card = createTaskCard(t);
        card.setAttribute("draggable", "false");
        body.appendChild(card);
      });
    }

    header.append(title, count);
    group.append(header, body);
    calendarLayout.appendChild(group);
  });

  void syncAttachmentIndicators();
};

const renderBoardView = (tasks) => {
  if (calendarLayout) {
    calendarLayout.setAttribute("aria-hidden", "true");
    calendarLayout.innerHTML = "";
  }
  clearBoardTasks();
  (Array.isArray(tasks) ? tasks : []).forEach((task) => addTaskToBoard(task));

  document.querySelectorAll(".column").forEach((column) => {
    updateColumnCount(column);
    ensureColumnPlaceholder(column);
  });
  updateFlowEmptyState();
  setColumnDelays();
  refreshAllTaskTimings();
  void syncAttachmentIndicators();
};

const renderCurrentView = () => {
  const view = board?.dataset.view || "board";
  if (view === "calendar") {
    renderCalendarView(lastNormalizedTasks);
    return;
  }
  renderBoardView(lastNormalizedTasks);
};

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
  node.dataset.taskKey = taskData?.taskKey ? String(taskData.taskKey) : buildTaskKey(taskData);
  if (taskData?.taskId) {
    node.dataset.taskId = String(taskData.taskId);
  }
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
      kicker: "Delete task",
      title: title ? `Delete "${title}"?` : "Delete this task?",
      message: "This task and its metadata will be removed from the board.",
      confirmText: "Delete task"
    });
    if (confirmed !== true) {
      setTrashZoneVisible(false);
      void loadTasksFromApi();
      return;
    }
    void (async () => {
      await deleteTaskViaApi(id);
      setTrashZoneVisible(false);
      await loadTasksFromApi();
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
      note: task.dataset.taskDescription || task.dataset.taskNote || "",
      taskKey: task.dataset.taskKey || "",
      taskId: task.dataset.taskId || ""
    };
    if (!payload.taskKey) {
      payload.taskKey = buildTaskKey(payload);
      task.dataset.taskKey = payload.taskKey;
    }
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
      const name = email.split("@")[0] || "UnnamedUser";
      const created = await fetchJsonOrNull(buildApiUrl(`/spaces/${currentWorkspaceId}/members`), "Add member", {
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

const taskDetailController = createTaskDetailController({
  isAdmin,
  ensureTagsLoaded,
  getTagNameById: (id) => tagById.get(Number(id)) || "",
  openTaskModalForEdit,
  applyTaskBgToCards,
  applyAttachmentCountToCards,
  confirmDestructiveAction: openConfirmModal
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (closeConfirmModal(false)) {
      return;
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

const saveWorkspaceName = async () => {
  if (!currentWorkspaceId) return;
  if (!isAdmin()) return;
  if (!panelWorkspaceNameEl) return;

  const name = normalizeToken(panelWorkspaceNameEl.textContent);
  if (!name) {
    const original = normalizeToken(panelWorkspaceNameEl.dataset.original);
    panelWorkspaceNameEl.textContent = original || "Workspace";
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
    await handleApiError(response, "Update workspace");
    const original = normalizeToken(panelWorkspaceNameEl.dataset.original);
    panelWorkspaceNameEl.textContent = original || "Workspace";
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
        await handleApiError(response, "Set workspace avatar");
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
      payload = { taskId: raw, title: raw, tag: "Task", note: "" };
    }

    if (!payload || typeof payload !== "object") {
      payload = { title: String(payload || ""), tag: "Task", note: "" };
    }

    const rawId = normalizeToken(payload.taskId);
    const numericId = /^[0-9]+$/.test(rawId) ? Number.parseInt(rawId, 10) : null;
    if (Number.isFinite(numericId)) {
      payload.taskId = String(numericId);
      const task = Array.isArray(lastNormalizedTasks)
        ? lastNormalizedTasks.find((t) => Number(t?.id) === numericId)
        : null;
      if (task) {
        payload.title = task.title || payload.title;
        payload.tag = STATUS_LABELS[toStatusValue(task.statusValue)] || payload.tag;
        payload.note = buildFlowNote(task);
      }
    }

    const taskKey = normalizeToken(payload.taskKey) || buildTaskKey(payload);
    payload.taskKey = taskKey;
    if (payload.taskId !== undefined && payload.taskId !== null && payload.taskId !== "") {
      payload.taskId = String(payload.taskId);
    } else {
      delete payload.taskId;
    }
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
    setBoardView(button.dataset.view || "board");
  });
});

refreshUserFilter();
setLayoutStyle(board?.dataset.style || "columns");
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

const bootstrapWorkspacePage = async () => {
  setAppScreen("board");
  await loadAccountsFromApi();
  updateActorUi();

  if (!getActorUserId() && knownUsers.length > 0) {
    setActorUser(knownUsers[0]);
  }

  if (!getActorUserId()) {
    navigateToSpacesPage();
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

  const workspace = await fetchJsonOrNull(buildApiUrl(`/spaces/${workspaceId}`), "Load workspace", {
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

function getStoredAccountNickname(id) {
  if (!Number.isFinite(Number(id))) return "";
  try {
    return localStorage.getItem(`gtt-account-nickname:${id}`) || "";
  } catch {
    return "";
  }
}

function setStoredAccountNickname(id, value) {
  if (!Number.isFinite(Number(id))) return;
  const cleaned = normalizeToken(value);
  try {
    if (!cleaned) {
      localStorage.removeItem(`gtt-account-nickname:${id}`);
    } else {
      localStorage.setItem(`gtt-account-nickname:${id}`, cleaned);
    }
  } catch {
    // ignore
  }
}

function getStoredAccountAvatar(id) {
  if (!Number.isFinite(Number(id))) return "";
  try {
    return localStorage.getItem(`gtt-account-avatar:${id}`) || "";
  } catch {
    return "";
  }
}

function setStoredAccountAvatar(id, dataUrl) {
  if (!Number.isFinite(Number(id))) return;
  const value = typeof dataUrl === "string" ? dataUrl : "";
  try {
    if (!value) {
      localStorage.removeItem(`gtt-account-avatar:${id}`);
    } else {
      localStorage.setItem(`gtt-account-avatar:${id}`, value);
    }
  } catch {
    // ignore
  }
}

function applyAccountAvatarToElement(element, textElement, initials, dataUrl) {
  if (!element) return;
  const url = normalizeToken(dataUrl);
  if (url) {
    element.classList.add("has-image");
    element.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    if (textElement) textElement.textContent = "";
    return;
  }
  element.classList.remove("has-image");
  element.style.backgroundImage = "";
  if (textElement) textElement.textContent = initials;
}

function refreshSettingsThemeState() {
  const theme = document.body.dataset.theme === "light" ? "light" : "dark";
  settingsThemeDarkBtn?.classList.toggle("is-selected", theme === "dark");
  settingsThemeLightBtn?.classList.toggle("is-selected", theme === "light");
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
    refreshSettingsThemeState();
    window.setTimeout(() => settingsNicknameInput?.focus(), 0);
  }
}
