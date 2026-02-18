import { STORAGE_WORKSPACE_ID } from "../shared/constants.js";
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

const taskBgScopedKey = (workspaceId, taskId) => `gtt-taskbg:${workspaceId}:${taskId}`;
const taskMetaScopedKey = (workspaceId, taskId) => `gtt-taskmeta:${workspaceId}:${taskId}`;
const taskBgLegacyKey = (taskId) => `gtt-taskbg:${taskId}`;
const taskMetaLegacyKey = (taskId) => `gtt-taskmeta:${taskId}`;
const workspaceColumnsKey = (workspaceId) => `gtt-columns:${workspaceId}`;

const normalizeTaskId = (taskId) => {
  const parsed = Number.parseInt(String(taskId ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveCurrentWorkspaceId = () => {
  try {
    const raw = localStorage.getItem(STORAGE_WORKSPACE_ID);
    const parsed = Number.parseInt(String(raw ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};
const normalizeWorkspaceId = (workspaceId) => {
  const id = Number(workspaceId);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const normalizeColumnType = (value) => {
  const token = String(value || "").trim().toLowerCase();
  if (token === "inprogress" || token === "done" || token === "overdue") {
    return token;
  }
  return "new";
};

export const getStoredTaskMeta = (id) => {
  const taskId = normalizeTaskId(id);
  const workspaceId = resolveCurrentWorkspaceId();
  if (!taskId || !workspaceId) return null;

  try {
    const raw = localStorage.getItem(taskMetaScopedKey(workspaceId, taskId));
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
  const taskId = normalizeTaskId(id);
  const workspaceId = resolveCurrentWorkspaceId();
  if (!taskId || !workspaceId) return;
  try {
    if (!meta || typeof meta !== "object") return;
    const theme = typeof meta.theme === "string" ? meta.theme.trim() : "";
    const tags = Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string") : [];
    localStorage.setItem(taskMetaScopedKey(workspaceId, taskId), JSON.stringify({ theme, tags }));
    localStorage.removeItem(taskMetaLegacyKey(taskId));
  } catch {
    // ignore
  }
};

export const clearStoredTaskMeta = (id) => {
  const taskId = normalizeTaskId(id);
  if (!taskId) return;

  try {
    const workspaceId = resolveCurrentWorkspaceId();
    if (workspaceId) {
      localStorage.removeItem(taskMetaScopedKey(workspaceId, taskId));
    }
    localStorage.removeItem(taskMetaLegacyKey(taskId));
  } catch {
    // ignore
  }
};

export const getStoredTaskBg = (id) => {
  const taskId = normalizeTaskId(id);
  const workspaceId = resolveCurrentWorkspaceId();
  if (!taskId || !workspaceId) return "";

  try {
    return localStorage.getItem(taskBgScopedKey(workspaceId, taskId)) || "";
  } catch {
    return "";
  }
};

export const setStoredTaskBg = (id, dataUrl) => {
  const taskId = normalizeTaskId(id);
  const workspaceId = resolveCurrentWorkspaceId();
  if (!taskId || !workspaceId) return;

  try {
    const value = typeof dataUrl === "string" ? dataUrl : "";
    if (value) {
      localStorage.setItem(taskBgScopedKey(workspaceId, taskId), value);
    } else {
      localStorage.removeItem(taskBgScopedKey(workspaceId, taskId));
    }
    localStorage.removeItem(taskBgLegacyKey(taskId));
  } catch {
    // ignore
  }
};

export const clearStoredTaskBg = (id) => {
  const taskId = normalizeTaskId(id);
  if (!taskId) return;

  try {
    const workspaceId = resolveCurrentWorkspaceId();
    if (workspaceId) {
      localStorage.removeItem(taskBgScopedKey(workspaceId, taskId));
    }
    localStorage.removeItem(taskBgLegacyKey(taskId));
  } catch {
    // ignore
  }
};

export const clearStoredTaskArtifacts = (id) => {
  clearStoredTaskMeta(id);
  clearStoredTaskBg(id);
};
export const getStoredWorkspaceColumns = (workspaceId) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(workspaceColumnsKey(normalizedWorkspaceId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .slice(0, 64)
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const columnId = String(item.columnId || "").trim().slice(0, 120);
        const title = String(item.title || "").trim().slice(0, 120);
        const columnType = normalizeColumnType(item.columnType);
        if (!title) {
          return null;
        }

        return {
          columnId,
          title,
          columnType
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const setStoredWorkspaceColumns = (workspaceId, columns) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId) {
    return;
  }

  const safeColumns = Array.isArray(columns)
    ? columns
      .slice(0, 64)
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const columnId = String(item.columnId || "").trim().slice(0, 120);
        const title = String(item.title || "").trim().slice(0, 120);
        const columnType = normalizeColumnType(item.columnType);
        if (!title) {
          return null;
        }

        return {
          columnId,
          title,
          columnType
        };
      })
      .filter(Boolean)
    : [];

  try {
    localStorage.setItem(workspaceColumnsKey(normalizedWorkspaceId), JSON.stringify(safeColumns));
  } catch {
    // ignore
  }
};

export const clearStoredWorkspaceColumns = (workspaceId) => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId) {
    return;
  }

  try {
    localStorage.removeItem(workspaceColumnsKey(normalizedWorkspaceId));
  } catch {
    // ignore
  }
};
