import {
  buildApiUrl,
  apiFetch,
  fetchJsonOrNull,
  handleApiError
} from "./api.js?v=auth5";
import { toPageUrl } from "./navigation.js";
import { normalizeToken } from "./utils.js";

const NOTIFICATION_TYPE_META = {
  deadline_soon: { icon: "🔥", kind: "deadline" },
  deadline: { icon: "🔥", kind: "deadline" },
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

    items.forEach((item) => {
      const type = normalizeToken(item?.type).toLowerCase();
      const title = normalizeToken(item?.title) || "Уведомление";
      const message = normalizeToken(item?.message);
      const meta = resolveNotificationMeta(type);
      const timeLabel = formatRelativeTime(item?.createdAt);

      const card = document.createElement("button");
      card.type = "button";
      card.className = `notification-item ${item?.isRead ? "is-read" : "is-unread"}`;
      card.innerHTML = `
        <span class="notification-icon notification-icon--${meta.kind}" aria-hidden="true">${meta.icon}</span>
        <span class="notification-body">
          <span class="notification-title">${escapeHtml(title)}</span>
          <span class="notification-text">${escapeHtml(message || "Откройте уведомление, чтобы посмотреть детали")}</span>
          <span class="notification-meta">${escapeHtml(timeLabel)}</span>
        </span>
        <span class="notification-dot" aria-hidden="true"></span>
      `;

      card.addEventListener("click", () => {
        void handleNotificationClick(item);
      });

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
    const unreadCount = notifications.filter((item) => item && !item.isRead).length;
    setUnreadBadge(unreadCount);
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
