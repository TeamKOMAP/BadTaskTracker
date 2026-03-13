import {
  CHAT_RAIL_MIN_WIDTH,
  CHAT_RAIL_MAX_WIDTH,
  CHAT_RAIL_DEFAULT_WIDTH,
  clampChatRailWidth,
  isChatRailExpanded,
  readStoredChatRailWidth,
  storeChatRailWidth
} from "./chat-state.js?v=chatstate1";

const CHAT_MESSAGE_KIND_TEXT = 1;

const CHAT_TYPE_LABELS = {
  1: "Общий чат",
  2: "Групповой чат",
  3: "Личный чат",
  4: "Чат задачи"
};

const toChatId = (value) => {
  const token = String(value ?? "").trim();
  return token || null;
};

const toSafeDate = (value) => {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
};

const formatMessageTime = (value) => {
  const date = toSafeDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const buildFallbackChatTitle = (chat) => {
  const taskId = Number(chat?.taskId);
  if (Number.isFinite(taskId) && taskId > 0) {
    return `Задача #${taskId}`;
  }
  return "Чат";
};

const normalizeChatRoom = (chat, normalizeToken) => {
  const id = toChatId(chat?.id ?? chat?.Id);
  if (!id) return null;

  const typeRaw = Number(chat?.type ?? chat?.Type);
  const type = Number.isFinite(typeRaw) && typeRaw > 0 ? typeRaw : 2;
  const title = normalizeToken(chat?.title ?? chat?.Title);
  const taskIdRaw = Number(chat?.taskId ?? chat?.TaskId);
  const taskId = Number.isFinite(taskIdRaw) && taskIdRaw > 0 ? taskIdRaw : null;
  const updatedAtUtc = String(chat?.updatedAtUtc ?? chat?.UpdatedAtUtc ?? "").trim();

  return {
    id,
    type,
    title: title || buildFallbackChatTitle({ taskId }),
    taskId,
    updatedAtUtc
  };
};

const normalizeChatMessage = (message, normalizeToken) => {
  const idRaw = Number(message?.id ?? message?.Id);
  const id = Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null;
  const senderUserIdRaw = Number(message?.senderUserId ?? message?.SenderUserId);
  const senderUserId = Number.isFinite(senderUserIdRaw) && senderUserIdRaw > 0 ? senderUserIdRaw : null;
  const body = normalizeToken(message?.bodyCipher ?? message?.BodyCipher);

  return {
    id,
    senderUserId,
    body: body || "-",
    createdAtUtc: String(message?.createdAtUtc ?? message?.CreatedAtUtc ?? "").trim(),
    editedAtUtc: String(message?.editedAtUtc ?? message?.EditedAtUtc ?? "").trim(),
    deletedAtUtc: String(message?.deletedAtUtc ?? message?.DeletedAtUtc ?? "").trim()
  };
};

const byDateAsc = (left, right) => {
  const leftMs = Date.parse(String(left?.createdAtUtc || ""));
  const rightMs = Date.parse(String(right?.createdAtUtc || ""));
  const safeLeft = Number.isFinite(leftMs) ? leftMs : 0;
  const safeRight = Number.isFinite(rightMs) ? rightMs : 0;
  return safeLeft - safeRight;
};

export const createWorkspaceChatController = (deps = {}) => {
  const chatRail = deps.chatRail ?? null;
  const chatRailList = deps.chatRailList ?? null;
  const chatRailEmpty = deps.chatRailEmpty ?? null;
  const chatRailResizer = deps.chatRailResizer ?? null;
  const chatHomeBtn = deps.chatHomeBtn ?? null;

  const chatShell = deps.chatShell ?? null;
  const chatShellTitle = deps.chatShellTitle ?? null;
  const chatShellSub = deps.chatShellSub ?? null;
  const chatShellAvatar = deps.chatShellAvatar ?? null;
  const chatShellMessages = deps.chatShellMessages ?? null;
  const chatShellEmpty = deps.chatShellEmpty ?? null;
  const chatShellForm = deps.chatShellForm ?? null;
  const chatShellInput = deps.chatShellInput ?? null;
  const chatShellSendBtn = deps.chatShellSendBtn ?? null;

  const buildApiUrl = typeof deps.buildApiUrl === "function" ? deps.buildApiUrl : null;
  const apiFetch = typeof deps.apiFetch === "function" ? deps.apiFetch : null;
  const handleApiError = typeof deps.handleApiError === "function" ? deps.handleApiError : async () => {};
  const normalizeToken = typeof deps.normalizeToken === "function" ? deps.normalizeToken : (value) => String(value || "").trim();
  const toInitials = typeof deps.toInitials === "function" ? deps.toInitials : (value) => String(value || "").slice(0, 2).toUpperCase();
  const getWorkspaceId = typeof deps.getWorkspaceId === "function" ? deps.getWorkspaceId : () => null;
  const getActorUserId = typeof deps.getActorUserId === "function" ? deps.getActorUserId : () => null;
  const getActorDisplayName = typeof deps.getActorDisplayName === "function" ? deps.getActorDisplayName : () => "Вы";
  const getMemberById = typeof deps.getMemberById === "function" ? deps.getMemberById : () => null;
  const getWorkspaceMembers = typeof deps.getWorkspaceMembers === "function" ? deps.getWorkspaceMembers : () => [];
  const onOpenTasks = typeof deps.onOpenTasks === "function" ? deps.onOpenTasks : () => {};
  const onOpenChat = typeof deps.onOpenChat === "function" ? deps.onOpenChat : () => {};

  const canUseApi = () => Boolean(apiFetch && buildApiUrl);

  let initialized = false;
  let currentRailWidth = CHAT_RAIL_DEFAULT_WIDTH;
  let chats = [];
  let chatFeatureEnabled = true;
  let useMockData = false;
  let activeChatId = null;
  let isLoadingMessages = false;
  let isSendingMessage = false;
  let dragState = null;

  const messagesByChatId = new Map();
  const previewByChatId = new Map();

  const setRailExpandedClass = (width) => {
    if (!(chatRail instanceof HTMLElement)) return;
    chatRail.classList.toggle("is-expanded", isChatRailExpanded(width));
  };

  const setRailWidth = (width, persist = true) => {
    currentRailWidth = clampChatRailWidth(width);
    if (chatRail instanceof HTMLElement) {
      chatRail.style.setProperty("--chat-rail-width", `${currentRailWidth}px`);
      chatRail.style.width = `${currentRailWidth}px`;
      chatRail.style.minWidth = `${currentRailWidth}px`;
    }
    setRailExpandedClass(currentRailWidth);
    if (persist) {
      storeChatRailWidth(currentRailWidth);
    }
  };

  const setChatAvailabilityState = (enabled, emptyMessage) => {
    chatFeatureEnabled = Boolean(enabled);
    if (chatRail instanceof HTMLElement) {
      chatRail.classList.toggle("is-disabled", !chatFeatureEnabled);
    }
    if (chatRailEmpty instanceof HTMLElement) {
      chatRailEmpty.textContent = emptyMessage || (chatFeatureEnabled ? "Пока нет чатов." : "Чаты недоступны в этом окружении.");
      chatRailEmpty.toggleAttribute("hidden", false);
    }
  };

  const showChatPlaceholder = (title, subtitle, message) => {
    if (chatShellTitle) {
      chatShellTitle.textContent = title || "Чат";
    }
    if (chatShellSub) {
      chatShellSub.textContent = subtitle || "";
    }
    if (chatShellAvatar) {
      chatShellAvatar.textContent = toInitials(title || "Чат", "CH");
    }
    if (chatShellMessages) {
      chatShellMessages.innerHTML = "";
      chatShellMessages.setAttribute("hidden", "");
    }
    if (chatShellEmpty) {
      chatShellEmpty.textContent = message || "Выберите чат слева.";
      chatShellEmpty.removeAttribute("hidden");
    }
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.value = "";
      chatShellInput.disabled = true;
    }
    if (chatShellSendBtn instanceof HTMLButtonElement) {
      chatShellSendBtn.disabled = true;
    }
  };

  const getChatTypeLabel = (type) => {
    return CHAT_TYPE_LABELS[Number(type)] || "Чат";
  };

  const getChatAvatarText = (chat) => {
    const type = Number(chat?.type);
    if (type === 4) return "TK";
    if (type === 1) return "GN";
    return toInitials(chat?.title || "Чат", "CH");
  };

  const getChatPreview = (chatId) => {
    const preview = normalizeToken(previewByChatId.get(chatId));
    if (!preview) return "Без сообщений";
    return preview.length > 64 ? `${preview.slice(0, 61)}...` : preview;
  };

  const buildMockChats = () => {
    const actorUserId = Number(getActorUserId());
    const actorName = normalizeToken(getActorDisplayName()) || "Вы";
    const members = Array.isArray(getWorkspaceMembers()) ? getWorkspaceMembers() : [];
    const peer = members.find((member) => {
      const id = Number(member?.id);
      return Number.isFinite(id) && id > 0 && id !== actorUserId;
    }) || null;

    const peerUserId = Number(peer?.id);
    const peerId = Number.isFinite(peerUserId) && peerUserId > 0 ? peerUserId : 404;
    const peerName = normalizeToken(peer?.name) || "София";

    const now = Date.now();
    const mkIso = (shiftMs) => new Date(now + shiftMs).toISOString();

    const mockChats = [
      {
        id: "mock-task-1",
        type: 4,
        title: "Задачи спринта",
        taskId: 1,
        updatedAtUtc: mkIso(-5 * 60 * 1000)
      },
      {
        id: "mock-general-1",
        type: 1,
        title: "Общий чат проекта",
        taskId: null,
        updatedAtUtc: mkIso(-8 * 60 * 1000)
      },
      {
        id: `mock-direct-${peerId}`,
        type: 3,
        title: peerName,
        taskId: null,
        updatedAtUtc: mkIso(-3 * 60 * 1000)
      }
    ];

    messagesByChatId.clear();
    previewByChatId.clear();

    const seedTask = [
      {
        id: now - 20,
        senderUserId: peerId,
        body: "Добавила обновление по задаче, посмотри пожалуйста.",
        createdAtUtc: mkIso(-32 * 60 * 1000),
        editedAtUtc: "",
        deletedAtUtc: ""
      },
      {
        id: now - 19,
        senderUserId: Number.isFinite(actorUserId) ? actorUserId : 1,
        body: "Принял, сейчас проверю и отпишусь.",
        createdAtUtc: mkIso(-30 * 60 * 1000),
        editedAtUtc: "",
        deletedAtUtc: ""
      }
    ];

    const seedGeneral = [
      {
        id: now - 18,
        senderUserId: peerId,
        body: "Не забудьте про демо в 16:00.",
        createdAtUtc: mkIso(-12 * 60 * 1000),
        editedAtUtc: "",
        deletedAtUtc: ""
      }
    ];

    const seedDirect = [
      {
        id: now - 17,
        senderUserId: peerId,
        body: `Привет, ${actorName}! Есть минутка обсудить приоритеты?`,
        createdAtUtc: mkIso(-4 * 60 * 1000),
        editedAtUtc: "",
        deletedAtUtc: ""
      }
    ];

    messagesByChatId.set("mock-task-1", seedTask);
    messagesByChatId.set("mock-general-1", seedGeneral);
    messagesByChatId.set(`mock-direct-${peerId}`, seedDirect);

    previewByChatId.set("mock-task-1", seedTask[seedTask.length - 1].body);
    previewByChatId.set("mock-general-1", seedGeneral[seedGeneral.length - 1].body);
    previewByChatId.set(`mock-direct-${peerId}`, seedDirect[seedDirect.length - 1].body);

    return mockChats;
  };

  const buildDisplayEntries = () => {
    if (!chatFeatureEnabled) {
      return [];
    }

    const actorId = Number(getActorUserId());
    const nonDirectChats = chats
      .filter((chat) => Number(chat?.type) !== 3)
      .map((chat) => ({
        entryId: `chat:${chat.id}`,
        kind: "chat",
        chatId: chat.id,
        userId: null,
        type: chat.type,
        title: chat.title
      }));

    const directChatsByTitle = new Map();
    chats
      .filter((chat) => Number(chat?.type) === 3)
      .forEach((chat) => {
        const key = normalizeToken(chat?.title).toLowerCase();
        if (key) {
          directChatsByTitle.set(key, chat);
        }
      });

    const memberDirectEntries = (Array.isArray(getWorkspaceMembers()) ? getWorkspaceMembers() : [])
      .map((member) => {
        const userId = Number(member?.id);
        if (!Number.isFinite(userId) || userId <= 0) return null;
        if (Number.isFinite(actorId) && actorId === userId) return null;

        const title = normalizeToken(member?.name) || `User ${userId}`;
        const existing = directChatsByTitle.get(title.toLowerCase()) || null;

        return {
          entryId: `direct:${userId}`,
          kind: "direct",
          chatId: toChatId(existing?.id),
          userId,
          type: 3,
          title
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(left.title).localeCompare(String(right.title), "ru"));

    return [...nonDirectChats, ...memberDirectEntries];
  };

  const resolveMemberName = (userId) => {
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      return "Участник";
    }

    const actorId = Number(getActorUserId());
    if (Number.isFinite(actorId) && actorId === normalizedUserId) {
      return normalizeToken(getActorDisplayName()) || "Вы";
    }

    const member = getMemberById(normalizedUserId);
    const memberName = normalizeToken(member?.name);
    if (memberName) return memberName;
    return `User ${normalizedUserId}`;
  };

  const renderRailList = () => {
    if (!(chatRailList instanceof HTMLElement)) return;

    chatRailList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const entries = buildDisplayEntries();

    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-rail-item";
      if (entry.chatId) {
        button.dataset.chatId = entry.chatId;
      }
      if (Number.isFinite(Number(entry.userId)) && entry.userId > 0) {
        button.dataset.userId = String(entry.userId);
      }
      button.classList.toggle("is-active", Boolean(entry.chatId) && entry.chatId === activeChatId);

      const avatar = document.createElement("span");
      avatar.className = "chat-rail-avatar";
      avatar.textContent = entry.kind === "chat"
        ? getChatAvatarText(entry)
        : toInitials(entry.title || "Чат", "DM");

      const meta = document.createElement("span");
      meta.className = "chat-rail-meta";

      const name = document.createElement("span");
      name.className = "chat-rail-name";
      name.textContent = entry.title;

      const preview = document.createElement("span");
      preview.className = "chat-rail-preview";
      preview.textContent = entry.chatId
        ? getChatPreview(entry.chatId)
        : "Открыть диалог";

      meta.append(name, preview);
      button.append(avatar, meta);

      button.addEventListener("click", () => {
        if (entry.kind === "direct") {
          void openDirectChat(entry.userId);
          return;
        }
        void openChat(entry.chatId);
      });

      fragment.appendChild(button);
    });

    chatRailList.appendChild(fragment);

    if (chatHomeBtn instanceof HTMLButtonElement) {
      chatHomeBtn.classList.toggle("is-active", !activeChatId);
    }

    if (chatRailEmpty instanceof HTMLElement) {
      const shouldShowEmpty = !entries.length;
      chatRailEmpty.textContent = chatFeatureEnabled ? "Пока нет доступных чатов." : "Чаты недоступны в этом окружении.";
      chatRailEmpty.toggleAttribute("hidden", !shouldShowEmpty);
    }
  };

  const renderMessages = (chatId) => {
    if (!(chatShellMessages instanceof HTMLElement)) return;

    const list = Array.isArray(messagesByChatId.get(chatId))
      ? messagesByChatId.get(chatId)
      : [];

    chatShellMessages.innerHTML = "";

    if (!list.length) {
      chatShellMessages.setAttribute("hidden", "");
      if (chatShellEmpty instanceof HTMLElement) {
        chatShellEmpty.textContent = "В этом чате пока нет сообщений.";
        chatShellEmpty.removeAttribute("hidden");
      }
      return;
    }

    const actorUserId = Number(getActorUserId());
    const fragment = document.createDocumentFragment();

    list.forEach((message) => {
      const item = document.createElement("article");
      item.className = "chat-msg";

      if (Number.isFinite(actorUserId) && Number(message.senderUserId) === actorUserId) {
        item.classList.add("is-own");
      }

      if (message.deletedAtUtc) {
        item.classList.add("is-deleted");
      }

      const meta = document.createElement("div");
      meta.className = "chat-msg-meta";

      const author = document.createElement("span");
      author.className = "chat-msg-author";
      author.textContent = resolveMemberName(message.senderUserId);

      const time = document.createElement("span");
      time.className = "chat-msg-time";
      time.textContent = formatMessageTime(message.createdAtUtc);

      meta.append(author, time);

      const body = document.createElement("div");
      body.className = "chat-msg-body";
      body.textContent = message.body;

      item.append(meta, body);
      fragment.appendChild(item);
    });

    chatShellMessages.appendChild(fragment);
    chatShellMessages.removeAttribute("hidden");

    if (chatShellEmpty instanceof HTMLElement) {
      chatShellEmpty.setAttribute("hidden", "");
    }

    chatShellMessages.scrollTop = chatShellMessages.scrollHeight;
  };

  const markChatAsRead = async (chatId, messages) => {
    if (!canUseApi()) return;

    const list = Array.isArray(messages) ? messages : [];
    if (!list.length) return;

    const lastMessage = list[list.length - 1];
    const lastReadMessageId = Number(lastMessage?.id);
    if (!Number.isFinite(lastReadMessageId) || lastReadMessageId <= 0) return;

    try {
      await apiFetch(buildApiUrl(`/chats/${chatId}/read`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ lastReadMessageId })
      });
    } catch {
      // ignore mark-as-read failures
    }
  };

  const loadMessages = async (chatId) => {
    if (!canUseApi()) return;

    const response = await apiFetch(buildApiUrl(`/chats/${chatId}/messages`, { limit: 80 }), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      await handleApiError(response, "Загрузка сообщений чата");
      if (chatShellEmpty instanceof HTMLElement) {
        chatShellEmpty.textContent = "Не удалось загрузить сообщения.";
        chatShellEmpty.removeAttribute("hidden");
      }
      return;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const normalized = Array.isArray(payload)
      ? payload
        .map((message) => normalizeChatMessage(message, normalizeToken))
        .filter((message) => Number.isFinite(Number(message?.id)) && message?.body)
        .sort(byDateAsc)
      : [];

    messagesByChatId.set(chatId, normalized);
    if (normalized.length) {
      const last = normalized[normalized.length - 1];
      previewByChatId.set(chatId, normalizeToken(last?.body));
    }

    renderMessages(chatId);
    renderRailList();
    void markChatAsRead(chatId, normalized);
  };

  const setComposerEnabled = (enabled) => {
    const canUse = Boolean(enabled);
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.disabled = !canUse;
    }
    if (chatShellSendBtn instanceof HTMLButtonElement) {
      chatShellSendBtn.disabled = !canUse;
    }
  };

  const openChat = async (chatId) => {
    const targetId = toChatId(chatId);
    if (!targetId || !chatFeatureEnabled) return;

    const chat = chats.find((item) => item.id === targetId);
    if (!chat) return;

    activeChatId = targetId;
    renderRailList();

    if (chatShellTitle) {
      chatShellTitle.textContent = chat.title;
    }
    if (chatShellSub) {
      chatShellSub.textContent = getChatTypeLabel(chat.type);
    }
    if (chatShellAvatar) {
      chatShellAvatar.textContent = getChatAvatarText(chat);
    }

    setComposerEnabled(true);
    if (chatShellEmpty instanceof HTMLElement) {
      chatShellEmpty.textContent = "Загрузка сообщений...";
      chatShellEmpty.removeAttribute("hidden");
    }

    onOpenChat(chat);

    if (useMockData) {
      if (!messagesByChatId.has(targetId)) {
        messagesByChatId.set(targetId, []);
      }
      renderMessages(targetId);
      renderRailList();
      if (chatShellInput instanceof HTMLInputElement) {
        chatShellInput.focus();
      }
      return;
    }

    isLoadingMessages = true;
    await loadMessages(targetId);
    isLoadingMessages = false;
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.focus();
    }
  };

  const openDirectChat = async (userId) => {
    const targetUserId = Number(userId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) return;

    if (useMockData) {
      const targetMember = getMemberById(targetUserId);
      const title = normalizeToken(targetMember?.name) || `User ${targetUserId}`;
      const mockId = `mock-direct-${targetUserId}`;

      let chat = chats.find((item) => item.id === mockId);
      if (!chat) {
        chat = {
          id: mockId,
          type: 3,
          title,
          taskId: null,
          updatedAtUtc: new Date().toISOString()
        };
        chats = [...chats, chat];
      }

      if (!messagesByChatId.has(mockId)) {
        const seed = {
          id: Date.now() - 1,
          senderUserId: targetUserId,
          body: "Привет! Это тестовый диалог в демо-режиме.",
          createdAtUtc: new Date().toISOString(),
          editedAtUtc: "",
          deletedAtUtc: ""
        };
        messagesByChatId.set(mockId, [seed]);
        previewByChatId.set(mockId, seed.body);
      }

      renderRailList();
      await openChat(mockId);
      return;
    }

    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) return;
    if (!canUseApi()) return;

    const response = await apiFetch(buildApiUrl(`/chats/direct/${targetUserId}`, { workspaceId }), {
      method: "POST",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      await handleApiError(response, "Открытие личного чата");
      return;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const normalized = normalizeChatRoom(payload || {}, normalizeToken);
    if (!normalized?.id) {
      return;
    }

    chats = [
      ...chats.filter((chat) => chat.id !== normalized.id),
      normalized
    ];

    await fetchLatestPreview(normalized.id);
    await openChat(normalized.id);
  };

  const fetchLatestPreview = async (chatId) => {
    if (!canUseApi()) return;
    try {
      const response = await apiFetch(buildApiUrl(`/chats/${chatId}/messages`, { limit: 1 }), {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const first = Array.isArray(payload) && payload.length ? payload[0] : null;
      const previewText = normalizeToken(first?.bodyCipher ?? first?.BodyCipher);
      if (previewText) {
        previewByChatId.set(chatId, previewText);
      }
    } catch {
      // ignore preview failures
    }
  };

  const refreshChats = async () => {
    if (!canUseApi()) return;

    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      chats = [];
      activeChatId = null;
      useMockData = false;
      previewByChatId.clear();
      messagesByChatId.clear();
      renderRailList();
      return;
    }

    const response = await apiFetch(buildApiUrl("/chats", { workspaceId }), {
      headers: {
        Accept: "application/json"
      }
    });

    if (response.status === 404) {
      useMockData = true;
      chats = buildMockChats();
      activeChatId = null;
      setChatAvailabilityState(true, "Демо-чаты");
      renderRailList();
      showChatPlaceholder("Демо-режим чатов", "Chat API недоступен", "Откройте любой чат слева: работает локальный макет диалога.");
      return;
    }

    if (!response.ok) {
      useMockData = false;
      await handleApiError(response, "Загрузка списка чатов");
      setChatAvailabilityState(false, "Не удалось загрузить список чатов.");
      renderRailList();
      return;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    chats = Array.isArray(payload)
      ? payload
        .map((chat) => normalizeChatRoom(chat, normalizeToken))
        .filter(Boolean)
      : [];

    useMockData = false;
    setChatAvailabilityState(true);

    await Promise.all(chats.map((chat) => fetchLatestPreview(chat.id)));
    renderRailList();

    if (activeChatId && chats.some((chat) => chat.id === activeChatId)) {
      await openChat(activeChatId);
      return;
    }

    if (!activeChatId) {
      showChatPlaceholder("Выберите чат", "Диалог внутри проекта", "Выберите чат слева, чтобы открыть диалог.");
    }
  };

  const activateTasks = () => {
    activeChatId = null;
    renderRailList();
    onOpenTasks();
  };

  const clearWorkspaceData = () => {
    chats = [];
    activeChatId = null;
    useMockData = false;
    messagesByChatId.clear();
    previewByChatId.clear();
    setChatAvailabilityState(true);
    renderRailList();
    showChatPlaceholder("Выберите чат", "Диалог внутри проекта", "Выберите чат слева, чтобы открыть диалог.");
  };

  const syncMembers = () => {
    renderRailList();
    if (activeChatId) {
      renderMessages(activeChatId);
    }
  };

  const sendMessage = async () => {
    if (isSendingMessage || isLoadingMessages) return;
    if (!chatFeatureEnabled || !activeChatId) return;
    if (!(chatShellInput instanceof HTMLInputElement)) return;

    const body = normalizeToken(chatShellInput.value);
    if (!body) return;

    if (useMockData) {
      const actorIdRaw = Number(getActorUserId());
      const actorId = Number.isFinite(actorIdRaw) && actorIdRaw > 0 ? actorIdRaw : 1;
      const draft = {
        id: Date.now(),
        senderUserId: actorId,
        body,
        createdAtUtc: new Date().toISOString(),
        editedAtUtc: "",
        deletedAtUtc: ""
      };
      const next = Array.isArray(messagesByChatId.get(activeChatId))
        ? [...messagesByChatId.get(activeChatId), draft].sort(byDateAsc)
        : [draft];
      messagesByChatId.set(activeChatId, next);
      previewByChatId.set(activeChatId, draft.body);
      renderMessages(activeChatId);
      renderRailList();
      chatShellInput.value = "";
      chatShellInput.focus();
      return;
    }

    if (!canUseApi()) return;

    isSendingMessage = true;
    setComposerEnabled(false);

    const response = await apiFetch(buildApiUrl(`/chats/${activeChatId}/messages`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        kind: CHAT_MESSAGE_KIND_TEXT,
        bodyCipher: body
      })
    });

    if (!response.ok) {
      await handleApiError(response, "Отправка сообщения");
      isSendingMessage = false;
      setComposerEnabled(true);
      return;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const normalized = normalizeChatMessage(payload || {}, normalizeToken);
    if (Number.isFinite(Number(normalized?.id))) {
      const next = Array.isArray(messagesByChatId.get(activeChatId))
        ? [...messagesByChatId.get(activeChatId), normalized].sort(byDateAsc)
        : [normalized];
      messagesByChatId.set(activeChatId, next);
      previewByChatId.set(activeChatId, normalizeToken(normalized.body));
      renderMessages(activeChatId);
      renderRailList();
      void markChatAsRead(activeChatId, next);
    } else {
      await loadMessages(activeChatId);
    }

    chatShellInput.value = "";
    setComposerEnabled(true);
    chatShellInput.focus();
    isSendingMessage = false;
  };

  const stopResize = () => {
    if (!dragState) return;
    dragState = null;
    document.body.classList.remove("is-chat-rail-resizing");
    document.removeEventListener("pointermove", handleResizeMove);
    document.removeEventListener("pointerup", stopResize);
    document.removeEventListener("pointercancel", stopResize);
  };

  const handleResizeMove = (event) => {
    if (!dragState) return;
    const deltaX = event.clientX - dragState.startX;
    setRailWidth(dragState.startWidth + deltaX, true);
  };

  const startResize = (event) => {
    event.preventDefault();
    dragState = {
      startX: event.clientX,
      startWidth: currentRailWidth
    };
    document.body.classList.add("is-chat-rail-resizing");
    document.addEventListener("pointermove", handleResizeMove);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
  };

  const handleResizerKeydown = (event) => {
    if (!event) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setRailWidth(currentRailWidth - 16, true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setRailWidth(currentRailWidth + 16, true);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setRailWidth(CHAT_RAIL_MIN_WIDTH, true);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setRailWidth(CHAT_RAIL_MAX_WIDTH, true);
    }
  };

  const init = () => {
    if (initialized) return;
    initialized = true;

    setRailWidth(readStoredChatRailWidth(), false);
    renderRailList();
    showChatPlaceholder("Выберите чат", "Диалог внутри проекта", "Выберите чат слева, чтобы открыть диалог.");

    if (chatHomeBtn instanceof HTMLButtonElement) {
      chatHomeBtn.addEventListener("click", () => {
        activateTasks();
      });
    }

    if (chatShellForm instanceof HTMLFormElement) {
      chatShellForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void sendMessage();
      });
    }

    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void sendMessage();
        }
      });
    }

    if (chatRailResizer instanceof HTMLElement) {
      chatRailResizer.addEventListener("pointerdown", (event) => {
        startResize(event);
      });
      chatRailResizer.addEventListener("keydown", handleResizerKeydown);
      chatRailResizer.addEventListener("dblclick", () => {
        const next = isChatRailExpanded(currentRailWidth)
          ? CHAT_RAIL_MIN_WIDTH
          : CHAT_RAIL_DEFAULT_WIDTH;
        setRailWidth(next, true);
      });
    }
  };

  return {
    init,
    refreshChats,
    openChat,
    activateTasks,
    clearWorkspaceData,
    syncMembers
  };
};
