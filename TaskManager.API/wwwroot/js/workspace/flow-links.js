export const createFlowLinksController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const flowLinks = deps?.flowLinks ?? null;
  const flowNodesLayer = deps?.flowNodesLayer ?? flowCanvas;
  const getFlowScale = typeof deps?.getFlowScale === "function" ? deps.getFlowScale : () => 1;
  const getFlowOffset = typeof deps?.getFlowOffset === "function"
    ? deps.getFlowOffset
    : () => ({ x: 0, y: 0 });
  const flowConnections = new Map();
  let previewLine = null;
  let previewFromNode = null;
  let previewToPoint = null;

  const findNodeById = (nodeId) => {
    if (!nodeId) return null;
    const selector = `[data-node-id="${nodeId}"]`;
    return flowNodesLayer?.querySelector(selector) || flowCanvas?.querySelector(selector) || null;
  };

  const getNodeCenter = (node) => {
    if (!(node instanceof Element)) {
      return { x: 0, y: 0 };
    }
    return {
      x: node.offsetLeft + node.offsetWidth / 2,
      y: node.offsetTop + node.offsetHeight / 2
    };
  };

  const getEdgePoint = (center, size, dx, dy, padding) => {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 0.001 && absDy < 0.001) {
      return { x: center.x, y: center.y };
    }

    let t = 0;
    if (absDx === 0) {
      t = (size.h / 2) / absDy;
    } else if (absDy === 0) {
      t = (size.w / 2) / absDx;
    } else {
      t = Math.min((size.w / 2) / absDx, (size.h / 2) / absDy);
    }

    const length = Math.hypot(dx, dy);
    const nx = dx / length;
    const ny = dy / length;
    return {
      x: center.x + dx * t + nx * padding,
      y: center.y + dy * t + ny * padding
    };
  };

  const setLineBetweenPoints = (line, fromCenter, toCenter, fromSize, toSize) => {
    if (!(line instanceof Element)) return;

    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    const start = getEdgePoint(fromCenter, fromSize, dx, dy, 4);
    const end = getEdgePoint(toCenter, toSize, -dx, -dy, 8);

    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
  };

  const removePreviewLine = () => {
    if (previewLine) {
      previewLine.remove();
      previewLine = null;
    }
  };

  const ensurePreviewLine = () => {
    if (!flowLinks) return null;
    if (previewLine instanceof SVGLineElement) {
      return previewLine;
    }
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.classList.add("flow-line", "is-preview");
    flowLinks.appendChild(line);
    previewLine = line;
    return previewLine;
  };

  const updatePreviewLine = () => {
    if (!(previewLine instanceof SVGLineElement)) return;
    if (!(previewFromNode instanceof Element) || !previewToPoint) {
      removePreviewLine();
      return;
    }

    const fromCenter = getNodeCenter(previewFromNode);
    const fromSize = {
      w: previewFromNode.offsetWidth,
      h: previewFromNode.offsetHeight
    };
    const toSize = { w: 0, h: 0 };

    setLineBetweenPoints(previewLine, fromCenter, previewToPoint, fromSize, toSize);
  };

  const updateFlowLines = () => {
    if (!flowCanvas || !flowLinks) return;

    for (const [key, line] of flowConnections.entries()) {
      const fromNode = findNodeById(line.dataset.from);
      const toNode = findNodeById(line.dataset.to);
      if (!fromNode || !toNode) {
        line.remove();
        flowConnections.delete(key);
        continue;
      }

      const fromCenter = getNodeCenter(fromNode);
      const toCenter = getNodeCenter(toNode);
      setLineBetweenPoints(
        line,
        fromCenter,
        toCenter,
        { w: fromNode.offsetWidth, h: fromNode.offsetHeight },
        { w: toNode.offsetWidth, h: toNode.offsetHeight }
      );
    }

    updatePreviewLine();
  };

  const connectFlowNodes = (fromNode, toNode) => {
    if (!flowLinks) return;

    const fromId = fromNode?.dataset?.nodeId;
    const toId = toNode?.dataset?.nodeId;
    if (!fromId || !toId || fromId === toId) return;

    const key = `${fromId}=>${toId}`;
    if (flowConnections.has(key)) return;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.classList.add("flow-line");
    line.dataset.from = fromId;
    line.dataset.to = toId;
    flowLinks.appendChild(line);
    flowConnections.set(key, line);
    updateFlowLines();
  };

  const toCanvasPointFromClient = (clientX, clientY) => {
    if (!flowCanvas) {
      return { x: Number(clientX) || 0, y: Number(clientY) || 0 };
    }
    const rect = flowCanvas.getBoundingClientRect();
    const scale = Math.max(0.2, Number(getFlowScale()) || 1);
    const offset = getFlowOffset() || {};
    const offsetX = Number(offset.x) || 0;
    const offsetY = Number(offset.y) || 0;
    return {
      x: (Number(clientX) - rect.left - offsetX) / scale,
      y: (Number(clientY) - rect.top - offsetY) / scale
    };
  };

  const startPreviewConnection = (fromNode) => {
    if (!(fromNode instanceof Element)) return;
    previewFromNode = fromNode;
    previewToPoint = getNodeCenter(fromNode);
    ensurePreviewLine();
    updatePreviewLine();
  };

  const updatePreviewConnection = (point) => {
    if (!(previewFromNode instanceof Element)) return;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    previewToPoint = { x, y };
    ensurePreviewLine();
    updatePreviewLine();
  };

  const stopPreviewConnection = () => {
    previewFromNode = null;
    previewToPoint = null;
    removePreviewLine();
  };

  const removeOutgoingConnectionsForNode = (node) => {
    const nodeId = node?.dataset?.nodeId;
    if (!nodeId) return;

    const keysToRemove = [];
    for (const [key, line] of flowConnections.entries()) {
      if (line.dataset.from === nodeId) {
        line.remove();
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => flowConnections.delete(key));
    updateFlowLines();
  };

  const removeAllConnectionsForNode = (node) => {
    const nodeId = node?.dataset?.nodeId;
    if (!nodeId) return;

    if (previewFromNode === node) {
      stopPreviewConnection();
    }

    const keysToRemove = [];
    for (const [key, line] of flowConnections.entries()) {
      if (line.dataset.from === nodeId || line.dataset.to === nodeId) {
        line.remove();
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => flowConnections.delete(key));
    updateFlowLines();
  };

  const clearAllConnections = () => {
    for (const [, line] of flowConnections.entries()) {
      line.remove();
    }
    flowConnections.clear();
    stopPreviewConnection();
    updateFlowLines();
  };

  return {
    updateFlowLines,
    connectFlowNodes,
    toCanvasPointFromClient,
    startPreviewConnection,
    updatePreviewConnection,
    stopPreviewConnection,
    removeOutgoingConnectionsForNode,
    removeAllConnectionsForNode,
    clearAllConnections
  };
};
