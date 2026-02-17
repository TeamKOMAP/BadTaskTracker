const THEME_KEY = "gtt-theme";
const DEV_AUTH_CODE_KEY = "gtt-dev-auth-code";

export const getPreferredTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }

  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

export const setTheme = (theme) => {
  const next = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore
  }
};

export const toggleTheme = () => {
  const current = document.body.dataset.theme || "dark";
  setTheme(current === "dark" ? "light" : "dark");
};

export const hasDotInDomain = (email) => {
  const value = String(email || "").trim();
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1].trim();
  if (!domain) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
};

export const parseApiErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    const message = String(data?.error || data?.title || "").trim();
    if (message) return message;
  } catch {
    // ignore
  }

  return fallback;
};

export const saveDevelopmentCode = (email, code) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").replace(/\D+/g, "").trim();
  try {
    if (!normalizedEmail || !normalizedCode) {
      sessionStorage.removeItem(DEV_AUTH_CODE_KEY);
      return;
    }

    sessionStorage.setItem(DEV_AUTH_CODE_KEY, JSON.stringify({
      email: normalizedEmail,
      code: normalizedCode
    }));
  } catch {
    // ignore
  }
};

export const clearDevelopmentCode = () => {
  try {
    sessionStorage.removeItem(DEV_AUTH_CODE_KEY);
  } catch {
    // ignore
  }
};

export const getDevelopmentCodeForEmail = (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return "";
  try {
    const raw = sessionStorage.getItem(DEV_AUTH_CODE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const storedEmail = String(parsed?.email || "").trim().toLowerCase();
    const storedCode = String(parsed?.code || "").replace(/\D+/g, "").trim();
    if (storedEmail !== normalizedEmail) return "";
    return storedCode;
  } catch {
    return "";
  }
};
