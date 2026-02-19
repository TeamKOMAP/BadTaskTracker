import {
  buildApiUrl,
  apiFetch,
  fetchJsonOrNull,
  handleApiError,
  ensureAuthOrRedirect,
  redirectToAuthPage,
  hasAccessToken,
  setAccessToken
} from "../shared/api.js?v=auth5";

import { normalizeToken } from "../shared/utils.js";
import { getPreferredTheme, setTheme } from "../shared/auth-utils.js";
import { navigateToSpacesPage, navigateToWorkspacePage } from "../shared/navigation.js";

import {
  STORAGE_WORKSPACE_ID,
  STATUS_VALUE_MAP,
  PRIORITY_VALUE_MAP,
  STATUS_LABELS
} from "../shared/constants.js";

import { getStoredAccountNickname } from "../shared/account-prefs.js";

const workspaceNameEl = document.getElementById("reports-workspace-name");
const updatedEl = document.getElementById("reports-updated");
const backToWorkspaceLink = document.getElementById("back-to-workspace");

const statusesRoot = document.getElementById("report-statuses");
const statusesEmptyEl = document.getElementById("report-statuses-empty");
const statusesChartEl = document.getElementById("report-statuses-chart");
const overdueRoot = document.getElementById("report-overdue");
const overdueEmptyEl = document.getElementById("report-overdue-empty");
const overdueChartEl = document.getElementById("report-overdue-chart");
const overdueNoteEl = document.getElementById("report-overdue-note");
const avgValueEl = document.getElementById("report-avg-value");
const avgSubEl = document.getElementById("report-avg-sub");
const avgChartEl = document.getElementById("report-avg-chart");
const toastEl = document.getElementById("reports-toast");

let actorUser = null;
let currentWorkspaceId = null;
let workspaceMembers = [];

const toStatusValue = (value) => {
  const key = typeof value === "string" ? value.trim() : value;
  const mapped = STATUS_VALUE_MAP[key] ?? STATUS_VALUE_MAP[String(key)] ?? Number(key);
  const num = Number(mapped);
  return Number.isFinite(num) && num >= 1 && num <= 4 ? num : 1;
};

const toPriorityValue = (value) => {
  const key = typeof value === "string" ? value.trim() : value;
  const mapped = PRIORITY_VALUE_MAP[key] ?? PRIORITY_VALUE_MAP[String(key)] ?? Number(key);
  const num = Number(mapped);
  return Number.isFinite(num) && num >= 1 && num <= 3 ? num : 2;
};

const formatShortDateTime = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  try {
    return d.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toISOString();
  }
};

const formatDuration = (ms) => {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "0м";
  const totalMinutes = Math.floor(value / 60000);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}м`);
  return parts.join(" ") || "0м";
};

const showToast = (message) => {
  if (!toastEl) return;
  toastEl.textContent = normalizeToken(message);
  if (!toastEl.textContent) return;
  toastEl.removeAttribute("hidden");
  window.setTimeout(() => {
    toastEl.setAttribute("hidden", "");
  }, 2500);
};

const resolveWorkspaceId = () => {
  const fromQuery = Number.parseInt(new URLSearchParams(window.location.search).get("workspaceId") || "", 10);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  try {
    const fromStorage = Number.parseInt(localStorage.getItem(STORAGE_WORKSPACE_ID) || "", 10);
    if (Number.isFinite(fromStorage) && fromStorage > 0) return fromStorage;
  } catch {
    // ignore
  }
  return null;
};

const setActorUser = (user) => {
  const id = Number(user?.id ?? user?.userId);
  actorUser = {
    id: Number.isFinite(id) ? id : null,
    name: normalizeToken(user?.name),
    email: normalizeToken(user?.email)
  };
};

const switchWorkspaceToken = async (workspaceId) => {
  const response = await apiFetch(buildApiUrl("/auth/switch-workspace"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ workspaceId })
  });

  if (!response.ok) {
    await handleApiError(response, "Переключение проекта");
    return false;
  }

  try {
    const data = await response.json();
    const token = String(data?.accessToken || "").trim();
    if (token) {
      setAccessToken(token);
    }
    if (data?.user?.id) {
      setActorUser(data.user);
    }
  } catch {
    // ignore
  }

  return true;
};

const loadCurrentUserFromApi = async () => {
  const me = await fetchJsonOrNull(buildApiUrl("/auth/me"), "Загрузка аккаунта", {
    headers: { Accept: "application/json" }
  });
  if (me?.id) {
    setActorUser(me);
  }
  return me;
};

const loadWorkspaceFromApi = async (workspaceId) => {
  const workspace = await fetchJsonOrNull(buildApiUrl(`/spaces/${workspaceId}`), "Загрузка проекта", {
    headers: { Accept: "application/json" }
  });
  return workspace;
};

const loadWorkspaceMembers = async (workspaceId) => {
  const members = await fetchJsonOrNull(buildApiUrl(`/spaces/${workspaceId}/members`), "Загрузка участников проекта", {
    headers: { Accept: "application/json" }
  });
  workspaceMembers = Array.isArray(members)
    ? members.map((m) => ({
      id: Number(m?.userId ?? m?.id),
      name: normalizeToken(m?.name),
      email: normalizeToken(m?.email)
    })).filter((m) => Number.isFinite(m.id) && m.id > 0)
    : [];
};

const getAssigneeLabel = (assigneeId, apiAssigneeName) => {
  const id = Number.parseInt(String(assigneeId ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return "Все";

  const stored = normalizeToken(getStoredAccountNickname(id));
  if (stored) return stored;

  const member = workspaceMembers.find((m) => Number(m?.id) === id);
  const name = normalizeToken(member?.name);
  if (name) return name;

  const api = normalizeToken(apiAssigneeName);
  if (!api) return "-";
  return api.includes("@") ? api.split("@")[0] : api;
};

const renderStatusesReport = (tasks) => {
  if (!statusesRoot || !statusesEmptyEl) return;
  statusesRoot.innerHTML = "";
  if (statusesChartEl) statusesChartEl.innerHTML = "";

  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) {
    statusesEmptyEl.hidden = false;
    return;
  }
  statusesEmptyEl.hidden = true;

  const counts = new Map();
  list.forEach((task) => {
    const statusValue = toStatusValue(task?.status ?? task?.statusValue);
    counts.set(statusValue, (counts.get(statusValue) || 0) + 1);
  });

  const present = Array.from(counts.entries())
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => a[0] - b[0]);

  present.forEach(([statusValue, count]) => {
    const pill = document.createElement("div");
    pill.className = "status-pill";
    pill.dataset.kind = String(statusValue);
    pill.innerHTML = `
      <div class="status-pill-title"><span>${STATUS_LABELS[statusValue] || "Статус"}</span></div>
      <div class="status-pill-value">${count}</div>
    `;
    statusesRoot.appendChild(pill);
  });

  if (statusesChartEl) {
    const total = present.reduce((acc, [, count]) => acc + Number(count || 0), 0);
    const width = 560;
    const height = 26;
    const pad = 2;
    const innerWidth = width - pad * 2;
    const gap = 3;
    const segCount = present.length;
    const available = Math.max(0, innerWidth - (segCount > 1 ? gap * (segCount - 1) : 0));

    const colors = {
      1: "rgba(120, 182, 255, 0.92)",
      2: "rgba(250, 204, 21, 0.92)",
      3: "rgba(74, 222, 128, 0.92)",
      4: "rgba(248, 113, 113, 0.92)"
    };

    if (!total || !segCount || !available) {
      statusesChartEl.innerHTML = "";
      return;
    }

    const base = present.map(([statusValue, count]) => {
      const value = Number(count || 0);
      const raw = (value / total) * available;
      return {
        statusValue,
        count: value,
        raw,
        frac: raw - Math.floor(raw),
        width: 0,
        color: colors[statusValue] || "rgba(185, 196, 216, 0.82)"
      };
    });

    const minWidth = available >= segCount ? 1 : 0;
    base.forEach((s) => {
      s.width = Math.max(minWidth, Math.floor(s.raw));
    });

    let sumWidth = base.reduce((acc, s) => acc + s.width, 0);
    let remainder = available - sumWidth;

    if (remainder > 0) {
      base
        .slice()
        .sort((a, b) => b.frac - a.frac)
        .slice(0, remainder)
        .forEach((s) => {
          s.width += 1;
        });
    } else if (remainder < 0) {
      // Remove pixels from smallest fractions first, never below minWidth.
      let toRemove = -remainder;
      const ordered = base.slice().sort((a, b) => a.frac - b.frac);
      for (const s of ordered) {
        if (toRemove <= 0) break;
        const canRemove = Math.max(0, s.width - minWidth);
        const delta = Math.min(canRemove, toRemove);
        s.width -= delta;
        toRemove -= delta;
      }
    }

    const segments = base.filter((s) => s.width > 0);

    // Compute x positions with gaps.
    let cursor = pad;
    segments.forEach((s, idx) => {
      s.x = cursor;
      cursor += s.width;
      if (idx !== segments.length - 1) {
        cursor += gap;
      }
    });

    const segRects = segments.map((s, idx) => {
      const rx = 10;
      const title = `${STATUS_LABELS[s.statusValue] || "Статус"}: ${s.count}`;
      return `<rect x="${s.x}" y="${pad}" width="${s.width}" height="${height - pad * 2}" rx="${rx}" fill="${s.color}"><title>${title}</title></rect>`;
    }).join("");

    statusesChartEl.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма статусов">
        <defs>
          <clipPath id="status-bar-clip">
            <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${height - pad * 2}" rx="10" />
          </clipPath>
        </defs>
        <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${height - pad * 2}" rx="10" fill="rgba(255, 255, 255, 0.06)" />
        <g clip-path="url(#status-bar-clip)">
          ${segRects}
        </g>
      </svg>
    `;
  }
};

const isOverdueTask = (task) => {
  const statusValue = toStatusValue(task?.status ?? task?.statusValue);
  if (statusValue === 3) return false;
  if (statusValue === 4) return true;
  if (task?.isOverdue === true) return true;
  const due = task?.dueDate ? new Date(task.dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
};

const renderOverdueReport = (tasks) => {
  if (!overdueRoot || !overdueEmptyEl) return;
  overdueRoot.innerHTML = "";
  if (overdueChartEl) overdueChartEl.innerHTML = "";
  if (overdueNoteEl) {
    overdueNoteEl.textContent = "";
    overdueNoteEl.hidden = true;
  }

  const overdueAll = (Array.isArray(tasks) ? tasks : []).filter(isOverdueTask);
  if (!overdueAll.length) {
    overdueEmptyEl.hidden = false;
    return;
  }
  overdueEmptyEl.hidden = true;

  const now = Date.now();
  const groups = new Map();

  let missingAssigneeCount = 0;
  let missingDueCount = 0;

  overdueAll.forEach((task) => {
    const due = task?.dueDate ? new Date(task.dueDate) : null;
    if (!due || Number.isNaN(due.getTime())) {
      missingDueCount += 1;
      return;
    }

    const assigneeId = Number.parseInt(String(task?.assigneeId ?? ""), 10);
    if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
      missingAssigneeCount += 1;
      return;
    }

    const overdueMs = Math.max(0, now - due.getTime());
    const assigneeKey = String(assigneeId);
    const bucket = groups.get(assigneeKey) || {
      assigneeId,
      assigneeName: task?.assigneeName ?? "",
      maxOverdueMs: 0,
      tasks: []
    };
    bucket.maxOverdueMs = Math.max(bucket.maxOverdueMs, overdueMs);
    bucket.tasks.push({
      id: Number(task?.id),
      title: normalizeToken(task?.title) || "Задача",
      dueDate: task?.dueDate,
      overdueMs
    });
    groups.set(assigneeKey, bucket);
  });

  const sorted = Array.from(groups.values())
    .sort((a, b) => b.maxOverdueMs - a.maxOverdueMs);

  if (!sorted.length) {
    overdueEmptyEl.hidden = false;
    overdueEmptyEl.textContent = "Недостаточно данных для расчёта";
    if (overdueNoteEl) {
      const parts = [];
      if (missingAssigneeCount > 0) parts.push(`задач без исполнителя: ${missingAssigneeCount}`);
      if (missingDueCount > 0) parts.push(`задач без срока: ${missingDueCount}`);
      overdueNoteEl.textContent = parts.length
        ? `Недостаточно данных для расчёта (${parts.join(", ")}).`
        : "Недостаточно данных для расчёта.";
      overdueNoteEl.hidden = false;
    }
    return;
  }

  if ((missingAssigneeCount > 0 || missingDueCount > 0) && overdueNoteEl) {
    const parts = [];
    if (missingAssigneeCount > 0) parts.push(`задач без исполнителя: ${missingAssigneeCount}`);
    if (missingDueCount > 0) parts.push(`задач без срока: ${missingDueCount}`);
    overdueNoteEl.textContent = `Недостаточно данных для расчёта для части задач (${parts.join(", ")}).`;
    overdueNoteEl.hidden = false;
  }

  if (overdueChartEl) {
    const top = sorted.slice(0, 8);
    const max = Math.max(...top.map((g) => Number(g.maxOverdueMs) || 0), 1);
    const width = 560;
    const row = 28;
    const height = top.length * row + 10;
    const leftPad = 180;
    const rightPad = 10;
    const barWidth = width - leftPad - rightPad;

    const bars = top.map((g, idx) => {
      const y = 6 + idx * row;
      const label = getAssigneeLabel(g.assigneeId, g.assigneeName);
      const value = Math.max(0, Number(g.maxOverdueMs) || 0);
      const w = Math.round((value / max) * barWidth);
      const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `
        <text x="${leftPad - 10}" y="${y + 18}" text-anchor="end" font-size="12" fill="rgba(185, 196, 216, 0.92)">${safeLabel}</text>
        <rect x="${leftPad}" y="${y + 8}" width="${w}" height="12" rx="6" fill="rgba(248, 113, 113, 0.92)">
          <title>${safeLabel}: ${formatDuration(value)}</title>
        </rect>
      `;
    }).join("");

    overdueChartEl.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма просрочек">
        ${bars}
      </svg>
    `;
  }

  sorted.forEach((group) => {
    const label = getAssigneeLabel(group.assigneeId, group.assigneeName);
    const card = document.createElement("div");
    card.className = "overdue-card";

    const tasksSorted = group.tasks.slice().sort((a, b) => b.overdueMs - a.overdueMs);
    const tasksHtml = tasksSorted.map((task) => {
      const late = formatDuration(task.overdueMs);
      const dueLabel = formatShortDateTime(task.dueDate);
      const safeTitle = task.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `
        <div class="overdue-task" data-task-id="${Number.isFinite(task.id) ? task.id : ""}">
          <div class="overdue-task-title" title="${safeTitle}">${safeTitle}</div>
          <div class="overdue-task-meta">
            <span class="overdue-task-late">${late}</span>
            <span>${dueLabel}</span>
          </div>
        </div>
      `;
    }).join("");

    card.innerHTML = `
      <div class="overdue-head">
        <div class="overdue-assignee">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <div class="overdue-max">${formatDuration(group.maxOverdueMs)}</div>
      </div>
      <div class="overdue-tasks">${tasksHtml}</div>
    `;

    overdueRoot.appendChild(card);
  });
};

const renderAverageCompletionReport = (tasks) => {
  if (!avgValueEl || !avgSubEl) return;
  if (avgChartEl) avgChartEl.innerHTML = "";

  const list = Array.isArray(tasks) ? tasks : [];
  const samples = list
    .map((task) => {
      const createdAt = task?.createdAt ? new Date(task.createdAt) : null;
      const completedAt = task?.completedAt ? new Date(task.completedAt) : null;
      if (!createdAt || !completedAt) return null;
      if (Number.isNaN(createdAt.getTime()) || Number.isNaN(completedAt.getTime())) return null;
      const ms = completedAt.getTime() - createdAt.getTime();
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return ms;
    })
    .filter((ms) => Number.isFinite(ms));

  if (!samples.length) {
    avgValueEl.textContent = "Недостаточно данных для расчёта";
    avgSubEl.textContent = "Нет завершённых задач";
    if (avgChartEl) {
      avgChartEl.innerHTML = `
        <svg viewBox="0 0 560 48" width="100%" height="48" role="img" aria-label="Диаграмма времени выполнения">
          <text x="0" y="30" font-size="13" fill="rgba(127, 139, 161, 0.92)">Недостаточно данных для диаграммы</text>
        </svg>
      `;
    }
    return;
  }

  const sum = samples.reduce((acc, ms) => acc + ms, 0);
  const avg = sum / samples.length;
  avgValueEl.textContent = formatDuration(avg);
  avgSubEl.textContent = `Завершённых задач: ${samples.length}`;

  if (avgChartEl) {
    const bins = [
      { id: "lt1d", title: "<1д", from: 0, to: 24 * 60 * 60 * 1000 },
      { id: "d1_2", title: "1-2д", from: 24 * 60 * 60 * 1000, to: 2 * 24 * 60 * 60 * 1000 },
      { id: "d2_3", title: "2-3д", from: 2 * 24 * 60 * 60 * 1000, to: 3 * 24 * 60 * 60 * 1000 },
      { id: "d3_5", title: "3-5д", from: 3 * 24 * 60 * 60 * 1000, to: 5 * 24 * 60 * 60 * 1000 },
      { id: "d5_7", title: "5-7д", from: 5 * 24 * 60 * 60 * 1000, to: 7 * 24 * 60 * 60 * 1000 },
      { id: "d7_14", title: "7-14д", from: 7 * 24 * 60 * 60 * 1000, to: 14 * 24 * 60 * 60 * 1000 },
      { id: "gt14", title: ">14д", from: 14 * 24 * 60 * 60 * 1000, to: Number.POSITIVE_INFINITY }
    ];

    const counts = bins.map((bin) => samples.filter((ms) => ms >= bin.from && ms < bin.to).length);
    const maxCount = Math.max(...counts, 1);

    const width = 560;
    const height = 90;
    const pad = 10;
    const chartHeight = 52;
    const barGap = 8;
    const barCount = bins.length;
    const barWidth = Math.floor((width - pad * 2 - barGap * (barCount - 1)) / barCount);
    const baseY = pad + chartHeight;

    const bars = bins.map((bin, idx) => {
      const count = counts[idx];
      const h = Math.round((count / maxCount) * chartHeight);
      const x = pad + idx * (barWidth + barGap);
      const y = baseY - h;
      const title = `${bin.title}: ${count}`;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="8" fill="rgba(68, 210, 199, 0.92)"><title>${title}</title></rect>
        <text x="${x + barWidth / 2}" y="${pad + chartHeight + 24}" text-anchor="middle" font-size="11" fill="rgba(127, 139, 161, 0.92)">${bin.title}</text>
      `;
    }).join("");

    avgChartEl.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма времени выполнения">
        ${bars}
      </svg>
    `;
  }
};

const updateUpdatedAt = () => {
  if (!updatedEl) return;
  updatedEl.textContent = formatShortDateTime(new Date().toISOString());
};

const bootstrapReportsPage = async () => {
  setTheme(getPreferredTheme());

  if (!ensureAuthOrRedirect() || !hasAccessToken()) {
    return;
  }

  await loadCurrentUserFromApi();
  if (!actorUser?.id) {
    redirectToAuthPage();
    return;
  }

  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) {
    navigateToSpacesPage();
    return;
  }
  currentWorkspaceId = workspaceId;

  try {
    localStorage.setItem(STORAGE_WORKSPACE_ID, String(workspaceId));
  } catch {
    // ignore
  }

  if (backToWorkspaceLink) {
    backToWorkspaceLink.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToWorkspacePage(workspaceId);
    });
  }

  const switched = await switchWorkspaceToken(workspaceId);
  if (!switched) {
    showToast("Не удалось открыть отчеты");
    return;
  }

  const workspace = await loadWorkspaceFromApi(workspaceId);
  const workspaceName = normalizeToken(workspace?.name) || "Отчеты";
  if (workspaceNameEl) {
    workspaceNameEl.textContent = `Отчеты: ${workspaceName}`;
  }

  await loadWorkspaceMembers(workspaceId);

  const tasks = await fetchJsonOrNull(buildApiUrl("/tasks"), "Загрузка задач", {
    headers: { Accept: "application/json" }
  });

  if (!Array.isArray(tasks)) {
    showToast("Не удалось загрузить задачи");
    return;
  }

  renderStatusesReport(tasks);
  renderOverdueReport(tasks);
  renderAverageCompletionReport(tasks);
  updateUpdatedAt();
};

void bootstrapReportsPage();
