import {
  taskDetailModal,
  taskDetailTitleEl,
  taskDetailEditBtn,
  taskDetailThemeBadge,
  taskDetailStatusBadge,
  taskDetailPriorityBadge,
  taskDetailDueBadge,
  taskDetailThemeEl,
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

import { buildApiUrl, apiFetch, fetchJsonOrNull, handleApiError, withAccessQuery } from "../shared/api.js";
import { STATUS_LABELS, PRIORITY_LABELS } from "../shared/constants.js";
import { normalizeToken } from "../shared/utils.js";
import { toStatusValue, toPriorityValue, formatIso, formatBytes, getUrgency, formatDueLabel } from "./helpers.js";
import { getStoredTaskMeta, getStoredTaskBg, setStoredTaskBg, clearStoredTaskBg } from "./storage.js";

const setDetailField = (el, value) => {
  if (!el) return;
  el.textContent = normalizeToken(value) || "-";
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("File read failed"));
  reader.readAsDataURL(file);
});

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

  const renderAttachments = (attachments) => {
    if (!taskAttachmentsList || !taskAttachmentsEmpty) return;
    taskAttachmentsList.innerHTML = "";

    const list = Array.isArray(attachments) ? attachments : [];
    taskAttachmentsEmpty.hidden = list.length > 0;
    if (list.length === 0) {
      taskAttachmentsEmpty.textContent = "No attachments";
    }

    list.forEach((att) => {
      const id = normalizeToken(att?.id);
      const name = normalizeToken(att?.fileName) || "file";
      const urlRaw = normalizeToken(att?.downloadUrl) || buildApiUrl(`/tasks/${detailTaskId}/attachments/${id}`);
      const url = withAccessQuery(urlRaw);
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
      const link = document.createElement("a");
      link.className = "task-attachment-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Download";
      actions.appendChild(link);

      if (isAdmin()) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "task-attachment-del";
        del.textContent = "Delete";
        del.addEventListener("click", async () => {
          if (!detailTaskId || !id) return;
          const confirmed = await confirmDestructiveAction({
            kicker: "Delete attachment",
            title: `Delete "${name}"?`,
            message: "This attachment will be removed from the task.",
            confirmText: "Delete attachment"
          });
          if (confirmed !== true) return;

          const response = await apiFetch(buildApiUrl(`/tasks/${detailTaskId}/attachments/${id}`), { method: "DELETE" });
          if (!response.ok) {
            await handleApiError(response, "Delete attachment");
            return;
          }
          void loadAttachmentsForDetail();
        });
        actions.appendChild(del);
      }

      row.append(ico, main, actions);
      taskAttachmentsList.appendChild(row);
    });
  };

  const loadAttachmentsForDetail = async () => {
    if (!detailTaskId) return;
    const attachments = await fetchJsonOrNull(buildApiUrl(`/tasks/${detailTaskId}/attachments`), "Load attachments", {
      headers: { Accept: "application/json" }
    });
    if (!attachments) {
      if (taskAttachmentsList) taskAttachmentsList.innerHTML = "";
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Failed to load attachments";
      }
      return;
    }
    const list = Array.isArray(attachments) ? attachments : [];
    renderAttachments(list);
    applyAttachmentCountToCards(detailTaskId, list.length);
  };

  const uploadAttachmentsForDetail = async (files) => {
    if (!detailTaskId) return;
    const list = Array.isArray(files) ? files.filter(Boolean) : Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    const form = new FormData();
    list.forEach((file) => form.append("files", file));

    const response = await apiFetch(buildApiUrl(`/tasks/${detailTaskId}/attachments`), {
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
    await loadAttachmentsForDetail();
  };

  const closeTaskDetailModal = () => {
    if (!taskDetailModal) return;
    taskDetailModal.setAttribute("hidden", "");
    detailTaskId = null;
    detailTaskCard = null;
    if (taskAttachmentsList) taskAttachmentsList.innerHTML = "";
    if (taskAttachmentsEmpty) taskAttachmentsEmpty.hidden = true;
  };

  const openTaskDetailModalForTask = async (taskId, card) => {
    if (!taskDetailModal) return;
    const id = Number(taskId);
    if (!Number.isFinite(id)) return;

    detailTaskId = id;
    detailTaskCard = card || null;

    await ensureTagsLoaded();
    const task = await fetchJsonOrNull(buildApiUrl(`/tasks/${id}`), "Load task", {
      headers: { Accept: "application/json" }
    });
    if (!task) return;

    const statusValue = toStatusValue(task.status);
    const priorityValue = toPriorityValue(task.priority);
    const tagIds = Array.isArray(task.tagIds) ? task.tagIds : [];
    const meta = getStoredTaskMeta(id);
    const theme = normalizeToken(meta?.theme) || (tagIds[0] ? (getTagNameById(Number(tagIds[0])) || "") : "");
    const title = normalizeToken(task.title);
    const description = normalizeToken(task.description);
    const dueLabel = formatDueLabel(task.dueDate, statusValue);
    const urgency = getUrgency(task.dueDate, statusValue);

    if (taskDetailTitleEl) taskDetailTitleEl.textContent = title || `Task #${id}`;
    setDetailField(taskDetailIdEl, `#${id}`);

    if (taskDetailThemeBadge) {
      taskDetailThemeBadge.dataset.kind = "theme";
      taskDetailThemeBadge.textContent = theme || "Theme";
    }
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

    setDetailField(taskDetailThemeEl, theme || STATUS_LABELS[statusValue]);
    setDetailField(taskDetailStatusEl, STATUS_LABELS[statusValue]);
    setDetailField(taskDetailPriorityEl, PRIORITY_LABELS[priorityValue] || "medium");
    setDetailField(taskDetailAssigneeEl, task.assigneeName ? `${task.assigneeName} (#${task.assigneeId})` : (task.assigneeId ? `#${task.assigneeId}` : "Not assigned"));
    setDetailField(taskDetailDueEl, `${dueLabel} (${formatIso(task.dueDate)})`);
    setDetailField(taskDetailCreatedEl, formatIso(task.createdAt));
    setDetailField(taskDetailUpdatedEl, formatIso(task.updatedAt));
    setDetailField(taskDetailCompletedEl, formatIso(task.completedAt));
    setDetailField(taskDetailDescriptionEl, description || "-");

    const metaTags = Array.isArray(meta?.tags) ? meta.tags : [];
    renderDetailTags(tagIds, metaTags);

    const photo = getStoredTaskBg(id);
    if (taskDetailPhotoWrap && taskDetailPhotoImg) {
      if (photo) {
        taskDetailPhotoImg.src = photo;
        taskDetailPhotoWrap.removeAttribute("hidden");
      } else {
        taskDetailPhotoImg.removeAttribute("src");
        taskDetailPhotoWrap.setAttribute("hidden", "");
      }
    }

    if (taskAttachBtn) {
      taskAttachBtn.toggleAttribute("hidden", !isAdmin());
    }

    await loadAttachmentsForDetail();

    if (taskDetailEditBtn) {
      taskDetailEditBtn.toggleAttribute("hidden", !isAdmin());
    }

    if (taskDetailPhotoBtn) {
      taskDetailPhotoBtn.toggleAttribute("hidden", !isAdmin());
    }

    if (taskDetailPhotoClearBtn) {
      taskDetailPhotoClearBtn.toggleAttribute("hidden", !isAdmin());
    }

    taskDetailModal.removeAttribute("hidden");
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
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl) return;
      setStoredTaskBg(id, dataUrl);
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
