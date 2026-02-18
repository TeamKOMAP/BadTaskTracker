export const createFlowSelectionController = (deps) => {
  const onConnect = typeof deps?.onConnect === "function" ? deps.onConnect : () => {};

  let selectedFlowNode = null;

  const clearFlowSelection = () => {
    if (selectedFlowNode) {
      selectedFlowNode.classList.remove("is-selected");
    }
    selectedFlowNode = null;
  };

  const isNodeSelected = (node) => selectedFlowNode === node;

  const handleFlowNodeSelect = (node) => {
    if (!node) return;

    if (!selectedFlowNode) {
      selectedFlowNode = node;
      node.classList.add("is-selected");
      return;
    }

    if (selectedFlowNode === node) {
      clearFlowSelection();
      return;
    }

    onConnect(selectedFlowNode, node);
    clearFlowSelection();
  };

  return {
    clearFlowSelection,
    handleFlowNodeSelect,
    isNodeSelected
  };
};
