const PRIORITY_BUCKETS = [
  { id: "high", title: "Высокий приоритет" },
  { id: "medium", title: "Средний приоритет" },
  { id: "low", title: "Низкий приоритет" },
  { id: "done", title: "Выполнено" },
  { id: "overdue", title: "Просрочено" }
];

export const createPriorityViewController = (deps) => {
  const calendarLayout = deps?.calendarLayout ?? null;
  const board = deps?.board ?? null;
  const clearBoardTasks = typeof deps?.clearBoardTasks === "function" ? deps.clearBoardTasks : () => {};
  const createTaskCard = typeof deps?.createTaskCard === "function" ? deps.createTaskCard : () => null;
  const toPriorityValue = typeof deps?.toPriorityValue === "function" ? deps.toPriorityValue : (value) => Number(value) || 2;

  const getPriorityBucketId = (task) => {
    const statusValueRaw = task?.statusValue ?? task?.status;
    const statusValue = Number(statusValueRaw);
    if (statusValue === 3) return "done";

    const due = task?.dueDate ? new Date(task.dueDate) : null;
    if (statusValue === 4) return "overdue";
    if (due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";

    const priorityValue = toPriorityValue(task?.priorityValue ?? task?.priority);
    if (priorityValue >= 3) return "high";
    if (priorityValue <= 1) return "low";
    return "medium";
  };

  const comparePriorityTasks = (a, b) => {
    const ad = a?.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b?.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    const ap = toPriorityValue(a?.priorityValue ?? a?.priority);
    const bp = toPriorityValue(b?.priorityValue ?? b?.priority);
    if (ap !== bp) return bp - ap;
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  };

  const ensurePriorityGroupUiState = (group) => {
    if (!(group instanceof Element)) return;
    const body = group.querySelector(".calendar-group-body");
    const count = group.querySelector(".calendar-group-count");
    if (!(body instanceof Element)) return;

    const cards = body.querySelectorAll(".task-card:not(.is-empty)");
    const cardsCount = cards.length;
    if (count) {
      count.textContent = String(cardsCount);
    }

    const empty = body.querySelector(".task-detail-attachments-empty");
    if (cardsCount === 0) {
      if (!(empty instanceof Element)) {
        const placeholder = document.createElement("div");
        placeholder.className = "task-detail-attachments-empty";
        placeholder.textContent = "Нет задач";
        body.appendChild(placeholder);
      }
      return;
    }

    if (empty instanceof Element) {
      empty.remove();
    }
  };

  const upsertTaskInPriority = (taskData) => {
    if (!calendarLayout) return false;

    const taskId = Number.parseInt(String(taskData?.id ?? ""), 10);
    if (!Number.isFinite(taskId) || taskId <= 0) return false;

    const targetBucketId = getPriorityBucketId(taskData);
    const targetGroup = calendarLayout.querySelector(`.calendar-group[data-group-id="${targetBucketId}"]`);
    const targetBody = targetGroup?.querySelector(".calendar-group-body");
    if (!(targetGroup instanceof Element) || !(targetBody instanceof Element)) {
      return false;
    }

    const affectedGroups = new Set([targetGroup]);
    const existingCards = Array.from(
      calendarLayout.querySelectorAll(`.task-card[data-task-id="${taskId}"]:not(.is-empty)`)
    );

    existingCards.forEach((card) => {
      const group = card.closest(".calendar-group");
      if (group instanceof Element) {
        affectedGroups.add(group);
      }
      card.remove();
    });

    const card = createTaskCard(taskData);
    if (!(card instanceof Element)) {
      return false;
    }
    card.setAttribute("draggable", "false");

    const existingInTarget = Array.from(targetBody.querySelectorAll(".task-card:not(.is-empty)"));
    const insertBefore = existingInTarget.find((item) => {
      const candidate = {
        title: item.querySelector("h3")?.textContent || "",
        dueDate: item.dataset.dueDate || null,
        priorityValue: Number.parseInt(item.dataset.priorityValue || "", 10)
      };
      return comparePriorityTasks(candidate, taskData) > 0;
    });

    if (insertBefore) {
      targetBody.insertBefore(card, insertBefore);
    } else {
      targetBody.appendChild(card);
    }

    affectedGroups.forEach((group) => ensurePriorityGroupUiState(group));
    return true;
  };

  const removeTaskFromPriority = (taskId) => {
    if (!calendarLayout) return false;

    const normalizedId = Number.parseInt(String(taskId ?? ""), 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return false;

    const cards = Array.from(
      calendarLayout.querySelectorAll(`.task-card[data-task-id="${normalizedId}"]:not(.is-empty)`)
    );

    if (!cards.length) {
      return false;
    }

    const affectedGroups = new Set();
    cards.forEach((card) => {
      const group = card.closest(".calendar-group");
      if (group instanceof Element) {
        affectedGroups.add(group);
      }
      card.remove();
    });

    affectedGroups.forEach((group) => ensurePriorityGroupUiState(group));
    return true;
  };

  const renderPriorityView = (tasks) => {
    if (!calendarLayout || !board) return;
    clearBoardTasks();
    calendarLayout.innerHTML = "";
    calendarLayout.setAttribute("aria-hidden", "false");

    const lists = new Map(PRIORITY_BUCKETS.map((bucket) => [bucket.id, []]));
    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
      const bucketId = getPriorityBucketId(task);
      const bucket = lists.get(bucketId);
      if (bucket) {
        bucket.push(task);
      }
    });

    PRIORITY_BUCKETS.forEach((bucket) => {
      const group = document.createElement("section");
      group.className = "calendar-group";
      group.dataset.groupId = bucket.id;

      const header = document.createElement("header");
      header.className = "calendar-group-header";
      const title = document.createElement("div");
      title.className = "calendar-group-title";
      title.textContent = bucket.title;
      const count = document.createElement("span");
      count.className = "calendar-group-count";

      const body = document.createElement("div");
      body.className = "calendar-group-body";

      const list = (lists.get(bucket.id) || []).slice().sort(comparePriorityTasks);
      count.textContent = String(list.length);

      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "task-detail-attachments-empty";
        empty.textContent = "Нет задач";
        body.appendChild(empty);
      } else {
        list.forEach((task) => {
          const card = createTaskCard(task);
          if (!(card instanceof Element)) return;
          card.setAttribute("draggable", "false");
          body.appendChild(card);
        });
      }

      header.append(title, count);
      group.append(header, body);
      calendarLayout.appendChild(group);
    });
  };

  return {
    renderPriorityView,
    upsertTaskInPriority,
    removeTaskFromPriority
  };
};
