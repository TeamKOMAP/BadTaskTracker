const STATUS_COLOR_BY_VALUE = {
  1: "#78b6ff",
  2: "#f0c36a",
  3: "#4ade80",
  4: "#f87171"
};

const normalizeHexColor = (value) => {
  const token = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(token)) {
    return token.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(token)) {
    const short = token.slice(1).toLowerCase();
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`;
  }
  return "";
};

const hexToRgb = (hex) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const value = Number.parseInt(normalized.slice(1), 16);
  if (!Number.isFinite(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const setTaskPhoto = (node, photoUrl) => {
  if (!(node instanceof Element)) return;
  const hasPhoto = typeof photoUrl === "string" && photoUrl.trim().length > 0;
  if (!hasPhoto) {
    node.classList.remove("has-photo");
    node.style.removeProperty("--task-photo");
    delete node.dataset.taskPhoto;
    return;
  }

  const safe = photoUrl.replace(/'/g, "%27");
  node.classList.add("has-photo");
  node.style.setProperty("--task-photo", `url('${safe}')`);
  node.dataset.taskPhoto = photoUrl;
};

const getStatusColor = (statusValue) => {
  const parsed = Number.parseInt(String(statusValue ?? ""), 10);
  return STATUS_COLOR_BY_VALUE[parsed] || STATUS_COLOR_BY_VALUE[1];
};

const syncNodeColorInput = (node) => {
  if (!(node instanceof Element)) return;
  const input = node.querySelector(".flow-node-color-input");
  if (!(input instanceof HTMLInputElement)) return;
  const custom = normalizeHexColor(node.dataset.customColor);
  const fallback = getStatusColor(node.dataset.taskStatus);
  input.value = custom || fallback;
};

export const applyFlowNodeCustomColor = (node, color) => {
  if (!(node instanceof Element)) return;

  const normalized = normalizeHexColor(color);
  if (!normalized) {
    node.classList.remove("has-custom-color");
    delete node.dataset.customColor;
    node.style.removeProperty("--flow-node-custom-color");
    node.style.removeProperty("--flow-node-custom-color-rgb");
    syncNodeColorInput(node);
    return;
  }

  const rgb = hexToRgb(normalized);
  node.classList.add("has-custom-color");
  node.dataset.customColor = normalized;
  node.style.setProperty("--flow-node-custom-color", normalized);
  if (rgb) {
    node.style.setProperty("--flow-node-custom-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }
  syncNodeColorInput(node);
};

export const applyFlowNodeData = (node, taskData) => {
  if (!(node instanceof Element)) return;

  const payload = taskData && typeof taskData === "object" ? taskData : {};
  const statusValue = Number.parseInt(String(payload.statusValue ?? "1"), 10);
  const normalizedStatus = Number.isFinite(statusValue) ? Math.min(4, Math.max(1, statusValue)) : 1;

  node.dataset.taskKey = payload.taskKey ? String(payload.taskKey) : "";
  node.dataset.taskStatus = String(normalizedStatus);
  node.dataset.taskTitle = payload.title ? String(payload.title) : "Новая задача";
  node.dataset.taskDescription = payload.description ? String(payload.description) : "";
  node.dataset.taskDueDate = payload.dueDate ? String(payload.dueDate) : "";

  if (payload.taskId !== undefined && payload.taskId !== null && `${payload.taskId}`.trim()) {
    node.dataset.taskId = String(payload.taskId);
  } else {
    delete node.dataset.taskId;
  }

  const tag = node.querySelector(".flow-node-tag");
  if (tag) {
    tag.textContent = payload.tag ? String(payload.tag) : "Задача";
  }

  const title = node.querySelector(".flow-node-title");
  if (title) {
    title.textContent = payload.title ? String(payload.title) : "Новая задача";
  }

  const note = node.querySelector(".flow-node-note");
  if (note) {
    note.textContent = payload.detailNote ? String(payload.detailNote) : (payload.note ? String(payload.note) : "");
  }

  setTaskPhoto(node, payload.taskPhoto ? String(payload.taskPhoto) : "");
  syncNodeColorInput(node);
};

export const createFlowNodeElement = (taskData) => {
  const node = document.createElement("div");
  node.className = "flow-node";
  node.dataset.nodeId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const removeBtn = document.createElement("button");
  removeBtn.className = "flow-node-remove";
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", "Создать связь");
  removeBtn.setAttribute("title", "Создать связь");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");

  const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  iconPath.setAttribute("d", "M5 12h12M12 7l5 5-5 5");
  icon.appendChild(iconPath);
  removeBtn.appendChild(icon);

  const clearLinksBtn = document.createElement("button");
  clearLinksBtn.className = "flow-node-clear";
  clearLinksBtn.type = "button";
  clearLinksBtn.setAttribute("aria-label", "Очистить исходящие связи");
  clearLinksBtn.setAttribute("title", "Очистить исходящие связи");

  const clearIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  clearIcon.setAttribute("viewBox", "0 0 24 24");
  clearIcon.setAttribute("aria-hidden", "true");

  const clearIconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  clearIconPath.setAttribute("d", "M7 7l10 10M17 7L7 17");
  clearIcon.appendChild(clearIconPath);
  clearLinksBtn.appendChild(clearIcon);

  const tag = document.createElement("span");
  tag.className = "flow-node-tag";

  const title = document.createElement("h4");
  title.className = "flow-node-title";

  const note = document.createElement("p");
  note.className = "flow-node-note";

  const menu = document.createElement("div");
  menu.className = "flow-node-menu";
  menu.setAttribute("hidden", "");

  const openTaskBtn = document.createElement("button");
  openTaskBtn.className = "flow-node-menu-open";
  openTaskBtn.type = "button";
  openTaskBtn.textContent = "Открыть задачу";

  const removeNodeBtn = document.createElement("button");
  removeNodeBtn.className = "flow-node-menu-delete";
  removeNodeBtn.type = "button";
  removeNodeBtn.textContent = "Удалить с карты";

  const colorRow = document.createElement("label");
  colorRow.className = "flow-node-color-row";
  colorRow.textContent = "Цвет узла";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "flow-node-color-input";
  colorInput.value = STATUS_COLOR_BY_VALUE[1];
  colorInput.setAttribute("aria-label", "Выберите цвет узла");

  colorRow.appendChild(colorInput);
  menu.append(openTaskBtn, removeNodeBtn, colorRow);

  node.append(removeBtn, clearLinksBtn, tag, title, note, menu);
  applyFlowNodeData(node, taskData);

  if (taskData?.customColor) {
    applyFlowNodeCustomColor(node, taskData.customColor);
  }

  return node;
};
