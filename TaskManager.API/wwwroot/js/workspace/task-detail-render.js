import { STATUS_LABELS, PRIORITY_LABELS } from "../shared/constants.js";
import { normalizeToken } from "../shared/utils.js";
import { toStatusValue, toPriorityValue, formatIso, formatBytes, getUrgency, formatDueLabel } from "./helpers.js?v=authflow6";
import { runWhenIdle } from "./media-utils.js";

const PRIORITY_DISPLAY_LABELS = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий"
};

const getPriorityDisplayLabel = (priorityValue) => {
  const key = PRIORITY_LABELS[priorityValue] || "medium";
  return PRIORITY_DISPLAY_LABELS[key] || key;
};

export const setDetailField = (element, value) => {
  if (!element) return;
  element.textContent = normalizeToken(value) || "-";
};

export const setDetailMultilineField = (element, value) => {
  if (!element) return;
  const raw = value === null || value === undefined ? "" : String(value);
  element.textContent = raw.trim() || "-";
};

export const renderDetailTags = (options) => {
  const container = options?.container ?? null;
  if (!container) return;
  container.innerHTML = "";

  const resolveTagName = typeof options?.resolveTagName === "function" ? options.resolveTagName : () => "";
  const ids = Array.isArray(options?.tagIds) ? options.tagIds : [];
  const names = ids
    .map((id) => resolveTagName(Number(id)) || "")
    .map((name) => normalizeToken(name))
    .filter(Boolean);

  const fallbackNames = Array.isArray(options?.fallbackNames) ? options.fallbackNames : [];
  const merged = names.length ? names : fallbackNames;

  if (!merged.length) {
    const empty = document.createElement("span");
    empty.className = "task-chip";
    empty.textContent = "Нет тегов";
    container.appendChild(empty);
    return;
  }

  merged.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "task-chip";
    chip.textContent = name;
    container.appendChild(chip);
  });
};

export const renderTaskInDetail = (options) => {
  const task = options?.task;
  const taskId = Number(options?.taskId);
  if (!task || !Number.isFinite(taskId)) {
    return { tagIds: [], metaTags: [] };
  }

  const elements = options?.elements || {};
  const resolveAssigneeName = typeof options?.resolveAssigneeName === "function" ? options.resolveAssigneeName : () => "";
  const getStoredTaskMeta = typeof options?.getStoredTaskMeta === "function" ? options.getStoredTaskMeta : () => null;
  const getCachedTaskBg = typeof options?.getCachedTaskBg === "function" ? options.getCachedTaskBg : () => "";
  const getCurrentRequestSeq = typeof options?.getCurrentRequestSeq === "function" ? options.getCurrentRequestSeq : () => null;
  const getCurrentTaskId = typeof options?.getCurrentTaskId === "function" ? options.getCurrentTaskId : () => null;

  const statusValue = toStatusValue(task.status);
  const priorityValue = toPriorityValue(task.priority);
  const tagIds = Array.isArray(task.tagIds) ? task.tagIds : [];
  const meta = getStoredTaskMeta(taskId);
  const title = normalizeToken(task.title);
  const description = normalizeToken(task.description);
  const dueLabel = formatDueLabel(task.dueDate, statusValue);
  const urgency = getUrgency(task.dueDate, statusValue);

  const doneApprovalPending = Boolean(task.doneApprovalPending);
  const canManageDoneApproval = typeof options?.canManageDoneApproval === "function"
    ? options.canManageDoneApproval
    : () => false;

  if (elements.titleEl) {
    elements.titleEl.textContent = title || `Задача #${taskId}`;
  }

  setDetailField(elements.idEl, `#${taskId}`);

  if (elements.statusBadgeEl) {
    elements.statusBadgeEl.dataset.kind = "status";
    elements.statusBadgeEl.dataset.status = String(statusValue);
    elements.statusBadgeEl.textContent = STATUS_LABELS[statusValue] || "Статус";
  }

  if (elements.priorityBadgeEl) {
    elements.priorityBadgeEl.dataset.kind = "priority";
    elements.priorityBadgeEl.dataset.priority = String(priorityValue);
    elements.priorityBadgeEl.textContent = `Приоритет: ${getPriorityDisplayLabel(priorityValue)}`;
  }

  if (elements.dueBadgeEl) {
    elements.dueBadgeEl.dataset.kind = "due";
    elements.dueBadgeEl.dataset.urgency = urgency;
    elements.dueBadgeEl.textContent = dueLabel;
  }

  setDetailField(elements.statusEl, STATUS_LABELS[statusValue]);
  setDetailField(elements.priorityEl, getPriorityDisplayLabel(priorityValue));
  const assigneeId = Number.parseInt(String(task.assigneeId ?? ""), 10);
  const resolvedAssigneeName = Number.isFinite(assigneeId) && assigneeId > 0
    ? normalizeToken(resolveAssigneeName(assigneeId))
    : "";
  const apiAssigneeNameRaw = normalizeToken(task.assigneeName);
  const apiAssigneeName = apiAssigneeNameRaw.includes("@");
  const apiAssigneeNameSafe = Number.isFinite(assigneeId) && assigneeId > 0
    ? (apiAssigneeName ? apiAssigneeNameRaw.split("@")[0] : apiAssigneeNameRaw)
    : "";
  const assigneeLabel = resolvedAssigneeName
    || apiAssigneeNameSafe
    || (Number.isFinite(assigneeId) && assigneeId > 0 ? "-" : "Все");
  setDetailField(elements.assigneeEl, assigneeLabel);
  setDetailField(elements.dueEl, `${dueLabel} (${formatIso(task.dueDate)})`);
  setDetailField(elements.createdEl, formatIso(task.createdAt));
  setDetailField(elements.updatedEl, formatIso(task.updatedAt));
  setDetailField(elements.completedEl, formatIso(task.completedAt));
  setDetailMultilineField(elements.descriptionEl, description || "-");

  const metaTags = Array.isArray(meta?.tags) ? meta.tags : [];
  renderDetailTags({
    container: elements.tagsEl,
    tagIds,
    fallbackNames: metaTags,
    resolveTagName: options?.resolveTagName
  });

  if (elements.photoWrapEl && elements.photoImgEl) {
    elements.photoImgEl.removeAttribute("src");
    elements.photoWrapEl.setAttribute("hidden", "");

    const requestSeq = options?.requestSeq;
    runWhenIdle(() => {
      if (requestSeq !== getCurrentRequestSeq() || getCurrentTaskId() !== taskId) {
        return;
      }
      const photo = getCachedTaskBg(taskId);
      if (!photo) {
        return;
      }
      elements.photoImgEl.decoding = "async";
      elements.photoImgEl.loading = "lazy";
      elements.photoImgEl.src = photo;
      elements.photoWrapEl.removeAttribute("hidden");
    });
  }

  if (elements.approvalWrapEl instanceof HTMLElement) {
    elements.approvalWrapEl.toggleAttribute("hidden", !doneApprovalPending);
  }
  if (elements.approvalTextEl instanceof HTMLElement) {
    elements.approvalTextEl.textContent = doneApprovalPending ? "Ожидает подтверждения выполнения" : "";
  }
  if (elements.approvalActionsEl instanceof HTMLElement) {
    elements.approvalActionsEl.toggleAttribute("hidden", !doneApprovalPending || !canManageDoneApproval());
  }
  if (elements.approveBtnEl instanceof HTMLButtonElement) {
    elements.approveBtnEl.disabled = !doneApprovalPending || !canManageDoneApproval();
  }
  if (elements.rejectBtnEl instanceof HTMLButtonElement) {
    elements.rejectBtnEl.disabled = !doneApprovalPending || !canManageDoneApproval();
  }

  return { tagIds, metaTags };
};

export const renderAttachmentsList = (options) => {
  const listElement = options?.listElement ?? null;
  const emptyElement = options?.emptyElement ?? null;
  if (!listElement || !emptyElement) return;

  listElement.innerHTML = "";

  const list = Array.isArray(options?.attachments) ? options.attachments : [];
  const taskId = Number(options?.taskId);
  const applyAttachmentCountToCards = typeof options?.applyAttachmentCountToCards === "function"
    ? options.applyAttachmentCountToCards
    : () => {};

  emptyElement.hidden = list.length > 0;
  if (list.length === 0) {
    emptyElement.textContent = "Нет вложений";
    applyAttachmentCountToCards(taskId, 0);
    return;
  }

  const isAdmin = typeof options?.isAdmin === "function" ? options.isAdmin : () => false;
  const onDownload = typeof options?.onDownload === "function" ? options.onDownload : async () => {};
  const onDelete = typeof options?.onDelete === "function" ? options.onDelete : async () => {};

  const fragment = document.createDocumentFragment();

  list.forEach((attachment) => {
    const id = normalizeToken(attachment?.id);
    const name = normalizeToken(attachment?.fileName) || "файл";
    const size = formatBytes(attachment?.size);
    const uploaded = attachment?.uploadedAtUtc ? formatIso(attachment.uploadedAtUtc) : "-";

    const row = document.createElement("div");
    row.className = "task-attachment";

    const icon = document.createElement("div");
    icon.className = "task-attachment-ico";
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8l-6-6z" />
        <path d="M14 2v6h6" />
      </svg>
    `;

    const main = document.createElement("div");
    main.className = "task-attachment-main";
    const title = document.createElement("div");
    title.className = "task-attachment-name";
    title.textContent = name;
    const subtitle = document.createElement("div");
    subtitle.className = "task-attachment-sub";
    subtitle.textContent = `${size} · ${uploaded}`;
    main.append(title, subtitle);

    const actions = document.createElement("div");
    actions.className = "task-attachment-actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "task-attachment-link";
    downloadBtn.textContent = "Скачать";
    downloadBtn.addEventListener("click", () => {
      void onDownload({ id, name, taskId, raw: attachment });
    });
    actions.appendChild(downloadBtn);

    if (isAdmin()) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "task-attachment-del";
      deleteBtn.textContent = "Удалить";
      deleteBtn.addEventListener("click", () => {
        void onDelete({ id, name, taskId, raw: attachment });
      });
      actions.appendChild(deleteBtn);
    }

    row.append(icon, main, actions);
    fragment.appendChild(row);
  });

  listElement.appendChild(fragment);
  applyAttachmentCountToCards(taskId, list.length);
};
