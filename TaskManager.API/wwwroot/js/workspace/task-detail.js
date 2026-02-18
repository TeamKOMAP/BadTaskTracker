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
} from "./dom.js?v=authflow2";

import { normalizeToken } from "../shared/utils.js";
import { getStoredTaskMeta, getStoredTaskBg, setStoredTaskBg, clearStoredTaskBg } from "./storage.js?v=authflow2";
import { optimizeImageForStorage } from "./media-utils.js";
import { createTaskDetailCache } from "./task-detail-cache.js";
import {
  fetchTaskById,
  fetchTaskAttachments,
  uploadTaskAttachments,
  deleteTaskAttachment,
  downloadTaskAttachmentBlob
} from "./task-detail-api.js";
import {
  setDetailField,
  setDetailMultilineField,
  renderTaskInDetail,
  renderDetailTags,
  renderAttachmentsList
} from "./task-detail-render.js";

const detailElements = {
  titleEl: taskDetailTitleEl,
  idEl: taskDetailIdEl,
  statusBadgeEl: taskDetailStatusBadge,
  priorityBadgeEl: taskDetailPriorityBadge,
  dueBadgeEl: taskDetailDueBadge,
  statusEl: taskDetailStatusEl,
  priorityEl: taskDetailPriorityEl,
  assigneeEl: taskDetailAssigneeEl,
  dueEl: taskDetailDueEl,
  createdEl: taskDetailCreatedEl,
  updatedEl: taskDetailUpdatedEl,
  completedEl: taskDetailCompletedEl,
  tagsEl: taskDetailTagsEl,
  descriptionEl: taskDetailDescriptionEl,
  photoWrapEl: taskDetailPhotoWrap,
  photoImgEl: taskDetailPhotoImg
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
      const title = normalizeToken(options?.title) || "Удалить элемент?";
      return window.confirm(title);
    };

  let detailTaskId = null;
  let detailTaskCard = null;
  let pendingPhotoTaskId = null;
  let detailRequestSeq = 0;
  let detailAbortController = null;

  const cache = createTaskDetailCache({ getStoredTaskBg });

  const beginDetailRequest = () => {
    if (detailAbortController) {
      detailAbortController.abort();
    }
    detailAbortController = new AbortController();
    return detailAbortController.signal;
  };

  const renderAttachments = (attachments, taskId = detailTaskId) => {
    renderAttachmentsList({
      attachments,
      taskId,
      listElement: taskAttachmentsList,
      emptyElement: taskAttachmentsEmpty,
      isAdmin,
      applyAttachmentCountToCards,
      onDownload: async (info) => {
        if (!info?.taskId || !info?.id) return;

        const blob = await downloadTaskAttachmentBlob(info.taskId, info.id);
        if (!blob) return;

        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = info.name || "файл";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      },
      onDelete: async (info) => {
        if (!info?.taskId || !info?.id) return;

        const confirmed = await confirmDestructiveAction({
          kicker: "Удаление вложения",
          title: `Удалить "${info.name || "файл"}"?`,
          message: "Это вложение будет удалено из задачи.",
          confirmText: "Удалить вложение"
        });
        if (confirmed !== true) return;

        const deleted = await deleteTaskAttachment(info.taskId, info.id);
        if (!deleted) return;

        cache.deleteAttachments(info.taskId);
        void loadAttachmentsForDetail(
          info.taskId,
          detailRequestSeq,
          detailAbortController?.signal,
          { forceRefresh: true }
        );
      }
    });
  };

  const loadAttachmentsForDetail = async (
    taskId = detailTaskId,
    requestSeq = detailRequestSeq,
    signal = detailAbortController?.signal,
    options = null
  ) => {
    if (!taskId) return;

    const forceRefresh = Boolean(options?.forceRefresh);
    const cached = cache.getAttachments(taskId);
    if (cached && !forceRefresh) {
      renderAttachments(cached, taskId);
    }

    const attachments = await fetchTaskAttachments(taskId, signal);
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
      if (taskAttachmentsList) {
        taskAttachmentsList.innerHTML = "";
      }
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Не удалось загрузить вложения";
      }
      return;
    }

    const list = Array.isArray(attachments) ? attachments : [];
    cache.setAttachments(taskId, list);
    renderAttachments(list, taskId);
  };

  const uploadAttachmentsForDetail = async (files) => {
    if (!detailTaskId) return;
    const taskId = detailTaskId;

    const uploaded = await uploadTaskAttachments(taskId, files);
    if (!uploaded) {
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Не удалось загрузить. Откройте консоль для деталей.";
      }
      return;
    }

    cache.deleteAttachments(taskId);
    await loadAttachmentsForDetail(
      taskId,
      detailRequestSeq,
      detailAbortController?.signal,
      { forceRefresh: true }
    );
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

    if (taskAttachmentsInput) {
      taskAttachmentsInput.value = "";
    }
    if (taskBgInput) {
      taskBgInput.value = "";
    }
    if (taskAttachmentsList) {
      taskAttachmentsList.innerHTML = "";
    }
    if (taskAttachmentsEmpty) {
      taskAttachmentsEmpty.hidden = true;
    }
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
    pendingPhotoTaskId = null;

    if (taskAttachmentsInput) {
      taskAttachmentsInput.value = "";
    }
    if (taskBgInput) {
      taskBgInput.value = "";
    }

    taskDetailModal.removeAttribute("hidden");

    const fallbackTitle = normalizeToken(card?.querySelector?.("h3")?.textContent) || `Задача #${id}`;
    if (taskDetailTitleEl) {
      taskDetailTitleEl.textContent = fallbackTitle;
    }

    setDetailField(taskDetailIdEl, `#${id}`);
    setDetailField(taskDetailStatusEl, "Загрузка...");
    setDetailField(taskDetailPriorityEl, "Загрузка...");
    setDetailField(taskDetailAssigneeEl, "Загрузка...");
    setDetailField(taskDetailDueEl, "Загрузка...");
    setDetailField(taskDetailCreatedEl, "Загрузка...");
    setDetailField(taskDetailUpdatedEl, "Загрузка...");
    setDetailField(taskDetailCompletedEl, "Загрузка...");
    setDetailMultilineField(taskDetailDescriptionEl, "Загрузка...");

    if (taskAttachmentsList) {
      taskAttachmentsList.innerHTML = "";
    }
    if (taskAttachmentsEmpty) {
      taskAttachmentsEmpty.hidden = false;
      taskAttachmentsEmpty.textContent = "Загрузка вложений...";
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

    const resolveTagName = (tagId) => getTagNameById(Number(tagId)) || "";

    const cachedTask = cache.getTask(id);
    let lastTagIds = [];
    let lastMetaTags = [];

    if (cachedTask) {
      const applied = renderTaskInDetail({
        task: cachedTask,
        taskId: id,
        requestSeq,
        elements: detailElements,
        resolveTagName,
        getStoredTaskMeta,
        getCachedTaskBg: cache.getTaskBg,
        getCurrentRequestSeq: () => detailRequestSeq,
        getCurrentTaskId: () => detailTaskId
      });
      lastTagIds = applied.tagIds;
      lastMetaTags = applied.metaTags;
    }

    const cachedAttachments = cache.getAttachments(id);
    if (cachedAttachments) {
      renderAttachments(cachedAttachments, id);
    }
    void loadAttachmentsForDetail(id, requestSeq, signal, { forceRefresh: false });

    const taskPromise = fetchTaskById(id, signal);
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
      setDetailField(taskDetailStatusEl, "Не удалось загрузить");
      setDetailField(taskDetailPriorityEl, "-");
      setDetailField(taskDetailAssigneeEl, "-");
      setDetailField(taskDetailDueEl, "-");
      setDetailField(taskDetailCreatedEl, "-");
      setDetailField(taskDetailUpdatedEl, "-");
      setDetailField(taskDetailCompletedEl, "-");
      setDetailMultilineField(taskDetailDescriptionEl, "Не удалось загрузить детали задачи");
      if (taskAttachmentsList) {
        taskAttachmentsList.innerHTML = "";
      }
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Не удалось загрузить вложения";
      }
      return;
    }

    cache.setTask(id, task);

    const applied = renderTaskInDetail({
      task,
      taskId: id,
      requestSeq,
      elements: detailElements,
      resolveTagName,
      getStoredTaskMeta,
      getCachedTaskBg: cache.getTaskBg,
      getCurrentRequestSeq: () => detailRequestSeq,
      getCurrentTaskId: () => detailTaskId
    });
    lastTagIds = applied.tagIds;
    lastMetaTags = applied.metaTags;

    void tagsPromise.then(() => {
      if (requestSeq !== detailRequestSeq || detailTaskId !== id) {
        return;
      }
      renderDetailTags({
        container: taskDetailTagsEl,
        tagIds: lastTagIds,
        fallbackNames: lastMetaTags,
        resolveTagName
      });
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
    cache.deleteTask(detailTaskId);
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
    cache.clearTaskBg(detailTaskId);
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
      cache.setTaskBg(id, dataUrl);
      applyTaskBgToCards(id, dataUrl);

      if (detailTaskId === id && taskDetailPhotoWrap && taskDetailPhotoImg) {
        taskDetailPhotoImg.src = dataUrl;
        taskDetailPhotoWrap.removeAttribute("hidden");
      }
    } catch (error) {
      console.error("Не удалось загрузить фото", error);
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
