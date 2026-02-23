import {
  buildApiUrl,
  apiFetch,
  fetchJsonOrNull,
  handleApiError,
  ensureAuthOrRedirect,
  redirectToAuthPage,
  clearAccessToken
} from "../shared/api.js?v=auth5";
import { getPreferredTheme, setTheme } from "../workspace/storage.js?v=auth4";
import { STORAGE_WORKSPACE_ID } from "../shared/constants.js";
import { navigateToWorkspacePage } from "../shared/navigation.js";
import { normalizeToken, toInitials, toWorkspaceRole } from "../shared/utils.js";
import { getRoleLabel } from "../shared/roles.js?v=auth1";
import { createNotificationsPanelController } from "../shared/notifications.js?v=notif3";
import {
  getStoredAccountAvatar,
  setStoredAccountAvatar,
  applyAccountAvatarToElement
} from "../shared/account-prefs.js?v=auth1";

setTheme(getPreferredTheme());

const spacesGrid = document.getElementById("spaces-grid");
const appShell = document.getElementById("app-shell");
const spaceModal = document.getElementById("space-modal");
const spaceForm = document.getElementById("space-form");
const spaceNameInput = document.getElementById("space-name");
const spaceAvatarInput = document.getElementById("space-avatar-input");

const spacesAccountNameEl = document.getElementById("spaces-account-name");
const spacesAccountEmailEl = document.getElementById("spaces-account-email");
const spacesAccountAvatarEl = document.getElementById("spaces-account-avatar");

const settingsPanel = document.getElementById("settings-panel");
const settingsToggleBtn = document.getElementById("settings-toggle");
const settingsNicknameInput = document.getElementById("settings-nickname");
const settingsNicknameSaveBtn = document.getElementById("settings-nickname-save");
const settingsNicknameCooldownEl = document.getElementById("settings-nickname-cooldown");
const settingsAvatarPreview = document.getElementById("settings-avatar-preview");
const settingsAvatarPreviewTextEl = settingsAvatarPreview?.querySelector("span") || null;
const settingsAvatarInput = document.getElementById("settings-avatar-input");
const settingsAvatarBtn = document.getElementById("settings-avatar-btn");
const settingsAvatarClearBtn = document.getElementById("settings-avatar-clear");
const settingsThemeDarkBtn = document.getElementById("settings-theme-dark");
const settingsThemeLightBtn = document.getElementById("settings-theme-light");

const notificationsPanel = document.getElementById("notifications-panel");
const notificationsToggleBtn = document.getElementById("notifications-toggle");
const notificationsCloseBtn = document.getElementById("notifications-close");
const notificationsListEl = document.getElementById("notifications-list");
const notificationsEmptyEl = document.getElementById("notifications-empty");
const notificationsMarkAllBtn = document.getElementById("notifications-mark-all");

const logoutBtn = document.getElementById("logout-btn");

let actorUser = null;
let pendingSpaceAvatarId = null;
let nicknameSaveInFlight = false;
let nicknameCooldownEndsAt = 0;
let nicknameCooldownTimerHandle = null;
let nicknameStatusMessage = "";
let nicknameStatusIsError = false;

const notificationsController = createNotificationsPanelController({
  toggleBtn: notificationsToggleBtn,
  listEl: notificationsListEl,
  emptyEl: notificationsEmptyEl,
  markAllBtn: notificationsMarkAllBtn,
  returnTo: "spaces"
});

const formatMembersLabel = (count) => {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
};

const refreshSettingsThemeState = () => {
  const theme = document.body.dataset.theme === "light" ? "light" : "dark";
  settingsThemeDarkBtn?.classList.toggle("is-selected", theme === "dark");
  settingsThemeLightBtn?.classList.toggle("is-selected", theme === "light");
};

const isNotificationsOpen = () => appShell?.classList.contains("is-notifications-open");

const setNotificationsOpen = (open) => {
  if (!appShell) return;
  appShell.classList.toggle("is-notifications-open", open);
  if (notificationsToggleBtn) {
    notificationsToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (notificationsPanel) {
    notificationsPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }

  if (open) {
    void notificationsController.onPanelOpened();
    window.setTimeout(() => notificationsCloseBtn?.focus(), 0);
  }
};

const isSettingsOpen = () => appShell?.classList.contains("is-settings-open");

const setSettingsOpen = (open) => {
  if (!appShell) return;
  appShell.classList.toggle("is-settings-open", open);
  if (settingsToggleBtn) {
    settingsToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (settingsPanel) {
    settingsPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (open) {
    refreshSettingsThemeState();
    window.setTimeout(() => settingsNicknameInput?.focus(), 0);
  }
};

const getActorUserId = () => {
  const id = Number(actorUser?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
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
  return "Аккаунт";
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
  const id = getActorUserId();
  const email = actorUser?.email || "account@example.com";
  const name = getActorDisplayName();
  const initials = toInitials(name, email);
  const avatarPath = normalizeToken(actorUser?.avatarPath);

  if (spacesAccountNameEl) spacesAccountNameEl.textContent = name;
  if (spacesAccountEmailEl) spacesAccountEmailEl.textContent = email;

  applyAccountAvatarToElement(spacesAccountAvatarEl, null, initials, avatarPath);
  applyAccountAvatarToElement(settingsAvatarPreview, settingsAvatarPreviewTextEl, initials, avatarPath);

  if (settingsNicknameInput && document.activeElement !== settingsNicknameInput) {
    settingsNicknameInput.value = name;
  }

  refreshNicknameControls();
};

const setActorUser = (user) => {
  if (!user) return;
  const id = Number(user.id);
  if (!Number.isFinite(id) || id <= 0) return;

  actorUser = {
    id,
    name: normalizeToken(user.name) || `User ${id}`,
    email: normalizeToken(user.email) || `user${id}@local`,
    avatarPath: normalizeToken(user.avatarPath),
    nicknameChangeAvailableAtUtc: normalizeToken(user.nicknameChangeAvailableAtUtc)
  };

  syncNicknameCooldownFromActor();
  updateActorUi();
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
    }
  } catch {
    // ignore one-time migration errors
  }
};

const closeSpaceModal = () => {
  if (!spaceModal) return;
  spaceModal.setAttribute("hidden", "");
  if (spaceNameInput) spaceNameInput.value = "";
};

const openSpaceModal = () => {
  if (!spaceModal) return;
  spaceModal.removeAttribute("hidden");
  window.requestAnimationFrame(() => {
    spaceNameInput?.focus();
  });
};

const openWorkspace = (space) => {
  const workspaceId = Number(space?.id);
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) return;

  try {
    localStorage.setItem(STORAGE_WORKSPACE_ID, String(workspaceId));
  } catch {
    // ignore
  }

  navigateToWorkspacePage(workspaceId);
};

const renderSpaces = (spaces) => {
  if (!spacesGrid) return;
  spacesGrid.innerHTML = "";

  const list = Array.isArray(spaces) ? spaces : [];

  const addCard = document.createElement("button");
  addCard.type = "button";
  addCard.className = "space-add-card";
  addCard.innerHTML = `<span class="space-add-plus">+</span><span>Создать новый проект</span>`;
  addCard.addEventListener("click", () => {
    openSpaceModal();
  });
  spacesGrid.appendChild(addCard);

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "spaces-empty";
    empty.textContent = "Пока нет проектов. Создайте свой первый проект.";
    spacesGrid.appendChild(empty);
  }

  list.forEach((space) => {
    const id = Number(space?.id);
    if (!Number.isFinite(id) || id <= 0) return;

    const card = document.createElement("article");
    card.className = "space-card";

    card.addEventListener("dblclick", (event) => {
      const target = event?.target;
      if (target && typeof target.closest === "function") {
        if (target.closest("button, a, input, select, textarea, label")) return;
      }
      openWorkspace(space);
    });

    const preview = document.createElement("div");
    preview.className = "space-card-preview";
    const safeSpaceName = normalizeToken(space?.name) || `Проект ${id}`;
    const avatarPath = normalizeToken(space?.avatarPath);
    if (avatarPath) {
      const img = document.createElement("img");
      img.src = avatarPath;
      img.alt = `Аватар проекта ${safeSpaceName}`;
      preview.appendChild(img);
    } else {
      const initials = document.createElement("span");
      initials.textContent = toInitials(space?.name, "WS");
      preview.appendChild(initials);
    }

    const body = document.createElement("div");
    body.className = "space-card-body";

    const title = document.createElement("h3");
    title.className = "space-card-title";
    title.textContent = safeSpaceName;

    const sub = document.createElement("span");
    sub.className = "space-card-sub";
    const role = toWorkspaceRole(space?.currentUserRole);
    const members = Number(space?.memberCount || 0);
    sub.textContent = `${getRoleLabel(role)} · ${formatMembersLabel(members)}`;

    const actions = document.createElement("div");
    actions.className = "space-card-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "space-open-btn";
    openBtn.textContent = "Открыть";
    openBtn.addEventListener("click", () => {
      openWorkspace(space);
    });
    actions.appendChild(openBtn);

    if (role === "Owner") {
      const avatarBtn = document.createElement("button");
      avatarBtn.type = "button";
      avatarBtn.className = "space-avatar-btn";
      avatarBtn.textContent = "Фото";
      avatarBtn.addEventListener("click", () => {
        pendingSpaceAvatarId = id;
        spaceAvatarInput?.click();
      });
      actions.appendChild(avatarBtn);
    }

    body.append(title, sub, actions);
    card.append(preview, body);
    spacesGrid.appendChild(card);
  });
};

const loadSpacesFromApi = async () => {
  if (!getActorUserId()) {
    renderSpaces([]);
    return;
  }

  const spaces = await fetchJsonOrNull(buildApiUrl("/spaces"), "Загрузка проектов", {
    headers: { Accept: "application/json" }
  });

  renderSpaces(Array.isArray(spaces) ? spaces : []);
};

const bindEvents = () => {
  if (notificationsToggleBtn) {
    notificationsToggleBtn.addEventListener("click", () => {
      const next = !isNotificationsOpen();
      if (next) {
        setSettingsOpen(false);
      }
      setNotificationsOpen(next);
    });
  }

  if (notificationsCloseBtn) {
    notificationsCloseBtn.addEventListener("click", () => {
      setNotificationsOpen(false);
    });
  }

  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener("click", () => {
      const next = !isSettingsOpen();
      if (next) {
        setNotificationsOpen(false);
      }
      setSettingsOpen(next);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAccessToken();
      redirectToAuthPage();
    });
  }

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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isNotificationsOpen()) setNotificationsOpen(false);
    if (isSettingsOpen()) setSettingsOpen(false);
  });

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

  if (spaceForm) {
    spaceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void (async () => {
        const name = normalizeToken(spaceNameInput?.value);
        if (!name) return;

        if (!getActorUserId()) {
          redirectToAuthPage();
          return;
        }

        const created = await fetchJsonOrNull(buildApiUrl("/spaces"), "Создание проекта", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ name })
        });

        closeSpaceModal();
        await loadSpacesFromApi();
        if (created && created.id) {
          openWorkspace(created);
        }
      })();
    });
  }

  document.querySelectorAll("[data-close-space-modal]").forEach((node) => {
    node.addEventListener("click", () => {
      closeSpaceModal();
    });
  });

  if (spaceAvatarInput) {
    spaceAvatarInput.addEventListener("change", () => {
      void (async () => {
        const id = pendingSpaceAvatarId;
        pendingSpaceAvatarId = null;

        const file = spaceAvatarInput.files && spaceAvatarInput.files[0]
          ? spaceAvatarInput.files[0]
          : null;
        spaceAvatarInput.value = "";
        if (!file || !Number.isFinite(Number(id))) return;

        const form = new FormData();
        form.append("file", file);

        const response = await apiFetch(buildApiUrl(`/spaces/${id}/avatar`), {
          method: "POST",
          body: form
        });

        if (!response.ok) {
          await handleApiError(response, "Установка аватара проекта");
          return;
        }

        await loadSpacesFromApi();
      })();
    });
  }
};

const bootstrap = async () => {
  if (!ensureAuthOrRedirect()) {
    return;
  }

  bindEvents();
  await loadCurrentUserFromApi();
  await migrateLegacyAvatarIfNeeded();
  updateActorUi();
  refreshSettingsThemeState();

  if (!getActorUserId()) {
    redirectToAuthPage();
    return;
  }

  await notificationsController.refreshUnreadCount();
  await loadSpacesFromApi();
};

window.addEventListener("pageshow", () => {
  setTheme(getPreferredTheme());
  refreshSettingsThemeState();
  updateActorUi();
});

window.addEventListener("storage", (event) => {
  const key = String(event?.key || "");
  if (key === "gtt-theme") {
    setTheme(getPreferredTheme());
    refreshSettingsThemeState();
  }
});

void bootstrap();
