export const createTaskDetailCache = (deps) => {
  const getStoredTaskBg = typeof deps?.getStoredTaskBg === "function" ? deps.getStoredTaskBg : () => "";

  const TASK_CACHE_TTL_MS = 30_000;
  const ATTACHMENT_CACHE_TTL_MS = 20_000;

  const taskCache = new Map();
  const attachmentCache = new Map();
  const photoCache = new Map();

  const isFresh = (entry, ttlMs) => {
    if (!entry || typeof entry !== "object") return false;
    const age = Date.now() - Number(entry.at || 0);
    return Number.isFinite(age) && age >= 0 && age < ttlMs;
  };

  const normalizeId = (id) => {
    const value = Number(id);
    return Number.isFinite(value) ? value : null;
  };

  const getTask = (id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return null;
    const entry = taskCache.get(normalizedId);
    return isFresh(entry, TASK_CACHE_TTL_MS) ? entry.data : null;
  };

  const setTask = (id, data) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null || !data) return;
    taskCache.set(normalizedId, { data, at: Date.now() });
    if (taskCache.size > 200) {
      const firstKey = taskCache.keys().next().value;
      if (firstKey !== undefined) taskCache.delete(firstKey);
    }
  };

  const deleteTask = (id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return;
    taskCache.delete(normalizedId);
  };

  const getAttachments = (id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return null;
    const entry = attachmentCache.get(normalizedId);
    return isFresh(entry, ATTACHMENT_CACHE_TTL_MS) ? entry.data : null;
  };

  const setAttachments = (id, data) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return;
    const list = Array.isArray(data) ? data : [];
    attachmentCache.set(normalizedId, { data: list, at: Date.now() });
    if (attachmentCache.size > 200) {
      const firstKey = attachmentCache.keys().next().value;
      if (firstKey !== undefined) attachmentCache.delete(firstKey);
    }
  };

  const deleteAttachments = (id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return;
    attachmentCache.delete(normalizedId);
  };

  const getTaskBg = (id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return "";

    if (photoCache.has(normalizedId)) {
      return photoCache.get(normalizedId) || "";
    }

    const value = getStoredTaskBg(normalizedId) || "";
    photoCache.set(normalizedId, value);
    if (photoCache.size > 200) {
      const firstKey = photoCache.keys().next().value;
      if (firstKey !== undefined) photoCache.delete(firstKey);
    }

    return value;
  };

  const setTaskBg = (id, value) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return;
    photoCache.set(normalizedId, typeof value === "string" ? value : "");
  };

  const clearTaskBg = (id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return;
    photoCache.set(normalizedId, "");
  };

  return {
    getTask,
    setTask,
    deleteTask,
    getAttachments,
    setAttachments,
    deleteAttachments,
    getTaskBg,
    setTaskBg,
    clearTaskBg
  };
};
