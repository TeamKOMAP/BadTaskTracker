import { findTaskInList } from "./task-state.js?v=state1";

export const createWorkspaceTaskActions = (deps = {}) => {
  const apiFetch = typeof deps.apiFetch === "function" ? deps.apiFetch : null;
  const buildApiUrl = typeof deps.buildApiUrl === "function" ? deps.buildApiUrl : null;
  const handleApiError = typeof deps.handleApiError === "function" ? deps.handleApiError : async () => {};
  const toStatusValue = typeof deps.toStatusValue === "function" ? deps.toStatusValue : (value) => Number(value) || 1;
  const toPriorityValue = typeof deps.toPriorityValue === "function" ? deps.toPriorityValue : (value) => Number(value) || 2;
  const normalizeToken = typeof deps.normalizeToken === "function" ? deps.normalizeToken : (value) => String(value || "").trim();
  const getStoredTaskMeta = typeof deps.getStoredTaskMeta === "function" ? deps.getStoredTaskMeta : () => null;
  const setStoredTaskMeta = typeof deps.setStoredTaskMeta === "function" ? deps.setStoredTaskMeta : () => {};
  const clearStoredTaskArtifacts = typeof deps.clearStoredTaskArtifacts === "function"
    ? deps.clearStoredTaskArtifacts
    : () => {};
  const getTagNameById = typeof deps.getTagNameById === "function" ? deps.getTagNameById : () => "";
  const clampValue = typeof deps.clampValue === "function"
    ? deps.clampValue
    : (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));
  const getDefaultDueDateIso = typeof deps.getDefaultDueDateIso === "function"
    ? deps.getDefaultDueDateIso
    : () => new Date().toISOString();
  const closeTaskModal = typeof deps.closeTaskModal === "function" ? deps.closeTaskModal : () => {};
  const ensureTagsLoaded = typeof deps.ensureTagsLoaded === "function" ? deps.ensureTagsLoaded : async () => {};
  const syncTaskStateToUi = typeof deps.syncTaskStateToUi === "function" ? deps.syncTaskStateToUi : () => {};
  const sweepAutoOverdueTasks = typeof deps.sweepAutoOverdueTasks === "function"
    ? deps.sweepAutoOverdueTasks
    : async () => {};
  const buildTaskHistoryLines = typeof deps.buildTaskHistoryLines === "function" ? deps.buildTaskHistoryLines : () => [];
  const recordTaskHistory = typeof deps.recordTaskHistory === "function" ? deps.recordTaskHistory : () => {};
  const isTaskVisibleWithCurrentFilters = typeof deps.isTaskVisibleWithCurrentFilters === "function"
    ? deps.isTaskVisibleWithCurrentFilters
    : () => true;
  const getTasks = typeof deps.getTasks === "function" ? deps.getTasks : () => [];
  const setTasks = typeof deps.setTasks === "function" ? deps.setTasks : () => {};
  const upsertTaskInState = typeof deps.upsertTaskInState === "function" ? deps.upsertTaskInState : () => {};
  const removeTaskFromState = typeof deps.removeTaskFromState === "function" ? deps.removeTaskFromState : () => {};
  const applyTaskUpsertToUi = typeof deps.applyTaskUpsertToUi === "function" ? deps.applyTaskUpsertToUi : () => {};
  const applyTaskRemovalToUi = typeof deps.applyTaskRemovalToUi === "function" ? deps.applyTaskRemovalToUi : () => {};
  const buildUpdatePayloadFromCard = typeof deps.buildUpdatePayloadFromCard === "function"
    ? deps.buildUpdatePayloadFromCard
    : () => null;
  const getCurrentWorkspaceId = typeof deps.getCurrentWorkspaceId === "function" ? deps.getCurrentWorkspaceId : () => null;
  const getCurrentAssigneeIdFilter = typeof deps.getCurrentAssigneeIdFilter === "function"
    ? deps.getCurrentAssigneeIdFilter
    : () => null;
  const defaultPriorityValue = Number.isFinite(Number(deps.defaultPriorityValue))
    ? Number(deps.defaultPriorityValue)
    : 2;

  const canCallApi = () => apiFetch && buildApiUrl;

  const parseJsonOrNull = async (response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const normalizeApiTask = (task) => {
    const statusValue = toStatusValue(task?.status);
    const priorityValue = toPriorityValue(task?.priority);
    const tagIds = Array.isArray(task?.tagIds) ? task.tagIds : [];
    const doneApprovalPending = Boolean(task?.doneApprovalPending);
    const doneApprovalRequestedByUserId = task?.doneApprovalRequestedByUserId ?? null;
    const doneApprovalRequestedAtUtc = task?.doneApprovalRequestedAtUtc ?? null;
    const meta = task?.id !== undefined && task?.id !== null ? getStoredTaskMeta(task.id) : null;
    const metaTags = meta?.tags && meta.tags.length ? meta.tags : null;
    const apiTagNames = tagIds
      .map((id) => getTagNameById(Number(id)) || "")
      .map((name) => normalizeToken(name))
      .filter(Boolean);

    return {
      id: task?.id,
      title: task?.title || "Задача без названия",
      description: task?.description || "",
      statusValue,
      priorityValue,
      doneApprovalPending,
      doneApprovalRequestedByUserId,
      doneApprovalRequestedAtUtc,
      assigneeId: task?.assigneeId ?? null,
      dueDate: task?.dueDate,
      tags: metaTags || (apiTagNames.length ? apiTagNames : tagIds.map((id) => `Tag-${id}`)),
      tagIds,
      attachmentCount: Number.isFinite(Number(task?.attachmentCount)) && Number(task.attachmentCount) > 0
        ? Number(task.attachmentCount)
        : 0
    };
  };

  const fetchTasks = async () => {
    const workspaceId = Number(getCurrentWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      return [];
    }
    if (!canCallApi()) {
      return null;
    }

    const response = await apiFetch(buildApiUrl("/tasks", {
      assigneeId: getCurrentAssigneeIdFilter()
    }), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      await handleApiError(response, "Загрузка задач");
      return null;
    }

    return response.json();
  };

  const applyTaskDtoUpdateFromServer = (taskDto) => {
    if (!taskDto || !Number.isFinite(Number(taskDto.id))) return null;

    const normalizedTask = normalizeApiTask(taskDto);
    if (isTaskVisibleWithCurrentFilters(normalizedTask)) {
      upsertTaskInState(normalizedTask);
      applyTaskUpsertToUi(normalizedTask);
    } else {
      removeTaskFromState(normalizedTask.id);
      applyTaskRemovalToUi(normalizedTask.id);
    }

    return normalizedTask;
  };

  const createTaskViaApi = async (uiTaskData) => {
    if (!canCallApi()) {
      return;
    }

    const assigneeIdParsed = Number.parseInt(String(uiTaskData.assigneeId ?? ""), 10);
    const assigneeId = Number.isFinite(assigneeIdParsed) && assigneeId > 0 ? assigneeIdParsed : null;
    const priorityParsed = Number.parseInt(String(uiTaskData.priorityValue ?? defaultPriorityValue), 10);
    const priority = Number.isFinite(priorityParsed)
      ? clampValue(priorityParsed, 1, 3)
      : defaultPriorityValue;
    const due = new Date(String(uiTaskData.dueDateIso || ""));
    const dueDate = Number.isNaN(due.getTime()) ? getDefaultDueDateIso() : due.toISOString();
    const tagIds = Array.isArray(uiTaskData.tagIds) ? uiTaskData.tagIds : [];

    const payload = {
      title: uiTaskData.title,
      description: uiTaskData.description,
      assigneeId,
      dueDate,
      priority,
      tagIds
    };

    const response = await apiFetch(buildApiUrl("/tasks"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await handleApiError(response, "Создание задачи");
      return;
    }

    const createdTask = await parseJsonOrNull(response);
    const createdId = Number.parseInt(String(createdTask?.id ?? ""), 10);
    if (!Number.isFinite(createdId) || createdId <= 0) {
      closeTaskModal();
      await loadTasksFromApi();
      return;
    }

    clearStoredTaskArtifacts(createdId);

    const tags = Array.isArray(uiTaskData.tags)
      ? uiTaskData.tags.filter((tag) => typeof tag === "string" && tag.trim())
      : [];
    if (Number.isFinite(createdId) && createdId > 0) {
      setStoredTaskMeta(createdId, { tags });
    }

    const taskData = normalizeApiTask(createdTask);
    if (tags.length) {
      taskData.tags = tags;
    }

    recordTaskHistory(createdId, {
      at: Date.now(),
      title: "Создана задача",
      source: "Создание",
      lines: [normalizeToken(taskData.title) ? `Название: ${normalizeToken(taskData.title)}` : ""]
        .filter(Boolean)
    });

    if (isTaskVisibleWithCurrentFilters(taskData)) {
      upsertTaskInState(taskData);
      applyTaskUpsertToUi(taskData);
    } else {
      removeTaskFromState(createdId);
      applyTaskRemovalToUi(createdId);
    }

    closeTaskModal();
  };

  const updateTaskViaApi = async (id, uiTaskData) => {
    if (!canCallApi()) {
      return;
    }

    const before = findTaskInList(getTasks(), id);
    const beforeStatusValue = toStatusValue(before?.statusValue ?? before?.status);

    let statusValue = toStatusValue(uiTaskData.statusValue);
    const dueMs = Date.parse(String(uiTaskData.dueDateIso || ""));
    const restoringFromOverdue = beforeStatusValue === 4
      && Number.isFinite(dueMs)
      && dueMs >= Date.now();

    if (restoringFromOverdue) {
      statusValue = 1;
    } else if (beforeStatusValue === 4) {
      statusValue = 4;
    } else if (statusValue === 4) {
      statusValue = beforeStatusValue || 1;
    }

    const tagIds = Array.isArray(uiTaskData.tagIds) ? uiTaskData.tagIds : [];
    const assigneeIdParsed = Number.parseInt(String(uiTaskData.assigneeId ?? ""), 10);
    const assigneeId = Number.isFinite(assigneeIdParsed) && assigneeIdParsed > 0 ? assigneeIdParsed : null;
    const priorityParsed = Number.parseInt(String(uiTaskData.priorityValue ?? defaultPriorityValue), 10);
    const priority = Number.isFinite(priorityParsed)
      ? clampValue(priorityParsed, 1, 3)
      : defaultPriorityValue;
    const due = new Date(String(uiTaskData.dueDateIso || ""));
    const dueDate = Number.isNaN(due.getTime()) ? getDefaultDueDateIso() : due.toISOString();

    const payload = {
      id,
      title: uiTaskData.title,
      description: uiTaskData.description,
      status: statusValue,
      assigneeId,
      dueDate,
      priority,
      tagIds
    };

    const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await handleApiError(response, "Обновление задачи");
      return;
    }

    const updatedTask = await parseJsonOrNull(response);
    const updatedId = Number.parseInt(String(updatedTask?.id ?? id), 10);
    if (!Number.isFinite(updatedId) || updatedId <= 0) {
      closeTaskModal();
      await loadTasksFromApi();
      return;
    }

    const tags = Array.isArray(uiTaskData.tags)
      ? uiTaskData.tags.filter((tag) => typeof tag === "string" && tag.trim())
      : [];
    setStoredTaskMeta(updatedId, { tags });

    const normalizedTask = normalizeApiTask(updatedTask || {
      id: updatedId,
      title: uiTaskData.title,
      description: uiTaskData.description,
      status: statusValue,
      assigneeId,
      dueDate,
      priority,
      tagIds,
      attachmentCount: 0
    });

    if (tags.length) {
      normalizedTask.tags = tags;
    }

    const beforeForHistory = before && Number(before?.id) === Number(updatedId)
      ? before
      : findTaskInList(getTasks(), updatedId);
    const historyLines = buildTaskHistoryLines(beforeForHistory, normalizedTask);
    if (historyLines.length) {
      recordTaskHistory(updatedId, {
        at: Date.now(),
        title: "Изменение задачи",
        source: "Редактирование",
        lines: historyLines
      });
    }

    if (isTaskVisibleWithCurrentFilters(normalizedTask)) {
      upsertTaskInState(normalizedTask);
      applyTaskUpsertToUi(normalizedTask);
    } else {
      removeTaskFromState(updatedId);
      applyTaskRemovalToUi(updatedId);
    }

    closeTaskModal();
  };

  const updateTaskStatus = async (card, statusValue) => {
    if (!canCallApi()) {
      return;
    }

    const id = Number.parseInt(card?.dataset?.taskId || "", 10);
    if (!Number.isFinite(id)) {
      return;
    }

    const currentStatusValue = toStatusValue(card.dataset.taskStatus);
    const nextStatusValue = toStatusValue(statusValue);
    if ((currentStatusValue === 4 && nextStatusValue !== 4)
      || (currentStatusValue !== 4 && nextStatusValue === 4)) {
      syncTaskStateToUi();
      return;
    }

    const before = findTaskInList(getTasks(), id);
    const payload = buildUpdatePayloadFromCard(card, statusValue);

    const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await handleApiError(response, "Обновление задачи");
      syncTaskStateToUi();
      return;
    }

    const updatedTask = await parseJsonOrNull(response);
    if (!updatedTask || !Number.isFinite(Number(updatedTask.id))) {
      await loadTasksFromApi();
      return;
    }

    const normalizedTask = normalizeApiTask(updatedTask);
    const historyLines = buildTaskHistoryLines(before, normalizedTask);
    if (historyLines.length) {
      recordTaskHistory(id, {
        at: Date.now(),
        title: "Изменение задачи",
        source: "Перетаскивание",
        lines: historyLines
      });
    }

    if (isTaskVisibleWithCurrentFilters(normalizedTask)) {
      upsertTaskInState(normalizedTask);
      applyTaskUpsertToUi(normalizedTask);
    } else {
      removeTaskFromState(normalizedTask.id);
      applyTaskRemovalToUi(normalizedTask.id);
    }
  };

  const deleteTaskViaApi = async (id) => {
    if (!canCallApi()) {
      return false;
    }
    if (!Number.isFinite(Number(id))) {
      return false;
    }

    const response = await apiFetch(buildApiUrl(`/tasks/${id}`), {
      method: "DELETE",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      await handleApiError(response, "Удаление задачи");
      return false;
    }

    clearStoredTaskArtifacts(id);
    return true;
  };

  const loadTasksFromApi = async () => {
    await ensureTagsLoaded();
    const tasks = await fetchTasks();
    if (!Array.isArray(tasks)) {
      return;
    }

    setTasks(tasks.map(normalizeApiTask));
    syncTaskStateToUi();
    void sweepAutoOverdueTasks();
  };

  return {
    normalizeApiTask,
    fetchTasks,
    applyTaskDtoUpdateFromServer,
    createTaskViaApi,
    updateTaskViaApi,
    updateTaskStatus,
    deleteTaskViaApi,
    loadTasksFromApi
  };
};
