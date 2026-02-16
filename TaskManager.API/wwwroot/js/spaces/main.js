import {
  buildApiUrl,
  apiFetch,
  fetchJsonOrNull,
  handleApiError,
  ensureAuthOrRedirect,
  redirectToAuthPage
} from "../shared/api.js?v=auth2";
import { MANAGE_ROLES, STORAGE_WORKSPACE_ID } from "../shared/constants.js";
import { navigateToWorkspacePage } from "../shared/navigation.js";
import { normalizeToken, toInitials, toWorkspaceRole } from "../shared/utils.js";

const spacesGrid = document.getElementById("spaces-grid");
const spaceCreateOpenBtn = document.getElementById("space-create-open");
const spaceModal = document.getElementById("space-modal");
const spaceForm = document.getElementById("space-form");
const spaceNameInput = document.getElementById("space-name");
const spaceAvatarInput = document.getElementById("space-avatar-input");

const accountSelect = document.getElementById("account-select");
const accountNameInput = document.getElementById("account-name-input");
const accountEmailInput = document.getElementById("account-email-input");
const accountCreateBtn = document.getElementById("account-create-btn");

const spacesAccountNameEl = document.getElementById("spaces-account-name");
const spacesAccountEmailEl = document.getElementById("spaces-account-email");
const spacesAccountAvatarEl = document.getElementById("spaces-account-avatar");

let actorUser = null;
let pendingSpaceAvatarId = null;

const getActorUserId = () => {
  const id = Number(actorUser?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const updateActorUi = () => {
  const name = actorUser?.name || "Account";
  const email = actorUser?.email || "account@example.com";
  const initials = toInitials(name, email);

  if (spacesAccountNameEl) spacesAccountNameEl.textContent = name;
  if (spacesAccountEmailEl) spacesAccountEmailEl.textContent = email;
  if (spacesAccountAvatarEl) spacesAccountAvatarEl.textContent = initials;
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

  updateActorUi();
};

const loadCurrentUserFromApi = async () => {
  const me = await fetchJsonOrNull(buildApiUrl("/auth/me"), "Load current account", {
    headers: { Accept: "application/json" }
  });

  if (me && Number.isFinite(Number(me.id))) {
    setActorUser(me);
    return;
  }

  actorUser = null;
  updateActorUi();
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
    const avatarPath = normalizeToken(space?.avatarPath);
    if (avatarPath) {
      const img = document.createElement("img");
      img.src = avatarPath;
      img.alt = `${space.name || "Workspace"} avatar`;
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
    title.textContent = normalizeToken(space?.name) || `Workspace ${id}`;

    const sub = document.createElement("span");
    sub.className = "space-card-sub";
    const role = toWorkspaceRole(space?.currentUserRole);
    const members = Number(space?.memberCount || 0);
    sub.textContent = `${role} · ${members} member${members === 1 ? "" : "s"}`;

    const actions = document.createElement("div");
    actions.className = "space-card-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "space-open-btn";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => {
      openWorkspace(space);
    });
    actions.appendChild(openBtn);

    if (MANAGE_ROLES.has(role)) {
      const avatarBtn = document.createElement("button");
      avatarBtn.type = "button";
      avatarBtn.className = "space-avatar-btn";
      avatarBtn.textContent = "Set avatar";
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

  const addCard = document.createElement("button");
  addCard.type = "button";
  addCard.className = "space-add-card";
  addCard.innerHTML = `<span class="space-add-plus">+</span><span>Create new workspace</span>`;
  addCard.addEventListener("click", () => {
    openSpaceModal();
  });
  spacesGrid.appendChild(addCard);

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "spaces-empty";
    empty.textContent = "No workspaces yet. Create your first workspace.";
    spacesGrid.prepend(empty);
  }
};

const loadSpacesFromApi = async () => {
  if (!getActorUserId()) {
    renderSpaces([]);
    return;
  }

  const spaces = await fetchJsonOrNull(buildApiUrl("/spaces"), "Load spaces", {
    headers: { Accept: "application/json" }
  });

  renderSpaces(Array.isArray(spaces) ? spaces : []);
};

const bindEvents = () => {
  if (spaceCreateOpenBtn) {
    spaceCreateOpenBtn.addEventListener("click", () => {
      openSpaceModal();
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

        const created = await fetchJsonOrNull(buildApiUrl("/spaces"), "Create workspace", {
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
          await handleApiError(response, "Set workspace avatar");
          return;
        }

        await loadSpacesFromApi();
      })();
    });
  }
};

const hideLegacyAccountControls = () => {
  accountSelect?.closest(".spaces-account-switch")?.setAttribute("hidden", "");
  accountNameInput?.closest(".spaces-account-create")?.setAttribute("hidden", "");
  accountEmailInput?.closest(".spaces-account-create")?.setAttribute("hidden", "");
  accountCreateBtn?.closest(".spaces-account-create")?.setAttribute("hidden", "");
};

const bootstrap = async () => {
  if (!ensureAuthOrRedirect()) {
    return;
  }

  hideLegacyAccountControls();
  bindEvents();
  await loadCurrentUserFromApi();
  updateActorUi();

  if (!getActorUserId()) {
    redirectToAuthPage();
    return;
  }

  await loadSpacesFromApi();
};

void bootstrap();
