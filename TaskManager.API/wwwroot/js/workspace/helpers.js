import {
  DEFAULT_DUE_DAYS,
  DEFAULT_PRIORITY_VALUE,
  PRIORITY_LABELS,
  PRIORITY_VALUE_MAP,
  STATUS_TO_COLUMN,
  STATUS_VALUE_MAP,
  COLUMN_TO_STATUS,
  URGENCY
} from "../shared/constants.js";
import { normalizeToken, pad2 } from "../shared/utils.js";

const ensureIsoHasTimeZone = (iso) => {
  const token = normalizeToken(iso);
  if (!token) return "";
  if (/[zZ]$/.test(token) || /[+\-]\d\d:\d\d$/.test(token)) return token;
  // Treat ISO strings without zone as UTC to avoid time drift.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?$/.test(token)) {
    return `${token}Z`;
  }
  return token;
};

export const toStatusValue = (status) => {
  if (status === null || status === undefined) return 1;
  if (typeof status === "number") {
    return STATUS_VALUE_MAP[status] ?? 1;
  }
  return STATUS_VALUE_MAP[String(status)] ?? 1;
};

export const toPriorityValue = (priority) => {
  if (priority === null || priority === undefined) return DEFAULT_PRIORITY_VALUE;
  if (typeof priority === "number") {
    return PRIORITY_VALUE_MAP[priority] ?? DEFAULT_PRIORITY_VALUE;
  }
  return PRIORITY_VALUE_MAP[String(priority)] ?? DEFAULT_PRIORITY_VALUE;
};

export const getPriorityLabel = (priorityValue) => PRIORITY_LABELS[priorityValue] || "medium";

export const getColumnIdForStatus = (statusValue) => STATUS_TO_COLUMN[statusValue] || "todo";

export const getStatusForColumnId = (columnId) => COLUMN_TO_STATUS[columnId] || null;

export const formatDateTimeLocal = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const toDateTimeLocalValue = (iso) => {
  if (!iso) return "";
  const date = new Date(ensureIsoHasTimeZone(iso));
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTimeLocal(date);
};

export const getDefaultDueDateLocalValue = () => {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_DUE_DAYS);
  date.setSeconds(0, 0);
  return formatDateTimeLocal(date);
};

export const getDefaultDueDateIso = () => {
  const value = getDefaultDueDateLocalValue();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

export const formatShortDate = (iso) => {
  if (!iso) return "";
  const date = new Date(ensureIsoHasTimeZone(iso));
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
};

export const getUrgency = (dueDateIso, statusValue) => {
  if (toStatusValue(statusValue) === 3) return URGENCY.done;
  if (!dueDateIso) return URGENCY.none;
  const due = new Date(ensureIsoHasTimeZone(dueDateIso));
  if (Number.isNaN(due.getTime())) return URGENCY.none;
  const delta = due.getTime() - Date.now();
  if (delta < 0) return URGENCY.red;
  if (delta <= 1000 * 60 * 60 * 24 * 1) return URGENCY.yellow;
  if (delta <= 1000 * 60 * 60 * 24 * 3) return URGENCY.blue;
  return URGENCY.green;
};

export const formatDurationShort = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return "0м";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return remHours > 0 ? `${days}д ${remHours}ч` : `${days}д`;
  }
  if (hours > 0) {
    const remMin = minutes % 60;
    return remMin > 0 ? `${hours}ч ${remMin}м` : `${hours}ч`;
  }
  return `${minutes}м`;
};

export const formatDueLabel = (dueDate, statusValue) => {
  if (!dueDate) return "Без срока";
  const due = new Date(ensureIsoHasTimeZone(dueDate));
  if (Number.isNaN(due.getTime())) return "Без срока";

  if (toStatusValue(statusValue) === 3) {
    return `Готово ${formatShortDate(dueDate)}`;
  }

  const now = Date.now();
  const delta = due.getTime() - now;
  if (delta < 0) return `Просрочено ${formatShortDate(dueDate)}`;
  if (delta <= 1000 * 60 * 60 * 24) return `Срок через ${formatDurationShort(delta)}`;
  return `До ${formatShortDate(dueDate)}`;
};

// For task cards: keep only the numeric/date part.
export const formatCardDueLabel = (dueDate, statusValue) => {
  if (!dueDate) return "-";
  const due = new Date(ensureIsoHasTimeZone(dueDate));
  if (Number.isNaN(due.getTime())) return "-";

  const normalizedStatus = toStatusValue(statusValue);
  if (normalizedStatus === 3) {
    return formatShortDate(dueDate);
  }

  const delta = due.getTime() - Date.now();
  if (delta < 0) {
    return formatShortDate(dueDate);
  }
  if (delta <= 1000 * 60 * 60 * 24) {
    return formatDurationShort(delta);
  }
  return formatShortDate(dueDate);
};

export const parseTagIds = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isFinite(id));
};

export const addUniqueToken = (map, value) => {
  const token = normalizeToken(value);
  if (!token) return;
  const key = token.toLowerCase();
  if (!map.has(key)) map.set(key, token);
};

export const formatIso = (iso) => {
  if (!iso) return "";
  const date = new Date(ensureIsoHasTimeZone(iso));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

export const parseTags = (value) => {
  const map = new Map();
  String(value || "")
    .split(/[\s,;]+/)
    .forEach((part) => {
      addUniqueToken(map, part.replace(/^#+/, ""));
    });
  return Array.from(map.values());
};

export const buildTaskKey = (taskData) => [taskData?.title, taskData?.tag, taskData?.note]
  .map((value) => String(value || "").trim().toLowerCase())
  .join("|");

export const buildFlowNote = (taskData) => {
  const tags = Array.isArray(taskData?.tags) ? taskData.tags : [];
  const dueShort = formatShortDate(taskData?.dueDate);
  const noteParts = [];
  if (dueShort) noteParts.push(`Срок ${dueShort}`);
  if (tags.length) noteParts.push(tags.join(" • "));
  return noteParts.length ? noteParts.join(" • ") : "Без срока";
};

export const startOfLocalDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const getCalendarBucketId = (task) => {
  const statusValue = toStatusValue(task?.statusValue ?? task?.status);
  if (statusValue === 3) return "done";

  const priorityValue = toPriorityValue(task?.priorityValue ?? task?.priority);
  const due = task?.dueDate ? new Date(ensureIsoHasTimeZone(task.dueDate)) : null;

  if (!due || Number.isNaN(due.getTime())) {
    return priorityValue === 3 ? "high" : "gtmonth";
  }

  const now = new Date();
  if (due.getTime() < now.getTime()) return "overdue";
  if (priorityValue === 3) return "high";

  const today = startOfLocalDay(now);
  const dueDay = startOfLocalDay(due);
  if (!today || !dueDay) return "gtmonth";

  const msDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / msDay);
  if (diffDays <= 0) return "today";
  if (diffDays <= 7) return "week";
  if (diffDays <= 30) return "gtweek";
  return "gtmonth";
};
