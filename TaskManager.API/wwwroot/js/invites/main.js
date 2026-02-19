import {
  buildApiUrl,
  apiFetch,
  fetchJsonOrNull,
  handleApiError,
  ensureAuthOrRedirect,
  redirectToAuthPage,
  hasAccessToken
} from "../shared/api.js?v=auth5";
import { getPreferredTheme, setTheme } from "../shared/auth-utils.js";
import { navigateToSpacesPage, navigateToWorkspacePage } from "../shared/navigation.js";
import { STORAGE_WORKSPACE_ID } from "../shared/constants.js";
import { normalizeToken } from "../shared/utils.js";

const backBtn = document.getElementById("invites-back");
const accountEl = document.getElementById("invites-account");
const listEl = document.getElementById("invites-list");
const emptyEl = document.getElementById("invites-empty");
const toastEl = document.getElementById("invites-toast");

let actorUser = null;
let invitesState = [];

const ROLE_LABELS = {
  1: "Member",
  2: "Admin",
  3: "Owner"
};

const STATUS_LABELS = {
  1: "Ожидает ответа",
  2: "Принято",
  3: "Отклонено",
  4: "Просрочено",
  5: "Отозвано"
};

const escapeHtml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatDateTime = (iso) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";

  try {
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return date.toISOString();
  }
};

const showToast = (message) => {
  if (!toastEl) return;
  const text = normalizeToken(message);
  if (!text) return;

  toastEl.textContent = text;
  toastEl.removeAttribute("hidden");
  window.setTimeout(() => {
    toastEl.setAttribute("hidden", "");
  }, 2600);
};

const parseQueryWorkspaceId = () => {
  const fromQuery = Number.parseInt(new URLSearchParams(window.location.search).get("workspaceId") || "", 10);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;

  try {
    const fromStorage = Number.parseInt(localStorage.getItem(STORAGE_WORKSPACE_ID) || "", 10);
    if (Number.isFinite(fromStorage) && fromStorage > 0) return fromStorage;
  } catch {
    // ignore
  }

  return null;
};

const resolveReturnTarget = () => {
  const params = new URLSearchParams(window.location.search);
  const returnTo = normalizeToken(params.get("returnTo")).toLowerCase();
  const workspaceId = parseQueryWorkspaceId();

  if (returnTo === "workspace" && workspaceId) {
    return { type: "workspace", workspaceId };
  }

  return { type: "spaces", workspaceId: null };
};

const getRoleLabel = (role) => {
  const id = Number(role);
  return ROLE_LABELS[id] || "Member";
};

const getStatusLabel = (status) => {
  const id = Number(status);
  return STATUS_LABELS[id] || "Обновлено";
};

const getStatusClass = (status) => {
  const id = Number(status);
  if (id === 2) return "is-accepted";
  if (id === 3) return "is-declined";
  if (id === 4 || id === 5) return "is-expired";
  return "";
};

const replaceInviteInState = (updated) => {
  const id = Number(updated?.id);
  if (!Number.isFinite(id) || id <= 0) return;

  const index = invitesState.findIndex((item) => Number(item?.id) === id);
  if (index < 0) return;
  invitesState[index] = { ...invitesState[index], ...updated };
};

const toInviteActionsMarkup = (invite) => {
  const inviteId = Number.parseInt(String(invite?.id ?? ""), 10);
  const safeInviteId = Number.isFinite(inviteId) && inviteId > 0 ? inviteId : 0;

  if (invite?.canRespond) {
    return `
      <button class="invite-action-btn invite-action-btn--accept" type="button" data-action="accept" data-id="${safeInviteId}" aria-label="Принять приглашение" title="Принять">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      </button>
      <button class="invite-action-btn invite-action-btn--decline" type="button" data-action="decline" data-id="${safeInviteId}" aria-label="Отклонить приглашение" title="Отклонить">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    `;
  }

  const statusLabel = escapeHtml(getStatusLabel(invite?.status));
  const statusClass = getStatusClass(invite?.status);
  const workspaceId = Number(invite?.workspaceId);
  const openBtn = Number(invite?.status) === 2 && Number.isFinite(workspaceId) && workspaceId > 0
    ? `<button class="ghost-btn" type="button" data-action="open-workspace" data-workspace-id="${workspaceId}">Открыть проект</button>`
    : "";

  return `<span class="invite-status ${statusClass}">${statusLabel}</span>${openBtn}`;
};

const renderInvites = () => {
  if (!listEl || !emptyEl) return;

  const list = Array.isArray(invitesState) ? invitesState : [];
  listEl.innerHTML = "";

  if (!list.length) {
    emptyEl.removeAttribute("hidden");
    return;
  }

  emptyEl.setAttribute("hidden", "");

  list.forEach((invite) => {
    const workspaceName = escapeHtml(normalizeToken(invite?.workspaceName) || "Проект");
    const inviter = escapeHtml(normalizeToken(invite?.invitedByName) || normalizeToken(invite?.invitedByEmail) || "Участник");
    const roleLabel = escapeHtml(getRoleLabel(invite?.role));
    const createdLabel = escapeHtml(formatDateTime(invite?.createdAtUtc));
    const expiresLabel = escapeHtml(formatDateTime(invite?.expiresAtUtc));
    const canRespond = !!invite?.canRespond;

    const item = document.createElement("article");
    item.className = `invite-item ${canRespond ? "" : "is-finished"}`;
    item.innerHTML = `
      <div class="invite-icon" aria-hidden="true">👤</div>
      <div class="invite-content">
        <h3>${workspaceName}</h3>
        <p class="invite-text">${inviter} приглашает вас в workspace.</p>
        <div class="invite-meta">
          <span class="invite-role">${roleLabel}</span>
          <span>Отправлено: ${createdLabel}</span>
          <span>Действует до: ${expiresLabel}</span>
        </div>
      </div>
      <div class="invite-actions">
        ${toInviteActionsMarkup(invite)}
      </div>
    `;

    listEl.appendChild(item);
  });
};

const loadCurrentUser = async () => {
  const me = await fetchJsonOrNull(buildApiUrl("/auth/me"), "Загрузка аккаунта", {
    headers: { Accept: "application/json" }
  });

  if (!me?.id) {
    actorUser = null;
    return;
  }

  actorUser = {
    id: Number(me.id),
    name: normalizeToken(me.name),
    email: normalizeToken(me.email)
  };

  if (accountEl) {
    accountEl.textContent = actorUser.name || actorUser.email || "Аккаунт";
  }
};

const loadInvites = async () => {
  const invites = await fetchJsonOrNull(buildApiUrl("/invites/me", { status: "Pending" }), "Загрузка приглашений", {
    headers: { Accept: "application/json" }
  });

  invitesState = Array.isArray(invites) ? invites.map((item) => ({ ...item })) : [];
  renderInvites();
};

const respondToInvite = async (inviteId, action) => {
  const id = Number(inviteId);
  if (!Number.isFinite(id) || id <= 0) return;

  const endpoint = action === "accept" ? `/invites/${id}/accept` : `/invites/${id}/decline`;
  const response = await apiFetch(buildApiUrl(endpoint), {
    method: "POST",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    await handleApiError(response, action === "accept" ? "Принятие приглашения" : "Отклонение приглашения");
    showToast("Не удалось обработать приглашение");
    return;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  replaceInviteInState(payload);
  renderInvites();

  if (action === "accept") {
    showToast("Приглашение принято");
  } else {
    showToast("Приглашение отклонено");
  }
};

const bindEvents = () => {
  const returnTarget = resolveReturnTarget();

  if (backBtn) {
    backBtn.addEventListener("click", (event) => {
      event.preventDefault();
      if (returnTarget.type === "workspace" && returnTarget.workspaceId) {
        navigateToWorkspacePage(returnTarget.workspaceId);
        return;
      }
      navigateToSpacesPage();
    });
  }

  if (listEl) {
    listEl.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const acceptBtn = target.closest("[data-action='accept']");
      if (acceptBtn) {
        const id = Number(acceptBtn.getAttribute("data-id"));
        void respondToInvite(id, "accept");
        return;
      }

      const declineBtn = target.closest("[data-action='decline']");
      if (declineBtn) {
        const id = Number(declineBtn.getAttribute("data-id"));
        void respondToInvite(id, "decline");
        return;
      }

      const openBtn = target.closest("[data-action='open-workspace']");
      if (openBtn) {
        const workspaceId = Number(openBtn.getAttribute("data-workspace-id"));
        if (Number.isFinite(workspaceId) && workspaceId > 0) {
          navigateToWorkspacePage(workspaceId);
        }
      }
    });
  }
};

const bootstrapInvitesPage = async () => {
  setTheme(getPreferredTheme());

  if (!ensureAuthOrRedirect() || !hasAccessToken()) {
    return;
  }

  bindEvents();
  await loadCurrentUser();
  if (!actorUser?.id) {
    redirectToAuthPage();
    return;
  }

  await loadInvites();
};

void bootstrapInvitesPage();
