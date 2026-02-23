import { normalizeToken } from "../shared/utils.js";

const INVITE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_BTN_LABEL_DEFAULT = "Пригласить";
const INVITE_BTN_LABEL_SENDING = "Отправка...";
const INVITE_BTN_LABEL_SENT = "✓ Отправлено";

const normalizeInviteEmail = (value) => normalizeToken(value).toLowerCase();

const isValidInviteEmail = (email) => {
  const value = normalizeInviteEmail(email);
  if (!value || value.length > 100) return false;
  return INVITE_EMAIL_PATTERN.test(value);
};

export const createInviteControls = ({
  inputEl,
  buttonEl,
  canManageInvites,
  getWorkspaceId,
  sendInvite,
  onInviteSent
} = {}) => {
  let isRequestInFlight = false;
  let isMarkedSent = false;
  let isBound = false;

  const refresh = () => {
    const canManage = typeof canManageInvites === "function" ? !!canManageInvites() : false;
    const rawEmail = inputEl ? inputEl.value : "";
    const normalizedEmail = normalizeInviteEmail(rawEmail);
    const hasEmail = normalizedEmail.length > 0;
    const hasValidEmail = isValidInviteEmail(normalizedEmail);

    if (inputEl) {
      inputEl.disabled = !canManage || isRequestInFlight;
      inputEl.classList.toggle("is-invalid", canManage && hasEmail && !hasValidEmail);
    }

    if (!buttonEl) {
      return;
    }

    buttonEl.classList.toggle("is-sent", isMarkedSent);

    if (isRequestInFlight) {
      buttonEl.textContent = INVITE_BTN_LABEL_SENDING;
    } else if (isMarkedSent) {
      buttonEl.textContent = INVITE_BTN_LABEL_SENT;
    } else {
      buttonEl.textContent = INVITE_BTN_LABEL_DEFAULT;
    }

    const shouldDisable = !canManage || isRequestInFlight || isMarkedSent || !hasValidEmail;
    buttonEl.disabled = shouldDisable;
  };

  const handleInviteClick = async () => {
    if (!inputEl || !buttonEl || typeof sendInvite !== "function") {
      return;
    }

    if (buttonEl.disabled || isRequestInFlight) {
      return;
    }

    const workspaceId = typeof getWorkspaceId === "function" ? Number(getWorkspaceId()) : NaN;
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      refresh();
      return;
    }

    const email = normalizeInviteEmail(inputEl.value);
    if (!isValidInviteEmail(email)) {
      refresh();
      return;
    }

    isRequestInFlight = true;
    isMarkedSent = false;
    refresh();

    const invite = await sendInvite(workspaceId, email);

    isRequestInFlight = false;
    if (invite && Number.isFinite(Number(invite.id))) {
      isMarkedSent = true;
      if (typeof onInviteSent === "function") {
        await onInviteSent(invite);
      }
    } else {
      isMarkedSent = false;
    }

    refresh();
  };

  const bind = () => {
    if (isBound) {
      return;
    }
    isBound = true;

    if (buttonEl) {
      buttonEl.addEventListener("click", () => {
        void handleInviteClick();
      });
    }

    if (inputEl) {
      inputEl.addEventListener("input", () => {
        isMarkedSent = false;
        refresh();
      });

      inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }

        event.preventDefault();
        if (buttonEl) {
          buttonEl.click();
        }
      });
    }

    refresh();
  };

  return {
    bind,
    refresh
  };
};
