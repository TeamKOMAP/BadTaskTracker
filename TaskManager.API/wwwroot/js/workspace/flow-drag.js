export const createFlowDragController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const clampValue = typeof deps?.clampValue === "function"
    ? deps.clampValue
    : (value, min, max) => Math.min(max, Math.max(min, value));
  const normalizeToken = typeof deps?.normalizeToken === "function"
    ? deps.normalizeToken
    : (value) => String(value ?? "").trim();
  const buildTaskKey = typeof deps?.buildTaskKey === "function" ? deps.buildTaskKey : () => "";
  const getFlowStatusLabel = typeof deps?.getFlowStatusLabel === "function" ? deps.getFlowStatusLabel : () => "Задача";
  const getTasks = typeof deps?.getTasks === "function" ? deps.getTasks : () => [];
  const buildFlowTaskPayloadFromTask = typeof deps?.buildFlowTaskPayloadFromTask === "function"
    ? deps.buildFlowTaskPayloadFromTask
    : (task) => {
      const title = task?.title ? String(task.title) : "Новая задача";
      const statusValue = Number.parseInt(String(task?.statusValue ?? task?.status ?? "1"), 10);
      const normalizedStatus = Number.isFinite(statusValue) ? clampValue(statusValue, 1, 4) : 1;
      const taskId = Number.parseInt(String(task?.id ?? ""), 10);
      return {
        title,
        tag: getFlowStatusLabel(normalizedStatus),
        note: "",
        detailNote: normalizeToken(task?.description) || "",
        description: normalizeToken(task?.description) || "",
        statusValue: normalizedStatus,
        taskId: Number.isFinite(taskId) && taskId > 0 ? String(taskId) : "",
        dueDate: normalizeToken(task?.dueDate),
        taskKey: Number.isFinite(taskId) && taskId > 0
          ? `task:${taskId}`
          : buildTaskKey({ title, tag: getFlowStatusLabel(normalizedStatus), note: "" })
      };
    };
  const getFlowScale = typeof deps?.getFlowScale === "function" ? deps.getFlowScale : () => 1;
  const getFlowOffset = typeof deps?.getFlowOffset === "function"
    ? deps.getFlowOffset
    : () => ({ x: 0, y: 0 });
  const setFlowScale = typeof deps?.setFlowScale === "function" ? deps.setFlowScale : () => false;
  const setFlowOffset = typeof deps?.setFlowOffset === "function" ? deps.setFlowOffset : () => false;

  const onCreateNode = typeof deps?.onCreateNode === "function" ? deps.onCreateNode : () => null;
  const onUpdateFlowLines = typeof deps?.onUpdateFlowLines === "function" ? deps.onUpdateFlowLines : () => {};
  const onFlowStateChanged = typeof deps?.onFlowStateChanged === "function" ? deps.onFlowStateChanged : () => {};
  const onClearSelection = typeof deps?.onClearSelection === "function" ? deps.onClearSelection : () => {};
  const onSelectNode = typeof deps?.onSelectNode === "function" ? deps.onSelectNode : () => {};
  const onStartConnectMode = typeof deps?.onStartConnectMode === "function"
    ? deps.onStartConnectMode
    : () => {};
  const onToggleNodeMenu = typeof deps?.onToggleNodeMenu === "function" ? deps.onToggleNodeMenu : () => {};
  const onCloseNodeMenu = typeof deps?.onCloseNodeMenu === "function" ? deps.onCloseNodeMenu : () => {};
  const onOpenNodeTask = typeof deps?.onOpenNodeTask === "function" ? deps.onOpenNodeTask : () => {};
  const onClearOutgoingConnections = typeof deps?.onClearOutgoingConnections === "function"
    ? deps.onClearOutgoingConnections
    : () => {};
  const onRemoveNodeFromMap = typeof deps?.onRemoveNodeFromMap === "function" ? deps.onRemoveNodeFromMap : () => {};
  const onSetNodeColor = typeof deps?.onSetNodeColor === "function" ? deps.onSetNodeColor : () => {};

  const getEffectiveScale = () => {
    const scale = Number(getFlowScale());
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  };

  const getEffectiveOffset = () => {
    const offset = getFlowOffset() || {};
    return {
      x: Number(offset.x) || 0,
      y: Number(offset.y) || 0
    };
  };

  const toCanvasPoint = (clientX, clientY) => {
    if (!flowCanvas) {
      return { x: Number(clientX) || 0, y: Number(clientY) || 0 };
    }
    const rect = flowCanvas.getBoundingClientRect();
    const scale = getEffectiveScale();
    const offset = getEffectiveOffset();
    return {
      x: (Number(clientX) - rect.left - offset.x) / scale,
      y: (Number(clientY) - rect.top - offset.y) / scale
    };
  };

  const clampNodePosition = (node, left, top) => {
    if (!flowCanvas) return { left, top };

    const canvasWidth = flowCanvas.clientWidth;
    const canvasHeight = flowCanvas.clientHeight;
    const nodeWidth = node?.offsetWidth || 0;
    const nodeHeight = node?.offsetHeight || 0;

    if (canvasWidth < 40 || canvasHeight < 40 || nodeWidth < 20 || nodeHeight < 20) {
      return { left, top };
    }

    const padding = 16;
    const scale = getEffectiveScale();
    const clampScale = scale > 1 ? scale : 1;
    const width = canvasWidth / clampScale;
    const height = canvasHeight / clampScale;
    const virtualWidth = Math.max(width * 3.2, 3200);
    const virtualHeight = Math.max(height * 2.8, 2200);
    const minLeft = -Math.round(virtualWidth * 0.32);
    const minTop = -Math.round(virtualHeight * 0.28);
    const maxLeft = minLeft + virtualWidth - nodeWidth - padding;
    const maxTop = minTop + virtualHeight - nodeHeight - padding;
    return {
      left: clampValue(left, minLeft, Math.max(minLeft, maxLeft)),
      top: clampValue(top, minTop, Math.max(minTop, maxTop))
    };
  };

  const highlightDuplicateNode = (node) => {
    if (!node) return;
    node.classList.add("is-duplicate");
    window.setTimeout(() => {
      node.classList.remove("is-duplicate");
    }, 500);
  };

  const initFlowNodeInteractions = (node) => {
    if (!(node instanceof Element)) return;

    node.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest(".flow-node-remove")) {
        return;
      }
      if (event.target instanceof Element && event.target.closest(".flow-node-clear")) {
        return;
      }
      if (event.target instanceof Element && event.target.closest(".flow-node-menu")) {
        return;
      }
      if (event.button !== 0) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseFloat(node.style.left) || 0;
      const startTop = parseFloat(node.style.top) || 0;
      let moved = false;

      node.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        const scale = getEffectiveScale();
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          moved = true;
        }
        if (!moved) return;

        onCloseNodeMenu();

        const next = clampNodePosition(node, startLeft + dx, startTop + dy);
        node.style.left = `${next.left}px`;
        node.style.top = `${next.top}px`;
        onUpdateFlowLines();
      };

      const onUp = (upEvent) => {
        if (node.hasPointerCapture(upEvent.pointerId)) {
          node.releasePointerCapture(upEvent.pointerId);
        }
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);
        node.removeEventListener("pointercancel", onUp);

        if (!moved) {
          onSelectNode(node);
          return;
        }

        onFlowStateChanged();
      };

      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
      node.addEventListener("pointercancel", onUp);
    });

    const removeBtn = node.querySelector(".flow-node-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onStartConnectMode(node);
      });
    }

    const clearBtn = node.querySelector(".flow-node-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClearOutgoingConnections(node);
      });
    }

    const menu = node.querySelector(".flow-node-menu");
    if (menu) {
      menu.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      menu.addEventListener("dblclick", (event) => {
        event.stopPropagation();
      });
      menu.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
    }

    const openTaskBtn = node.querySelector(".flow-node-menu-open");
    if (openTaskBtn) {
      openTaskBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenNodeTask(node);
      });
    }

    const removeNodeBtn = node.querySelector(".flow-node-menu-delete");
    if (removeNodeBtn) {
      removeNodeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onRemoveNodeFromMap(node);
      });
    }

    const colorInput = node.querySelector(".flow-node-color-input");
    if (colorInput instanceof HTMLInputElement) {
      colorInput.addEventListener("input", (event) => {
        event.stopPropagation();
        onSetNodeColor(node, colorInput.value);
      });
      colorInput.addEventListener("change", (event) => {
        event.stopPropagation();
        onSetNodeColor(node, colorInput.value);
      });
    }

    node.addEventListener("dblclick", (event) => {
      if (event.target instanceof Element && event.target.closest(".flow-node-remove")) {
        return;
      }
      if (event.target instanceof Element && event.target.closest(".flow-node-clear")) {
        return;
      }
      if (event.target instanceof Element && event.target.closest(".flow-node-menu")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onToggleNodeMenu(node);
    });
  };

  const buildPayloadFromTaskById = (rawTaskId) => {
    const taskId = Number.parseInt(String(rawTaskId ?? ""), 10);
    if (!Number.isFinite(taskId) || taskId <= 0) return null;
    const task = Array.isArray(getTasks())
      ? getTasks().find((item) => Number(item?.id) === taskId)
      : null;
    if (!task) return null;
    return buildFlowTaskPayloadFromTask(task);
  };

  const normalizePayloadObject = (payload) => {
    if (!payload || typeof payload !== "object") return null;

    const taskFromId = buildPayloadFromTaskById(payload.taskId ?? payload.id);
    const fallbackStatusValue = Number.parseInt(String(payload.statusValue ?? payload.status ?? "1"), 10);
    const normalizedStatus = Number.isFinite(fallbackStatusValue)
      ? clampValue(fallbackStatusValue, 1, 4)
      : 1;

    const title = normalizeToken(taskFromId?.title ?? payload.title) || "Новая задача";
    const tag = normalizeToken(taskFromId?.tag ?? payload.tag) || getFlowStatusLabel(normalizedStatus);
    const note = normalizeToken(taskFromId?.note ?? payload.note);
    const detailNote = normalizeToken(taskFromId?.detailNote ?? payload.detailNote ?? payload.description) || note;
    const description = normalizeToken(taskFromId?.description ?? payload.description);
    const taskId = normalizeToken(taskFromId?.taskId ?? payload.taskId ?? payload.id);
    const dueDate = normalizeToken(taskFromId?.dueDate ?? payload.dueDate);

    const taskKey = normalizeToken(taskFromId?.taskKey)
      || normalizeToken(payload.taskKey)
      || (taskId ? `task:${taskId}` : buildTaskKey({ title, tag, note }));

    if (!taskId && !taskKey) {
      return null;
    }

    return {
      title,
      tag,
      note,
      detailNote,
      description,
      dueDate,
      statusValue: Number.parseInt(String(taskFromId?.statusValue ?? normalizedStatus), 10) || 1,
      taskId,
      taskKey,
      source: normalizeToken(payload.source)
    };
  };

  const normalizeDropPayload = (raw) => {
    const token = normalizeToken(raw);
    if (!token) return null;

    let parsed = null;
    try {
      parsed = JSON.parse(token);
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === "object") {
      const source = normalizeToken(parsed.source).toLowerCase();
      const hasKnownSource = source === "flow-task" || source === "task-card";
      const hasKnownTask = Boolean(buildPayloadFromTaskById(parsed.taskId ?? parsed.id));
      if (!hasKnownSource && !hasKnownTask) {
        return null;
      }

      const normalized = normalizePayloadObject(parsed);
      if (normalized) return normalized;

      // For security: ignore arbitrary text/object drops that do not match task payload shape.
      return null;
    }

    const taskPayload = buildPayloadFromTaskById(token);
    if (taskPayload) {
      return normalizePayloadObject(taskPayload);
    }

    return null;
  };

  const bindCanvasInteractions = () => {
    if (!flowCanvas) return;

    flowCanvas.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        event.preventDefault();
      }
    });

    flowCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 1) return;

      event.preventDefault();
      event.stopPropagation();
      onCloseNodeMenu();

      const startOffset = getEffectiveOffset();
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;

      flowCanvas.classList.add("is-panning");
      flowCanvas.setPointerCapture(pointerId);

      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        setFlowOffset(startOffset.x + dx, startOffset.y + dy);
      };

      const finishPan = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        flowCanvas.classList.remove("is-panning");
        flowCanvas.removeEventListener("pointermove", onMove);
        flowCanvas.removeEventListener("pointerup", finishPan);
        flowCanvas.removeEventListener("pointercancel", finishPan);
        if (flowCanvas.hasPointerCapture(pointerId)) {
          flowCanvas.releasePointerCapture(pointerId);
        }
      };

      flowCanvas.addEventListener("pointermove", onMove);
      flowCanvas.addEventListener("pointerup", finishPan);
      flowCanvas.addEventListener("pointercancel", finishPan);
    });

    flowCanvas.addEventListener("dragover", (event) => {
      event.preventDefault();
      flowCanvas.classList.add("is-dragging-over");
    });

    flowCanvas.addEventListener("dragleave", () => {
      flowCanvas.classList.remove("is-dragging-over");
    });

    flowCanvas.addEventListener("drop", (event) => {
      event.preventDefault();
      flowCanvas.classList.remove("is-dragging-over");
      if (!event.dataTransfer) return;

      const raw = event.dataTransfer.getData("text/plain");
      if (!raw) return;

      const payload = normalizeDropPayload(raw);
      if (!payload) return;

      const taskKey = normalizeToken(payload.taskKey) || buildTaskKey(payload);

      const existing = Array.from(flowCanvas.querySelectorAll(".flow-node")).find(
        (node) => {
          if (payload.taskId && node.dataset.taskId && node.dataset.taskId === payload.taskId) {
            return true;
          }
          return node.dataset.taskKey === taskKey;
        }
      );
      if (existing) {
        highlightDuplicateNode(existing);
        return;
      }

      const position = toCanvasPoint(event.clientX, event.clientY);
      onCreateNode(payload, position);
    });

    flowCanvas.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".flow-node-menu")) {
        return;
      }
      if (target instanceof Element && target.closest(".flow-node")) {
        return;
      }
      onCloseNodeMenu();
      onClearSelection();
    });

    flowCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const step = event.shiftKey ? 0.15 : 0.08;
      const current = getEffectiveScale();
      const next = clampValue(current + direction * step, 0.3, 1.8);
      if (Math.abs(next - current) < 0.0001) return;
      const changed = setFlowScale(next, {
        clientX: event.clientX,
        clientY: event.clientY
      });
      if (changed) {
        onUpdateFlowLines();
      }
    }, { passive: false });

    flowCanvas.addEventListener("transitionend", (event) => {
      const target = event.target;
      if (target instanceof Element && target.classList.contains("flow-node-note")) {
        onUpdateFlowLines();
      }
    });
  };

  return {
    clampNodePosition,
    initFlowNodeInteractions,
    bindCanvasInteractions,
    highlightDuplicateNode
  };
};
