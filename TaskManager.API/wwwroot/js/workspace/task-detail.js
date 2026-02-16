import {
  taskDetailModal,
  taskDetailTitleEl,
  taskDetailEditBtn,
  taskDetailStatusBadge,
  taskDetailPriorityBadge,
  taskDetailDueBadge,
  taskDetailStatusEl,
  taskDetailPriorityEl,
  taskDetailIdEl,
  taskDetailAssigneeEl,
  taskDetailDueEl,
  taskDetailCreatedEl,
  taskDetailUpdatedEl,
  taskDetailCompletedEl,
  taskDetailTagsEl,
  taskDetailDescriptionEl,
  taskDetailPhotoWrap,
  taskDetailPhotoImg,
  taskDetailPhotoBtn,
  taskDetailPhotoClearBtn,
  taskAttachBtn,
  taskAttachmentsList,
  taskAttachmentsEmpty,
  taskAttachmentsInput,
  taskBgInput
} from "./dom.js";

import { buildApiUrl, apiFetch, handleApiError } from "../shared/api.js?v=auth2";
import { STATUS_LABELS, PRIORITY_LABELS } from "../shared/constants.js";
import { normalizeToken } from "../shared/utils.js";
import { toStatusValue, toPriorityValue, formatIso, formatBytes, getUrgency, formatDueLabel } from "./helpers.js";
import { getStoredTaskMeta, getStoredTaskBg, setStoredTaskBg, clearStoredTaskBg } from "./storage.js";

const setDetailField = (el, value) => {
  if (!el) return;
  el.textContent = normalizeToken(value) || "-";
};

const setDetailMultilineField = (el, value) => {
  if (!el) return;
  const raw = value === null || value === undefined ? "" : String(value);
  el.textContent = raw.trim() || "-";
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("File read failed"));
  reader.readAsDataURL(file);
});

const optimizeImageForStorage = async (file) => {
  if (!file) return "";
  const type = normalizeToken(file.type).toLowerCase();
  if (!type.startsWith("image/") || typeof document === "undefined") {
    return readFileAsDataUrl(file);
  }

  const fallback = () => readFileAsDataUrl(file);
  if (typeof window.createImageBitmap !== "function") {
    return fallback();
  }

  try {
    const bitmap = await window.createImageBitmap(file);
    const width = Number(bitmap.width) || 0;
    const height = Number(bitmap.height) || 0;
    if (width <= 0 || height <= 0) {
      bitmap.close?.();
      return fallback();
    }

    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) {
      bitmap.close?.();
      return fallback();
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const outputType = scale < 1 ? "image/jpeg" : (type === "image/png" ? "image/png" : "image/jpeg");
    return outputType === "image/jpeg"
      ? canvas.toDataURL(outputType, 0.82)
      : canvas.toDataURL(outputType);
  } catch {
    return fallback();
  }
};

const fetchJsonAbortable = async (url, context, options) => {
  let response = null;
  try {
    response = await apiFetch(url, options);
  } catch (error) {
    if (error && typeof error === "object" && error.name === "AbortError") {
      return null;
    }
    console.error(`${context} failed: network error`, error);
    return null;
  }

  if (!response.ok) {
    await handleApiError(response, context);
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
};

const runWhenIdle = (callback) => {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 400 });
  }
  return window.setTimeout(callback, 80);
};

export const createTaskDetailController = (deps) => {
  const isAdmin = typeof deps?.isAdmin === "function" ? deps.isAdmin : () => false;
  const ensureTagsLoaded = typeof deps?.ensureTagsLoaded === "function" ? deps.ensureTagsLoaded : async () => {};
  const getTagNameById = typeof deps?.getTagNameById === "function" ? deps.getTagNameById : () => "";
  const openTaskModalForEdit = typeof deps?.openTaskModalForEdit === "function" ? deps.openTaskModalForEdit : () => {};
  const applyTaskBgToCards = typeof deps?.applyTaskBgToCards === "function" ? deps.applyTaskBgToCards : () => {};
  const applyAttachmentCountToCards = typeof deps?.applyAttachmentCountToCards === "function"
    ? deps.applyAttachmentCountToCards
    : () => {};
  const confirmDestructiveAction = typeof deps?.confirmDestructiveAction === "function"
    ? deps.confirmDestructiveAction
    : async (options) => {
      const title = normalizeToken(options?.title) || "Delete item?";
      return window.confirm(title);
    };

  let detailTaskId = null;
  let detailTaskCard = null;
  let pendingPhotoTaskId = null;
  let detailRequestSeq = 0;
  let detailAbortController = null;

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

  const getCachedTask = (id) => {
    const entry = taskCache.get(id);
    return isFresh(entry, TASK_CACHE_TTL_MS) ? entry.data : null;
  };

  const setCachedTask = (id, data) => {
    if (!Number.isFinite(Number(id)) || !data) return;
    taskCache.set(id, { data, at: Date.now() });
    if (taskCache.size > 200) {
      const firstKey = taskCache.keys().next().value;
      if (firstKey !== undefined) taskCache.delete(firstKey);
    }
  };

  const getCachedAttachments = (id) => {
    const entry = attachmentCache.get(id);
    return isFresh(entry, ATTACHMENT_CACHE_TTL_MS) ? entry.data : null;
  };

  const setCachedAttachments = (id, data) => {
    if (!Number.isFinite(Number(id))) return;
    const list = Array.isArray(data) ? data : [];
    attachmentCache.set(id, { data: list, at: Date.now() });
    if (attachmentCache.size > 200) {
      const firstKey = attachmentCache.keys().next().value;
      if (firstKey !== undefined) attachmentCache.delete(firstKey);
    }
  };

  const getCachedTaskBg = (id) => {
    if (!Number.isFinite(Number(id))) return "";
    if (photoCache.has(id)) {
      return photoCache.get(id) || "";
    }
    const value = getStoredTaskBg(id) || "";
    photoCache.set(id, value);
    if (photoCache.size > 200) {
      const firstKey = photoCache.keys().next().value;
      if (firstKey !== undefined) photoCache.delete(firstKey);
    }
    return value;
  };

  const renderDetailTags = (tagIds, fallbackNames) => {
    if (!taskDetailTagsEl) return;
    taskDetailTagsEl.innerHTML = "";

    const ids = Array.isArray(tagIds) ? tagIds : [];
    const names = ids
      .map((id) => getTagNameById(Number(id)) || "")
      .map((name) => normalizeToken(name))
      .filter(Boolean);
    const merged = names.length ? names : (Array.isArray(fallbackNames) ? fallbackNames : []);

    if (!merged.length) {
      const empty = document.createElement("span");
      empty.className = "task-chip";
      empty.textContent = "No tags";
      taskDetailTagsEl.appendChild(empty);
      return;
    }

    merged.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "task-chip";
      chip.textContent = name;
      taskDetailTagsEl.appendChild(chip);
    });
  };

  const beginDetailRequest = () => {
    if (detailAbortController) {
      detailAbortController.abort();
    }
    detailAbortController = new AbortController();
    return detailAbortController.signal;
  };

  const applyTaskToDetail = (task, id, requestSeq) => {
    if (!task || !Number.isFinite(Number(id))) {
      return { tagIds: [], metaTags: [] };
    }

    const statusValue = toStatusValue(task.status);
    const priorityValue = toPriorityValue(task.priority);
    const tagIds = Array.isArray(task.tagIds) ? task.tagIds : [];
    const meta = getStoredTaskMeta(id);
    const title = normalizeToken(task.title);
    const description = normalizeToken(task.description);
    const dueLabel = formatDueLabel(task.dueDate, statusValue);
    const urgency = getUrgency(task.dueDate, statusValue);

    if (taskDetailTitleEl) taskDetailTitleEl.textContent = title || `Task #${id}`;
    setDetailField(taskDetailIdEl, `#${id}`);

    if (taskDetailStatusBadge) {
      taskDetailStatusBadge.dataset.kind = "status";
      taskDetailStatusBadge.dataset.status = String(statusValue);
      taskDetailStatusBadge.textContent = STATUS_LABELS[statusValue] || "Status";
    }
    if (taskDetailPriorityBadge) {
      taskDetailPriorityBadge.dataset.kind = "priority";
      taskDetailPriorityBadge.dataset.priority = String(priorityValue);
      taskDetailPriorityBadge.textContent = `Priority: ${PRIORITY_LABELS[priorityValue] || "medium"}`;
    }
    if (taskDetailDueBadge) {
      taskDetailDueBadge.dataset.kind = "due";
      taskDetailDueBadge.dataset.urgency = urgency;
      taskDetailDueBadge.textContent = dueLabel;
    }

    setDetailField(taskDetailStatusEl, STATUS_LABELS[statusValue]);
    setDetailField(taskDetailPriorityEl, PRIORITY_LABELS[priorityValue] || "medium");
    setDetailField(taskDetailAssigneeEl, task.assigneeName ? `${task.assigneeName} (#${task.assigneeId})` : (task.assigneeId ? `#${task.assigneeId}` : "Not assigned"));
    setDetailField(taskDetailDueEl, `${dueLabel} (${formatIso(task.dueDate)})`);
    setDetailField(taskDetailCreatedEl, formatIso(task.createdAt));
    setDetailField(taskDetailUpdatedEl, formatIso(task.updatedAt));
    setDetailField(taskDetailCompletedEl, formatIso(task.completedAt));
    setDetailMultilineField(taskDetailDescriptionEl, description || "-");

    const metaTags = Array.isArray(meta?.tags) ? meta.tags : [];
    renderDetailTags(tagIds, metaTags);

    if (taskDetailPhotoWrap && taskDetailPhotoImg) {
      taskDetailPhotoImg.removeAttribute("src");
      taskDetailPhotoWrap.setAttribute("hidden", "");

      runWhenIdle(() => {
        if (requestSeq !== detailRequestSeq || detailTaskId !== id) {
          return;
        }
        const photo = getCachedTaskBg(id);
        if (!photo) {
          return;
        }
        taskDetailPhotoImg.decoding = "async";
        taskDetailPhotoImg.loading = "lazy";
        taskDetailPhotoImg.src = photo;
        taskDetailPhotoWrap.removeAttribute("hidden");
      });
    }

    return { tagIds, metaTags };
  };

  const renderAttachments = (attachments, taskId = detailTaskId) => {
    if (!taskAttachmentsList || !taskAttachmentsEmpty) return;
    taskAttachmentsList.innerHTML = "";

    const list = Array.isArray(attachments) ? attachments : [];
    taskAttachmentsEmpty.hidden = list.length > 0;
    if (list.length === 0) {
      taskAttachmentsEmpty.textContent = "No attachments";
      applyAttachmentCountToCards(taskId, 0);
      return;
    }

    const fragment = document.createDocumentFragment();

    list.forEach((att) => {
      const id = normalizeToken(att?.id);
      const name = normalizeToken(att?.fileName) || "file";
      const size = formatBytes(att?.size);
      const uploaded = att?.uploadedAtUtc ? formatIso(att.uploadedAtUtc) : "-";

      const row = document.createElement("div");
      row.className = "task-attachment";

      const ico = document.createElement("div");
      ico.className = "task-attachment-ico";
      ico.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8l-6-6z" />
        <path d="M14 2v6h6" />
      </svg>
    `;

      const main = document.createElement("div");
      main.className = "task-attachment-main";
      const title = document.createElement("div");
      title.className = "task-attachment-name";
      title.textContent = name;
      const sub = document.createElement("div");
      sub.className = "task-attachment-sub";
      sub.textContent = `${size} · ${uploaded}`;
      main.append(title, sub);

      const actions = document.createElement("div");
      actions.className = "task-attachment-actions";
      const link = document.createElement("button");
      link.type = "button";
      link.className = "task-attachment-link";
      link.textContent = "Download";
      link.addEventListener("click", () => {
        void (async () => {
          if (!taskId || !id) return;
          const response = await apiFetch(buildApiUrl(`/tasks/${taskId}/attachments/${id}`), {
            method: "GET"
          });
          if (!response.ok) {
            await handleApiError(response, "Download attachment");
            return;
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = blobUrl;
          anchor.download = name;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(blobUrl);
        })();
      });
      actions.appendChild(link);

      if (isAdmin()) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "task-attachment-del";
        del.textContent = "Delete";
        del.addEventListener("click", async () => {
          if (!taskId || !id) return;
          const confirmed = await confirmDestructiveAction({
            kicker: "Delete attachment",
            title: `Delete "${name}"?`,
            message: "This attachment will be removed from the task.",
            confirmText: "Delete attachment"
          });
          if (confirmed !== true) return;

          const response = await apiFetch(buildApiUrl(`/tasks/${taskId}/attachments/${id}`), { method: "DELETE" });
          if (!response.ok) {
            await handleApiError(response, "Delete attachment");
            return;
          }
          attachmentCache.delete(taskId);
          void loadAttachmentsForDetail(taskId, detailRequestSeq, detailAbortController?.signal, { forceRefresh: true });
        });
        actions.appendChild(del);
      }

      row.append(ico, main, actions);
      fragment.appendChild(row);
    });

    taskAttachmentsList.appendChild(fragment);
    applyAttachmentCountToCards(taskId, list.length);
  };

  const loadAttachmentsForDetail = async (
    taskId = detailTaskId,
    requestSeq = detailRequestSeq,
    signal = detailAbortController?.signal,
    options = null
  ) => {
    if (!taskId) return;

    const forceRefresh = Boolean(options?.forceRefresh);
    const cached = getCachedAttachments(taskId);
    if (cached && !forceRefresh) {
      renderAttachments(cached, taskId);
    }

    const attachments = await fetchJsonAbortable(buildApiUrl(`/tasks/${taskId}/attachments`), "Load attachments", {
      headers: { Accept: "application/json" },
      signal
    });

    if (signal?.aborted) {
      return;
    }

    if (requestSeq !== detailRequestSeq || taskId !== detailTaskId) {
      return;
    }

    if (!attachments) {
      if (cached && !forceRefresh) {
        return;
      }
      if (taskAttachmentsList) taskAttachmentsList.innerHTML = "";
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Failed to load attachments";
      }
      return;
    }

    const list = Array.isArray(attachments) ? attachments : [];
    setCachedAttachments(taskId, list);
    renderAttachments(list, taskId);
  };

  const uploadAttachmentsForDetail = async (files) => {
    if (!detailTaskId) return;
    const taskId = detailTaskId;
    const list = Array.isArray(files) ? files.filter(Boolean) : Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    const form = new FormData();
    list.forEach((file) => form.append("files", file));

    const response = await apiFetch(buildApiUrl(`/tasks/${taskId}/attachments`), {
      method: "POST",
      body: form
    });
    if (!response.ok) {
      await handleApiError(response, "Upload attachments");
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Upload failed. Open console for details.";
      }
      return;
    }
    attachmentCache.delete(taskId);
    await loadAttachmentsForDetail(taskId, detailRequestSeq, detailAbortController?.signal, { forceRefresh: true });
  };

  const closeTaskDetailModal = () => {
    if (!taskDetailModal) return;
    detailRequestSeq += 1;
    if (detailAbortController) {
      detailAbortController.abort();
      detailAbortController = null;
    }
    taskDetailModal.setAttribute("hidden", "");
    detailTaskId = null;
    detailTaskCard = null;
    pendingPhotoTaskId = null;
    if (taskAttachmentsList) taskAttachmentsList.innerHTML = "";
    if (taskAttachmentsEmpty) taskAttachmentsEmpty.hidden = true;
  };

  const openTaskDetailModalForTask = async (taskId, card) => {
    if (!taskDetailModal) return;
    const id = Number(taskId);
    if (!Number.isFinite(id)) return;

    const requestSeq = detailRequestSeq + 1;
    detailRequestSeq = requestSeq;
    const signal = beginDetailRequest();

    detailTaskId = id;
    detailTaskCard = card || null;

    taskDetailModal.removeAttribute("hidden");

    const fallbackTitle = normalizeToken(card?.querySelector?.("h3")?.textContent) || `Task #${id}`;
    if (taskDetailTitleEl) taskDetailTitleEl.textContent = fallbackTitle;
    setDetailField(taskDetailIdEl, `#${id}`);
    setDetailField(taskDetailStatusEl, "Loading...");
    setDetailField(taskDetailPriorityEl, "Loading...");
    setDetailField(taskDetailAssigneeEl, "Loading...");
    setDetailField(taskDetailDueEl, "Loading...");
    setDetailField(taskDetailCreatedEl, "Loading...");
    setDetailField(taskDetailUpdatedEl, "Loading...");
    setDetailField(taskDetailCompletedEl, "Loading...");
    setDetailMultilineField(taskDetailDescriptionEl, "Loading...");

    if (taskAttachmentsList) {
      taskAttachmentsList.innerHTML = "";
    }
    if (taskAttachmentsEmpty) {
      taskAttachmentsEmpty.hidden = false;
      taskAttachmentsEmpty.textContent = "Loading attachments...";
    }

    if (taskDetailPhotoWrap && taskDetailPhotoImg) {
      taskDetailPhotoImg.removeAttribute("src");
      taskDetailPhotoWrap.setAttribute("hidden", "");
    }

    if (taskDetailEditBtn) {
      taskDetailEditBtn.toggleAttribute("hidden", !isAdmin());
    }

    if (taskDetailPhotoBtn) {
      taskDetailPhotoBtn.toggleAttribute("hidden", !isAdmin());
    }

    if (taskDetailPhotoClearBtn) {
      taskDetailPhotoClearBtn.toggleAttribute("hidden", !isAdmin());
    }

    if (taskAttachBtn) {
      taskAttachBtn.toggleAttribute("hidden", !isAdmin());
    }

    const cachedTask = getCachedTask(id);
    let lastTagIds = [];
    let lastMetaTags = [];
    if (cachedTask) {
      const applied = applyTaskToDetail(cachedTask, id, requestSeq);
      lastTagIds = applied.tagIds;
      lastMetaTags = applied.metaTags;
    }

    const cachedAttachments = getCachedAttachments(id);
    if (cachedAttachments) {
      renderAttachments(cachedAttachments, id);
    }
    void loadAttachmentsForDetail(id, requestSeq, signal, { forceRefresh: false });

    const taskPromise = fetchJsonAbortable(buildApiUrl(`/tasks/${id}`), "Load task", {
      headers: { Accept: "application/json" },
      signal
    });

    const tagsPromise = ensureTagsLoaded();

    const task = await taskPromise;

    if (signal.aborted) {
      return;
    }

    if (requestSeq !== detailRequestSeq || detailTaskId !== id) {
      return;
    }

    if (!task) {
      if (cachedTask) {
        void loadAttachmentsForDetail(id, requestSeq, signal);
        return;
      }
      setDetailField(taskDetailStatusEl, "Failed to load");
      setDetailField(taskDetailPriorityEl, "-");
      setDetailField(taskDetailAssigneeEl, "-");
      setDetailField(taskDetailDueEl, "-");
      setDetailField(taskDetailCreatedEl, "-");
      setDetailField(taskDetailUpdatedEl, "-");
      setDetailField(taskDetailCompletedEl, "-");
      setDetailMultilineField(taskDetailDescriptionEl, "Failed to load task details");
      if (taskAttachmentsList) taskAttachmentsList.innerHTML = "";
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Failed to load attachments";
      }
      return;
    }

    setCachedTask(id, task);
    const applied = applyTaskToDetail(task, id, requestSeq);
    lastTagIds = applied.tagIds;
    lastMetaTags = applied.metaTags;

    void tagsPromise.then(() => {
      if (requestSeq !== detailRequestSeq || detailTaskId !== id) {
        return;
      }
      renderDetailTags(lastTagIds, lastMetaTags);
    }).catch(() => {
      // ignore
    });

  };

  const onDetailModalClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-close-detail]")) {
      closeTaskDetailModal();
    }
  };

  const onDetailEditClick = () => {
    if (!isAdmin() || !detailTaskId) return;
    const card = detailTaskCard || document.querySelector(`.task-card[data-task-id="${detailTaskId}"]`);
    if (!card) return;
    taskCache.delete(detailTaskId);
    closeTaskDetailModal();
    openTaskModalForEdit(card);
  };

  const onDetailPhotoClick = () => {
    if (!isAdmin() || !detailTaskId) return;
    pendingPhotoTaskId = detailTaskId;
    taskBgInput?.click();
  };

  const onDetailPhotoClearClick = () => {
    if (!isAdmin() || !detailTaskId) return;
    clearStoredTaskBg(detailTaskId);
    photoCache.set(detailTaskId, "");
    applyTaskBgToCards(detailTaskId, "");
    if (taskDetailPhotoWrap && taskDetailPhotoImg) {
      taskDetailPhotoImg.removeAttribute("src");
      taskDetailPhotoWrap.setAttribute("hidden", "");
    }
  };

  const onAttachClick = () => {
    if (!isAdmin() || !detailTaskId) return;
    taskAttachmentsInput?.click();
  };

  const onAttachmentsInputChange = async () => {
    if (!taskAttachmentsInput) return;
    const files = taskAttachmentsInput.files ? Array.from(taskAttachmentsInput.files) : [];
    taskAttachmentsInput.value = "";
    if (!files.length) return;
    await uploadAttachmentsForDetail(files);
  };

  const onTaskBgInputChange = async () => {
    const id = pendingPhotoTaskId;
    pendingPhotoTaskId = null;
    if (!taskBgInput) return;
    const file = taskBgInput.files && taskBgInput.files[0] ? taskBgInput.files[0] : null;
    taskBgInput.value = "";
    if (!file || !Number.isFinite(Number(id))) return;
    try {
      const dataUrl = await optimizeImageForStorage(file);
      if (!dataUrl) return;
      setStoredTaskBg(id, dataUrl);
      photoCache.set(id, dataUrl);
      applyTaskBgToCards(id, dataUrl);
      if (detailTaskId === id && taskDetailPhotoWrap && taskDetailPhotoImg) {
        taskDetailPhotoImg.src = dataUrl;
        taskDetailPhotoWrap.removeAttribute("hidden");
      }
    } catch (error) {
      console.error("Photo load failed", error);
    }
  };

  return {
    closeTaskDetailModal,
    openTaskDetailModalForTask,
    onDetailModalClick,
    onDetailEditClick,
    onDetailPhotoClick,
    onDetailPhotoClearClick,
    onAttachClick,
    onAttachmentsInputChange,
    onTaskBgInputChange
  };
};
