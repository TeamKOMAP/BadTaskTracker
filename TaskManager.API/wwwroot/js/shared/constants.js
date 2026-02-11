export const STORAGE_ACTOR_ID = "gtt-actor-user-id";
export const STORAGE_WORKSPACE_ID = "gtt-workspace-id";

export const MANAGE_ROLES = new Set(["Owner", "Admin"]);

export const DEFAULT_ASSIGNEE_ID = 1;
export const DEFAULT_DUE_DAYS = 7;
export const DEFAULT_PRIORITY_VALUE = 2;

export const URGENCY = {
  green: "green",
  blue: "blue",
  yellow: "yellow",
  red: "red",
  done: "done",
  none: "none"
};

export const STATUS_VALUE_MAP = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  New: 1,
  InProgress: 2,
  Done: 3,
  Overdue: 4
};

export const STATUS_LABELS = {
  1: "New",
  2: "In Progress",
  3: "Done",
  4: "Overdue"
};

export const STATUS_LABEL_SET = new Set(Object.values(STATUS_LABELS));

export const STATUS_TO_COLUMN = {
  1: "todo",
  2: "progress",
  3: "done",
  4: "overdue"
};

export const COLUMN_TO_STATUS = {
  todo: 1,
  progress: 2,
  done: 3,
  overdue: 4
};

export const PRIORITY_VALUE_MAP = {
  1: 1,
  2: 2,
  3: 3,
  Low: 1,
  Medium: 2,
  High: 3
};

export const PRIORITY_LABELS = {
  1: "low",
  2: "medium",
  3: "high"
};
