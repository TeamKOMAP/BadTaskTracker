import { createFlowLinksController } from "./flow-links.js";
import { createFlowSelectionController } from "./flow-select.js";
import { createFlowNodeElement, applyFlowNodeData, applyFlowNodeCustomColor } from "./flow-nodes.js";
import { createFlowDragController } from "./flow-drag.js";

export const createFlowEditorController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const flowLinks = deps?.flowLinks ?? null;
  const flowNodesLayer = deps?.flowNodesLayer ?? flowCanvas;
  const flowDropzone = deps?.flowDropzone ?? null;
  const flowListItems = deps?.flowListItems ?? null;

  const onFlowTaskDragStart = typeof deps?.onFlowTaskDragStart === "function" ? deps.onFlowTaskDragStart : () => {};
  const onFlowTaskDragEnd = typeof deps?.onFlowTaskDragEnd === "function" ? deps.onFlowTaskDragEnd : () => {};
  const onFlowTaskOpenDetails = typeof deps?.onFlowTaskOpenDetails === "function"
    ? deps.onFlowTaskOpenDetails
    : () => {};
  const getStoredFlowState = typeof deps?.getStoredFlowState === "function"
    ? deps.getStoredFlowState
    : () => null;
  const setStoredFlowState = typeof deps?.setStoredFlowState === "function"
    ? deps.setStoredFlowState
    : () => {};

  const clampValue = typeof deps?.clampValue === "function"
    ? deps.clampValue
    : (value, min, max) => Math.min(max, Math.max(min, value));
  const normalizeToken = typeof deps?.normalizeToken === "function"
    ? deps.normalizeToken
    : (value) => String(value ?? "").trim();
  const buildTaskKey = typeof deps?.buildTaskKey === "function" ? deps.buildTaskKey : () => "";
  const buildFlowNote = typeof deps?.buildFlowNote === "function" ? deps.buildFlowNote : () => "";
  const getFlowStatusLabel = typeof deps?.getFlowStatusLabel === "function" ? deps.getFlowStatusLabel : () => "Задача";
  const getTasks = typeof deps?.getTasks === "function" ? deps.getTasks : () => [];
  const createFlowTaskItem = typeof deps?.createFlowTaskItem === "function" ? deps.createFlowTaskItem : () => null;
  const buildFlowTaskPayloadFromTask = typeof deps?.buildFlowTaskPayloadFromTask === "function"
    ? deps.buildFlowTaskPayloadFromTask
    : (task) => {
      const title = task?.title ? String(task.title) : "Новая задача";
      const statusValue = Number.parseInt(String(task?.statusValue ?? task?.status ?? "1"), 10);
      const normalizedStatus = Number.isFinite(statusValue) ? clampValue(statusValue, 1, 4) : 1;
      const note = buildFlowNote(task);
      const taskId = Number.parseInt(String(task?.id ?? ""), 10);
      return {
        title,
        tag: getFlowStatusLabel(normalizedStatus),
        note,
        detailNote: note,
        description: task?.description ? String(task.description) : "",
        statusValue: normalizedStatus,
        taskId: Number.isFinite(taskId) && taskId > 0 ? String(taskId) : "",
        taskKey: Number.isFinite(taskId) && taskId > 0 ? `task:${taskId}` : buildTaskKey({ title, tag: getFlowStatusLabel(normalizedStatus), note }),
        dueDate: task?.dueDate ? String(task.dueDate) : "",
        taskPhoto: ""
      };
    };

  let flowScale = 1;
  let flowOffsetX = 0;
  let flowOffsetY = 0;
  let activeNodeMenu = null;
  let flowStatePersistTimer = null;
  let flowStateRestoreAttempted = false;
  let isFlowStateRestoring = false;
  let flowPersistenceBound = false;

  const getFlowScale = () => flowScale;
  const getFlowOffset = () => ({ x: flowOffsetX, y: flowOffsetY });

  const readNodePosition = (node) => {
    const leftStyle = Number.parseFloat(node.style.left);
    const topStyle = Number.parseFloat(node.style.top);
    return {
      left: Number.isFinite(leftStyle) ? leftStyle : node.offsetLeft,
      top: Number.isFinite(topStyle) ? topStyle : node.offsetTop,
      width: node.offsetWidth,
      height: node.offsetHeight
    };
  };

  const getFlowPanBounds = (scaleValue = flowScale) => {
    if (!flowCanvas) {
      return {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0
      };
    }

    const scale = Number.isFinite(Number(scaleValue)) && Number(scaleValue) > 0
      ? Number(scaleValue)
      : 1;
    const viewportWidth = flowCanvas.clientWidth;
    const viewportHeight = flowCanvas.clientHeight;
    const minSceneWidth = Math.max(viewportWidth / scale, 2800);
    const minSceneHeight = Math.max(viewportHeight / scale, 2000);
    const panPadding = Math.max(220, Math.round(Math.min(viewportWidth, viewportHeight) * 0.35));
    const baseLeft = -Math.round(minSceneWidth * 0.32);
    const baseTop = -Math.round(minSceneHeight * 0.28);

    let contentLeft = baseLeft;
    let contentTop = baseTop;
    let contentRight = baseLeft + minSceneWidth;
    let contentBottom = baseTop + minSceneHeight;

    const nodes = Array.from(flowNodesLayer?.querySelectorAll(".flow-node") || []);
    if (nodes.length) {
      let nodeLeft = Number.POSITIVE_INFINITY;
      let nodeTop = Number.POSITIVE_INFINITY;
      let nodeRight = Number.NEGATIVE_INFINITY;
      let nodeBottom = Number.NEGATIVE_INFINITY;

      nodes.forEach((node) => {
        const box = readNodePosition(node);
        nodeLeft = Math.min(nodeLeft, box.left);
        nodeTop = Math.min(nodeTop, box.top);
        nodeRight = Math.max(nodeRight, box.left + box.width);
        nodeBottom = Math.max(nodeBottom, box.top + box.height);
      });

      contentLeft = Math.min(contentLeft, nodeLeft - panPadding);
      contentTop = Math.min(contentTop, nodeTop - panPadding);
      contentRight = Math.max(contentRight, nodeRight + panPadding);
      contentBottom = Math.max(contentBottom, nodeBottom + panPadding);
    }

    contentRight = Math.max(contentRight, contentLeft + minSceneWidth);
    contentBottom = Math.max(contentBottom, contentTop + minSceneHeight);

    let minX = viewportWidth - contentRight * scale;
    let maxX = -contentLeft * scale;
    let minY = viewportHeight - contentBottom * scale;
    let maxY = -contentTop * scale;

    if (minX > maxX) {
      const centerX = (minX + maxX) / 2;
      minX = centerX;
      maxX = centerX;
    }

    if (minY > maxY) {
      const centerY = (minY + maxY) / 2;
      minY = centerY;
      maxY = centerY;
    }

    return {
      minX,
      maxX,
      minY,
      maxY
    };
  };

  const clampFlowOffset = (x, y, scaleValue = flowScale) => {
    const bounds = getFlowPanBounds(scaleValue);
    return {
      x: clampValue(x, bounds.minX, bounds.maxX),
      y: clampValue(y, bounds.minY, bounds.maxY)
    };
  };

  const normalizeNodeId = (value) => String(value || "").trim().slice(0, 120);

  const buildFlowStateSnapshot = () => {
    const nodes = Array.from(flowNodesLayer?.querySelectorAll(".flow-node") || [])
      .map((node) => {
        const nodeId = normalizeNodeId(node.dataset.nodeId);
        if (!nodeId) {
          return null;
        }

        const taskIdParsed = Number.parseInt(String(node.dataset.taskId ?? ""), 10);
        const leftStyle = Number.parseFloat(node.style.left);
        const topStyle = Number.parseFloat(node.style.top);
        const left = Number.isFinite(leftStyle) ? leftStyle : node.offsetLeft;
        const top = Number.isFinite(topStyle) ? topStyle : node.offsetTop;

        return {
          nodeId,
          taskId: Number.isFinite(taskIdParsed) && taskIdParsed > 0 ? taskIdParsed : null,
          taskKey: normalizeToken(node.dataset.taskKey),
          left,
          top,
          customColor: normalizeToken(node.dataset.customColor)
        };
      })
      .filter(Boolean);

    const validNodeIds = new Set(nodes.map((node) => node.nodeId));
    const seen = new Set();
    const connections = Array.from(flowLinks?.querySelectorAll(".flow-line[data-from][data-to]") || [])
      .filter((line) => !line.classList.contains("is-preview"))
      .map((line) => {
        const from = normalizeNodeId(line.dataset.from);
        const to = normalizeNodeId(line.dataset.to);
        if (!from || !to || from === to) {
          return null;
        }
        if (!validNodeIds.has(from) || !validNodeIds.has(to)) {
          return null;
        }
        const key = `${from}=>${to}`;
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);
        return { from, to };
      })
      .filter(Boolean);

    return {
      nodes,
      connections,
      viewport: {
        scale: flowScale,
        offsetX: flowOffsetX,
        offsetY: flowOffsetY
      }
    };
  };

  const persistFlowStateNow = () => {
    if (isFlowStateRestoring) {
      return;
    }
    setStoredFlowState(buildFlowStateSnapshot());
  };

  const scheduleFlowStatePersist = () => {
    if (isFlowStateRestoring) {
      return;
    }
    if (flowStatePersistTimer) {
      window.clearTimeout(flowStatePersistTimer);
    }
    flowStatePersistTimer = window.setTimeout(() => {
      flowStatePersistTimer = null;
      persistFlowStateNow();
    }, 180);
  };

  const applyFlowTransformVars = () => {
    if (!flowCanvas) return;
    flowCanvas.style.setProperty("--flow-scale", `${flowScale}`);
    flowCanvas.style.setProperty("--flow-offset-x", `${flowOffsetX}px`);
    flowCanvas.style.setProperty("--flow-offset-y", `${flowOffsetY}px`);
    flowCanvas.style.setProperty("--flow-grid-offset-x", `${flowOffsetX}px`);
    flowCanvas.style.setProperty("--flow-grid-offset-y", `${flowOffsetY}px`);
  };

  const setFlowOffset = (nextX, nextY, options = null) => {
    const x = Number(nextX);
    const y = Number(nextY);
    const normalizedX = Number.isFinite(x) ? x : flowOffsetX;
    const normalizedY = Number.isFinite(y) ? y : flowOffsetY;
    const shouldPersist = options?.persist !== false;
    const clamped = clampFlowOffset(normalizedX, normalizedY, flowScale);

    if (Math.abs(clamped.x - flowOffsetX) < 0.01
      && Math.abs(clamped.y - flowOffsetY) < 0.01) {
      return false;
    }

    flowOffsetX = clamped.x;
    flowOffsetY = clamped.y;
    applyFlowTransformVars();
    linksController.updateFlowLines();
    if (shouldPersist) {
      scheduleFlowStatePersist();
    }
    return true;
  };

  const setFlowScale = (nextScale, options = null) => {
    const prevScale = flowScale;
    const parsed = Number(nextScale);
    const normalized = Number.isFinite(parsed) ? clampValue(parsed, 0.3, 1.8) : 1;
    const hasScaleChange = Math.abs(normalized - flowScale) >= 0.0001;
    const shouldPersist = options?.persist !== false;
    if (!hasScaleChange) {
      return false;
    }

    const anchorX = Number(options?.clientX);
    const anchorY = Number(options?.clientY);
    const canAnchor = flowCanvas && Number.isFinite(anchorX) && Number.isFinite(anchorY);
    let scenePointX = 0;
    let scenePointY = 0;

    if (canAnchor) {
      const rect = flowCanvas.getBoundingClientRect();
      scenePointX = (anchorX - rect.left - flowOffsetX) / prevScale;
      scenePointY = (anchorY - rect.top - flowOffsetY) / prevScale;
    }

    flowScale = normalized;

    if (canAnchor) {
      const rect = flowCanvas.getBoundingClientRect();
      flowOffsetX = anchorX - rect.left - scenePointX * flowScale;
      flowOffsetY = anchorY - rect.top - scenePointY * flowScale;
    }

    const clamped = clampFlowOffset(flowOffsetX, flowOffsetY, flowScale);
    flowOffsetX = clamped.x;
    flowOffsetY = clamped.y;

    applyFlowTransformVars();
    linksController.updateFlowLines();
    if (shouldPersist) {
      scheduleFlowStatePersist();
    }
    return true;
  };

  const ensureFlowOffsetWithinBounds = (persist = false) => {
    setFlowOffset(flowOffsetX, flowOffsetY, {
      persist
    });
  };

  const linksController = createFlowLinksController({
    flowCanvas,
    flowLinks: deps?.flowLinks ?? null,
    flowNodesLayer,
    getFlowScale,
    getFlowOffset
  });

  const selectionController = createFlowSelectionController({
    flowCanvas,
    onConnect: (fromNode, toNode) => {
      linksController.connectFlowNodes(fromNode, toNode);
      scheduleFlowStatePersist();
    },
    onConnectModeStart: (node) => {
      linksController.startPreviewConnection(node);
    },
    onConnectModeMove: (point) => {
      const next = linksController.toCanvasPointFromClient(point.clientX, point.clientY);
      linksController.updatePreviewConnection(next);
    },
    onConnectModeEnd: () => {
      linksController.stopPreviewConnection();
    }
  });

  const closeNodeMenu = () => {
    if (!(activeNodeMenu instanceof Element)) {
      activeNodeMenu = null;
      return;
    }
    activeNodeMenu.classList.remove("is-menu-open");
    const menu = activeNodeMenu.querySelector(".flow-node-menu");
    if (menu) {
      menu.setAttribute("hidden", "");
    }
    activeNodeMenu = null;
  };

  const openNodeMenu = (node) => {
    if (!(node instanceof Element)) return;
    if (activeNodeMenu === node) {
      closeNodeMenu();
      return;
    }

    closeNodeMenu();
    const menu = node.querySelector(".flow-node-menu");
    if (!menu) return;

    node.classList.add("is-menu-open");
    menu.removeAttribute("hidden");
    activeNodeMenu = node;
    selectionController.handleFlowNodeSelect(node);
  };

  const openTaskDetailsForNode = (node) => {
    const taskId = Number.parseInt(String(node?.dataset?.taskId ?? ""), 10);
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    onFlowTaskOpenDetails(taskId, node);
  };

  const updateFlowEmptyState = () => {
    if (!flowDropzone) return;
    const hasNodes = Boolean(flowNodesLayer?.querySelector(".flow-node"));
    flowDropzone.classList.toggle("is-hidden", hasNodes);
  };

  const removeFlowNode = (node, options = null) => {
    if (!node) return;
    const shouldPersist = options?.persist !== false;

    if (selectionController.isNodeSelected(node)) {
      selectionController.clearFlowSelection();
    }
    if (activeNodeMenu === node) {
      closeNodeMenu();
    }
    linksController.removeAllConnectionsForNode(node);
    node.remove();
    updateFlowEmptyState();
    ensureFlowOffsetWithinBounds(shouldPersist);
    linksController.updateFlowLines();
    if (shouldPersist) {
      scheduleFlowStatePersist();
    }
  };

  const clearFlowBoard = (options = null) => {
    const shouldPersist = options?.persist !== false;
    closeNodeMenu();
    selectionController.clearFlowSelection();
    flowNodesLayer?.querySelectorAll(".flow-node").forEach((node) => node.remove());
    linksController.clearAllConnections();
    updateFlowEmptyState();
    ensureFlowOffsetWithinBounds(shouldPersist);
    if (shouldPersist) {
      scheduleFlowStatePersist();
    }
  };

  const clearFlowLinks = (options = null) => {
    const shouldPersist = options?.persist !== false;
    selectionController.cancelConnectMode();
    linksController.clearAllConnections();
    linksController.updateFlowLines();
    if (shouldPersist) {
      scheduleFlowStatePersist();
    }
  };

  const dragController = createFlowDragController({
    flowCanvas,
    clampValue,
    normalizeToken,
    buildTaskKey,
    getFlowStatusLabel,
    getTasks,
    buildFlowTaskPayloadFromTask,
    getFlowScale,
    getFlowOffset,
    setFlowScale,
    setFlowOffset,
    onCreateNode: (taskData, position) => createFlowNode(taskData, position),
    onUpdateFlowLines: linksController.updateFlowLines,
    onFlowStateChanged: scheduleFlowStatePersist,
    onClearSelection: selectionController.clearFlowSelection,
    onSelectNode: selectionController.handleFlowNodeSelect,
    onStartConnectMode: selectionController.startConnectMode,
    onClearOutgoingConnections: (node) => {
      linksController.removeOutgoingConnectionsForNode(node);
      scheduleFlowStatePersist();
    },
    onToggleNodeMenu: openNodeMenu,
    onCloseNodeMenu: closeNodeMenu,
    onOpenNodeTask: openTaskDetailsForNode,
    onRemoveNodeFromMap: removeFlowNode,
    onSetNodeColor: (node, color) => {
      applyFlowNodeCustomColor(node, color);
      linksController.updateFlowLines();
      scheduleFlowStatePersist();
    }
  });

  const createFlowNode = (taskData, position, options = null) => {
    if (!flowCanvas || !flowNodesLayer) return null;
    const shouldPersist = options?.persist !== false;

    const payload = taskData && typeof taskData === "object"
      ? { ...taskData }
      : {
        title: "",
        tag: "Задача",
        note: "",
        detailNote: "",
        description: "",
        statusValue: 1
      };
    payload.taskKey = normalizeToken(payload.taskKey) || buildTaskKey(payload);

    const node = createFlowNodeElement(payload);
    const requestedNodeId = normalizeNodeId(options?.nodeId || payload.nodeId);
    if (requestedNodeId) {
      node.dataset.nodeId = requestedNodeId;
    }

    flowNodesLayer.appendChild(node);

    const exactLeft = Number(options?.left);
    const exactTop = Number(options?.top);
    const hasExactPosition = Number.isFinite(exactLeft) && Number.isFinite(exactTop);
    const adjustedLeft = Number(position?.x || 0) - node.offsetWidth / 2;
    const adjustedTop = Number(position?.y || 0) - node.offsetHeight / 2;
    const next = hasExactPosition
      ? dragController.clampNodePosition(node, exactLeft, exactTop)
      : dragController.clampNodePosition(node, adjustedLeft, adjustedTop);
    node.style.left = `${next.left}px`;
    node.style.top = `${next.top}px`;

    dragController.initFlowNodeInteractions(node);
    updateFlowEmptyState();
    linksController.updateFlowLines();
    if (shouldPersist) {
      scheduleFlowStatePersist();
    }
    return node;
  };

  const initFlowTask = (task) => {
    if (!(task instanceof Element)) return;
    if (task.dataset.flowInit === "1") return;
    task.dataset.flowInit = "1";

    task.addEventListener("dragstart", (event) => {
      const payload = {
        source: "flow-task",
        title: task.dataset.taskTitle || task.textContent.trim(),
        tag: task.dataset.taskTag || "Задача",
        note: task.dataset.taskDescription || task.dataset.taskNote || "",
        detailNote: task.dataset.taskDetailNote || task.dataset.taskDescription || task.dataset.taskNote || "",
        description: task.dataset.taskDescription || "",
        dueDate: task.dataset.taskDueDate || "",
        statusValue: task.dataset.taskStatus || "1",
        taskKey: task.dataset.taskKey || "",
        taskId: task.dataset.taskId || ""
      };

      if (!payload.taskKey) {
        payload.taskKey = buildTaskKey(payload);
        task.dataset.taskKey = payload.taskKey;
      }

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData("text/plain", JSON.stringify(payload));
        event.dataTransfer.setDragImage(task, 20, 20);
      }

      onFlowTaskDragStart(payload, event);
    });

    task.addEventListener("dragend", (event) => {
      onFlowTaskDragEnd(event);
    });

    task.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const taskId = Number.parseInt(String(task.dataset.taskId ?? ""), 10);
      if (!Number.isFinite(taskId) || taskId <= 0) return;
      onFlowTaskOpenDetails(taskId, task);
    });
  };

  const updateNodeFromTaskData = (node, taskData) => {
    if (!(node instanceof Element) || !taskData) return;
    const customColor = normalizeToken(node.dataset.customColor);
    const payload = buildFlowTaskPayloadFromTask(taskData);
    applyFlowNodeData(node, payload);
    if (customColor) {
      applyFlowNodeCustomColor(node, customColor);
    }
  };

  const updateFlowNodesForTask = (taskData) => {
    const taskId = Number.parseInt(String(taskData?.id ?? taskData?.taskId ?? ""), 10);
    if (!Number.isFinite(taskId) || taskId <= 0) return;

    const nodes = Array.from(flowNodesLayer?.querySelectorAll(`.flow-node[data-task-id="${taskId}"]`) || []);
    if (!nodes.length) return;

    nodes.forEach((node) => updateNodeFromTaskData(node, taskData));
    linksController.updateFlowLines();
  };

  const removeFlowNodesByTaskId = (taskId) => {
    const normalizedId = Number.parseInt(String(taskId ?? ""), 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    const nodes = Array.from(flowNodesLayer?.querySelectorAll(`.flow-node[data-task-id="${normalizedId}"]`) || []);
    nodes.forEach((node) => removeFlowNode(node));
    updateFlowEmptyState();
  };

  const syncFlowNodesWithTasks = (tasks = null) => {
    const source = Array.isArray(tasks) ? tasks : getTasks();
    const list = Array.isArray(source) ? source : [];
    const taskById = new Map();

    list.forEach((task) => {
      const id = Number.parseInt(String(task?.id ?? ""), 10);
      if (!Number.isFinite(id) || id <= 0) return;
      taskById.set(id, task);
    });

    const nodes = Array.from(flowNodesLayer?.querySelectorAll(".flow-node") || []);
    nodes.forEach((node) => {
      const id = Number.parseInt(String(node.dataset.taskId ?? ""), 10);
      if (!Number.isFinite(id) || id <= 0) return;

      const taskData = taskById.get(id);
      if (!taskData) {
        removeFlowNode(node);
        return;
      }

      updateNodeFromTaskData(node, taskData);
    });

    updateFlowEmptyState();
    ensureFlowOffsetWithinBounds(false);
    linksController.updateFlowLines();
  };

  const applyTaskPhoto = (taskId, dataUrl) => {
    const normalizedId = Number.parseInt(String(taskId ?? ""), 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    const photo = typeof dataUrl === "string" ? dataUrl : "";

    const listItems = Array.from(flowListItems?.querySelectorAll(`.flow-task[data-task-id="${normalizedId}"]`) || []);
    listItems.forEach((item) => {
      if (!photo) {
        item.classList.remove("has-photo");
        item.style.removeProperty("--task-photo");
        delete item.dataset.taskPhoto;
        return;
      }
      item.classList.add("has-photo");
      item.dataset.taskPhoto = photo;
      item.style.setProperty("--task-photo", `url('${photo.replace(/'/g, "%27")}')`);
    });

    const nodes = Array.from(flowNodesLayer?.querySelectorAll(`.flow-node[data-task-id="${normalizedId}"]`) || []);
    nodes.forEach((node) => {
      if (!photo) {
        node.classList.remove("has-photo");
        node.style.removeProperty("--task-photo");
        delete node.dataset.taskPhoto;
        return;
      }
      node.classList.add("has-photo");
      node.dataset.taskPhoto = photo;
      node.style.setProperty("--task-photo", `url('${photo.replace(/'/g, "%27")}')`);
    });
  };

  const restoreFlowStateFromStorage = () => {
    if (flowStateRestoreAttempted) {
      return;
    }
    flowStateRestoreAttempted = true;

    const state = getStoredFlowState();
    if (!state || typeof state !== "object") {
      return;
    }

    const source = Array.isArray(getTasks()) ? getTasks() : [];
    const taskById = new Map();
    source.forEach((task) => {
      const id = Number.parseInt(String(task?.id ?? ""), 10);
      if (!Number.isFinite(id) || id <= 0) return;
      taskById.set(id, task);
    });

    const viewport = state.viewport && typeof state.viewport === "object" ? state.viewport : null;

    isFlowStateRestoring = true;
    try {
      flowNodesLayer?.querySelectorAll(".flow-node").forEach((node) => node.remove());
      linksController.clearAllConnections();

      const createdByNodeId = new Map();
      const usedTaskIds = new Set();
      const nodes = Array.isArray(state.nodes) ? state.nodes : [];
      nodes.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;

        const taskId = Number.parseInt(String(entry.taskId ?? ""), 10);
        if (!Number.isFinite(taskId) || taskId <= 0) return;
        if (usedTaskIds.has(taskId)) return;

        const task = taskById.get(taskId);
        if (!task) return;

        const nodeId = normalizeNodeId(entry.nodeId);
        if (!nodeId || createdByNodeId.has(nodeId)) return;

        const payload = buildFlowTaskPayloadFromTask(task);
        payload.taskKey = normalizeToken(entry.taskKey) || payload.taskKey;

        const node = createFlowNode(payload, null, {
          nodeId,
          left: Number(entry.left),
          top: Number(entry.top),
          persist: false
        });
        if (!(node instanceof Element)) return;

        const customColor = normalizeToken(entry.customColor);
        if (customColor) {
          applyFlowNodeCustomColor(node, customColor);
        }

        usedTaskIds.add(taskId);
        createdByNodeId.set(nodeId, node);
      });

      const connections = Array.isArray(state.connections) ? state.connections : [];
      connections.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const fromId = normalizeNodeId(entry.from);
        const toId = normalizeNodeId(entry.to);
        if (!fromId || !toId || fromId === toId) return;

        const fromNode = createdByNodeId.get(fromId);
        const toNode = createdByNodeId.get(toId);
        if (!(fromNode instanceof Element) || !(toNode instanceof Element)) return;

        linksController.connectFlowNodes(fromNode, toNode);
      });

      if (viewport) {
        setFlowScale(viewport.scale, { persist: false });
        setFlowOffset(viewport.offsetX, viewport.offsetY, { persist: false });
      } else {
        ensureFlowOffsetWithinBounds(false);
      }
    } finally {
      isFlowStateRestoring = false;
    }

    updateFlowEmptyState();
    linksController.updateFlowLines();
  };

  const rebuildFlowPool = (tasks) => {
    if (!flowListItems) return;
    flowListItems.querySelectorAll(".flow-task").forEach((item) => item.remove());

    (Array.isArray(tasks) ? tasks : []).forEach((taskData) => {
      const flowItem = createFlowTaskItem(taskData);
      if (!(flowItem instanceof Element)) return;
      flowListItems.appendChild(flowItem);
      initFlowTask(flowItem);
    });

    restoreFlowStateFromStorage();

    syncFlowNodesWithTasks(getTasks());
  };

  const bindCanvasInteractions = () => {
    applyFlowTransformVars();
    dragController.bindCanvasInteractions();

    if (!flowPersistenceBound) {
      flowPersistenceBound = true;
      window.addEventListener("beforeunload", () => {
        if (flowStatePersistTimer) {
          window.clearTimeout(flowStatePersistTimer);
          flowStatePersistTimer = null;
        }
        persistFlowStateNow();
      });
    }

    document.addEventListener("click", (event) => {
      if (!(activeNodeMenu instanceof Element)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && activeNodeMenu.contains(target)) {
        return;
      }
      closeNodeMenu();
    });
  };

  return {
    updateFlowEmptyState,
    updateFlowLines: linksController.updateFlowLines,
    clearFlowSelection: selectionController.clearFlowSelection,
    clearFlowLinks,
    clearFlowBoard,
    createFlowNode,
    initFlowTask,
    syncFlowNodesWithTasks,
    updateFlowNodesForTask,
    removeFlowNodesByTaskId,
    applyTaskPhoto,
    rebuildFlowPool,
    bindCanvasInteractions
  };
};
