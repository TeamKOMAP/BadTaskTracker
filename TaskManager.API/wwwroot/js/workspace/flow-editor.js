import { createFlowLinksController } from "./flow-links.js";
import { createFlowSelectionController } from "./flow-select.js";
import { createFlowNodeElement } from "./flow-nodes.js";
import { createFlowDragController } from "./flow-drag.js";

export const createFlowEditorController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const flowDropzone = deps?.flowDropzone ?? null;
  const flowListItems = deps?.flowListItems ?? null;

  const onFlowTaskDragStart = typeof deps?.onFlowTaskDragStart === "function" ? deps.onFlowTaskDragStart : () => {};
  const onFlowTaskDragEnd = typeof deps?.onFlowTaskDragEnd === "function" ? deps.onFlowTaskDragEnd : () => {};

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
  const createFlowTaskItem = typeof deps?.createFlowTaskItem === "function" ? deps.createFlowTaskItem : () => null;

  const linksController = createFlowLinksController({
    flowCanvas,
    flowLinks: deps?.flowLinks ?? null
  });

  const selectionController = createFlowSelectionController({
    onConnect: linksController.connectFlowNodes
  });

  const updateFlowEmptyState = () => {
    if (!flowCanvas || !flowDropzone) return;
    const hasNodes = Boolean(flowCanvas.querySelector(".flow-node"));
    flowDropzone.classList.toggle("is-hidden", hasNodes);
  };

  const removeFlowNode = (node) => {
    if (!node) return;
    if (selectionController.isNodeSelected(node)) {
      selectionController.clearFlowSelection();
    }
    linksController.removeAllConnectionsForNode(node);
    node.remove();
    updateFlowEmptyState();
  };

  const dragController = createFlowDragController({
    flowCanvas,
    clampValue,
    normalizeToken,
    buildTaskKey,
    buildFlowNote,
    getFlowStatusLabel,
    getTasks,
    onCreateNode: (taskData, position) => createFlowNode(taskData, position),
    onUpdateFlowLines: linksController.updateFlowLines,
    onClearSelection: selectionController.clearFlowSelection,
    onSelectNode: selectionController.handleFlowNodeSelect,
    onRemoveOutgoingConnections: linksController.removeOutgoingConnectionsForNode,
    onRemoveNode: removeFlowNode
  });

  const createFlowNode = (taskData, position) => {
    if (!flowCanvas) return null;

    const payload = taskData && typeof taskData === "object" ? { ...taskData } : { title: "", tag: "Task", note: "" };
    payload.taskKey = normalizeToken(payload.taskKey) || buildTaskKey(payload);

    const node = createFlowNodeElement(payload);
    flowCanvas.appendChild(node);

    const adjustedLeft = Number(position?.x || 0) - node.offsetWidth / 2;
    const adjustedTop = Number(position?.y || 0) - node.offsetHeight / 2;
    const next = dragController.clampNodePosition(node, adjustedLeft, adjustedTop);
    node.style.left = `${next.left}px`;
    node.style.top = `${next.top}px`;

    dragController.initFlowNodeInteractions(node);
    updateFlowEmptyState();
    linksController.updateFlowLines();
    return node;
  };

  const initFlowTask = (task) => {
    if (!task) return;
    task.addEventListener("dragstart", (event) => {
      const payload = {
        title: task.dataset.taskTitle || task.textContent.trim(),
        tag: task.dataset.taskTag || "Task",
        note: task.dataset.taskDescription || task.dataset.taskNote || "",
        taskKey: task.dataset.taskKey || "",
        taskId: task.dataset.taskId || ""
      };

      if (!payload.taskKey) {
        payload.taskKey = buildTaskKey(payload);
        task.dataset.taskKey = payload.taskKey;
      }

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", JSON.stringify(payload));
        event.dataTransfer.setDragImage(task, 20, 20);
      }

      onFlowTaskDragStart(payload, event);
    });

    task.addEventListener("dragend", (event) => {
      onFlowTaskDragEnd(event);
    });
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
  };

  const bindCanvasInteractions = () => {
    dragController.bindCanvasInteractions();
  };

  return {
    updateFlowEmptyState,
    updateFlowLines: linksController.updateFlowLines,
    clearFlowSelection: selectionController.clearFlowSelection,
    createFlowNode,
    initFlowTask,
    rebuildFlowPool,
    bindCanvasInteractions
  };
};
