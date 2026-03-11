const toTaskId = (value) => {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const isTaskVisibleForAssignee = (taskData, assigneeIdFilter) => {
  const filterId = toTaskId(assigneeIdFilter);
  if (!filterId) {
    return true;
  }

  const assigneeId = toTaskId(taskData?.assigneeId);
  return assigneeId === filterId;
};

export const upsertTaskInList = (tasks, taskData) => {
  const source = Array.isArray(tasks) ? tasks : [];
  const taskId = toTaskId(taskData?.id);
  if (!taskId) {
    return source;
  }

  let replaced = false;
  const next = source.map((item) => {
    const itemId = toTaskId(item?.id);
    if (itemId !== taskId) {
      return item;
    }

    replaced = true;
    return {
      ...item,
      ...taskData
    };
  });

  if (!replaced) {
    next.push(taskData);
  }

  return next;
};

export const removeTaskFromList = (tasks, taskId) => {
  const source = Array.isArray(tasks) ? tasks : [];
  const normalizedId = toTaskId(taskId);
  if (!normalizedId) {
    return source;
  }

  return source.filter((task) => toTaskId(task?.id) !== normalizedId);
};

export const updateTaskAttachmentCountInList = (tasks, taskId, count) => {
  const source = Array.isArray(tasks) ? tasks : [];
  const normalizedId = toTaskId(taskId);
  if (!normalizedId) {
    return source;
  }

  const normalizedCount = Number.isFinite(Number(count)) && Number(count) > 0
    ? Number(count)
    : 0;

  return source.map((task) => {
    const currentId = toTaskId(task?.id);
    if (currentId !== normalizedId) {
      return task;
    }

    return {
      ...task,
      attachmentCount: normalizedCount
    };
  });
};

export const findTaskInList = (tasks, taskId) => {
  const source = Array.isArray(tasks) ? tasks : [];
  const normalizedId = toTaskId(taskId);
  if (!normalizedId) {
    return null;
  }

  return source.find((task) => toTaskId(task?.id) === normalizedId) || null;
};
