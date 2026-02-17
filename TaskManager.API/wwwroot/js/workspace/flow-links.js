export const createFlowLinksController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const flowLinks = deps?.flowLinks ?? null;
  const flowConnections = new Map();

  const updateFlowLines = () => {
    if (!flowCanvas || !flowLinks) return;
    const canvasRect = flowCanvas.getBoundingClientRect();

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

    for (const [key, line] of flowConnections.entries()) {
      const fromNode = flowCanvas.querySelector(`[data-node-id="${line.dataset.from}"]`);
      const toNode = flowCanvas.querySelector(`[data-node-id="${line.dataset.to}"]`);
      if (!fromNode || !toNode) {
        line.remove();
        flowConnections.delete(key);
        continue;
      }

      const fromRect = fromNode.getBoundingClientRect();
      const toRect = toNode.getBoundingClientRect();
      const fromCenter = {
        x: fromRect.left + fromRect.width / 2 - canvasRect.left,
        y: fromRect.top + fromRect.height / 2 - canvasRect.top
      };
      const toCenter = {
        x: toRect.left + toRect.width / 2 - canvasRect.left,
        y: toRect.top + toRect.height / 2 - canvasRect.top
      };

      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const start = getEdgePoint(
        fromCenter,
        { w: fromRect.width, h: fromRect.height },
        dx,
        dy,
        4
      );
      const end = getEdgePoint(
        toCenter,
        { w: toRect.width, h: toRect.height },
        -dx,
        -dy,
        8
      );

      line.setAttribute("x1", start.x);
      line.setAttribute("y1", start.y);
      line.setAttribute("x2", end.x);
      line.setAttribute("y2", end.y);
    }
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

  return {
    updateFlowLines,
    connectFlowNodes,
    removeOutgoingConnectionsForNode,
    removeAllConnectionsForNode
  };
};
