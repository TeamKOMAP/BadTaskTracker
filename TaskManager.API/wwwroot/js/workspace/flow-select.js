export const createFlowSelectionController = (deps) => {
  const flowCanvas = deps?.flowCanvas ?? null;
  const onConnect = typeof deps?.onConnect === "function" ? deps.onConnect : () => {};
  const onConnectModeStart = typeof deps?.onConnectModeStart === "function"
    ? deps.onConnectModeStart
    : () => {};
  const onConnectModeMove = typeof deps?.onConnectModeMove === "function"
    ? deps.onConnectModeMove
    : () => {};
  const onConnectModeEnd = typeof deps?.onConnectModeEnd === "function"
    ? deps.onConnectModeEnd
    : () => {};
  const onSelectionChange = typeof deps?.onSelectionChange === "function"
    ? deps.onSelectionChange
    : () => {};

  let selectedFlowNode = null;
  let connectFromNode = null;

  const setSelectedNode = (node) => {
    if (selectedFlowNode === node) return;

    if (selectedFlowNode) {
      selectedFlowNode.classList.remove("is-selected");
    }

    selectedFlowNode = node || null;

    if (selectedFlowNode) {
      selectedFlowNode.classList.add("is-selected");
    }

    onSelectionChange(selectedFlowNode);
  };

  const cancelConnectMode = () => {
    if (connectFromNode) {
      connectFromNode.classList.remove("is-connecting");
      connectFromNode = null;
      onConnectModeEnd();
    }
  };

  const clearFlowSelection = () => {
    cancelConnectMode();
    setSelectedNode(null);
  };

  const isNodeSelected = (node) => selectedFlowNode === node;

  const startConnectMode = (node) => {
    if (!(node instanceof Element)) return;

    if (connectFromNode === node) {
      cancelConnectMode();
      setSelectedNode(node);
      return;
    }

    cancelConnectMode();
    setSelectedNode(node);
    connectFromNode = node;
    connectFromNode.classList.add("is-connecting");
    onConnectModeStart(connectFromNode);
  };

  const handleFlowNodeSelect = (node) => {
    if (!(node instanceof Element)) return;

    if (connectFromNode) {
      if (connectFromNode !== node) {
        onConnect(connectFromNode, node);
      }
      cancelConnectMode();
      setSelectedNode(node);
      return;
    }

    if (selectedFlowNode === node) {
      setSelectedNode(null);
      return;
    }

    setSelectedNode(node);
  };

  document.addEventListener("pointermove", (event) => {
    if (!connectFromNode) return;
    onConnectModeMove({
      clientX: event.clientX,
      clientY: event.clientY
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!connectFromNode) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && flowCanvas?.contains(target)) {
      return;
    }
    clearFlowSelection();
  });

  return {
    clearFlowSelection,
    handleFlowNodeSelect,
    isNodeSelected,
    startConnectMode,
    cancelConnectMode,
    isConnectModeActive: () => Boolean(connectFromNode)
  };
};
