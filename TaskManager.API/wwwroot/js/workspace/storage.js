export const getPreferredTheme = () => {
  try {
    const saved = localStorage.getItem("gtt-theme");
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
    localStorage.setItem("gtt-theme", next);
  } catch {
    // ignore
  }
};

export const toggleTheme = () => {
  const current = document.body.dataset.theme || "dark";
  setTheme(current === "dark" ? "light" : "dark");
};

const taskBgKey = (id) => `gtt-taskbg:${id}`;
const taskMetaKey = (id) => `gtt-taskmeta:${id}`;

export const getStoredTaskMeta = (id) => {
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

export const setStoredTaskMeta = (id, meta) => {
  try {
    if (!meta || typeof meta !== "object") return;
    const theme = typeof meta.theme === "string" ? meta.theme.trim() : "";
    const tags = Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string") : [];
    localStorage.setItem(taskMetaKey(id), JSON.stringify({ theme, tags }));
  } catch {
    // ignore
  }
};

export const getStoredTaskBg = (id) => {
  try {
    return localStorage.getItem(taskBgKey(id)) || "";
  } catch {
    return "";
  }
};

export const setStoredTaskBg = (id, dataUrl) => {
  try {
    localStorage.setItem(taskBgKey(id), dataUrl);
  } catch {
    // ignore
  }
};

export const clearStoredTaskBg = (id) => {
  try {
    localStorage.removeItem(taskBgKey(id));
  } catch {
    // ignore
  }
};
