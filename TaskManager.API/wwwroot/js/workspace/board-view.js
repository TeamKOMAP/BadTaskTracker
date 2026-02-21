import { normalizeToken } from "../shared/utils.js";

export const createBoardViewController = (deps) => {
  const calendarLayout = deps?.calendarLayout ?? null;
  const clearBoardTasks = typeof deps?.clearBoardTasks === "function" ? deps.clearBoardTasks : () => {};
  const addTaskToBoard = typeof deps?.addTaskToBoard === "function" ? deps.addTaskToBoard : () => {};
  const addTaskToColumn = typeof deps?.addTaskToColumn === "function" ? deps.addTaskToColumn : () => {};
  const getDefaultColumn = typeof deps?.getDefaultColumn === "function" ? deps.getDefaultColumn : () => null;
  const createTaskCard = typeof deps?.createTaskCard === "function" ? deps.createTaskCard : () => null;
  const ensureColumnPlaceholder = typeof deps?.ensureColumnPlaceholder === "function"
    ? deps.ensureColumnPlaceholder
    : () => {};
  const updateColumnCount = typeof deps?.updateColumnCount === "function" ? deps.updateColumnCount : () => {};
  const updateFlowEmptyState = typeof deps?.updateFlowEmptyState === "function" ? deps.updateFlowEmptyState : () => {};
  const refreshAllTaskTimings = typeof deps?.refreshAllTaskTimings === "function" ? deps.refreshAllTaskTimings : () => {};
  const setColumnDelays = typeof deps?.setColumnDelays === "function" ? deps.setColumnDelays : () => {};
  const updateTaskCardStatus = typeof deps?.updateTaskCardStatus === "function" ? deps.updateTaskCardStatus : () => {};
  const refreshTaskCardTiming = typeof deps?.refreshTaskCardTiming === "function" ? deps.refreshTaskCardTiming : () => {};
  const setTaskCardAttachmentCount = typeof deps?.setTaskCardAttachmentCount === "function"
    ? deps.setTaskCardAttachmentCount
    : () => {};
  const toStatusValue = typeof deps?.toStatusValue === "function" ? deps.toStatusValue : (value) => Number(value) || 1;
  const toPriorityValue = typeof deps?.toPriorityValue === "function" ? deps.toPriorityValue : (value) => Number(value) || 2;
  const getColumnIdForStatus = typeof deps?.getColumnIdForStatus === "function"
    ? deps.getColumnIdForStatus
    : () => "column-new";
  const getPriorityLabel = typeof deps?.getPriorityLabel === "function" ? deps.getPriorityLabel : () => "medium";

  const compareBoardTasks = (a, b) => {
    const ad = a?.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b?.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    const ap = toPriorityValue(a?.priorityValue ?? a?.priority);
    const bp = toPriorityValue(b?.priorityValue ?? b?.priority);
    if (ap !== bp) return bp - ap;
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  };

  const compareTasks = typeof deps?.compareTasks === "function" ? deps.compareTasks : compareBoardTasks;

  const upsertTaskChips = (footer, tags) => {
    if (!(footer instanceof Element)) return;
    footer.querySelectorAll(".task-chip").forEach((chip) => chip.remove());
    const actions = footer.querySelector(".task-actions");
    const fragment = document.createDocumentFragment();
    (Array.isArray(tags) ? tags : []).forEach((item) => {
      const value = normalizeToken(item);
      if (!value) return;
      const chip = document.createElement("span");
      chip.className = "task-chip";
      chip.textContent = value;
      fragment.appendChild(chip);
    });
    if (actions) {
      footer.insertBefore(fragment, actions);
    } else {
      footer.appendChild(fragment);
    }
  };

  const upsertTaskInBoard = (taskData) => {
    const taskId = Number.parseInt(String(taskData?.id ?? ""), 10);
    if (!Number.isFinite(taskId) || taskId <= 0) return;

    const statusValue = toStatusValue(taskData?.statusValue ?? taskData?.status);
    const columnId = getColumnIdForStatus(statusValue);
    const targetColumn = document.querySelector(`.column[data-column-id="${columnId}"]`) || getDefaultColumn();
    if (!(targetColumn instanceof Element)) return;

    const existingCard = document.querySelector(`.task-card[data-task-id="${taskId}"]:not(.is-empty)`);
    if (!(existingCard instanceof Element)) {
      const card = createTaskCard(taskData);
      if (!(card instanceof Element)) return;
      addTaskToColumn(targetColumn, card);
      ensureColumnPlaceholder(targetColumn);
      updateColumnCount(targetColumn);
      updateFlowEmptyState();
      return;
    }

    const sourceColumn = existingCard.closest(".column");

    const titleEl = existingCard.querySelector("h3");
    if (titleEl) {
      titleEl.textContent = taskData?.title || "Задача без названия";
    }

    const textEl = existingCard.querySelector(".task-text");
    if (textEl) {
      textEl.textContent = taskData?.description || "";
    }

    const assigneeId = Number.parseInt(String(taskData?.assigneeId ?? ""), 10);
    if (Number.isFinite(assigneeId) && assigneeId > 0) {
      existingCard.dataset.assigneeId = String(assigneeId);
    } else {
      delete existingCard.dataset.assigneeId;
    }

    const dueDate = taskData?.dueDate ? new Date(taskData.dueDate) : null;
    if (dueDate && !Number.isNaN(dueDate.getTime())) {
      existingCard.dataset.dueDate = dueDate.toISOString();
    } else {
      delete existingCard.dataset.dueDate;
    }

    const priorityValue = toPriorityValue(taskData?.priorityValue ?? taskData?.priority);
    existingCard.dataset.priorityValue = String(priorityValue);
    existingCard.dataset.priority = getPriorityLabel(priorityValue);
    existingCard.dataset.taskStatus = String(statusValue);

    const doneApprovalPending = Boolean(taskData?.doneApprovalPending);
    if (doneApprovalPending) {
      existingCard.dataset.doneApproval = "pending";
    } else {
      delete existingCard.dataset.doneApproval;
    }
    const approvalEl = existingCard.querySelector(".task-approval-wait");
    if (approvalEl instanceof HTMLElement) {
      approvalEl.hidden = !doneApprovalPending;
    }

    const tagIds = Array.isArray(taskData?.tagIds) ? taskData.tagIds : [];
    existingCard.dataset.tagIds = tagIds.join(",");

    const attachmentCount = Number(taskData?.attachmentCount);
    existingCard.dataset.attachmentCount = Number.isFinite(attachmentCount) && attachmentCount > 0
      ? String(attachmentCount)
      : "0";

    const footer = existingCard.querySelector(".task-footer");
    upsertTaskChips(footer, Array.isArray(taskData?.tags) ? taskData.tags : []);

    updateTaskCardStatus(existingCard, statusValue);
    refreshTaskCardTiming(existingCard);
    setTaskCardAttachmentCount(existingCard, Number(existingCard.dataset.attachmentCount || 0));

    if (sourceColumn !== targetColumn) {
      addTaskToColumn(targetColumn, existingCard);
    }

    const columnsToSync = new Set([sourceColumn, targetColumn].filter(Boolean));
    columnsToSync.forEach((column) => {
      ensureColumnPlaceholder(column);
      updateColumnCount(column);
    });
    updateFlowEmptyState();
  };

  const removeTaskFromBoard = (taskId) => {
    const normalizedId = Number.parseInt(String(taskId ?? ""), 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;

    const cards = Array.from(document.querySelectorAll(`.task-card[data-task-id="${normalizedId}"]:not(.is-empty)`));
    if (!cards.length) return;

    const affectedColumns = new Set();
    cards.forEach((card) => {
      const column = card.closest(".column");
      if (column) {
        affectedColumns.add(column);
      }
      card.remove();
    });

    affectedColumns.forEach((column) => {
      ensureColumnPlaceholder(column);
      updateColumnCount(column);
    });
    updateFlowEmptyState();
  };

  const renderBoardView = (tasks) => {
    if (calendarLayout) {
      calendarLayout.setAttribute("aria-hidden", "true");
      calendarLayout.innerHTML = "";
    }

    clearBoardTasks();

    const list = Array.isArray(tasks) ? tasks : [];
    const groupsByColumnId = new Map();
    list.forEach((task) => {
      const statusValue = toStatusValue(task?.statusValue ?? task?.status);
      const columnId = getColumnIdForStatus(statusValue);
      const bucket = groupsByColumnId.get(columnId) || [];
      bucket.push(task);
      groupsByColumnId.set(columnId, bucket);
    });

    const columns = Array.from(document.querySelectorAll(".column"));
    columns.forEach((column) => {
      const columnId = column?.dataset?.columnId;
      if (!columnId) return;
      const bucket = groupsByColumnId.get(columnId) || [];
      bucket.slice().sort(compareTasks).forEach((task) => addTaskToBoard(task));
      groupsByColumnId.delete(columnId);
    });

    // Any remaining tasks fall back to default column.
    Array.from(groupsByColumnId.values()).forEach((bucket) => {
      bucket.slice().sort(compareTasks).forEach((task) => addTaskToBoard(task));
    });

    document.querySelectorAll(".column").forEach((column) => {
      updateColumnCount(column);
      ensureColumnPlaceholder(column);
    });
    updateFlowEmptyState();
    setColumnDelays();
    refreshAllTaskTimings();
  };

  return {
    renderBoardView,
    upsertTaskInBoard,
    removeTaskFromBoard
  };
};
