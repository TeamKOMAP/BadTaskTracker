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
  taskDetailHistoryPanel,
  taskDetailHistoryToggleBtn,
  taskDetailHistoryList,
  taskDetailHistoryEmpty,
  taskDetailHistoryClearBtn,
  taskDetailApprovalWrap,
  taskDetailApprovalTextEl,
  taskDetailApprovalActions,
  taskDetailApproveBtn,
  taskDetailRejectBtn,
  taskAttachBtn,
  taskAttachmentsList,
  taskAttachmentsEmpty,
  taskAttachmentsInput,
  taskBgInput
} from "./dom.js?v=authflow9";

import { normalizeToken } from "../shared/utils.js";
import {
  getStoredTaskMeta,
  getStoredTaskBg,
  setStoredTaskBg,
  clearStoredTaskBg,
  getStoredTaskHistory,
  appendStoredTaskHistory,
  clearStoredTaskHistory
} from "./storage.js?v=authflow4";
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
} from "./task-detail-render.js?v=perf3";

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
  photoImgEl: taskDetailPhotoImg,
  approvalWrapEl: taskDetailApprovalWrap,
  approvalTextEl: taskDetailApprovalTextEl,
  approvalActionsEl: taskDetailApprovalActions,
  approveBtnEl: taskDetailApproveBtn,
  rejectBtnEl: taskDetailRejectBtn
};

const formatHistoryAt = (timestampMs) => {
  const date = new Date(Number(timestampMs) || 0);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export const createTaskDetailController = (deps) => {
  const canEditTask = typeof deps?.canEditTask === "function"
    ? deps.canEditTask
    : typeof deps?.isAdmin === "function"
      ? deps.isAdmin
      : () => false;
  const canClearHistory = typeof deps?.canClearHistory === "function"
    ? deps.canClearHistory
    : canEditTask;
  const canManageDoneApproval = typeof deps?.canManageDoneApproval === "function"
    ? deps.canManageDoneApproval
    : canEditTask;
  const approveDone = typeof deps?.approveDone === "function" ? deps.approveDone : async () => null;
  const rejectDone = typeof deps?.rejectDone === "function" ? deps.rejectDone : async () => null;
  const ensureTagsLoaded = typeof deps?.ensureTagsLoaded === "function" ? deps.ensureTagsLoaded : async () => {};
  const getTagNameById = typeof deps?.getTagNameById === "function" ? deps.getTagNameById : () => "";
  const getAssigneeNameById = typeof deps?.getAssigneeNameById === "function" ? deps.getAssigneeNameById : () => "";
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

  const refreshHistoryClearButton = (options) => {
    if (!taskDetailHistoryClearBtn) return;
    const allowed = !!canClearHistory();
    const hasEntries = Boolean(options?.hasEntries);
    taskDetailHistoryClearBtn.toggleAttribute("hidden", !allowed);
    taskDetailHistoryClearBtn.disabled = !allowed || !hasEntries;
  };

  const renderHistoryForTask = (taskId = detailTaskId) => {
    if (!taskDetailHistoryList || !taskDetailHistoryEmpty) return;
    const id = Number(taskId);
    if (!Number.isFinite(id) || id <= 0) {
      taskDetailHistoryList.innerHTML = "";
      taskDetailHistoryEmpty.hidden = false;
      taskDetailHistoryEmpty.textContent = "Нет изменений.";
      refreshHistoryClearButton({ hasEntries: false });
      return;
    }

    const entries = getStoredTaskHistory(id);
    taskDetailHistoryList.innerHTML = "";

    if (!entries.length) {
      taskDetailHistoryEmpty.hidden = false;
      taskDetailHistoryEmpty.textContent = "Нет изменений.";
      refreshHistoryClearButton({ hasEntries: false });
      return;
    }

    taskDetailHistoryEmpty.hidden = true;
    refreshHistoryClearButton({ hasEntries: true });

    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const item = document.createElement("article");
      item.className = "task-history-item";

      const meta = document.createElement("div");
      meta.className = "task-history-meta";
      const time = document.createElement("span");
      time.className = "task-history-time";
      time.textContent = formatHistoryAt(entry.at);
      meta.appendChild(time);

      const source = normalizeToken(entry.source);
      if (source) {
        const src = document.createElement("span");
        src.className = "task-history-source";
        src.textContent = source;
        meta.appendChild(src);
      }

      const title = document.createElement("div");
      title.className = "task-history-title";
      title.textContent = entry.title || "Изменение";

      item.append(meta, title);

      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      if (lines.length) {
        const list = document.createElement("div");
        list.className = "task-history-lines";
        lines.forEach((line) => {
          const row = document.createElement("div");
          row.className = "task-history-line";
          row.textContent = line;
          list.appendChild(row);
        });
        item.appendChild(list);
      }

      fragment.appendChild(item);
    });

    taskDetailHistoryList.appendChild(fragment);
  };

  const notifyTaskHistoryChanged = (taskId) => {
    const id = Number(taskId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (detailTaskId !== id) return;
    if (!isHistoryPanelOpen()) return;
    renderHistoryForTask(id);
  };

  const onHistoryClearClick = async () => {
    if (!detailTaskId) return;
    if (!canClearHistory()) return;
    const confirmed = await confirmDestructiveAction({
      kicker: "История изменений",
      title: "Очистить историю изменений этой задачи?",
      message: "История изменений хранится локально в браузере. Это действие нельзя отменить.",
      confirmText: "Очистить"
    });
    if (confirmed !== true) return;
    clearStoredTaskHistory(detailTaskId);
    renderHistoryForTask(detailTaskId);
  };

  const isHistoryPanelOpen = () => Boolean(taskDetailHistoryPanel && !taskDetailHistoryPanel.hasAttribute("hidden"));

  const positionHistoryPanel = () => {
    if (!taskDetailHistoryPanel || !taskDetailModal) return;
    const card = taskDetailModal.querySelector(".task-modal-card.task-detail-card");
    if (!(card instanceof Element)) return;
    if (!isHistoryPanelOpen()) return;

    const rect = card.getBoundingClientRect();
    const gap = 14;
    const margin = 16;
    const maxHeight = Math.max(240, Math.min(window.innerHeight - margin * 2, rect.height));

    taskDetailHistoryPanel.classList.remove("is-stack");
    taskDetailHistoryPanel.style.width = "";

    const defaultWidth = Math.min(380, Math.max(260, window.innerWidth - rect.right - gap - margin));
    const fitsRight = rect.right + gap + defaultWidth <= window.innerWidth - margin;

    if (fitsRight) {
      taskDetailHistoryPanel.style.left = `${Math.round(rect.right + gap)}px`;
      taskDetailHistoryPanel.style.top = `${Math.round(Math.max(margin, rect.top))}px`;
      taskDetailHistoryPanel.style.height = `${Math.round(Math.min(maxHeight, window.innerHeight - Math.max(margin, rect.top) - margin))}px`;
      taskDetailHistoryPanel.style.width = `${Math.round(defaultWidth)}px`;
      return;
    }

    // Fallback: stack below the card (mobile / narrow viewports).
    taskDetailHistoryPanel.classList.add("is-stack");
    const stackTop = rect.bottom + gap;
    const height = Math.max(200, Math.min(420, window.innerHeight - stackTop - margin));
    taskDetailHistoryPanel.style.left = `${Math.round(Math.max(margin, rect.left))}px`;
    taskDetailHistoryPanel.style.top = `${Math.round(stackTop)}px`;
    taskDetailHistoryPanel.style.height = `${Math.round(height)}px`;
    taskDetailHistoryPanel.style.width = `${Math.round(Math.min(rect.width, window.innerWidth - margin * 2))}px`;
  };

  const setHistoryPanelOpen = (open) => {
    if (!taskDetailHistoryPanel) return;
    const show = Boolean(open);
    taskDetailHistoryPanel.toggleAttribute("hidden", !show);
    if (taskDetailHistoryToggleBtn) {
      taskDetailHistoryToggleBtn.setAttribute("aria-expanded", show ? "true" : "false");
      taskDetailHistoryToggleBtn.setAttribute("aria-pressed", show ? "true" : "false");
    }
    if (!show) {
      taskDetailHistoryPanel.classList.remove("is-stack");
      taskDetailHistoryPanel.style.left = "";
      taskDetailHistoryPanel.style.top = "";
      taskDetailHistoryPanel.style.height = "";
      taskDetailHistoryPanel.style.width = "";
      window.removeEventListener("resize", positionHistoryPanel);
      return;
    }

    renderHistoryForTask(detailTaskId);
    positionHistoryPanel();
    window.addEventListener("resize", positionHistoryPanel);
  };

  const onHistoryToggleClick = () => {
    if (!detailTaskId) return;
    setHistoryPanelOpen(!isHistoryPanelOpen());
  };

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
      isAdmin: canEditTask,
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

        appendStoredTaskHistory(info.taskId, {
          at: Date.now(),
          title: "Удалено вложение",
          source: "Детали задачи",
          lines: normalizeToken(info.name) ? [normalizeToken(info.name)] : []
        });
        notifyTaskHistoryChanged(info.taskId);

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
    if (!detailTaskId) return false;
    const taskId = detailTaskId;

    const uploaded = await uploadTaskAttachments(taskId, files);
    if (!uploaded) {
      if (taskAttachmentsEmpty) {
        taskAttachmentsEmpty.hidden = false;
        taskAttachmentsEmpty.textContent = "Не удалось загрузить. Откройте консоль для деталей.";
      }
      return false;
    }

    cache.deleteAttachments(taskId);
    await loadAttachmentsForDetail(
      taskId,
      detailRequestSeq,
      detailAbortController?.signal,
      { forceRefresh: true }
    );
    return true;
  };

  const closeTaskDetailModal = () => {
    if (!taskDetailModal) return;

    detailRequestSeq += 1;
    if (detailAbortController) {
      detailAbortController.abort();
      detailAbortController = null;
    }

    taskDetailModal.setAttribute("hidden", "");
    setHistoryPanelOpen(false);
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

    if (taskDetailHistoryList) taskDetailHistoryList.innerHTML = "";
    if (taskDetailHistoryEmpty) taskDetailHistoryEmpty.hidden = true;
    refreshHistoryClearButton({ hasEntries: false });
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
    setHistoryPanelOpen(false);

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
      taskDetailEditBtn.toggleAttribute("hidden", !canEditTask());
    }
    if (taskDetailPhotoBtn) {
      taskDetailPhotoBtn.toggleAttribute("hidden", !canEditTask());
    }
    if (taskDetailPhotoClearBtn) {
      taskDetailPhotoClearBtn.toggleAttribute("hidden", !canEditTask());
    }
    if (taskAttachBtn) {
      taskAttachBtn.toggleAttribute("hidden", !canEditTask());
    }

    const resolveTagName = (tagId) => getTagNameById(Number(tagId)) || "";
    const resolveAssigneeName = (assigneeId) => getAssigneeNameById(Number(assigneeId)) || "";

    const cachedTask = cache.getTask(id);
    let lastTagIds = [];
    let lastMetaTags = [];

    if (cachedTask) {
      const applied = renderTaskInDetail({
        task: cachedTask,
        taskId: id,
        requestSeq,
        elements: detailElements,
        canManageDoneApproval,
        resolveTagName,
        resolveAssigneeName,
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
      canManageDoneApproval,
      resolveTagName,
      resolveAssigneeName,
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
      setHistoryPanelOpen(false);
      closeTaskDetailModal();
    }
  };

  const onDetailEditClick = () => {
    if (!canEditTask() || !detailTaskId) return;
    const card = detailTaskCard || document.querySelector(`.task-card[data-task-id="${detailTaskId}"]`);
    if (!card) return;
    cache.deleteTask(detailTaskId);
    closeTaskDetailModal();
    openTaskModalForEdit(card);
  };

  const setApprovalButtonsBusy = (busy) => {
    const isBusy = Boolean(busy);
    if (taskDetailApproveBtn instanceof HTMLButtonElement) {
      taskDetailApproveBtn.disabled = isBusy;
    }
    if (taskDetailRejectBtn instanceof HTMLButtonElement) {
      taskDetailRejectBtn.disabled = isBusy;
    }
  };

  const onApproveDoneClick = () => {
    if (!detailTaskId) return;
    if (!canManageDoneApproval()) return;
    setApprovalButtonsBusy(true);
    void (async () => {
      try {
        await approveDone(detailTaskId);
        cache.deleteTask(detailTaskId);
        await openTaskDetailModalForTask(detailTaskId, detailTaskCard);
      } finally {
        setApprovalButtonsBusy(false);
      }
    })();
  };

  const onRejectDoneClick = () => {
    if (!detailTaskId) return;
    if (!canManageDoneApproval()) return;
    setApprovalButtonsBusy(true);
    void (async () => {
      try {
        await rejectDone(detailTaskId);
        cache.deleteTask(detailTaskId);
        await openTaskDetailModalForTask(detailTaskId, detailTaskCard);
      } finally {
        setApprovalButtonsBusy(false);
      }
    })();
  };

  const onDetailPhotoClick = () => {
    if (!canEditTask() || !detailTaskId) return;
    pendingPhotoTaskId = detailTaskId;
    taskBgInput?.click();
  };

  const onDetailPhotoClearClick = () => {
    if (!canEditTask() || !detailTaskId) return;
    clearStoredTaskBg(detailTaskId);
    cache.clearTaskBg(detailTaskId);
    applyTaskBgToCards(detailTaskId, "");
    if (taskDetailPhotoWrap && taskDetailPhotoImg) {
      taskDetailPhotoImg.removeAttribute("src");
      taskDetailPhotoWrap.setAttribute("hidden", "");
    }

    appendStoredTaskHistory(detailTaskId, {
      at: Date.now(),
      title: "Фото удалено",
      source: "Детали задачи",
      lines: []
    });
    notifyTaskHistoryChanged(detailTaskId);
  };

  const onAttachClick = () => {
    if (!canEditTask() || !detailTaskId) return;
    taskAttachmentsInput?.click();
  };

  const onAttachmentsInputChange = async () => {
    if (!taskAttachmentsInput) return;
    const files = taskAttachmentsInput.files ? Array.from(taskAttachmentsInput.files) : [];
    taskAttachmentsInput.value = "";
    if (!files.length) return;
    const uploaded = await uploadAttachmentsForDetail(files);
    if (!uploaded) return;
    appendStoredTaskHistory(detailTaskId, {
      at: Date.now(),
      title: "Добавлены вложения",
      source: "Детали задачи",
      lines: files.map((f) => normalizeToken(f?.name)).filter(Boolean)
    });
    notifyTaskHistoryChanged(detailTaskId);
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

      appendStoredTaskHistory(id, {
        at: Date.now(),
        title: "Фото обновлено",
        source: "Детали задачи",
        lines: normalizeToken(file.name) ? [normalizeToken(file.name)] : []
      });
      notifyTaskHistoryChanged(id);
    } catch (error) {
      console.error("Не удалось загрузить фото", error);
    }
  };

  return {
    closeTaskDetailModal,
    openTaskDetailModalForTask,
    notifyTaskHistoryChanged,
    onDetailModalClick,
    onDetailEditClick,
    onApproveDoneClick,
    onRejectDoneClick,
    onDetailPhotoClick,
    onDetailPhotoClearClick,
    onHistoryToggleClick,
    onHistoryClearClick,
    onAttachClick,
    onAttachmentsInputChange,
    onTaskBgInputChange
  };
};
