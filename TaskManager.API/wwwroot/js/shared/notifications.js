import {
  buildApiUrl,
  apiFetch,
  setAccessToken,
  fetchJsonOrNull,
  handleApiError
} from "./api.js?v=auth5";
import { toPageUrl } from "./navigation.js";
import { normalizeToken } from "./utils.js";

const NOTIFICATION_TYPE_META = {
  deadline_soon: { icon: "🔥", kind: "deadline" },
  deadline: { icon: "🔥", kind: "deadline" },
  task_done_pending_approval: { icon: "🕒", kind: "pending" },
  task_done_approved: { icon: "✅", kind: "approved" },
  task_done_rejected: { icon: "❌", kind: "rejected" },
  workspace_invite_received: { icon: "👤", kind: "invite" },
  workspace_deleted: { icon: "⚠️", kind: "workspace" }
};

const clampCount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(0, Math.floor(num));
};

const formatCount = (value) => {
  const count = clampCount(value);
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
};

const escapeHtml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatRelativeTime = (iso) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return "только что";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн назад`;

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

const resolveNotificationMeta = (type) => {
  const key = normalizeToken(type).toLowerCase();
  return NOTIFICATION_TYPE_META[key] || { icon: "🔔", kind: "generic" };
};

const toAbsoluteUrl = (rawUrl) => {
  const token = normalizeToken(rawUrl);
  if (!token) return "";

  try {
    const url = new URL(token, window.location.href);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
};

export const createNotificationsPanelController = ({
  toggleBtn,
  listEl,
  emptyEl,
  markAllBtn,
  returnTo = "spaces",
  resolveWorkspaceId = () => null
} = {}) => {
  let notifications = [];

  const switchWorkspaceToken = async (workspaceId) => {
    const id = Number(workspaceId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const response = await apiFetch(buildApiUrl("/auth/switch-workspace"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ workspaceId: id })
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
    } catch {
      // ignore
    }

    return true;
  };

  const setUnreadBadge = (value) => {
    if (!toggleBtn) return;
    const text = formatCount(value);
    if (!text) {
      toggleBtn.classList.remove("has-unread");
      toggleBtn.removeAttribute("data-unread-count");
      return;
    }

    toggleBtn.classList.add("has-unread");
    toggleBtn.setAttribute("data-unread-count", text);
  };

  const renderEmptyState = (text) => {
    if (listEl) {
      listEl.innerHTML = "";
      listEl.setAttribute("hidden", "");
    }
    if (emptyEl) {
      emptyEl.textContent = text;
      emptyEl.removeAttribute("hidden");
    }
  };

  const resolveInviteUrl = (notification) => {
    const workspaceId = Number(notification?.workspaceId || resolveWorkspaceId?.());
    const directInviteId = Number(notification?.inviteId);
    let actionInviteId = null;
    const actionUrlToken = normalizeToken(notification?.actionUrl);
    if (actionUrlToken) {
      try {
        const parsed = new URL(actionUrlToken, window.location.href);
        const fromAction = Number.parseInt(parsed.searchParams.get("inviteId") || "", 10);
        if (Number.isFinite(fromAction) && fromAction > 0) {
          actionInviteId = fromAction;
        }
      } catch {
        actionInviteId = null;
      }
    }

    const inviteId = Number.isFinite(directInviteId) && directInviteId > 0
      ? directInviteId
      : actionInviteId;
    const query = {
      returnTo,
      workspaceId: Number.isFinite(workspaceId) && workspaceId > 0 ? workspaceId : undefined,
      inviteId: Number.isFinite(inviteId) && inviteId > 0 ? inviteId : undefined
    };

    return toPageUrl("invites.html", query);
  };

  const resolveNotificationUrl = (notification) => {
    const type = normalizeToken(notification?.type).toLowerCase();
    if (type === "workspace_invite_received") {
      return resolveInviteUrl(notification);
    }

    return toAbsoluteUrl(notification?.actionUrl);
  };

  const markAsRead = async (notificationId) => {
    const id = Number(notificationId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const response = await apiFetch(buildApiUrl(`/notifications/${id}/read`), {
      method: "POST",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      await handleApiError(response, "Отметка уведомления");
      return false;
    }

    return true;
  };

  const handleNotificationClick = async (notification) => {
    if (!notification) return;

    if (!notification.isRead) {
      const success = await markAsRead(notification.id);
      if (success) {
        notification.isRead = true;
      }
    }

    const targetUrl = resolveNotificationUrl(notification);
    if (targetUrl) {
      window.location.href = targetUrl;
      return;
    }

    await refreshNotifications();
  };

  const renderNotifications = () => {
    if (!listEl || !emptyEl) return;

    const items = Array.isArray(notifications) ? notifications : [];
    if (!items.length) {
      renderEmptyState("Пока нет уведомлений.");
      return;
    }

    emptyEl.setAttribute("hidden", "");
    listEl.removeAttribute("hidden");
    listEl.innerHTML = "";

    const runDoneApprovalAction = async (notification, decision) => {
      const taskId = Number(notification?.taskId);
      const workspaceId = Number(notification?.workspaceId);
      if (!Number.isFinite(taskId) || taskId <= 0) return false;

      // Ensure workspace context matches the task.
      if (Number.isFinite(workspaceId) && workspaceId > 0) {
        const switched = await switchWorkspaceToken(workspaceId);
        if (!switched) return false;
      }

      const route = decision === "approve"
        ? `/tasks/${taskId}/done-approval/approve`
        : `/tasks/${taskId}/done-approval/reject`;

      const response = await apiFetch(buildApiUrl(route), {
        method: "POST",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        await handleApiError(response, decision === "approve" ? "Подтверждение задачи" : "Отклонение задачи");
        await refreshNotifications();
        return false;
      }

      let updatedTask = null;
      try {
        updatedTask = await response.json();
      } catch {
        updatedTask = null;
      }

      if (updatedTask) {
        window.dispatchEvent(new CustomEvent("task:upsert", { detail: { task: updatedTask } }));
      }

      if (notification?.id && !notification?.isRead) {
        const ok = await markAsRead(notification.id);
        if (ok) {
          notification.isRead = true;
        }
      }

      await refreshNotifications();
      return true;
    };

    items.forEach((item) => {
      const type = normalizeToken(item?.type).toLowerCase();
      const title = normalizeToken(item?.title) || "Уведомление";
      const message = normalizeToken(item?.message);
      const meta = resolveNotificationMeta(type);
      const timeLabel = formatRelativeTime(item?.createdAt);

      const card = document.createElement("div");
      card.className = `notification-item ${item?.isRead ? "is-read" : "is-unread"}`;
      card.setAttribute("role", "button");
      card.tabIndex = 0;

      const icon = document.createElement("span");
      icon.className = `notification-icon notification-icon--${meta.kind}`;
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = meta.icon;

      const body = document.createElement("span");
      body.className = "notification-body";
      const titleEl = document.createElement("span");
      titleEl.className = "notification-title";
      titleEl.textContent = title;
      const textEl = document.createElement("span");
      textEl.className = "notification-text";
      textEl.textContent = message || "Откройте уведомление, чтобы посмотреть детали";
      const metaEl = document.createElement("span");
      metaEl.className = "notification-meta";
      metaEl.textContent = timeLabel;
      body.append(titleEl, textEl, metaEl);

      let actionsEl = null;
      if (type === "task_done_pending_approval" && !item?.isRead && Number.isFinite(Number(item?.taskId)) && Number(item.taskId) > 0) {
        const actions = document.createElement("span");
        actions.className = "notification-actions";

        const acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "notification-action notification-action--accept";
        acceptBtn.textContent = "Принять";
        acceptBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (acceptBtn.disabled) return;
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
          void (async () => {
            const ok = await runDoneApprovalAction(item, "approve");
            if (!ok) {
              acceptBtn.disabled = false;
              rejectBtn.disabled = false;
              return;
            }
            item.isRead = true;
            card.classList.add("is-read");
            card.classList.remove("is-unread");
            if (actionsEl) actionsEl.remove();
          })();
        });

        const rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "notification-action notification-action--reject";
        rejectBtn.textContent = "Отклонить";
        rejectBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (rejectBtn.disabled) return;
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
          void (async () => {
            const ok = await runDoneApprovalAction(item, "reject");
            if (!ok) {
              acceptBtn.disabled = false;
              rejectBtn.disabled = false;
              return;
            }
            item.isRead = true;
            card.classList.add("is-read");
            card.classList.remove("is-unread");
            if (actionsEl) actionsEl.remove();
          })();
        });

        actions.append(acceptBtn, rejectBtn);
        actionsEl = actions;
        body.appendChild(actions);
      }

      const dot = document.createElement("span");
      dot.className = "notification-dot";
      dot.setAttribute("aria-hidden", "true");

      const open = () => {
        void handleNotificationClick(item);
      };

      card.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target && target.closest(".notification-action")) return;
        open();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target;
        if (target !== card) return;
        event.preventDefault();
        open();
      });

      card.append(icon, body, dot);
      listEl.appendChild(card);
    });
  };

  const refreshUnreadCount = async () => {
    const payload = await fetchJsonOrNull(buildApiUrl("/notifications/unread-count"), "Загрузка счетчика уведомлений", {
      headers: { Accept: "application/json" }
    });

    const unreadCount = clampCount(payload?.unreadCount);
    setUnreadBadge(unreadCount);
    return unreadCount;
  };

  const refreshNotifications = async () => {
    const data = await fetchJsonOrNull(buildApiUrl("/notifications", { take: 50 }), "Загрузка уведомлений", {
      headers: { Accept: "application/json" }
    });

    notifications = Array.isArray(data) ? data.map((item) => ({ ...item })) : [];
    renderNotifications();
    await refreshUnreadCount();
    return notifications;
  };

  if (markAllBtn) {
    markAllBtn.addEventListener("click", () => {
      void (async () => {
        const response = await apiFetch(buildApiUrl("/notifications/read-all"), {
          method: "POST",
          headers: { Accept: "application/json" }
        });

        if (!response.ok) {
          await handleApiError(response, "Отметка всех уведомлений");
          return;
        }

        await refreshNotifications();
      })();
    });
  }

  return {
    refreshUnreadCount,
    refreshNotifications,
    onPanelOpened: async () => {
      await refreshNotifications();
    }
  };
};
