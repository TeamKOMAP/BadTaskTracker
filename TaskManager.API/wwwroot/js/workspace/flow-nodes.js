export const createFlowNodeElement = (taskData) => {
  const node = document.createElement("div");
  node.className = "flow-node";
  node.dataset.nodeId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  node.dataset.taskKey = taskData?.taskKey ? String(taskData.taskKey) : "";

  if (taskData?.taskId) {
    node.dataset.taskId = String(taskData.taskId);
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "flow-node-remove";
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", "Clear outgoing links");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");

  const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  iconPath.setAttribute("d", "M7 7l10 10M17 7L7 17");
  icon.appendChild(iconPath);
  removeBtn.appendChild(icon);

  const tag = document.createElement("span");
  tag.className = "flow-node-tag";
  tag.textContent = taskData?.tag ? String(taskData.tag) : "Task";

  const title = document.createElement("h4");
  title.className = "flow-node-title";
  title.textContent = taskData?.title ? String(taskData.title) : "New task";

  const note = document.createElement("p");
  note.className = "flow-node-note";
  note.textContent = taskData?.note ? String(taskData.note) : "";

  node.append(removeBtn, tag, title, note);
  return node;
};
