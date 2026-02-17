import { normalizeToken } from "./utils.js";

export const getStoredAccountNickname = (id) => {
  if (!Number.isFinite(Number(id))) return "";
  try {
    return localStorage.getItem(`gtt-account-nickname:${id}`) || "";
  } catch {
    return "";
  }
};

export const setStoredAccountNickname = (id, value) => {
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
};

export const getStoredAccountAvatar = (id) => {
  if (!Number.isFinite(Number(id))) return "";
  try {
    return localStorage.getItem(`gtt-account-avatar:${id}`) || "";
  } catch {
    return "";
  }
};

export const setStoredAccountAvatar = (id, dataUrl) => {
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
};

export const applyAccountAvatarToElement = (element, textElement, initials, dataUrl) => {
  if (!element) return;
  const url = normalizeToken(dataUrl);
  if (url) {
    element.classList.add("has-image");
    element.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    if (textElement) {
      textElement.textContent = "";
    } else {
      element.textContent = "";
    }
    return;
  }

  element.classList.remove("has-image");
  element.style.backgroundImage = "";
  if (textElement) {
    textElement.textContent = initials;
  } else {
    element.textContent = initials;
  }
};
