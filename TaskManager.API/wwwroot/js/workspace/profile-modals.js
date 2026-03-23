export const createProfileModalsController = ({
  getWorkspaceId,
  getActorUserId,
  buildApiUrl,
  apiFetch,
  handleApiError,
  normalizeToken,
  toInitials,
  applyAccountAvatarToElement,
  getRoleLabel,
  statusLabels,
  toStatusValue,
  openDirectChat,
  openDirectChatNotifications
} = {}) => {
  const profileModal = document.getElementById("profile-modal");
  const profileUserNameEl = document.getElementById("profile-user-name");
  const profileAvatarEl = document.getElementById("profile-avatar");
  const profileAvatarTextEl = document.getElementById("profile-avatar-text");
  const profileUserEmailEl = document.getElementById("profile-user-email");
  const profileUserRoleEl = document.getElementById("profile-user-role");
  const profileMessageBtn = document.getElementById("profile-message-btn");
  const profileNotificationsBtn = document.getElementById("profile-notifications-btn");
  const profileChatBtn = document.getElementById("profile-chat-btn");

  const profileStatusesChartEl = document.getElementById("profile-statuses-chart");
  const profileStatusesRoot = document.getElementById("profile-statuses");
  const profileStatusesEmptyEl = document.getElementById("profile-statuses-empty");

  const profileOverdueRoot = document.getElementById("profile-overdue");
  const profileOverdueEmptyEl = document.getElementById("profile-overdue-empty");
  const profileOverdueNoteEl = document.getElementById("profile-overdue-note");

  const profileAvgValueEl = document.getElementById("profile-avg-value");
  const profileAvgSubEl = document.getElementById("profile-avg-sub");
  const profileAvgChartEl = document.getElementById("profile-avg-chart");

  const avatarModal = document.getElementById("avatar-modal");
  const avatarModalTitleEl = document.getElementById("avatar-modal-title");
  const avatarModalAvatarEl = document.getElementById("avatar-modal-avatar");
  const avatarModalAvatarTextEl = document.getElementById("avatar-modal-avatar-text");

  let profileReportsRequestSeq = 0;
  let profileDetailsRequestSeq = 0;
  let activeProfileMember = null;

  const isProfileModalOpen = () => Boolean(profileModal && !profileModal.hasAttribute("hidden"));
  const isAvatarModalOpen = () => Boolean(avatarModal && !avatarModal.hasAttribute("hidden"));

  const closeProfileModal = () => {
    if (!isProfileModalOpen()) return false;
    profileModal.setAttribute("hidden", "");
    activeProfileMember = null;
    profileReportsRequestSeq += 1;
    return true;
  };

  const closeAvatarModal = () => {
    if (!isAvatarModalOpen()) return false;
    avatarModal.setAttribute("hidden", "");
    return true;
  };

  const formatDurationCompact = (ms) => {
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

  const formatShortDateTimeRu = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "-";
    try {
      return d.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return d.toISOString();
    }
  };

  const renderProfileStatusChart = (countsByStatus) => {
    if (!profileStatusesChartEl) return;
    profileStatusesChartEl.innerHTML = "";

    const entries = Array.from(countsByStatus.entries())
      .filter(([, count]) => Number(count) > 0)
      .sort((a, b) => a[0] - b[0]);
    const total = entries.reduce((acc, [, count]) => acc + Number(count || 0), 0);
    if (!total) return;

    const width = 520;
    const height = 22;
    const pad = 2;
    const innerWidth = width - pad * 2;
    const gap = 3;
    const segCount = entries.length;
    const available = Math.max(0, innerWidth - (segCount > 1 ? gap * (segCount - 1) : 0));
    if (!available) return;

    const colors = {
      1: "rgba(120, 182, 255, 0.92)",
      2: "rgba(250, 204, 21, 0.92)",
      3: "rgba(74, 222, 128, 0.92)",
      4: "rgba(248, 113, 113, 0.92)"
    };

    const base = entries.map(([statusValue, count]) => {
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
    base.forEach((segment) => {
      segment.width = Math.max(minWidth, Math.floor(segment.raw));
    });
    const sumWidth = base.reduce((acc, segment) => acc + segment.width, 0);
    const remainder = available - sumWidth;
    if (remainder > 0) {
      base.slice().sort((a, b) => b.frac - a.frac).slice(0, remainder).forEach((segment) => {
        segment.width += 1;
      });
    } else if (remainder < 0) {
      let toRemove = -remainder;
      const ordered = base.slice().sort((a, b) => a.frac - b.frac);
      for (const segment of ordered) {
        if (toRemove <= 0) break;
        const canRemove = Math.max(0, segment.width - minWidth);
        const delta = Math.min(canRemove, toRemove);
        segment.width -= delta;
        toRemove -= delta;
      }
    }

    const segments = base.filter((segment) => segment.width > 0);
    let cursor = pad;
    segments.forEach((segment, idx) => {
      segment.x = cursor;
      cursor += segment.width;
      if (idx !== segments.length - 1) cursor += gap;
    });

    const segRects = segments.map((segment) => {
      const title = `${statusLabels[segment.statusValue] || "Статус"}: ${segment.count}`;
      return `<rect x="${segment.x}" y="${pad}" width="${segment.width}" height="${height - pad * 2}" rx="10" fill="${segment.color}"><title>${title}</title></rect>`;
    }).join("");

    profileStatusesChartEl.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма статусов">
        <defs>
          <clipPath id="profile-status-bar-clip">
            <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${height - pad * 2}" rx="10" />
          </clipPath>
        </defs>
        <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${height - pad * 2}" rx="10" fill="rgba(255, 255, 255, 0.06)" />
        <g clip-path="url(#profile-status-bar-clip)">
          ${segRects}
        </g>
      </svg>
    `;
  };

  const clearProfileReportsUi = () => {
    if (profileStatusesChartEl) profileStatusesChartEl.innerHTML = "";
    if (profileStatusesRoot) profileStatusesRoot.innerHTML = "";
    if (profileStatusesEmptyEl) profileStatusesEmptyEl.hidden = true;

    if (profileOverdueRoot) profileOverdueRoot.innerHTML = "";
    if (profileOverdueEmptyEl) profileOverdueEmptyEl.hidden = true;
    if (profileOverdueNoteEl) {
      profileOverdueNoteEl.textContent = "";
      profileOverdueNoteEl.hidden = true;
    }

    if (profileAvgValueEl) profileAvgValueEl.textContent = "-";
    if (profileAvgSubEl) profileAvgSubEl.textContent = "-";
    if (profileAvgChartEl) profileAvgChartEl.innerHTML = "";
  };

  const renderProfileReportsLoading = () => {
    clearProfileReportsUi();
    if (profileStatusesEmptyEl) {
      profileStatusesEmptyEl.textContent = "Загрузка...";
      profileStatusesEmptyEl.hidden = false;
    }
    if (profileOverdueEmptyEl) {
      profileOverdueEmptyEl.textContent = "Загрузка...";
      profileOverdueEmptyEl.hidden = false;
    }
    if (profileAvgValueEl) profileAvgValueEl.textContent = "Загрузка...";
    if (profileAvgSubEl) profileAvgSubEl.textContent = "";
  };

  const fetchTasksForAssignee = async (assigneeId) => {
    const workspaceId = typeof getWorkspaceId === "function" ? Number(getWorkspaceId()) : NaN;
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) return null;

    const id = Number.parseInt(String(assigneeId ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return [];

    const response = await apiFetch(buildApiUrl("/tasks", { assigneeId: id }), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      await handleApiError(response, "Загрузка задач пользователя");
      return null;
    }
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const renderProfileReports = async (member) => {
    const memberId = Number(member?.id);
    if (!Number.isFinite(memberId) || memberId <= 0) return;

    profileReportsRequestSeq += 1;
    const seq = profileReportsRequestSeq;
    renderProfileReportsLoading();

    const tasks = await fetchTasksForAssignee(memberId);
    if (seq !== profileReportsRequestSeq || !isProfileModalOpen()) return;

    if (!Array.isArray(tasks)) {
      clearProfileReportsUi();
      if (profileStatusesEmptyEl) {
        profileStatusesEmptyEl.textContent = "Не удалось загрузить";
        profileStatusesEmptyEl.hidden = false;
      }
      if (profileOverdueEmptyEl) {
        profileOverdueEmptyEl.textContent = "Не удалось загрузить";
        profileOverdueEmptyEl.hidden = false;
      }
      if (profileAvgValueEl) profileAvgValueEl.textContent = "Недостаточно данных для расчёта";
      if (profileAvgSubEl) profileAvgSubEl.textContent = "";
      return;
    }

    const counts = new Map();
    tasks.forEach((task) => {
      const statusValue = toStatusValue(task?.status ?? task?.statusValue);
      counts.set(statusValue, (counts.get(statusValue) || 0) + 1);
    });

    if (profileStatusesRoot) {
      profileStatusesRoot.innerHTML = "";
      const present = Array.from(counts.entries()).filter(([, count]) => Number(count) > 0).sort((a, b) => a[0] - b[0]);
      if (!present.length) {
        if (profileStatusesEmptyEl) {
          profileStatusesEmptyEl.textContent = "Нет задач.";
          profileStatusesEmptyEl.hidden = false;
        }
      } else {
        if (profileStatusesEmptyEl) profileStatusesEmptyEl.hidden = true;
        present.forEach(([statusValue, count]) => {
          const el = document.createElement("div");
          el.className = "profile-status-pill";
          el.dataset.kind = String(statusValue);
          el.innerHTML = `
            <div class="profile-status-title">${statusLabels[statusValue] || "Статус"}</div>
            <div class="profile-status-value">${Number(count)}</div>
          `;
          profileStatusesRoot.appendChild(el);
        });
      }
    }
    renderProfileStatusChart(counts);

    const now = Date.now();
    const overdueAll = tasks.filter((task) => {
      const statusValue = toStatusValue(task?.status ?? task?.statusValue);
      if (statusValue === 3) return false;
      if (statusValue === 4) return true;
      if (task?.isOverdue === true) return true;
      const due = task?.dueDate ? new Date(task.dueDate) : null;
      if (!due || Number.isNaN(due.getTime())) return false;
      return due.getTime() < now;
    });

    let missingDueCount = 0;
    const overdueWithDue = overdueAll
      .map((task) => {
        const due = task?.dueDate ? new Date(task.dueDate) : null;
        if (!due || Number.isNaN(due.getTime())) {
          missingDueCount += 1;
          return null;
        }
        const overdueMs = Math.max(0, now - due.getTime());
        return {
          id: Number(task?.id),
          title: normalizeToken(task?.title) || "Задача",
          dueDate: task?.dueDate,
          overdueMs
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.overdueMs - a.overdueMs);

    if (profileOverdueRoot) {
      profileOverdueRoot.innerHTML = "";
      if (!overdueAll.length) {
        if (profileOverdueEmptyEl) {
          profileOverdueEmptyEl.textContent = "Нет просроченных задач.";
          profileOverdueEmptyEl.hidden = false;
        }
      } else if (!overdueWithDue.length) {
        if (profileOverdueEmptyEl) {
          profileOverdueEmptyEl.textContent = "Недостаточно данных для расчёта";
          profileOverdueEmptyEl.hidden = false;
        }
        if (profileOverdueNoteEl) {
          profileOverdueNoteEl.textContent = "Есть просроченные задачи, но у них не указан корректный срок.";
          profileOverdueNoteEl.hidden = false;
        }
      } else {
        if (profileOverdueEmptyEl) profileOverdueEmptyEl.hidden = true;
        if (missingDueCount > 0 && profileOverdueNoteEl) {
          profileOverdueNoteEl.textContent = `Недостаточно данных для расчёта для ${missingDueCount} задач без срока.`;
          profileOverdueNoteEl.hidden = false;
        }

        overdueWithDue.slice(0, 8).forEach((task) => {
          const item = document.createElement("div");
          item.className = "profile-overdue-item";
          const safeTitle = task.title;
          const escapedTitle = safeTitle
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

          item.innerHTML = `
            <div class="profile-overdue-title" title="${escapedTitle}">${escapedTitle}</div>
            <div class="profile-overdue-meta">
              <span class="profile-overdue-late">${formatDurationCompact(task.overdueMs)}</span>
              <span>${formatShortDateTimeRu(task.dueDate)}</span>
            </div>
          `;
          profileOverdueRoot.appendChild(item);
        });
      }
    }

    const samples = tasks
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
      if (profileAvgValueEl) profileAvgValueEl.textContent = "Недостаточно данных для расчёта";
      if (profileAvgSubEl) profileAvgSubEl.textContent = "Нет завершённых задач";
      if (profileAvgChartEl) {
        profileAvgChartEl.innerHTML = `
          <svg viewBox="0 0 520 42" width="100%" height="42" role="img" aria-label="Диаграмма времени выполнения">
            <text x="0" y="28" font-size="13" fill="rgba(127, 139, 161, 0.92)">Недостаточно данных для диаграммы</text>
          </svg>
        `;
      }
    } else {
      const avg = samples.reduce((acc, ms) => acc + ms, 0) / samples.length;
      if (profileAvgValueEl) profileAvgValueEl.textContent = formatDurationCompact(avg);
      if (profileAvgSubEl) profileAvgSubEl.textContent = `Завершённых задач: ${samples.length}`;

      if (profileAvgChartEl) {
        const bins = [
          { title: "<1д", from: 0, to: 24 * 60 * 60 * 1000 },
          { title: "1-2д", from: 24 * 60 * 60 * 1000, to: 2 * 24 * 60 * 60 * 1000 },
          { title: "2-3д", from: 2 * 24 * 60 * 60 * 1000, to: 3 * 24 * 60 * 60 * 1000 },
          { title: "3-5д", from: 3 * 24 * 60 * 60 * 1000, to: 5 * 24 * 60 * 60 * 1000 },
          { title: "5-7д", from: 5 * 24 * 60 * 60 * 1000, to: 7 * 24 * 60 * 60 * 1000 },
          { title: "7-14д", from: 7 * 24 * 60 * 60 * 1000, to: 14 * 24 * 60 * 60 * 1000 },
          { title: ">14д", from: 14 * 24 * 60 * 60 * 1000, to: Number.POSITIVE_INFINITY }
        ];
        const countsByBin = bins.map((bin) => samples.filter((ms) => ms >= bin.from && ms < bin.to).length);
        const maxCount = Math.max(...countsByBin, 1);

        const width = 520;
        const height = 86;
        const pad = 8;
        const chartHeight = 50;
        const gap = 8;
        const barWidth = Math.floor((width - pad * 2 - gap * (bins.length - 1)) / bins.length);
        const baseY = pad + chartHeight;

        const bars = bins.map((bin, idx) => {
          const count = countsByBin[idx];
          const h = Math.round((count / maxCount) * chartHeight);
          const x = pad + idx * (barWidth + gap);
          const y = baseY - h;
          const title = `${bin.title}: ${count}`;
          return `
            <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="8" fill="rgba(68, 210, 199, 0.92)"><title>${title}</title></rect>
            <text x="${x + barWidth / 2}" y="${pad + chartHeight + 22}" text-anchor="middle" font-size="11" fill="rgba(127, 139, 161, 0.92)">${bin.title}</text>
          `;
        }).join("");

        profileAvgChartEl.innerHTML = `
          <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Диаграмма времени выполнения">
            ${bars}
          </svg>
        `;
      }
    }
  };

  const openAvatarModal = (member) => {
    if (!avatarModal || !avatarModalAvatarEl) return;

    const id = Number(member?.id);
    const name = normalizeToken(member?.name) || "Пользователь";
    const email = normalizeToken(member?.email) || "";
    const initials = toInitials(name || email, "U");
    const avatarPath = normalizeToken(member?.avatarPath);

    if (avatarModalTitleEl) avatarModalTitleEl.textContent = name;
    applyAccountAvatarToElement(avatarModalAvatarEl, avatarModalAvatarTextEl, initials, avatarPath);

    avatarModal.removeAttribute("hidden");
    window.setTimeout(() => {
      const btn = avatarModal.querySelector("button[data-close-avatar]");
      if (btn instanceof HTMLElement) {
        btn.focus();
      }
    }, 0);
  };

  const normalizeRoleValue = (value) => {
    if (typeof value === "number") {
      return value === 3 ? "Owner" : value === 2 ? "Admin" : "Member";
    }

    const raw = normalizeToken(value);
    if (raw === "3") return "Owner";
    if (raw === "2") return "Admin";
    if (raw === "1") return "Member";
    return raw || "Member";
  };

  const applyProfileMemberToUi = (member) => {
    const id = Number(member?.id);
    const name = normalizeToken(member?.name) || "Пользователь";
    const email = normalizeToken(member?.email) || "-";
    const role = normalizeRoleValue(member?.role);
    const initials = toInitials(name || email, "U");
    const avatarPath = normalizeToken(member?.avatarPath);

    activeProfileMember = {
      id,
      name,
      email,
      role,
      avatarPath
    };

    if (profileUserNameEl) profileUserNameEl.textContent = name;
    if (profileUserEmailEl) profileUserEmailEl.textContent = email;
    if (profileUserRoleEl) profileUserRoleEl.textContent = getRoleLabel(role);
    applyAccountAvatarToElement(profileAvatarEl, profileAvatarTextEl, initials, avatarPath);
  };

  const syncProfileActionButtonsState = (userIdValue) => {
    const userId = Number(userIdValue);
    const actorId = typeof getActorUserId === "function" ? Number(getActorUserId()) : 0;
    const hidden = !Number.isFinite(userId) || userId <= 0 || userId === actorId;
    [profileMessageBtn, profileNotificationsBtn, profileChatBtn].forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.hidden = hidden;
      btn.disabled = hidden;
    });
  };

  const fetchWorkspaceMemberById = async (userId) => {
    const workspaceId = typeof getWorkspaceId === "function" ? Number(getWorkspaceId()) : NaN;
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) return null;

    const response = await apiFetch(buildApiUrl(`/spaces/${workspaceId}/members`), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      await handleApiError(response, "Загрузка профиля участника");
      return null;
    }

    let members = null;
    try {
      members = await response.json();
    } catch {
      return null;
    }

    if (!Array.isArray(members)) return null;
    const match = members.find((item) => Number(item?.userId ?? item?.id) === Number(userId));
    if (!match) return null;

    return {
      id: Number(match?.userId ?? match?.id),
      name: normalizeToken(match?.name) || normalizeToken(match?.email) || "Пользователь",
      email: normalizeToken(match?.email) || "-",
      role: normalizeToken(match?.role) || "Member",
      avatarPath: normalizeToken(match?.avatarPath)
    };
  };

  const openProfileModal = async (member) => {
    if (!profileModal) {
      const name = normalizeToken(member?.name) || "Пользователь";
      const email = normalizeToken(member?.email) || "-";
      const role = normalizeRoleValue(member?.role);
      window.alert(`${name}\n\nПочта: ${email}\nРоль: ${getRoleLabel(role)}`);
      return;
    }

    const id = Number(member?.id ?? member?.userId);
    applyProfileMemberToUi({
      id,
      name: normalizeToken(member?.name) || "Пользователь",
      email: normalizeToken(member?.email) || "-",
      role: normalizeRoleValue(member?.role),
      avatarPath: normalizeToken(member?.avatarPath)
    });
    syncProfileActionButtonsState(id);

    profileModal.removeAttribute("hidden");
    void renderProfileReports(activeProfileMember);
    profileDetailsRequestSeq += 1;
    const seq = profileDetailsRequestSeq;
    window.setTimeout(() => {
      const btn = profileModal.querySelector("button[data-close-profile]");
      if (btn instanceof HTMLElement) {
        btn.focus();
      }
    }, 0);

    if (Number.isFinite(id) && id > 0) {
      const freshMember = await fetchWorkspaceMemberById(id);
      if (seq !== profileDetailsRequestSeq || !isProfileModalOpen() || !freshMember) {
        return;
      }
      applyProfileMemberToUi(freshMember);
      syncProfileActionButtonsState(freshMember.id);
      void renderProfileReports(activeProfileMember);
    }
  };

  if (profileAvatarEl) {
    profileAvatarEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!activeProfileMember) return;
      openAvatarModal(activeProfileMember);
    });
  }

  const openDirectFromProfile = async (mode = "message") => {
    const userId = Number(activeProfileMember?.id);
    const handler = mode === "notifications"
      ? (typeof openDirectChatNotifications === "function" ? openDirectChatNotifications : openDirectChat)
      : openDirectChat;
    if (!Number.isFinite(userId) || userId <= 0 || typeof handler !== "function") {
      return;
    }

    const actions = [profileMessageBtn, profileNotificationsBtn, profileChatBtn].filter((btn) => btn instanceof HTMLButtonElement);
    actions.forEach((btn) => {
      btn.disabled = true;
    });
    try {
      await handler(userId);
      closeProfileModal();
    } finally {
      syncProfileActionButtonsState(userId);
    }
  };

  if (profileMessageBtn instanceof HTMLButtonElement) {
    profileMessageBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openDirectFromProfile("message");
    });
  }

  if (profileNotificationsBtn instanceof HTMLButtonElement) {
    profileNotificationsBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openDirectFromProfile("notifications");
    });
  }

  if (profileChatBtn instanceof HTMLButtonElement) {
    profileChatBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openDirectFromProfile("message");
    });
  }

  return {
    openProfileModal,
    closeProfileModal,
    closeAvatarModal,
    isProfileModalOpen,
    isAvatarModalOpen
  };
};
