export const createFlowDragController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const clampValue = typeof deps?.clampValue === "function"
    ? deps.clampValue
    : (value, min, max) => Math.min(max, Math.max(min, value));
  const normalizeToken = typeof deps?.normalizeToken === "function"
    ? deps.normalizeToken
    : (value) => String(value ?? "").trim();
  const buildTaskKey = typeof deps?.buildTaskKey === "function" ? deps.buildTaskKey : () => "";
  const buildFlowNote = typeof deps?.buildFlowNote === "function" ? deps.buildFlowNote : () => "";
  const getFlowStatusLabel = typeof deps?.getFlowStatusLabel === "function" ? deps.getFlowStatusLabel : () => "Task";
  const getTasks = typeof deps?.getTasks === "function" ? deps.getTasks : () => [];

  const onCreateNode = typeof deps?.onCreateNode === "function" ? deps.onCreateNode : () => null;
  const onUpdateFlowLines = typeof deps?.onUpdateFlowLines === "function" ? deps.onUpdateFlowLines : () => {};
  const onClearSelection = typeof deps?.onClearSelection === "function" ? deps.onClearSelection : () => {};
  const onSelectNode = typeof deps?.onSelectNode === "function" ? deps.onSelectNode : () => {};
  const onRemoveOutgoingConnections = typeof deps?.onRemoveOutgoingConnections === "function"
    ? deps.onRemoveOutgoingConnections
    : () => {};
  const onRemoveNode = typeof deps?.onRemoveNode === "function" ? deps.onRemoveNode : () => {};

  const clampNodePosition = (node, left, top) => {
    if (!flowCanvas) return { left, top };
    const padding = 16;
    const maxLeft = flowCanvas.clientWidth - node.offsetWidth - padding;
    const maxTop = flowCanvas.clientHeight - node.offsetHeight - padding;
    return {
      left: clampValue(left, padding, Math.max(padding, maxLeft)),
      top: clampValue(top, padding, Math.max(padding, maxTop))
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
      if (event.button !== 0) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseFloat(node.style.left) || 0;
      const startTop = parseFloat(node.style.top) || 0;
      let moved = false;

      node.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          moved = true;
        }
        if (!moved) return;

        const next = clampNodePosition(node, startLeft + dx, startTop + dy);
        node.style.left = `${next.left}px`;
        node.style.top = `${next.top}px`;
        onUpdateFlowLines();
      };

      const onUp = (upEvent) => {
        node.releasePointerCapture(upEvent.pointerId);
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);

        if (!moved) {
          onSelectNode(node);
        }
      };

      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
    });

    const removeBtn = node.querySelector(".flow-node-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        onRemoveOutgoingConnections(node);
      });
    }

    node.addEventListener("dblclick", (event) => {
      if (event.target instanceof Element && event.target.closest(".flow-node-remove")) {
        return;
      }
      event.stopPropagation();
      onRemoveNode(node);
    });
  };

  const normalizeDropPayload = (raw) => {
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { taskId: raw, title: raw, tag: "Task", note: "" };
    }

    if (!payload || typeof payload !== "object") {
      payload = { title: String(payload || ""), tag: "Task", note: "" };
    }

    const rawId = normalizeToken(payload.taskId);
    const numericId = /^[0-9]+$/.test(rawId) ? Number.parseInt(rawId, 10) : null;
    if (Number.isFinite(numericId)) {
      payload.taskId = String(numericId);

      const task = Array.isArray(getTasks())
        ? getTasks().find((item) => Number(item?.id) === numericId)
        : null;
      if (task) {
        payload.title = task.title || payload.title;
        payload.tag = getFlowStatusLabel(task.statusValue) || payload.tag;
        payload.note = buildFlowNote(task);
      }
    }

    const taskKey = normalizeToken(payload.taskKey) || buildTaskKey(payload);
    payload.taskKey = taskKey;

    if (payload.taskId !== undefined && payload.taskId !== null && payload.taskId !== "") {
      payload.taskId = String(payload.taskId);
    } else {
      delete payload.taskId;
    }

    return payload;
  };

  const bindCanvasInteractions = () => {
    if (!flowCanvas) return;

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
      const taskKey = normalizeToken(payload.taskKey) || buildTaskKey(payload);

      const existing = Array.from(flowCanvas.querySelectorAll(".flow-node")).find(
        (node) => node.dataset.taskKey === taskKey
      );
      if (existing) {
        highlightDuplicateNode(existing);
        return;
      }

      const rect = flowCanvas.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      onCreateNode(payload, position);
    });

    flowCanvas.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".flow-node")) {
        return;
      }
      onClearSelection();
    });

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
