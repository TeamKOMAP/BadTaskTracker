import {
  CHAT_RAIL_MIN_WIDTH,
  CHAT_RAIL_MAX_WIDTH,
  CHAT_RAIL_DEFAULT_WIDTH,
  clampChatRailWidth,
  isChatRailExpanded,
  readStoredChatRailWidth,
  storeChatRailWidth
} from "../workspace/chat-state.js?v=chatstate1";
import { createChatApi } from "./api.js?v=chat5";
import { createChatStore } from "./store.js?v=chat4";
import { createChatSignalRClient } from "./signalr-client.js?v=chatrt1";

const CHAT_MESSAGE_KIND_TEXT = 1;
const CHAT_PAGE_SIZE = 30;
const CHAT_SETTINGS_STORAGE_KEY = "gtt-chat-ui-settings-v1";
const CHAT_BOTTOM_THRESHOLD_PX = 96;
const CHAT_TOP_THRESHOLD_PX = 56;

const CHAT_TYPE_LABELS = {
  1: "General",
  2: "Group",
  3: "DM",
  4: "Task"
};

const createComposerState = () => ({
  mode: "compose",
  chatId: null,
  messageId: null,
  messageIds: [],
  body: "",
  summary: ""
});

const toChatId = (value) => {
  const token = String(value ?? "").trim();
  return token || null;
};

const normalizeUtcDateValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(raw)) {
    return raw;
  }
  return `${raw}Z`;
};

const toSafeDate = (value) => {
  const ms = Date.parse(normalizeUtcDateValue(value));
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

const createClientMessageId = () => {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.round(Math.random() * 100000)}`;
};

const formatBytes = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageContentType = (contentType) => String(contentType || "").toLowerCase().startsWith("image/");
const isVoiceContentType = (contentType) => String(contentType || "").toLowerCase().startsWith("audio/");

const getMessageKindForFile = (file) => {
  const contentType = String(file?.type || "").toLowerCase();
  if (isVoiceContentType(contentType)) return 4;
  if (isImageContentType(contentType)) return 3;
  return 2;
};

const getMessageBodyForFile = (file, kind) => {
  const name = String(file?.name || "").trim();
  if (kind === 4) {
    return name || "Голосовое сообщение";
  }
  if (kind === 3) {
    return name || "Изображение";
  }
  return name || "Файл";
};

const formatMediaTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const hashToken = (value) => {
  const source = String(value || "voice");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const readUiSettings = () => {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeUiSettings = (value) => {
  try {
    localStorage.setItem(CHAT_SETTINGS_STORAGE_KEY, JSON.stringify(value || {}));
  } catch {
    // ignore storage errors
  }
};

const buildMockChats = ({ getActorUserId, getActorDisplayName, getWorkspaceMembers, normalizeToken }) => {
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

  const chats = [
    {
      id: "mock-general-1",
      type: 1,
      title: "Команда проекта",
      taskId: null,
      updatedAtUtc: mkIso(-10 * 60 * 1000)
    },
    {
      id: "mock-group-1",
      type: 2,
      title: "Дизайн-ревью",
      taskId: null,
      updatedAtUtc: mkIso(-8 * 60 * 1000)
    },
    {
      id: "mock-task-1",
      type: 4,
      title: "Задачи спринта",
      taskId: 17,
      updatedAtUtc: mkIso(-6 * 60 * 1000)
    },
    {
      id: `mock-direct-${peerId}`,
      type: 3,
      title: peerName,
      taskId: null,
      updatedAtUtc: mkIso(-4 * 60 * 1000)
    }
  ];

  const messagesByChatId = new Map([
    [
      "mock-general-1",
      [
        {
          id: now - 25,
          senderUserId: peerId,
          body: "Не забудьте синк в 16:00.",
          kind: CHAT_MESSAGE_KIND_TEXT,
          replyToMessageId: null,
          forwardedFromMessageId: null,
          clientMessageId: null,
          createdAtUtc: mkIso(-28 * 60 * 1000),
          editedAtUtc: "",
          deletedAtUtc: ""
        }
      ]
    ],
    [
      "mock-group-1",
      [
        {
          id: now - 24,
          senderUserId: Number.isFinite(actorUserId) ? actorUserId : 1,
          body: "Соберу макеты к вечеру.",
          kind: CHAT_MESSAGE_KIND_TEXT,
          replyToMessageId: null,
          forwardedFromMessageId: null,
          clientMessageId: null,
          createdAtUtc: mkIso(-20 * 60 * 1000),
          editedAtUtc: "",
          deletedAtUtc: ""
        }
      ]
    ],
    [
      "mock-task-1",
      [
        {
          id: now - 23,
          senderUserId: peerId,
          body: "Добавила обновление по задаче, посмотри пожалуйста.",
          kind: CHAT_MESSAGE_KIND_TEXT,
          replyToMessageId: null,
          forwardedFromMessageId: null,
          clientMessageId: null,
          createdAtUtc: mkIso(-14 * 60 * 1000),
          editedAtUtc: "",
          deletedAtUtc: ""
        },
        {
          id: now - 22,
          senderUserId: Number.isFinite(actorUserId) ? actorUserId : 1,
          body: `Принял, ${actorName}, беру в работу.`,
          kind: CHAT_MESSAGE_KIND_TEXT,
          replyToMessageId: now - 23,
          forwardedFromMessageId: null,
          clientMessageId: null,
          createdAtUtc: mkIso(-10 * 60 * 1000),
          editedAtUtc: "",
          deletedAtUtc: ""
        }
      ]
    ],
    [
      `mock-direct-${peerId}`,
      [
        {
          id: now - 21,
          senderUserId: peerId,
          body: `Привет, ${actorName}! Есть минутка обсудить приоритеты?`,
          kind: CHAT_MESSAGE_KIND_TEXT,
          replyToMessageId: null,
          forwardedFromMessageId: null,
          clientMessageId: null,
          createdAtUtc: mkIso(-4 * 60 * 1000),
          editedAtUtc: "",
          deletedAtUtc: ""
        }
      ]
    ]
  ]);

  return { chats, messagesByChatId };
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
  const chatShellBulkActions = deps.chatShellBulkActions ?? null;
  const chatShellBulkCancelBtn = deps.chatShellBulkCancelBtn ?? null;
  const chatShellBulkForwardBtn = deps.chatShellBulkForwardBtn ?? null;
  const chatShellBulkDeleteBtn = deps.chatShellBulkDeleteBtn ?? null;
  const chatShellSettingsBtn = deps.chatShellSettingsBtn ?? null;
  const chatSettingsPanel = deps.chatSettingsPanel ?? null;
  const chatSettingsMuted = deps.chatSettingsMuted ?? null;
  const chatSettingsSound = deps.chatSettingsSound ?? null;
  const chatSettingsSkipActive = deps.chatSettingsSkipActive ?? null;
  const chatSettingsRoomBlock = deps.chatSettingsRoomBlock ?? null;
  const chatSettingsTitleWrap = deps.chatSettingsTitleWrap ?? null;
  const chatSettingsTitle = deps.chatSettingsTitle ?? null;
  const chatSettingsBgBlock = deps.chatSettingsBgBlock ?? null;
  const chatSettingsBgHeading = deps.chatSettingsBgHeading ?? null;
  const chatSettingsSwatches = deps.chatSettingsSwatches ?? null;
  const chatSettingsNote = deps.chatSettingsNote ?? null;
  const chatSettingsSaveBtn = deps.chatSettingsSaveBtn ?? null;
  const chatShellFeed = deps.chatShellFeed ?? null;
  const chatShellMessages = deps.chatShellMessages ?? null;
  const chatShellEmpty = deps.chatShellEmpty ?? null;
  const chatMsgMenu = deps.chatMsgMenu ?? null;
  const chatMsgMenuReplyBtn = deps.chatMsgMenuReplyBtn ?? null;
  const chatMsgMenuForwardBtn = deps.chatMsgMenuForwardBtn ?? null;
  const chatMsgMenuEditBtn = deps.chatMsgMenuEditBtn ?? null;
  const chatMsgMenuDeleteBtn = deps.chatMsgMenuDeleteBtn ?? null;
  const chatShellForm = deps.chatShellForm ?? null;
  const chatShellRecording = deps.chatShellRecording ?? null;
  const chatShellRecordingMain = deps.chatShellRecordingMain ?? null;
  const chatShellRecordingStatus = deps.chatShellRecordingStatus ?? null;
  const chatShellRecordingTime = deps.chatShellRecordingTime ?? null;
  const chatShellRecordingWave = deps.chatShellRecordingWave ?? null;
  const chatShellRecordingCancelBtn = deps.chatShellRecordingCancelBtn ?? null;
  const chatShellRecordingPauseBtn = deps.chatShellRecordingPauseBtn ?? null;
  const chatShellRecordingSendBtn = deps.chatShellRecordingSendBtn ?? null;
  const chatShellInput = deps.chatShellInput ?? null;
  const chatShellSendBtn = deps.chatShellSendBtn ?? null;
  const chatShellLoadMoreBtn = deps.chatShellLoadMoreBtn ?? null;
  const chatShellContext = deps.chatShellContext ?? null;
  const chatShellContextLabel = deps.chatShellContextLabel ?? null;
  const chatShellContextText = deps.chatShellContextText ?? null;
  const chatShellContextCancelBtn = deps.chatShellContextCancelBtn ?? null;
  const chatShellAttachBtn = deps.chatShellAttachBtn ?? null;
  const chatShellVoiceBtn = deps.chatShellVoiceBtn ?? null;
  const chatShellVoiceStatus = deps.chatShellVoiceStatus ?? null;
  const chatShellUploadList = deps.chatShellUploadList ?? null;
  const chatShellFileInput = deps.chatShellFileInput ?? null;
  const chatShellJumpBottomBtn = deps.chatShellJumpBottomBtn ?? null;

  const normalizeToken = typeof deps.normalizeToken === "function" ? deps.normalizeToken : (value) => String(value || "").trim();
  const toInitials = typeof deps.toInitials === "function" ? deps.toInitials : (value) => String(value || "").slice(0, 2).toUpperCase();
  const getWorkspaceId = typeof deps.getWorkspaceId === "function" ? deps.getWorkspaceId : () => null;
  const getActorUserId = typeof deps.getActorUserId === "function" ? deps.getActorUserId : () => null;
  const getActorDisplayName = typeof deps.getActorDisplayName === "function" ? deps.getActorDisplayName : () => "Вы";
  const getMemberById = typeof deps.getMemberById === "function" ? deps.getMemberById : () => null;
  const getWorkspaceMembers = typeof deps.getWorkspaceMembers === "function" ? deps.getWorkspaceMembers : () => [];
  const getWorkspaceRole = typeof deps.getWorkspaceRole === "function" ? deps.getWorkspaceRole : () => "Member";
  const onOpenTasks = typeof deps.onOpenTasks === "function" ? deps.onOpenTasks : () => {};
  const onOpenChat = typeof deps.onOpenChat === "function" ? deps.onOpenChat : () => {};

  const api = createChatApi();
  const store = createChatStore();

  let initialized = false;
  let currentRailWidth = CHAT_RAIL_DEFAULT_WIDTH;
  let isLoadingMessages = false;
  let isLoadingOlderMessages = false;
  let isSendingMessage = false;
  let dragState = null;
  let composerState = createComposerState();
  let selectedMessageIds = new Set();
  let uploadQueue = [];
  let mediaRecorder = null;
  let mediaRecorderStream = null;
  let voiceChunks = [];
  let discardCurrentRecording = false;
  let voiceRecordingMode = "idle";
  let voiceRecordingElapsedMs = 0;
  let voiceRecordingStartedAt = 0;
  let voiceRecordingTimerId = 0;
  let voiceRecordingIntent = "cancel";
  let isSettingsOpen = false;
  let selectedBackground = "default";
  let settingsSaving = false;
  let contextMenuState = null;

  const attachmentsByMessageId = new Map();
  const attachmentLoadingByMessageId = new Map();
  const attachmentObjectUrls = new Map();
  const pendingVoiceUploadsByMessageId = new Map();
  const unreadByChatId = new Map();
  const readStateByChatId = new Map();
  const typingByChatId = new Map();
  const preferencesByChatId = new Map();
  const typingTimersByChatId = new Map();
  let typingStopTimeoutId = 0;
  let isTypingSent = false;

  const realtimeClient = createChatSignalRClient({
    onMessageCreated: (payload) => {
      handleRealtimeMessageCreated(payload);
    },
    onMessageUpdated: (payload) => {
      handleRealtimeMessageUpdated(payload);
    },
    onMessageDeleted: (payload) => {
      handleRealtimeMessageDeleted(payload);
    },
    onReadUpdated: (payload) => {
      handleRealtimeReadUpdated(payload);
    },
    onAttachmentUploaded: (payload) => {
      handleRealtimeAttachmentUploaded(payload);
    },
    onAttachmentDeleted: (payload) => {
      handleRealtimeAttachmentDeleted(payload);
    },
    onTypingUpdated: (payload) => {
      handleRealtimeTypingUpdated(payload);
    },
    onStateChanged: (state) => {
      handleRealtimeStateChanged(state);
    }
  });

  const normalizeChatRoom = (chat) => {
    const id = toChatId(chat?.id ?? chat?.Id);
    if (!id) return null;

    const typeRaw = Number(chat?.type ?? chat?.Type);
    const type = Number.isFinite(typeRaw) && typeRaw > 0 ? typeRaw : 2;
    const workspaceIdRaw = Number(chat?.workspaceId ?? chat?.WorkspaceId);
    const createdByUserIdRaw = Number(chat?.createdByUserId ?? chat?.CreatedByUserId);
    const title = normalizeToken(chat?.title ?? chat?.Title);
    const taskIdRaw = Number(chat?.taskId ?? chat?.TaskId);
    const taskId = Number.isFinite(taskIdRaw) && taskIdRaw > 0 ? taskIdRaw : null;
    const updatedAtUtc = normalizeUtcDateValue(chat?.updatedAtUtc ?? chat?.UpdatedAtUtc ?? "");

    return {
      id,
      workspaceId: Number.isFinite(workspaceIdRaw) && workspaceIdRaw > 0 ? workspaceIdRaw : null,
      type,
      title: title || buildFallbackChatTitle({ taskId }),
      taskId,
      createdByUserId: Number.isFinite(createdByUserIdRaw) && createdByUserIdRaw > 0 ? createdByUserIdRaw : null,
      updatedAtUtc
    };
  };

  const normalizeChatMessage = (message) => {
    const idRaw = Number(message?.id ?? message?.Id);
    const id = Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null;
    const senderUserIdRaw = Number(message?.senderUserId ?? message?.SenderUserId);
    const senderUserId = Number.isFinite(senderUserIdRaw) && senderUserIdRaw > 0 ? senderUserIdRaw : null;
    const body = normalizeToken(message?.bodyCipher ?? message?.BodyCipher);
    const replyToMessageId = Number(message?.replyToMessageId ?? message?.ReplyToMessageId);
    const forwardedFromMessageId = Number(message?.forwardedFromMessageId ?? message?.ForwardedFromMessageId);

    return {
      id,
      senderUserId,
      kind: Number(message?.kind ?? message?.Kind) || CHAT_MESSAGE_KIND_TEXT,
      body: body || "-",
      replyToMessageId: Number.isFinite(replyToMessageId) && replyToMessageId > 0 ? replyToMessageId : null,
      forwardedFromMessageId: Number.isFinite(forwardedFromMessageId) && forwardedFromMessageId > 0 ? forwardedFromMessageId : null,
      clientMessageId: normalizeToken(message?.clientMessageId ?? message?.ClientMessageId) || null,
      createdAtUtc: normalizeUtcDateValue(message?.createdAtUtc ?? message?.CreatedAtUtc ?? ""),
      editedAtUtc: normalizeUtcDateValue(message?.editedAtUtc ?? message?.EditedAtUtc ?? ""),
      deletedAtUtc: normalizeUtcDateValue(message?.deletedAtUtc ?? message?.DeletedAtUtc ?? "")
    };
  };

  const normalizeAttachment = (attachment) => {
    const id = toChatId(attachment?.id ?? attachment?.Id);
    const messageId = Number(attachment?.messageId ?? attachment?.MessageId);
    if (!id || !Number.isFinite(messageId) || messageId <= 0) return null;

    return {
      id,
      messageId,
      fileName: normalizeToken(attachment?.fileName ?? attachment?.FileName) || "attachment",
      contentType: normalizeToken(attachment?.contentType ?? attachment?.ContentType) || "application/octet-stream",
      size: Number(attachment?.size ?? attachment?.Size) || 0,
      durationMs: Number(attachment?.durationMs ?? attachment?.DurationMs) || null
    };
  };

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
    store.setFeatureEnabled(enabled);
    if (chatRail instanceof HTMLElement) {
      chatRail.classList.toggle("is-disabled", !enabled);
    }
    if (chatRailEmpty instanceof HTMLElement) {
      chatRailEmpty.textContent = emptyMessage || (enabled ? "Пока нет чатов." : "Чаты недоступны в этом окружении.");
      chatRailEmpty.toggleAttribute("hidden", enabled);
    }
  };

  const clearComposerIntent = () => {
    composerState = createComposerState();
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.value = "";
    }
    syncComposerUi();
  };

  const getChatTypeLabel = (type) => {
    return CHAT_TYPE_LABELS[Number(type)] || "Chat";
  };

  const getChatAvatarText = (chat) => {
    const type = Number(chat?.type);
    if (type === 4) return "TK";
    if (type === 1) return "GN";
    if (type === 2) return "GR";
    return toInitials(chat?.title || "Чат", "DM");
  };

  const getChatPreview = (chatId) => {
    const preview = normalizeToken(store.getPreview(chatId));
    if (!preview) return "Без сообщений";
    return preview.length > 64 ? `${preview.slice(0, 61)}...` : preview;
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

  const getMessageById = (chatId, messageId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return store.getMessages(chatId).find((message) => Number(message?.id) === id) || null;
  };

  const getSelectedMessageIds = () => {
    return Array.from(selectedMessageIds.values()).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  };

  const isSelectionMode = () => selectedMessageIds.size > 0;

  const clearSelectedMessages = () => {
    selectedMessageIds = new Set();
  };

  const exitSelectionMode = () => {
    const activeChatId = store.getActiveChatId();
    clearSelectedMessages();
    closeMessageContextMenu();
    setSettingsOpen(false);
    if (activeChatId) {
      renderMessages(activeChatId);
      updateHeader(store.getChatById(activeChatId));
    }
  };

  const toggleSelectedMessage = (messageId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (selectedMessageIds.has(id)) {
      selectedMessageIds.delete(id);
    } else {
      selectedMessageIds.add(id);
    }
  };

  const getSelectedMessages = (chatId) => {
    const ids = selectedMessageIds;
    return store.getMessages(chatId).filter((message) => ids.has(Number(message?.id)));
  };

  const canSelectMessage = (message) => {
    return !message?.deletedAtUtc;
  };

  const ensureAttachmentMediaUrl = async (chatId, attachment) => {
    if (!attachment?.id) return "";
    const existing = getAttachmentUrl(attachment.id);
    if (existing) return existing;

    const blob = await api.downloadAttachmentBlob(chatId, attachment.id);
    if (!blob) return "";
    const url = URL.createObjectURL(blob);
    setAttachmentUrl(attachment.id, url);
    return url;
  };

  const loadAttachmentsForMessages = async (chatId, messages, options = {}) => {
    if (store.isUsingMockData()) return;
    const stickToBottom = options?.stickToBottom === true;

    const targets = (Array.isArray(messages) ? messages : [])
      .map((message) => Number(message?.id))
      .filter((messageId) => Number.isFinite(messageId) && messageId > 0)
      .filter((messageId) => !attachmentLoadingByMessageId.get(messageId));

    await Promise.allSettled(targets.map(async (messageId) => {
      attachmentLoadingByMessageId.set(messageId, true);
      try {
        const list = await api.getAttachments(chatId, messageId);
        setMessageAttachments(messageId, list);
      } finally {
        attachmentLoadingByMessageId.delete(messageId);
      }
    }));

    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
      if (stickToBottom) {
        scrollMessagesToBottom();
      }
    }
  };

  const loadPreferencesForChat = async (chatId) => {
    if (!chatId || store.isUsingMockData()) {
      applyChatBackground(chatId);
      syncSettingsPanel();
      return;
    }

    const preference = await api.getPreferences(chatId);
    if (preference) {
      setPreference(chatId, {
        isMuted: preference?.isMuted,
        soundEnabled: preference?.soundEnabled,
        backgroundImageKey: preference?.backgroundImageKey
      });
    }
    applyChatBackground(chatId);
    syncSettingsPanel();
  };

  const closeMessageContextMenu = () => {
    contextMenuState = null;
    if (chatMsgMenu instanceof HTMLElement) {
      chatMsgMenu.hidden = true;
    }
  };

  const openMessageContextMenu = (event, chatId, message) => {
    if (isSelectionMode() || !(chatMsgMenu instanceof HTMLElement) || !event || !message || message.deletedAtUtc) {
      closeMessageContextMenu();
      return;
    }
    if (!(chatShell instanceof HTMLElement)) {
      closeMessageContextMenu();
      return;
    }

    const actorUserId = Number(getActorUserId());
    const canManageOwnMessage = Number(actorUserId) > 0 && Number(message.senderUserId) === Number(actorUserId);

    contextMenuState = {
      chatId,
      message,
      canManageOwnMessage
    };

    if (chatMsgMenuEditBtn instanceof HTMLButtonElement) {
      chatMsgMenuEditBtn.hidden = !canManageOwnMessage;
    }
    if (chatMsgMenuDeleteBtn instanceof HTMLButtonElement) {
      chatMsgMenuDeleteBtn.hidden = !canManageOwnMessage;
    }

    chatMsgMenu.hidden = false;
    chatMsgMenu.style.left = "0px";
    chatMsgMenu.style.top = "0px";

    const margin = 12;
    const shellRect = chatShell.getBoundingClientRect();
    const rect = chatMsgMenu.getBoundingClientRect();
    const relativeX = event.clientX - shellRect.left;
    const relativeY = event.clientY - shellRect.top;
    const left = Math.min(relativeX, shellRect.width - rect.width - margin);
    const top = Math.min(relativeY, shellRect.height - rect.height - margin);
    chatMsgMenu.style.left = `${Math.max(margin, left)}px`;
    chatMsgMenu.style.top = `${Math.max(margin, top)}px`;
  };

  const startReplyToMessage = (chatId, message) => {
    composerState = {
      mode: "reply",
      chatId,
      messageId: message.id,
      body: "",
      summary: buildMessageSummary(message)
    };
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.value = "";
      chatShellInput.focus();
    }
    syncComposerUi();
  };

  const startForwardMessage = (chatId, message) => {
    composerState = {
      mode: "forward",
      chatId,
      messageId: message.id,
      body: "",
      summary: buildMessageSummary(message)
    };
    syncComposerUi();
  };

  const startEditMessage = (chatId, message) => {
    composerState = {
      mode: "edit",
      chatId,
      messageId: message.id,
      body: message.body,
      summary: buildMessageSummary(message)
    };
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.value = message.body || "";
      chatShellInput.focus();
      chatShellInput.setSelectionRange(chatShellInput.value.length, chatShellInput.value.length);
    }
    syncComposerUi();
  };

  const removeMessage = async (chatId, message) => {
    const confirmed = window.confirm("Удалить это сообщение?");
    if (!confirmed) return;

    if (store.isUsingMockData()) {
      clearPendingVoiceUpload(message.id);
      store.patchMessage(chatId, message.id, {
        body: "Сообщение удалено",
        deletedAtUtc: new Date().toISOString()
      });
      renderMessages(chatId);
      scrollMessagesToBottom();
      renderRailList();
      if (composerState.messageId === message.id) {
        clearComposerIntent();
      }
      return;
    }

    const deleted = await api.deleteMessage(chatId, message.id);
    if (!deleted) return;

    clearPendingVoiceUpload(message.id);
    store.patchMessage(chatId, message.id, {
      body: "Сообщение удалено",
      deletedAtUtc: new Date().toISOString()
    });
    renderMessages(chatId);
    scrollMessagesToBottom();
    renderRailList();
    if (composerState.messageId === message.id) {
      clearComposerIntent();
    }
  };

  const buildMessageSummary = (message) => {
    const body = normalizeToken(message?.body);
    if (!body) {
      return "Пустое сообщение";
    }
    return body.length > 72 ? `${body.slice(0, 69)}...` : body;
  };

  const getReferenceText = (chatId, messageId, fallbackPrefix) => {
    const linked = getMessageById(chatId, messageId);
    if (linked) {
      return buildMessageSummary(linked);
    }
    return `${fallbackPrefix} #${messageId}`;
  };

  const getReadStateLabel = (chatId, message) => {
    const actorId = Number(getActorUserId());
    if (!Number.isFinite(actorId) || actorId <= 0) return "";
    if (Number(message?.senderUserId) !== actorId) return "";
    const messageId = Number(message?.id);
    if (!Number.isFinite(messageId) || messageId <= 0) return "";

    const readers = Array.from(getReadMap(chatId).entries())
      .filter(([userId, lastReadMessageId]) => Number(userId) !== actorId && Number(lastReadMessageId) >= messageId);

    if (!readers.length) return "";
    if (readers.length === 1) {
      return `Прочитал(а): ${resolveMemberName(readers[0][0])}`;
    }
    return `Прочитали: ${readers.length}`;
  };

  const updateHeader = (chat) => {
    if (chatShellTitle) {
      chatShellTitle.textContent = chat?.title || "Чат";
    }
    if (chatShellSub) {
      chatShellSub.textContent = getChatTypeLabel(chat?.type);
    }
    if (chatShellAvatar) {
      chatShellAvatar.textContent = getChatAvatarText(chat || {});
    }
    const selectionActive = isSelectionMode();
    if (chatShellBulkActions instanceof HTMLElement) {
      chatShellBulkActions.hidden = !selectionActive;
    }
    if (chatShellSettingsBtn instanceof HTMLButtonElement) {
      chatShellSettingsBtn.hidden = selectionActive;
    }
    if (selectionActive && chatShellTitle) {
      const count = getSelectedMessageIds().length;
      chatShellTitle.textContent = `${count} выбрано`;
    }
    if (selectionActive && chatShellSub) {
      chatShellSub.textContent = "Выберите действие для отмеченных сообщений";
    }
    renderRealtimePresence();
    syncSettingsPanel();
  };

  const scrollMessagesToBottom = () => {
    if (!(chatShellFeed instanceof HTMLElement)) return;
    chatShellFeed.scrollTop = chatShellFeed.scrollHeight;
    window.requestAnimationFrame(() => {
      if (!(chatShellFeed instanceof HTMLElement)) return;
      chatShellFeed.scrollTop = chatShellFeed.scrollHeight;
      window.requestAnimationFrame(() => {
        if (!(chatShellFeed instanceof HTMLElement)) return;
        chatShellFeed.scrollTop = chatShellFeed.scrollHeight;
        syncJumpBottomButton();
      });
    });
    syncJumpBottomButton();
  };

  const isFeedNearBottom = () => {
    if (!(chatShellFeed instanceof HTMLElement)) return true;
    const remaining = chatShellFeed.scrollHeight - chatShellFeed.clientHeight - chatShellFeed.scrollTop;
    return remaining <= CHAT_BOTTOM_THRESHOLD_PX;
  };

  const syncJumpBottomButton = () => {
    if (!(chatShellJumpBottomBtn instanceof HTMLButtonElement)) return;
    const hasMessages = chatShellMessages instanceof HTMLElement && !chatShellMessages.hasAttribute("hidden") && chatShellMessages.childElementCount > 0;
    const shouldShow = hasMessages && !isFeedNearBottom();
    chatShellJumpBottomBtn.hidden = !shouldShow;
  };

  const showChatPlaceholder = (title, subtitle, message) => {
    updateHeader({ title: title || "Чат", type: 0 });
    if (chatShellSub) {
      chatShellSub.textContent = subtitle || "";
    }
    if (chatShellMessages) {
      chatShellMessages.innerHTML = "";
      chatShellMessages.setAttribute("hidden", "");
    }
    if (chatShellEmpty) {
      chatShellEmpty.textContent = message || "Выберите чат слева.";
      chatShellEmpty.removeAttribute("hidden");
    }
    syncJumpBottomButton();
    clearComposerIntent();
  };

  const setVoiceStatus = (text) => {
    if (chatShellVoiceStatus instanceof HTMLElement) {
      chatShellVoiceStatus.textContent = text || "Голосовые сообщения готовы";
    }
  };

  const getVoiceRecordingElapsedMs = () => {
    if (voiceRecordingMode === "recording" && voiceRecordingStartedAt > 0) {
      return voiceRecordingElapsedMs + Math.max(0, Date.now() - voiceRecordingStartedAt);
    }
    return voiceRecordingElapsedMs;
  };

  const stopVoiceRecordingTimer = () => {
    if (voiceRecordingTimerId) {
      window.clearInterval(voiceRecordingTimerId);
      voiceRecordingTimerId = 0;
    }
  };

  const syncVoiceRecordingUi = () => {
    const elapsedSeconds = getVoiceRecordingElapsedMs() / 1000;
    if (chatShellRecording instanceof HTMLElement) {
      chatShellRecording.dataset.state = voiceRecordingMode;
    }
    if (chatShellRecordingStatus instanceof HTMLElement) {
      chatShellRecordingStatus.textContent = voiceRecordingMode === "paused"
        ? "Запись на паузе"
        : voiceRecordingMode === "recording"
          ? "Идет запись..."
          : voiceRecordingMode === "starting"
            ? "Подключаем микрофон..."
            : "Голосовое сообщение";
    }
    if (chatShellRecordingTime instanceof HTMLElement) {
      chatShellRecordingTime.textContent = formatMediaTime(elapsedSeconds);
    }
    if (chatShellRecordingPauseBtn instanceof HTMLButtonElement) {
      const paused = voiceRecordingMode === "paused";
      chatShellRecordingPauseBtn.dataset.paused = paused ? "true" : "false";
      chatShellRecordingPauseBtn.setAttribute("aria-label", paused ? "Продолжить запись" : "Пауза записи");
      chatShellRecordingPauseBtn.title = paused ? "Продолжить запись" : "Пауза записи";
    }
  };

  const startVoiceRecordingTimer = () => {
    stopVoiceRecordingTimer();
    syncVoiceRecordingUi();
    voiceRecordingTimerId = window.setInterval(() => {
      syncVoiceRecordingUi();
    }, 200);
  };

  const revokeAttachmentUrls = () => {
    attachmentObjectUrls.forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
    attachmentObjectUrls.clear();
  };

  const clearAttachmentState = () => {
    attachmentsByMessageId.clear();
    attachmentLoadingByMessageId.clear();
    pendingVoiceUploadsByMessageId.clear();
    revokeAttachmentUrls();
  };

  const clearRealtimeState = () => {
    unreadByChatId.clear();
    readStateByChatId.clear();
    typingByChatId.clear();
    typingTimersByChatId.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    typingTimersByChatId.clear();
    if (typingStopTimeoutId) {
      window.clearTimeout(typingStopTimeoutId);
      typingStopTimeoutId = 0;
    }
    isTypingSent = false;
    preferencesByChatId.clear();
    selectedBackground = "default";
  };

  const getStoredUiSetting = (chatId) => {
    const key = String(chatId || "").trim();
    if (!key) return {};
    const all = readUiSettings();
    const current = all[key];
    return current && typeof current === "object" ? current : {};
  };

  const setStoredUiSetting = (chatId, patch) => {
    const key = String(chatId || "").trim();
    if (!key) return;
    const all = readUiSettings();
    all[key] = {
      ...(all[key] && typeof all[key] === "object" ? all[key] : {}),
      ...(patch && typeof patch === "object" ? patch : {})
    };
    writeUiSettings(all);
  };

  const getPreference = (chatId) => {
    const key = String(chatId || "").trim();
    const persisted = preferencesByChatId.get(key) || { isMuted: false, soundEnabled: true, backgroundImageKey: null };
    const ui = getStoredUiSetting(key);
    return {
      isMuted: Boolean(persisted?.isMuted),
      soundEnabled: persisted?.soundEnabled !== false,
      backgroundImageKey: String(persisted?.backgroundImageKey || "").trim() || "default",
      suppressActiveSound: ui?.suppressActiveSound !== false
    };
  };

  const setPreference = (chatId, preference) => {
    const key = String(chatId || "").trim();
    if (!key) return;
    preferencesByChatId.set(key, {
      isMuted: Boolean(preference?.isMuted),
      soundEnabled: preference?.soundEnabled !== false,
      backgroundImageKey: String(preference?.backgroundImageKey || "").trim() || "default"
    });
  };

  const getCurrentChatPermissions = () => {
    const chat = store.getChatById(store.getActiveChatId());
    const actorId = Number(getActorUserId());
    const workspaceRole = String(getWorkspaceRole() || "Member");
    const isOwner = workspaceRole === "Owner";
    const isAdmin = workspaceRole === "Owner" || workspaceRole === "Admin";
    const isGroupOwner = Number(chat?.createdByUserId) > 0 && Number(chat?.createdByUserId) === actorId;

    return {
      canEditUserPrefs: Boolean(chat),
      canEditRoomTitle: Number(chat?.type) === 2
        ? isGroupOwner
        : Number(chat?.type) === 1
          ? isOwner
          : false,
      canEditBackground: Number(chat?.type) === 3
        ? true
        : Number(chat?.type) === 1
          ? isAdmin
          : false,
      backgroundLabel: Number(chat?.type) === 3 ? "DM background" : "General background"
    };
  };

  const shouldPlayNotificationSound = (chatId, senderUserId) => {
    const actorId = Number(getActorUserId());
    if (Number.isFinite(actorId) && Number(senderUserId) === actorId) return false;

    const preference = getPreference(chatId);
    if (preference.isMuted || preference.soundEnabled === false) {
      return false;
    }
    if (preference.suppressActiveSound !== false && store.getActiveChatId() === String(chatId || "").trim()) {
      return false;
    }
    return true;
  };

  const playNotificationSound = () => {
    if (!(globalThis.AudioContext || globalThis.webkitAudioContext)) return;
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      const ctx = new Ctx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      oscillator.stop(ctx.currentTime + 0.2);
      oscillator.onended = () => {
        void ctx.close().catch(() => {});
      };
    } catch {
      // ignore audio failures
    }
  };

  const applyChatBackground = (chatId, forcedValue = null) => {
    const preference = getPreference(chatId);
    const value = String(forcedValue || preference?.backgroundImageKey || "default").trim() || "default";
    selectedBackground = value;
    if (chatShell instanceof HTMLElement) {
      chatShell.dataset.chatBg = value;
    }
    if (chatSettingsSwatches instanceof HTMLElement) {
      chatSettingsSwatches.querySelectorAll("[data-bg-value]").forEach((button) => {
        button.classList.toggle("is-active", String(button.getAttribute("data-bg-value") || "") === value);
      });
    }
  };

  const syncSettingsPanel = () => {
    const activeChatId = store.getActiveChatId();
    const chat = store.getChatById(activeChatId);
    const preference = getPreference(activeChatId);
    const permissions = getCurrentChatPermissions();

    if (chatSettingsPanel instanceof HTMLElement) {
      chatSettingsPanel.hidden = !isSettingsOpen || !chat;
    }
    if (chatShellSettingsBtn instanceof HTMLButtonElement) {
      chatShellSettingsBtn.disabled = !chat;
      chatShellSettingsBtn.textContent = isSettingsOpen ? "Close" : "Settings";
    }
    if (!chat) return;

    if (chatSettingsMuted instanceof HTMLInputElement) {
      chatSettingsMuted.checked = Boolean(preference.isMuted);
    }
    if (chatSettingsSound instanceof HTMLInputElement) {
      chatSettingsSound.checked = preference.soundEnabled !== false;
    }
    if (chatSettingsSkipActive instanceof HTMLInputElement) {
      chatSettingsSkipActive.checked = preference.suppressActiveSound !== false;
    }
    if (chatSettingsTitleWrap instanceof HTMLElement) {
      chatSettingsTitleWrap.hidden = !permissions.canEditRoomTitle;
    }
    if (chatSettingsTitle instanceof HTMLInputElement) {
      chatSettingsTitle.value = chat?.title || "";
      chatSettingsTitle.disabled = !permissions.canEditRoomTitle || settingsSaving;
    }
    if (chatSettingsRoomBlock instanceof HTMLElement) {
      chatSettingsRoomBlock.hidden = !permissions.canEditRoomTitle;
    }
    if (chatSettingsBgBlock instanceof HTMLElement) {
      chatSettingsBgBlock.hidden = !permissions.canEditBackground;
    }
    if (chatSettingsBgHeading instanceof HTMLElement) {
      chatSettingsBgHeading.textContent = permissions.backgroundLabel;
    }
    if (chatSettingsNote instanceof HTMLElement) {
      if (Number(chat?.type) === 2 && !permissions.canEditRoomTitle) {
        chatSettingsNote.textContent = "Только GroupOwner может менять параметры group-чата.";
      } else if (Number(chat?.type) === 1 && !permissions.canEditRoomTitle) {
        chatSettingsNote.textContent = permissions.canEditBackground
          ? "Фон General можно менять Admin/Owner, название - только Owner."
          : "Только Owner может менять параметры General-чата.";
      } else {
        chatSettingsNote.textContent = "Настройки применяются к текущему чату.";
      }
    }
    if (chatSettingsSaveBtn instanceof HTMLButtonElement) {
      chatSettingsSaveBtn.disabled = settingsSaving;
      chatSettingsSaveBtn.textContent = settingsSaving ? "Сохраняем..." : "Сохранить";
    }
    applyChatBackground(activeChatId, selectedBackground || preference.backgroundImageKey);
  };

  const getUnreadCount = (chatId) => {
    return Number(unreadByChatId.get(String(chatId || "")) || 0);
  };

  const setUnreadCount = (chatId, count) => {
    const key = String(chatId || "").trim();
    if (!key) return;
    const value = Math.max(0, Number(count) || 0);
    if (value <= 0) {
      unreadByChatId.delete(key);
    } else {
      unreadByChatId.set(key, value);
    }
  };

  const incrementUnreadCount = (chatId) => {
    const key = String(chatId || "").trim();
    if (!key) return;
    setUnreadCount(key, getUnreadCount(key) + 1);
  };

  const resetUnreadCount = (chatId) => {
    setUnreadCount(chatId, 0);
  };

  const getReadMap = (chatId) => {
    const key = String(chatId || "").trim();
    if (!key) return new Map();
    if (!readStateByChatId.has(key)) {
      readStateByChatId.set(key, new Map());
    }
    return readStateByChatId.get(key);
  };

  const getTypingUsers = (chatId) => {
    const key = String(chatId || "").trim();
    if (!key) return new Set();
    if (!typingByChatId.has(key)) {
      typingByChatId.set(key, new Set());
    }
    return typingByChatId.get(key);
  };

  const renderRealtimePresence = () => {
    const activeChatId = store.getActiveChatId();
    if (!(chatShellSub instanceof HTMLElement)) return;
    if (!activeChatId) return;
    if (isSelectionMode()) return;

    const typingUsers = Array.from(getTypingUsers(activeChatId).values()).map((userId) => resolveMemberName(userId));
    if (typingUsers.length) {
      chatShellSub.textContent = typingUsers.length === 1
        ? `${typingUsers[0]} печатает...`
        : `Печатают: ${typingUsers.join(", ")}`;
      return;
    }

    const chat = store.getChatById(activeChatId);
    chatShellSub.textContent = getChatTypeLabel(chat?.type);
  };

  const getAttachmentUrl = (attachmentId) => {
    return attachmentObjectUrls.get(String(attachmentId || "")) || "";
  };

  const setAttachmentUrl = (attachmentId, url) => {
    const key = String(attachmentId || "").trim();
    if (!key) return;
    const previous = attachmentObjectUrls.get(key);
    if (previous && previous !== url) {
      URL.revokeObjectURL(previous);
    }
    if (url) {
      attachmentObjectUrls.set(key, url);
      return;
    }
    attachmentObjectUrls.delete(key);
  };

  const getMessageAttachments = (messageId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return [];
    return Array.isArray(attachmentsByMessageId.get(id)) ? attachmentsByMessageId.get(id) : [];
  };

  const setMessageAttachments = (messageId, attachments) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    const list = Array.isArray(attachments)
      ? attachments.map((attachment) => normalizeAttachment(attachment)).filter(Boolean)
      : [];
    attachmentsByMessageId.set(id, list);
    if (list.length > 0) {
      clearPendingVoiceUpload(id);
    }
  };

  const removeAttachmentFromMessage = (messageId, attachmentId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    const current = getMessageAttachments(id);
    const next = current.filter((attachment) => String(attachment?.id) !== String(attachmentId || ""));
    attachmentsByMessageId.set(id, next);
    setAttachmentUrl(attachmentId, "");
  };

  const getPendingVoiceUpload = (messageId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return pendingVoiceUploadsByMessageId.get(id) || null;
  };

  const setPendingVoiceUpload = (messageId, state) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    pendingVoiceUploadsByMessageId.set(id, {
      progress: Math.max(0, Math.min(100, Number(state?.progress) || 0)),
      chatId: state?.chatId || "",
      messageId: id,
      uploadId: state?.uploadId || "",
      cancel: typeof state?.cancel === "function" ? state.cancel : null,
      fileName: state?.fileName || "voice-message",
      size: Number(state?.size) || 0,
      error: state?.error || ""
    });
  };

  const clearPendingVoiceUpload = (messageId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    pendingVoiceUploadsByMessageId.delete(id);
  };

  const renderUploadQueue = () => {
    if (!(chatShellUploadList instanceof HTMLElement)) return;

    chatShellUploadList.innerHTML = "";
    chatShellUploadList.hidden = uploadQueue.length === 0;
    if (!uploadQueue.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    uploadQueue.forEach((item) => {
      const row = document.createElement("div");
      row.className = "chat-upload-item";
      if (item.status === "error") row.classList.add("is-error");
      if (item.status === "done") row.classList.add("is-done");

      const top = document.createElement("div");
      top.className = "chat-upload-top";

      const name = document.createElement("div");
      name.className = "chat-upload-name";
      name.textContent = item.label;

      const status = document.createElement("div");
      status.className = "chat-upload-status";
      const statusText = item.status === "uploading"
        ? `Загрузка ${item.progress}%`
        : item.status === "done"
          ? "Готово"
          : item.status === "error"
            ? "Ошибка"
            : item.status === "queued"
              ? "В очереди"
              : item.status;
      status.textContent = statusText;
      top.append(name, status);

      const progress = document.createElement("div");
      progress.className = "chat-upload-progress";
      const bar = document.createElement("div");
      bar.className = "chat-upload-progress-bar";
      bar.style.width = `${Math.max(0, Math.min(100, Number(item.progress) || 0))}%`;
      progress.appendChild(bar);

      row.append(top, progress);

      if (item.error) {
        const error = document.createElement("div");
        error.className = "chat-upload-error";
        error.textContent = item.error;
        row.appendChild(error);
      }

      fragment.appendChild(row);
    });

    chatShellUploadList.appendChild(fragment);
  };

  const renderPendingVoiceUploadCard = (message, parent) => {
    if (!(parent instanceof HTMLElement)) return false;
    const pending = getPendingVoiceUpload(message?.id);
    if (!pending) return false;

    const card = document.createElement("div");
    card.className = "chat-attachment-card is-uploading-voice";

    const player = document.createElement("div");
    player.className = "chat-voice-player is-uploading";

    const cancelWrap = document.createElement("div");
    cancelWrap.className = "chat-voice-upload-ring";
    cancelWrap.style.setProperty("--upload-progress", `${Math.max(0, Math.min(100, Number(pending.progress) || 0))}%`);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "chat-voice-play chat-voice-upload-cancel";
    cancelBtn.setAttribute("aria-label", "Отменить отправку голосового сообщения");
    cancelBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10" /><path d="M17 7L7 17" /></svg>';
    cancelBtn.addEventListener("click", async () => {
      const current = getPendingVoiceUpload(message.id);
      current?.cancel?.();
      clearPendingVoiceUpload(message.id);
      store.patchMessage(current?.chatId || store.getActiveChatId(), message.id, {
        deletedAtUtc: new Date().toISOString(),
        body: ""
      });
      const targetChatId = current?.chatId || store.getActiveChatId();
      if (targetChatId) {
        store.setMessages(targetChatId, store.getMessages(targetChatId).filter((item) => Number(item?.id) !== Number(message.id)), store.getHistoryMeta(targetChatId));
        renderMessages(targetChatId);
      }
      if (!store.isUsingMockData()) {
        await api.deleteMessage(current?.chatId || store.getActiveChatId(), message.id).catch(() => {});
      }
    });
    cancelWrap.appendChild(cancelBtn);

    const main = document.createElement("div");
    main.className = "chat-voice-main";

    const top = document.createElement("div");
    top.className = "chat-voice-top";

    const time = document.createElement("div");
    time.className = "chat-voice-time";
    time.textContent = `${Math.round(Number(pending.progress) || 0)}%`;

    const status = document.createElement("div");
    status.className = "chat-voice-meta";
    status.textContent = "Отправка голосового сообщения";

    top.append(time, status);

    const waveform = document.createElement("div");
    waveform.className = "chat-voice-waveform is-uploading";
    for (let index = 0; index < 36; index += 1) {
      const bar = document.createElement("span");
      bar.className = "chat-voice-bar is-active";
      const height = 18 + (((index * 17) + Number(pending.progress || 0)) % 50);
      bar.style.setProperty("--bar-height", `${height}%`);
      waveform.appendChild(bar);
    }

    const meta = document.createElement("div");
    meta.className = "chat-voice-meta";
    meta.textContent = formatBytes(pending.size);

    main.append(top, waveform, meta);
    player.append(cancelWrap, main);
    card.appendChild(player);
    parent.appendChild(card);
    return true;
  };

  const upsertUploadItem = (nextItem) => {
    const key = String(nextItem?.id || "").trim();
    if (!key) return;
    uploadQueue = [
      ...uploadQueue.filter((item) => String(item?.id) !== key),
      {
        id: key,
        label: nextItem.label || "upload",
        status: nextItem.status || "queued",
        progress: Math.max(0, Math.min(100, Number(nextItem.progress) || 0)),
        error: nextItem.error || ""
      }
    ];
    renderUploadQueue();
  };

  const finishUploadItem = (id) => {
    const key = String(id || "").trim();
    if (!key) return;
    window.setTimeout(() => {
      uploadQueue = uploadQueue.filter((item) => String(item?.id) !== key);
      renderUploadQueue();
    }, 1200);
  };

  const buildDirectEntries = () => {
    const actorId = Number(getActorUserId());
    const chats = store.getChats();
    const existingDirectChats = chats
      .filter((chat) => Number(chat?.type) === 3)
      .map((chat) => ({
        entryId: `chat:${chat.id}`,
        kind: "chat",
        chatId: chat.id,
        userId: null,
        type: 3,
        title: chat.title
      }));

    const existingTitles = new Set(
      existingDirectChats
        .map((chat) => normalizeToken(chat?.title).toLowerCase())
        .filter(Boolean)
    );

    const candidateEntries = (Array.isArray(getWorkspaceMembers()) ? getWorkspaceMembers() : [])
      .map((member) => {
        const userId = Number(member?.id);
        if (!Number.isFinite(userId) || userId <= 0) return null;
        if (Number.isFinite(actorId) && actorId === userId) return null;

        const title = normalizeToken(member?.name) || `User ${userId}`;
        if (existingTitles.has(title.toLowerCase())) {
          return null;
        }

        return {
          entryId: `direct:${userId}`,
          kind: "direct",
          chatId: null,
          userId,
          type: 3,
          title
        };
      })
      .filter(Boolean);

    return [...existingDirectChats, ...candidateEntries]
      .sort((left, right) => String(left.title).localeCompare(String(right.title), "ru"));
  };

  const buildSections = () => {
    const chats = store.getChats();
    return [
      {
        key: "general",
        title: "General",
        entries: chats
          .filter((chat) => Number(chat?.type) === 1)
          .map((chat) => ({ entryId: `chat:${chat.id}`, kind: "chat", chatId: chat.id, userId: null, type: 1, title: chat.title }))
      },
      {
        key: "groups",
        title: "Group",
        entries: chats
          .filter((chat) => Number(chat?.type) === 2)
          .map((chat) => ({ entryId: `chat:${chat.id}`, kind: "chat", chatId: chat.id, userId: null, type: 2, title: chat.title }))
      },
      {
        key: "tasks",
        title: "Task",
        entries: chats
          .filter((chat) => Number(chat?.type) === 4)
          .map((chat) => ({ entryId: `chat:${chat.id}`, kind: "chat", chatId: chat.id, userId: null, type: 4, title: chat.title }))
      },
      {
        key: "direct",
        title: "DM",
        entries: buildDirectEntries()
      }
    ];
  };

  const renderRailList = () => {
    if (!(chatRailList instanceof HTMLElement)) return;

    chatRailList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const sections = buildSections();
    const activeChatId = store.getActiveChatId();
    let totalEntries = 0;

    sections.forEach((section) => {
      totalEntries += section.entries.length;

      const sectionEl = document.createElement("section");
      sectionEl.className = "chat-rail-section";

      const heading = document.createElement("div");
      heading.className = "chat-rail-section-title";
      heading.textContent = section.title;
      sectionEl.appendChild(heading);

      const list = document.createElement("div");
      list.className = "chat-rail-section-list";

      if (!section.entries.length) {
        const empty = document.createElement("div");
        empty.className = "chat-rail-section-empty";
        empty.textContent = "Пока пусто";
        list.appendChild(empty);
      } else {
        section.entries.forEach((entry) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "chat-rail-item";
          if (entry.chatId) {
            button.dataset.chatId = entry.chatId;
          }
          if (Number.isFinite(Number(entry.userId)) && Number(entry.userId) > 0) {
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
          preview.textContent = entry.chatId ? getChatPreview(entry.chatId) : "Открыть диалог";

          meta.append(name, preview);
          button.append(avatar, meta);

          if (entry.chatId) {
            const unread = getUnreadCount(entry.chatId);
            if (unread > 0) {
              const badge = document.createElement("span");
              badge.className = "chat-rail-badge";
              badge.textContent = unread > 99 ? "99+" : String(unread);
              button.appendChild(badge);
            }
          }

          button.addEventListener("click", async () => {
            if (entry.kind === "direct") {
              await openDirectChat(entry.userId);
              return;
            }
            await openChat(entry.chatId);
          });

          list.appendChild(button);
        });
      }

      sectionEl.appendChild(list);
      fragment.appendChild(sectionEl);
    });

    chatRailList.appendChild(fragment);

    if (chatHomeBtn instanceof HTMLButtonElement) {
      chatHomeBtn.classList.toggle("is-active", !activeChatId);
    }

    if (chatRailEmpty instanceof HTMLElement) {
      chatRailEmpty.toggleAttribute("hidden", totalEntries > 0 || !store.isFeatureEnabled());
    }
  };

  const syncLoadMoreButton = () => {
    if (!(chatShellLoadMoreBtn instanceof HTMLButtonElement)) return;
    chatShellLoadMoreBtn.hidden = true;
  };

  const shouldAutoLoadOlderMessages = () => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || store.isUsingMockData() || isLoadingMessages || isLoadingOlderMessages || isSendingMessage) {
      return false;
    }
    if (!(chatShellFeed instanceof HTMLElement)) {
      return false;
    }
    const meta = store.getHistoryMeta(activeChatId);
    if (!meta?.hasMore) {
      return false;
    }
    return chatShellFeed.scrollTop <= CHAT_TOP_THRESHOLD_PX;
  };

  const syncComposerUi = () => {
    const activeChatId = store.getActiveChatId();
    const hasActiveChat = Boolean(activeChatId && store.isFeatureEnabled());
    const isForwardMode = composerState.mode === "forward";
    const isBulkForwardMode = composerState.mode === "bulk-forward";
    const isEditMode = composerState.mode === "edit";
    const isReplyMode = composerState.mode === "reply";
    const isVoiceRecordingUi = voiceRecordingMode === "starting" || voiceRecordingMode === "recording" || voiceRecordingMode === "paused";
    const hasText = normalizeToken(chatShellInput instanceof HTMLInputElement ? chatShellInput.value : "").length > 0;
    const isRecording = Boolean(mediaRecorder && mediaRecorder.state === "recording");

    if (chatShellContext instanceof HTMLElement) {
      const hasContext = composerState.mode !== "compose";
      chatShellContext.hidden = !hasContext;
      if (chatShellContextLabel) {
        const labels = {
          edit: "Редактирование",
          reply: "Ответ",
          forward: "Пересылка"
        };
        chatShellContextLabel.textContent = labels[composerState.mode] || "";
      }
      if (chatShellContextText) {
        chatShellContextText.textContent = composerState.summary || "";
      }
    }

    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.disabled = !hasActiveChat || isForwardMode || isLoadingMessages || isLoadingOlderMessages || isSendingMessage;
      chatShellInput.disabled = !hasActiveChat || isForwardMode || isBulkForwardMode || isLoadingMessages || isLoadingOlderMessages || isSendingMessage;
      chatShellInput.placeholder = !hasActiveChat
        ? "Выберите чат"
        : isEditMode
          ? "Измените сообщение"
          : isReplyMode
            ? "Введите ответ"
            : isForwardMode
              ? "Переключитесь в нужный чат и нажмите «Переслать сюда»"
              : isBulkForwardMode
                ? "Переключитесь в нужный чат и нажмите «Переслать сюда»"
              : "Введите сообщение";

      if (isEditMode && chatShellInput.value !== composerState.body) {
        chatShellInput.value = composerState.body || "";
      }
      if (isForwardMode) {
        chatShellInput.value = "";
      }
    }

    if (chatShellRecording instanceof HTMLElement) {
      chatShellRecording.hidden = !isVoiceRecordingUi;
    }
    if (chatShellRecordingMain instanceof HTMLElement) {
      chatShellRecordingMain.hidden = !isVoiceRecordingUi;
    }
    if (chatShellRecordingCancelBtn instanceof HTMLButtonElement) {
      chatShellRecordingCancelBtn.hidden = !isVoiceRecordingUi;
      chatShellRecordingCancelBtn.disabled = !isVoiceRecordingUi || isSendingMessage;
    }
    if (chatShellRecordingPauseBtn instanceof HTMLButtonElement) {
      chatShellRecordingPauseBtn.hidden = !isVoiceRecordingUi;
      chatShellRecordingPauseBtn.disabled = !isVoiceRecordingUi || isSendingMessage || voiceRecordingMode === "starting";
    }
    if (chatShellRecordingSendBtn instanceof HTMLButtonElement) {
      chatShellRecordingSendBtn.hidden = !isVoiceRecordingUi;
      chatShellRecordingSendBtn.disabled = !isVoiceRecordingUi || isSendingMessage || voiceRecordingMode === "starting";
    }
    if (chatShellAttachBtn instanceof HTMLButtonElement) {
      chatShellAttachBtn.hidden = isVoiceRecordingUi;
    }
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.hidden = isVoiceRecordingUi;
    }
    if (chatShellForm instanceof HTMLFormElement) {
      chatShellForm.classList.toggle("is-recording", isVoiceRecordingUi);
    }
    if (chatShellForm instanceof HTMLFormElement && chatShellForm.firstElementChild instanceof HTMLElement) {
      chatShellForm.firstElementChild.toggleAttribute("hidden", isVoiceRecordingUi);
    }

    if (chatShellSendBtn instanceof HTMLButtonElement) {
      const sendLabel = isEditMode
        ? "Сохранить сообщение"
        : isReplyMode
          ? "Ответить"
          : isForwardMode
            ? "Переслать сюда"
            : isBulkForwardMode
              ? "Переслать сюда"
            : "Отправить сообщение";
      chatShellSendBtn.setAttribute("aria-label", sendLabel);
      chatShellSendBtn.title = sendLabel;
      chatShellSendBtn.hidden = isVoiceRecordingUi || (!isForwardMode && !isBulkForwardMode && !isEditMode && !isReplyMode && !hasText);
      chatShellSendBtn.disabled = !hasActiveChat
        || isLoadingMessages
        || isLoadingOlderMessages
        || isSendingMessage
        || (!isForwardMode && !isBulkForwardMode && !hasText);
    }

    const toolsDisabled = !hasActiveChat || isLoadingMessages || isLoadingOlderMessages || isSendingMessage;
    if (chatShellAttachBtn instanceof HTMLButtonElement) {
      chatShellAttachBtn.disabled = toolsDisabled;
    }
    if (chatShellVoiceBtn instanceof HTMLButtonElement) {
      chatShellVoiceBtn.disabled = !hasActiveChat || isLoadingMessages || isLoadingOlderMessages || isSendingMessage;
      chatShellVoiceBtn.hidden = isVoiceRecordingUi || isForwardMode || isBulkForwardMode || isEditMode || isReplyMode || (hasText && !isRecording);
      chatShellVoiceBtn.dataset.recording = isRecording ? "true" : "false";
      const voiceLabel = isRecording ? "Остановить запись" : "Записать голосовое сообщение";
      chatShellVoiceBtn.setAttribute("aria-label", voiceLabel);
      chatShellVoiceBtn.title = voiceLabel;
    }

    syncVoiceRecordingUi();
    syncLoadMoreButton();
  };

  const renderAttachmentCollection = (chatId, message, parent) => {
    if (!(parent instanceof HTMLElement)) return;
    if (message?.deletedAtUtc) return;
    const attachments = getMessageAttachments(message?.id);
    const isLoading = attachmentLoadingByMessageId.get(Number(message?.id)) === true;
    const hasPendingVoice = attachments.length === 0 && Boolean(getPendingVoiceUpload(message?.id));
    const shouldRenderLoading = !attachments.length && isLoading;
    if (!attachments.length && !shouldRenderLoading && !hasPendingVoice) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "chat-msg-attachments";

    if (hasPendingVoice) {
      renderPendingVoiceUploadCard(message, wrap);
    }

    if (shouldRenderLoading) {
      const loading = document.createElement("div");
      loading.className = "chat-attachment-placeholder";
      loading.textContent = "Загрузка вложений...";
      wrap.appendChild(loading);
    }

    attachments.forEach((attachment) => {
      const card = document.createElement("div");
      card.className = "chat-attachment-card";

      const isImage = isImageContentType(attachment.contentType);
      const isVoice = isVoiceContentType(attachment.contentType);

      if (isImage) {
        const img = document.createElement("img");
        img.className = "chat-attachment-preview";
        img.alt = attachment.fileName;
        const existing = getAttachmentUrl(attachment.id);
        if (existing) {
          img.src = existing;
        } else {
          img.hidden = true;
          const placeholder = document.createElement("div");
          placeholder.className = "chat-attachment-placeholder";
          placeholder.textContent = "Подготавливаем превью...";
          card.appendChild(placeholder);
          void ensureAttachmentMediaUrl(chatId, attachment).then((url) => {
            if (!url || !img.isConnected) return;
            img.src = url;
            img.hidden = false;
            if (placeholder.isConnected) {
              placeholder.remove();
            }
          });
        }
        img.addEventListener("click", () => {
          void ensureAttachmentMediaUrl(chatId, attachment).then((url) => {
            if (!url) return;
            window.open(url, "_blank", "noopener,noreferrer");
          });
        });
        card.appendChild(img);
      }

      if (isVoice) {
        const player = document.createElement("div");
        player.className = "chat-voice-player";

        const audio = document.createElement("audio");
        audio.className = "chat-attachment-audio";
        audio.preload = "metadata";

        const playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.className = "chat-voice-play";
        playBtn.setAttribute("aria-label", "Воспроизвести голосовое сообщение");
        playBtn.innerHTML = '<svg class="chat-voice-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6z" /></svg><svg class="chat-voice-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12" /><path d="M15 6v12" /></svg>';

        const main = document.createElement("div");
        main.className = "chat-voice-main";

        const top = document.createElement("div");
        top.className = "chat-voice-top";

        const time = document.createElement("div");
        time.className = "chat-voice-time";
        const initialDuration = Number(attachment.durationMs) > 0 ? Number(attachment.durationMs) / 1000 : 0;
        time.textContent = `0:00 / ${formatMediaTime(initialDuration)}`;

        const speedBtn = document.createElement("button");
        speedBtn.type = "button";
        speedBtn.className = "chat-voice-speed";
        speedBtn.textContent = "1x";

        top.append(time, speedBtn);

        const waveform = document.createElement("button");
        waveform.type = "button";
        waveform.className = "chat-voice-waveform";
        waveform.setAttribute("aria-label", "Позиция воспроизведения голосового сообщения");

        const bars = [];
        const waveformSeed = hashToken(attachment.id);
        for (let index = 0; index < 36; index += 1) {
          const bar = document.createElement("span");
          bar.className = "chat-voice-bar";
          const value = ((waveformSeed >> (index % 16)) + index * 13) % 100;
          const height = 18 + (value % 60);
          bar.style.setProperty("--bar-height", `${height}%`);
          waveform.appendChild(bar);
          bars.push(bar);
        }

        const progress = document.createElement("input");
        progress.type = "range";
        progress.className = "chat-voice-progress";
        progress.min = "0";
        progress.max = "1";
        progress.step = "0.01";
        progress.value = "0";

        const meta = document.createElement("div");
        meta.className = "chat-voice-meta";
        meta.textContent = formatBytes(attachment.size);

        const actions = document.createElement("div");
        actions.className = "chat-attachment-actions";

        const downloadBtn = document.createElement("button");
        downloadBtn.type = "button";
        downloadBtn.className = "chat-msg-action";
        downloadBtn.textContent = "Скачать";
        downloadBtn.addEventListener("click", async () => {
          const blob = await api.downloadAttachmentBlob(chatId, attachment.id);
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = attachment.fileName || "voice-message";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        });
        actions.appendChild(downloadBtn);

        const syncTime = () => {
          const duration = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : initialDuration;
          const current = Number.isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0;
          const ratio = duration > 0 ? Math.min(1, current / duration) : 0;
          time.textContent = `${formatMediaTime(current)} / ${formatMediaTime(duration)}`;
          progress.value = String(ratio);
          waveform.style.setProperty("--voice-progress", `${ratio}`);
          bars.forEach((bar, index) => {
            const edge = (index + 1) / bars.length;
            bar.classList.toggle("is-active", ratio >= edge);
          });
        };

        const syncPlayState = () => {
          const isPlaying = !audio.paused && !audio.ended;
          playBtn.dataset.playing = isPlaying ? "true" : "false";
          playBtn.setAttribute("aria-label", isPlaying ? "Пауза" : "Воспроизвести голосовое сообщение");
        };

        playBtn.addEventListener("click", async () => {
          if (audio.paused || audio.ended) {
            try {
              await audio.play();
            } catch {
              return;
            }
          } else {
            audio.pause();
          }
          syncPlayState();
        });

        speedBtn.addEventListener("click", () => {
          const steps = [1, 1.5, 2];
          const current = steps.findIndex((step) => step === audio.playbackRate);
          const nextRate = steps[(current + 1 + steps.length) % steps.length];
          audio.playbackRate = nextRate;
          speedBtn.textContent = `${nextRate}x`;
        });

        progress.addEventListener("input", () => {
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : initialDuration;
          if (!duration) return;
          audio.currentTime = Math.max(0, Math.min(duration, Number(progress.value) * duration));
          syncTime();
        });

        waveform.addEventListener("click", (event) => {
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : initialDuration;
          if (!duration) return;
          const rect = waveform.getBoundingClientRect();
          const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
          audio.currentTime = ratio * duration;
          syncTime();
        });

        audio.addEventListener("loadedmetadata", syncTime);
        audio.addEventListener("timeupdate", syncTime);
        audio.addEventListener("play", syncPlayState);
        audio.addEventListener("pause", syncPlayState);
        audio.addEventListener("ended", () => {
          syncPlayState();
          syncTime();
        });

        const existing = getAttachmentUrl(attachment.id);
        if (existing) {
          audio.src = existing;
        } else {
          const placeholder = document.createElement("div");
          placeholder.className = "chat-attachment-placeholder";
          placeholder.textContent = "Подготавливаем аудио...";
          card.appendChild(placeholder);
          void ensureAttachmentMediaUrl(chatId, attachment).then((url) => {
            if (!url || !audio.isConnected) return;
            audio.src = url;
            if (placeholder.isConnected) {
              placeholder.remove();
            }
            syncTime();
          });
        }
        main.append(top, waveform, progress, meta, actions);
        player.append(playBtn, main, audio);
        card.appendChild(player);
      }

      if (!isVoice) {
        const meta = document.createElement("div");
        meta.className = "chat-attachment-meta";
        const name = document.createElement("div");
        name.className = "chat-attachment-name";
        name.textContent = attachment.fileName;
        const sub = document.createElement("div");
        sub.className = "chat-attachment-sub";
        sub.textContent = `${attachment.contentType} · ${formatBytes(attachment.size)}`;
        meta.append(name, sub);

        const actions = document.createElement("div");
        actions.className = "chat-attachment-actions";

        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "chat-msg-action";
        openBtn.textContent = "Открыть";
        openBtn.addEventListener("click", () => {
          void ensureAttachmentMediaUrl(chatId, attachment).then((url) => {
            if (!url) return;
            window.open(url, "_blank", "noopener,noreferrer");
          });
        });
        actions.appendChild(openBtn);

        const downloadBtn = document.createElement("button");
        downloadBtn.type = "button";
        downloadBtn.className = "chat-msg-action";
        downloadBtn.textContent = "Скачать";
        downloadBtn.addEventListener("click", async () => {
          const blob = await api.downloadAttachmentBlob(chatId, attachment.id);
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = attachment.fileName || "attachment";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        });
        actions.appendChild(downloadBtn);

        card.append(meta, actions);
      }
      wrap.appendChild(card);
    });

    parent.appendChild(wrap);
  };

  const renderMessages = (chatId) => {
    if (!(chatShellMessages instanceof HTMLElement)) return;

    const list = store.getMessages(chatId);
    chatShellMessages.innerHTML = "";

    if (!list.length) {
      chatShellMessages.setAttribute("hidden", "");
      if (chatShellEmpty instanceof HTMLElement) {
        chatShellEmpty.textContent = "В этом чате пока нет сообщений.";
        chatShellEmpty.removeAttribute("hidden");
      }
      syncJumpBottomButton();
      syncLoadMoreButton();
      syncComposerUi();
      return;
    }

    const actorUserId = Number(getActorUserId());
    const fragment = document.createDocumentFragment();

    list.forEach((message) => {
      const item = document.createElement("article");
      item.className = "chat-msg";
      item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openMessageContextMenu(event, chatId, message);
      });
      item.addEventListener("dblclick", (event) => {
        if (!canSelectMessage(message)) return;
        event.preventDefault();
        toggleSelectedMessage(message.id);
        closeMessageContextMenu();
        setSettingsOpen(false);
        renderMessages(chatId);
        updateHeader(store.getChatById(chatId));
      });
      item.addEventListener("click", (event) => {
        if (!canSelectMessage(message)) return;
        if (!isSelectionMode()) return;
        event.preventDefault();
        toggleSelectedMessage(message.id);
        closeMessageContextMenu();
        renderMessages(chatId);
        updateHeader(store.getChatById(chatId));
      });

      if (Number.isFinite(actorUserId) && Number(message.senderUserId) === actorUserId) {
        item.classList.add("is-own");
      }
      if (message.deletedAtUtc) {
        item.classList.add("is-deleted");
      }
      if (isSelectionMode() && canSelectMessage(message)) {
        item.classList.add("is-selection-mode");
        item.classList.toggle("is-selected", selectedMessageIds.has(Number(message?.id)));
      }

      const meta = document.createElement("div");
      meta.className = "chat-msg-meta";

      const author = document.createElement("span");
      author.className = "chat-msg-author";
      author.textContent = resolveMemberName(message.senderUserId);

      const time = document.createElement("span");
      time.className = "chat-msg-time";
      const editedSuffix = message.editedAtUtc ? " · изм." : "";
      time.textContent = `${formatMessageTime(message.createdAtUtc)}${editedSuffix}`.trim();

      meta.append(author, time);

      if (message.replyToMessageId || message.forwardedFromMessageId) {
        const refs = document.createElement("div");
        refs.className = "chat-msg-refs";

        if (message.replyToMessageId) {
          const reply = document.createElement("div");
          reply.className = "chat-msg-ref";
          reply.textContent = `Ответ: ${getReferenceText(chatId, message.replyToMessageId, "Сообщение")}`;
          refs.appendChild(reply);
        }

        if (message.forwardedFromMessageId) {
          const forward = document.createElement("div");
          forward.className = "chat-msg-ref";
          forward.textContent = `Переслано: ${getReferenceText(chatId, message.forwardedFromMessageId, "Сообщение")}`;
          refs.appendChild(forward);
        }

        item.appendChild(meta);
        item.appendChild(refs);
      } else {
        item.appendChild(meta);
      }

      const shouldRenderBody = message.deletedAtUtc || Number(message.kind) !== 4;
      if (shouldRenderBody) {
        const body = document.createElement("div");
        body.className = "chat-msg-body";
        body.textContent = message.body;
        item.appendChild(body);
      }

      renderAttachmentCollection(chatId, message, item);

      const readStateLabel = getReadStateLabel(chatId, message);
      if (readStateLabel) {
        const readState = document.createElement("div");
        readState.className = "chat-msg-read-state";
        readState.textContent = readStateLabel;
        item.appendChild(readState);
      }

      fragment.appendChild(item);
    });

    chatShellMessages.appendChild(fragment);
    chatShellMessages.removeAttribute("hidden");
    if (chatShellEmpty instanceof HTMLElement) {
      chatShellEmpty.setAttribute("hidden", "");
    }

    syncJumpBottomButton();
    syncLoadMoreButton();
    syncComposerUi();
  };

  const normalizeRealtimeMessage = (payload) => {
    return normalizeChatMessage({
      id: payload?.messageId,
      senderUserId: payload?.senderUserId,
      kind: payload?.kind,
      bodyCipher: payload?.bodyCipher,
      replyToMessageId: payload?.replyToMessageId,
      forwardedFromMessageId: payload?.forwardedFromMessageId,
      clientMessageId: payload?.clientMessageId,
      createdAtUtc: payload?.createdAtUtc,
      editedAtUtc: payload?.editedAtUtc,
      deletedAtUtc: payload?.deletedAtUtc
    });
  };

  const applyTypingTimeout = (chatId, userId) => {
    const key = `${String(chatId || "").trim()}:${Number(userId)}`;
    const existing = typingTimersByChatId.get(key);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timerId = window.setTimeout(() => {
      const users = getTypingUsers(chatId);
      users.delete(Number(userId));
      typingTimersByChatId.delete(key);
      if (store.getActiveChatId() === String(chatId || "").trim()) {
        renderRealtimePresence();
      }
    }, 3500);
    typingTimersByChatId.set(key, timerId);
  };

  const handleRealtimeStateChanged = (state) => {
    if (state === "connected") {
      void realtimeClient.syncChats(store.getChats().map((chat) => chat.id));
    }
  };

  const handleRealtimeMessageCreated = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    if (!chatId) return;
    const message = normalizeRealtimeMessage(payload);
    if (!message) return;

    store.reconcileMessage(chatId, message.clientMessageId, message);
    store.upsertChat({ ...(store.getChatById(chatId) || { id: chatId, type: 2, title: "Чат" }), id: chatId });

    const actorId = Number(getActorUserId());
    const isOwn = Number.isFinite(actorId) && Number(message.senderUserId) === actorId;
    if (!isOwn && store.getActiveChatId() !== chatId) {
      incrementUnreadCount(chatId);
    }
    if (shouldPlayNotificationSound(chatId, message.senderUserId)) {
      playNotificationSound();
    }

    renderRailList();
    if (store.getActiveChatId() === chatId) {
      const wasNearBottom = isFeedNearBottom();
      renderMessages(chatId);
      if (isOwn || wasNearBottom) {
        scrollMessagesToBottom();
      } else {
        syncJumpBottomButton();
      }
      if (!isOwn && wasNearBottom) {
        void markActiveChatAsRead();
      }
    }
  };

  const handleRealtimeMessageUpdated = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    if (!chatId) return;
    const message = normalizeRealtimeMessage(payload);
    if (!message?.id) return;
    store.reconcileMessage(chatId, message.clientMessageId, message);
    renderRailList();
    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
    }
  };

  const handleRealtimeMessageDeleted = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const messageId = Number(payload?.messageId);
    if (!chatId || !Number.isFinite(messageId) || messageId <= 0) return;
    store.patchMessage(chatId, messageId, {
      body: "Сообщение удалено",
      deletedAtUtc: String(payload?.deletedAtUtc || new Date().toISOString())
    });
    renderRailList();
    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
    }
  };

  const handleRealtimeReadUpdated = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const userId = Number(payload?.userId);
    const lastReadMessageId = Number(payload?.lastReadMessageId);
    if (!chatId || !Number.isFinite(userId) || userId <= 0 || !Number.isFinite(lastReadMessageId) || lastReadMessageId <= 0) return;
    getReadMap(chatId).set(userId, lastReadMessageId);
    const actorId = Number(getActorUserId());
    if (userId === actorId) {
      resetUnreadCount(chatId);
      renderRailList();
    }
    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
    }
  };

  const handleRealtimeAttachmentUploaded = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const attachment = normalizeAttachment({
      id: payload?.attachmentId,
      messageId: payload?.messageId,
      fileName: payload?.fileName,
      contentType: payload?.contentType,
      size: payload?.size,
      durationMs: payload?.durationMs
    });
    if (!chatId || !attachment) return;
    clearPendingVoiceUpload(attachment.messageId);
    const current = getMessageAttachments(attachment.messageId);
    setMessageAttachments(attachment.messageId, [...current, attachment]);
    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
    }
  };

  const handleRealtimeAttachmentDeleted = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const messageId = Number(payload?.messageId);
    if (!chatId || !Number.isFinite(messageId) || messageId <= 0) return;
    removeAttachmentFromMessage(messageId, payload?.attachmentId);
    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
    }
  };

  const handleRealtimeTypingUpdated = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const userId = Number(payload?.userId);
    if (!chatId || !Number.isFinite(userId) || userId <= 0) return;

    const users = getTypingUsers(chatId);
    if (payload?.isTyping) {
      users.add(userId);
      applyTypingTimeout(chatId, userId);
    } else {
      users.delete(userId);
      const key = `${chatId}:${userId}`;
      const existing = typingTimersByChatId.get(key);
      if (existing) {
        window.clearTimeout(existing);
        typingTimersByChatId.delete(key);
      }
    }

    if (store.getActiveChatId() === chatId) {
      renderRealtimePresence();
    }
  };

  const scheduleTypingStop = () => {
    if (typingStopTimeoutId) {
      window.clearTimeout(typingStopTimeoutId);
    }
    typingStopTimeoutId = window.setTimeout(() => {
      const activeChatId = store.getActiveChatId();
      if (!activeChatId || !isTypingSent) return;
      isTypingSent = false;
      void realtimeClient.setTyping(activeChatId, false);
    }, 1500);
  };

  const notifyTyping = () => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || store.isUsingMockData()) return;
    const currentText = normalizeToken(chatShellInput instanceof HTMLInputElement ? chatShellInput.value : "");
    if (!currentText) {
      stopTyping();
      return;
    }
    if (!isTypingSent) {
      isTypingSent = true;
      void realtimeClient.setTyping(activeChatId, true);
    }
    scheduleTypingStop();
  };

  const stopTyping = () => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || !isTypingSent) return;
    if (typingStopTimeoutId) {
      window.clearTimeout(typingStopTimeoutId);
      typingStopTimeoutId = 0;
    }
    isTypingSent = false;
    void realtimeClient.setTyping(activeChatId, false);
  };

  const setSettingsOpen = (open) => {
    isSettingsOpen = Boolean(open);
    syncSettingsPanel();
  };

  const applyContextMenuAction = async (action) => {
    if (!contextMenuState) return;
    const { chatId, message, canManageOwnMessage } = contextMenuState;
    closeMessageContextMenu();

    if (action === "reply") {
      startReplyToMessage(chatId, message);
      return;
    }
    if (action === "forward") {
      startForwardMessage(chatId, message);
      return;
    }
    if (action === "edit" && canManageOwnMessage) {
      startEditMessage(chatId, message);
      return;
    }
    if (action === "delete" && canManageOwnMessage) {
      await removeMessage(chatId, message);
    }
  };

  const startBulkForwardSelectedMessages = () => {
    const activeChatId = store.getActiveChatId();
    const selectedIds = getSelectedMessageIds();
    if (!activeChatId || !selectedIds.length) return;
    composerState = {
      mode: "bulk-forward",
      chatId: activeChatId,
      messageId: null,
      messageIds: selectedIds,
      body: "",
      summary: `${selectedIds.length} сообщений`
    };
    clearSelectedMessages();
    setSettingsOpen(false);
    renderMessages(activeChatId);
    updateHeader(store.getChatById(activeChatId));
    syncComposerUi();
  };

  const deleteSelectedMessages = async () => {
    const activeChatId = store.getActiveChatId();
    const selectedMessages = getSelectedMessages(activeChatId).filter((message) => canSelectMessage(message));
    if (!activeChatId || !selectedMessages.length) return;
    const confirmed = window.confirm(`Удалить выбранные сообщения: ${selectedMessages.length}?`);
    if (!confirmed) return;

    for (const message of selectedMessages) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await api.deleteMessage(activeChatId, message.id);
        store.patchMessage(activeChatId, message.id, {
          body: "Сообщение удалено",
          deletedAtUtc: new Date().toISOString()
        });
        clearPendingVoiceUpload(message.id);
      } catch {
        // ignore per-message delete failures
      }
    }

    clearSelectedMessages();
    renderMessages(activeChatId);
    updateHeader(store.getChatById(activeChatId));
  };

  const saveChatSettings = async () => {
    const activeChatId = store.getActiveChatId();
    const chat = store.getChatById(activeChatId);
    if (!activeChatId || !chat) return;

    settingsSaving = true;
    syncSettingsPanel();

    const permissions = getCurrentChatPermissions();
    const nextPreference = {
      isMuted: chatSettingsMuted instanceof HTMLInputElement ? chatSettingsMuted.checked : false,
      soundEnabled: chatSettingsSound instanceof HTMLInputElement ? chatSettingsSound.checked : true,
      backgroundImageKey: selectedBackground || "default"
    };

    const savedPreference = store.isUsingMockData()
      ? nextPreference
      : await api.updatePreferences(activeChatId, nextPreference);

    if (savedPreference) {
      setPreference(activeChatId, savedPreference);
    }

    setStoredUiSetting(activeChatId, {
      suppressActiveSound: chatSettingsSkipActive instanceof HTMLInputElement ? chatSettingsSkipActive.checked : true
    });

    if (permissions.canEditRoomTitle && chatSettingsTitle instanceof HTMLInputElement) {
      const nextTitle = normalizeToken(chatSettingsTitle.value);
      if (nextTitle && nextTitle !== normalizeToken(chat?.title)) {
        const updated = store.isUsingMockData()
          ? true
          : await api.updateChatSettings(activeChatId, { title: nextTitle });
        if (updated) {
          store.upsertChat({ ...chat, title: nextTitle });
        }
      }
    }

    settingsSaving = false;
    applyChatBackground(activeChatId);
    renderRailList();
    updateHeader(store.getChatById(activeChatId) || chat);
    syncSettingsPanel();
  };

  const markActiveChatAsRead = async () => {
    if (store.isUsingMockData()) return;
    const activeChatId = store.getActiveChatId();
    if (!activeChatId) return;
    const list = store.getMessages(activeChatId);
    if (!list.length) return;
    const lastMessageId = Number(list[list.length - 1]?.id);
    if (!Number.isFinite(lastMessageId) || lastMessageId <= 0) return;
    const actorId = Number(getActorUserId());
    if (Number.isFinite(actorId) && actorId > 0) {
      getReadMap(activeChatId).set(actorId, lastMessageId);
    }
    resetUnreadCount(activeChatId);
    renderRailList();
    await api.markAsRead(activeChatId, lastMessageId);
  };

  const loadMessages = async (chatId, options = {}) => {
    const appendOlder = Boolean(options.appendOlder);
    const current = store.getMessages(chatId);
    const oldestMessage = current.length ? current[0] : null;
    const beforeMessageId = appendOlder ? Number(oldestMessage?.id) : null;
    const result = await api.getMessages(chatId, {
      limit: CHAT_PAGE_SIZE,
      beforeMessageId
    });

    if (!result.ok) {
      if (chatShellEmpty instanceof HTMLElement) {
        chatShellEmpty.textContent = "Не удалось загрузить сообщения.";
        chatShellEmpty.removeAttribute("hidden");
      }
      return false;
    }

    const normalized = result.data
      .map((message) => normalizeChatMessage(message))
      .filter((message) => Number.isFinite(Number(message?.id)) && message?.body)
      .sort((left, right) => Date.parse(normalizeUtcDateValue(left.createdAtUtc || "")) - Date.parse(normalizeUtcDateValue(right.createdAtUtc || "")));

    if (appendOlder) {
      store.prependMessages(chatId, normalized, { hasMore: result.hasMore });
    } else {
      store.setMessages(chatId, normalized, { hasMore: result.hasMore });
    }

    renderMessages(chatId);
    if (!appendOlder) {
      scrollMessagesToBottom();
    }
    renderRailList();
    void loadAttachmentsForMessages(chatId, store.getMessages(chatId), { stickToBottom: !appendOlder });
    if (!appendOlder) {
      await markActiveChatAsRead();
    }
    return true;
  };

  const fetchLatestPreviews = async () => {
    const chats = store.getChats();
    await Promise.allSettled(chats.map(async (chat) => {
      const preview = await api.getLatestPreview(chat.id);
      const normalized = preview ? normalizeChatMessage(preview) : null;
      if (normalized?.body) {
        store.setPreview(chat.id, normalized.body);
      }
    }));
    renderRailList();
  };

  const setMockData = () => {
    const mock = buildMockChats({
      getActorUserId,
      getActorDisplayName,
      getWorkspaceMembers,
      normalizeToken
    });

    store.clear();
    clearAttachmentState();
    clearRealtimeState();
    void realtimeClient.stop();
    store.setUseMockData(true);
    uploadQueue = [];
    renderUploadQueue();
    store.setChats(mock.chats);
    mock.messagesByChatId.forEach((messages, chatId) => {
      store.setMessages(chatId, messages, { hasMore: false });
    });
    setChatAvailabilityState(true, "Демо-чаты");
    renderRailList();
    showChatPlaceholder("Демо-режим чатов", "REST fallback", "Откройте любой чат слева: доступен локальный макет диалога.");
  };

  const openChat = async (chatId) => {
    const targetId = toChatId(chatId);
    if (!targetId || !store.isFeatureEnabled()) return;

    const chat = store.getChatById(targetId);
    if (!chat) return;

    const previousChatId = store.getActiveChatId();
    if (previousChatId && previousChatId !== targetId) {
      stopTyping();
      resetVoiceRecorder();
      clearSelectedMessages();
    }
    if (!store.isUsingMockData()) {
      await realtimeClient.joinChat(targetId);
    }
    store.setActiveChatId(targetId);
    resetUnreadCount(targetId);
    renderRailList();
    updateHeader(chat);

    if (composerState.mode !== "forward" && composerState.mode !== "bulk-forward" && composerState.chatId && composerState.chatId !== targetId) {
      clearComposerIntent();
    } else {
      syncComposerUi();
    }

    if (chatShellEmpty instanceof HTMLElement) {
      chatShellEmpty.setAttribute("hidden", "");
    }
    if (chatShellMessages instanceof HTMLElement) {
      chatShellMessages.setAttribute("hidden", "");
      chatShellMessages.innerHTML = "";
    }

    onOpenChat(chat);

    if (store.isUsingMockData()) {
      await loadPreferencesForChat(targetId);
      renderMessages(targetId);
      scrollMessagesToBottom();
      renderRailList();
      renderRealtimePresence();
      syncComposerUi();
      if (chatShellInput instanceof HTMLInputElement && composerState.mode !== "forward" && composerState.mode !== "bulk-forward") {
        chatShellInput.focus();
      }
      return;
    }

    isLoadingMessages = true;
    syncComposerUi();
    const loaded = await loadMessages(targetId);
    isLoadingMessages = false;
    syncComposerUi();
    renderRealtimePresence();
    await loadPreferencesForChat(targetId);

    if (!loaded && previousChatId && previousChatId !== targetId) {
      store.setActiveChatId(previousChatId);
      renderRailList();
    }

    if (chatShellInput instanceof HTMLInputElement && composerState.mode !== "forward" && composerState.mode !== "bulk-forward") {
      chatShellInput.focus();
    }
  };

  const openDirectChat = async (userId) => {
    const targetUserId = Number(userId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) return;

    if (store.isUsingMockData()) {
      const targetMember = getMemberById(targetUserId);
      const title = normalizeToken(targetMember?.name) || `User ${targetUserId}`;
      const mockId = `mock-direct-${targetUserId}`;

      let chat = store.getChatById(mockId);
      if (!chat) {
        chat = {
          id: mockId,
          type: 3,
          title,
          taskId: null,
          updatedAtUtc: new Date().toISOString()
        };
        store.upsertChat(chat);
      }

      if (!store.getMessages(mockId).length) {
        store.setMessages(mockId, [
          {
            id: Date.now() - 1,
            senderUserId: targetUserId,
            kind: CHAT_MESSAGE_KIND_TEXT,
            body: "Привет! Это тестовый диалог в демо-режиме.",
            replyToMessageId: null,
            forwardedFromMessageId: null,
            clientMessageId: null,
            createdAtUtc: new Date().toISOString(),
            editedAtUtc: "",
            deletedAtUtc: ""
          }
        ], { hasMore: false });
      }

      renderRailList();
      await openChat(mockId);
      return;
    }

    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) return;

    const payload = await api.openDirectChat(workspaceId, targetUserId);
    const normalized = normalizeChatRoom(payload || {});
    if (!normalized?.id) return;

    store.upsertChat(normalized);
    await realtimeClient.joinChat(normalized.id);
    renderRailList();
    await openChat(normalized.id);
  };

  const ensureTaskChat = async (taskId, options = {}) => {
    const normalizedTaskId = Number(taskId);
    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(normalizedTaskId) || normalizedTaskId <= 0) return null;
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) return null;
    if (store.isUsingMockData()) return null;

    const payload = await api.openTaskChat(workspaceId, normalizedTaskId);
    const normalized = normalizeChatRoom(payload || {});
    if (!normalized?.id) return null;

    store.upsertChat(normalized);
    await realtimeClient.joinChat(normalized.id);
    renderRailList();

    const openAfterEnsure = options?.open !== false;
    if (openAfterEnsure) {
      await openChat(normalized.id);
    }

    return normalized;
  };

  const loadOlderMessages = async () => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || store.isUsingMockData() || isLoadingMessages || isLoadingOlderMessages) return;
    if (!(chatShellFeed instanceof HTMLElement)) return;

    const beforeHeight = chatShellFeed.scrollHeight;
    isLoadingOlderMessages = true;
    syncComposerUi();
    const loaded = await loadMessages(activeChatId, { appendOlder: true });
    isLoadingOlderMessages = false;
    syncComposerUi();

    if (loaded) {
      const afterHeight = chatShellFeed.scrollHeight;
      chatShellFeed.scrollTop += afterHeight - beforeHeight;
      syncJumpBottomButton();
    }
  };

  const uploadFileToChat = async (file, forcedKind = null) => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || !file) return;

    const uploadId = createClientMessageId();
    const kind = forcedKind || getMessageKindForFile(file);
    const label = String(file?.name || "attachment").trim() || "attachment";
    const isVoiceUpload = kind === 4;
    let voiceMessageId = null;
    if (!isVoiceUpload) {
      upsertUploadItem({ id: uploadId, label, status: "queued", progress: 0, error: "" });
    }

    try {
      const message = await api.sendMessage(activeChatId, {
        kind,
        bodyCipher: getMessageBodyForFile(file, kind),
        clientMessageId: uploadId
      });

      const normalizedMessage = normalizeChatMessage(message || {});
      if (!normalizedMessage?.id) {
        throw new Error("Не удалось создать сообщение для вложения.");
      }
      voiceMessageId = normalizedMessage.id;

      store.reconcileMessage(activeChatId, uploadId, {
        ...normalizedMessage,
        clientMessageId: normalizedMessage.clientMessageId || uploadId
      });
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();

      let attachment = null;
      if (isVoiceUpload) {
        const upload = api.startAttachmentUpload(activeChatId, normalizedMessage.id, file, {
          onProgress: (progress) => {
            setPendingVoiceUpload(normalizedMessage.id, {
              chatId: activeChatId,
              messageId: normalizedMessage.id,
              uploadId,
              progress,
              cancel: upload.cancel,
              fileName: label,
              size: file.size
            });
            renderMessages(activeChatId);
          }
        });

        setPendingVoiceUpload(normalizedMessage.id, {
          chatId: activeChatId,
          messageId: normalizedMessage.id,
          uploadId,
          progress: 5,
          cancel: upload.cancel,
          fileName: label,
          size: file.size
        });
        renderMessages(activeChatId);
        attachment = await upload.promise;
      } else {
        upsertUploadItem({ id: uploadId, label, status: "uploading", progress: 5, error: "" });
        attachment = await api.uploadAttachment(activeChatId, normalizedMessage.id, file, {
          onProgress: (progress) => {
            upsertUploadItem({ id: uploadId, label, status: "uploading", progress, error: "" });
          }
        });
      }

      if (!attachment) {
        clearPendingVoiceUpload(normalizedMessage.id);
        await api.deleteMessage(activeChatId, normalizedMessage.id);
        store.setMessages(activeChatId, store.getMessages(activeChatId).filter((item) => Number(item?.id) !== Number(normalizedMessage.id)), store.getHistoryMeta(activeChatId));
        renderMessages(activeChatId);
        if (isVoiceUpload) {
          return;
        }
        throw new Error("Не удалось загрузить файл.");
      }

      setMessageAttachments(normalizedMessage.id, [attachment]);
      clearPendingVoiceUpload(normalizedMessage.id);
      if (!isVoiceUpload) {
        upsertUploadItem({ id: uploadId, label, status: "done", progress: 100, error: "" });
      }
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      await markActiveChatAsRead();
      if (!isVoiceUpload) {
        finishUploadItem(uploadId);
      }
    } catch (error) {
      if (isVoiceUpload) {
        clearPendingVoiceUpload(voiceMessageId);
        return;
      }
      upsertUploadItem({
        id: uploadId,
        label,
        status: "error",
        progress: 100,
        error: error instanceof Error ? error.message : "Неизвестная ошибка"
      });
    }
  };

  const handleSelectedFiles = async (files, forcedKind = null) => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || !Array.isArray(files) || !files.length) return;
    if (store.isUsingMockData()) {
      files.forEach((file) => {
        upsertUploadItem({
          id: createClientMessageId(),
          label: String(file?.name || "attachment"),
          status: "error",
          progress: 100,
          error: "В демо-режиме загрузка вложений недоступна"
        });
      });
      return;
    }

    for (const file of files) {
      // sequential keeps message order stable and progress easy to follow
      // eslint-disable-next-line no-await-in-loop
      await uploadFileToChat(file, forcedKind);
    }
  };

  const stopVoiceRecording = async () => {
    if (!mediaRecorder) return;
    const recorder = mediaRecorder;
    mediaRecorder = null;

    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.stop();
    });
  };

  const cleanupRecorderStream = () => {
    if (mediaRecorderStream) {
      mediaRecorderStream.getTracks().forEach((track) => track.stop());
    }
    mediaRecorderStream = null;
  };

  const resetVoiceRecorder = () => {
    stopVoiceRecordingTimer();
    voiceRecordingMode = "idle";
    voiceRecordingElapsedMs = 0;
    voiceRecordingStartedAt = 0;
    voiceRecordingIntent = "cancel";
    if (mediaRecorder && mediaRecorder.state === "recording") {
      discardCurrentRecording = true;
      try {
        mediaRecorder.stop();
      } catch {
        // ignore stop errors during reset
      }
    }
    mediaRecorder = null;
    cleanupRecorderStream();
    voiceChunks = [];
    setVoiceStatus("Голосовые сообщения готовы");
    syncVoiceRecordingUi();
  };

  const cancelVoiceRecording = async () => {
    if (!mediaRecorder) {
      resetVoiceRecorder();
      syncComposerUi();
      return;
    }
    discardCurrentRecording = true;
    voiceRecordingIntent = "cancel";
    stopVoiceRecordingTimer();
    voiceRecordingMode = "idle";
    voiceRecordingElapsedMs = 0;
    voiceRecordingStartedAt = 0;
    syncVoiceRecordingUi();
    await stopVoiceRecording();
    syncComposerUi();
  };

  const finalizeVoiceRecording = async () => {
    if (!mediaRecorder) return;
    if (voiceRecordingMode === "recording" && voiceRecordingStartedAt > 0) {
      voiceRecordingElapsedMs += Math.max(0, Date.now() - voiceRecordingStartedAt);
    }
    voiceRecordingStartedAt = 0;
    stopVoiceRecordingTimer();
    voiceRecordingMode = "idle";
    voiceRecordingIntent = "send";
    syncVoiceRecordingUi();
    await stopVoiceRecording();
    syncComposerUi();
  };

  const toggleVoiceRecordingPause = async () => {
    if (!mediaRecorder) return;
    if (voiceRecordingMode === "recording" && mediaRecorder.state === "recording") {
      voiceRecordingElapsedMs += Math.max(0, Date.now() - voiceRecordingStartedAt);
      voiceRecordingStartedAt = 0;
      mediaRecorder.pause();
      voiceRecordingMode = "paused";
      stopVoiceRecordingTimer();
      syncVoiceRecordingUi();
      syncComposerUi();
      return;
    }
    if (voiceRecordingMode === "paused" && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      voiceRecordingMode = "recording";
      voiceRecordingStartedAt = Date.now();
      startVoiceRecordingTimer();
      syncVoiceRecordingUi();
      syncComposerUi();
    }
  };

  const startVoiceRecording = async () => {
    if (!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") || typeof MediaRecorder === "undefined") {
      setVoiceStatus("MediaRecorder недоступен в этом браузере");
      return;
    }

    try {
      voiceRecordingIntent = "send";
      voiceRecordingElapsedMs = 0;
      voiceRecordingStartedAt = 0;
      voiceRecordingMode = "starting";
      syncVoiceRecordingUi();
      syncComposerUi();
      mediaRecorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      discardCurrentRecording = false;
      voiceRecordingStartedAt = Date.now();
      voiceRecordingMode = "recording";
      voiceChunks = [];
      mediaRecorder = new MediaRecorder(mediaRecorderStream);
      const recorder = mediaRecorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          voiceChunks.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(voiceChunks, { type: mimeType });
        mediaRecorder = null;
        stopVoiceRecordingTimer();
        cleanupRecorderStream();
        voiceChunks = [];
        const shouldDiscard = discardCurrentRecording || voiceRecordingIntent !== "send";
        voiceRecordingMode = "idle";
        voiceRecordingElapsedMs = 0;
        voiceRecordingStartedAt = 0;
        if (shouldDiscard) {
          discardCurrentRecording = false;
          voiceRecordingIntent = "cancel";
          setVoiceStatus("Голосовые сообщения готовы");
          syncVoiceRecordingUi();
          syncComposerUi();
          return;
        }
        if (blob.size <= 0) {
          voiceRecordingIntent = "cancel";
          setVoiceStatus("Пустая запись, попробуйте еще раз");
          syncVoiceRecordingUi();
          syncComposerUi();
          return;
        }

        const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        setVoiceStatus("Голосовое сообщение отправляется...");
        voiceRecordingIntent = "cancel";
        syncVoiceRecordingUi();
        void handleSelectedFiles([file], 4).finally(() => {
          setVoiceStatus("Голосовые сообщения готовы");
          syncVoiceRecordingUi();
          syncComposerUi();
        });
      });
      recorder.start();
      setVoiceStatus("Идет запись... Нажмите Stop, когда закончите");
      startVoiceRecordingTimer();
      syncVoiceRecordingUi();
      syncComposerUi();
    } catch (error) {
      stopVoiceRecordingTimer();
      voiceRecordingMode = "idle";
      voiceRecordingElapsedMs = 0;
      voiceRecordingStartedAt = 0;
      cleanupRecorderStream();
      mediaRecorder = null;
      setVoiceStatus(error instanceof Error ? error.message : "Не удалось получить доступ к микрофону");
      syncVoiceRecordingUi();
      syncComposerUi();
    }
  };

  const onVoiceToggleClick = async () => {
    await startVoiceRecording();
  };

  const applyMockSend = () => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId) return false;
    const body = normalizeToken(chatShellInput instanceof HTMLInputElement ? chatShellInput.value : "");
    const actorIdRaw = Number(getActorUserId());
    const actorId = Number.isFinite(actorIdRaw) && actorIdRaw > 0 ? actorIdRaw : 1;

    if (composerState.mode === "edit") {
      store.patchMessage(activeChatId, composerState.messageId, {
        body,
        editedAtUtc: new Date().toISOString()
      });
      clearComposerIntent();
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();
      return true;
    }

    if (composerState.mode === "forward") {
      const source = getMessageById(composerState.chatId || activeChatId, composerState.messageId);
      if (!source) return false;
      store.upsertMessage(activeChatId, {
        id: Date.now(),
        senderUserId: actorId,
        kind: CHAT_MESSAGE_KIND_TEXT,
        body: source.body,
        replyToMessageId: null,
        forwardedFromMessageId: source.id,
        clientMessageId: createClientMessageId(),
        createdAtUtc: new Date().toISOString(),
        editedAtUtc: "",
        deletedAtUtc: ""
      });
      clearComposerIntent();
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();
      return true;
    }

    if (!body) return false;
    store.upsertMessage(activeChatId, {
      id: Date.now(),
      senderUserId: actorId,
      kind: CHAT_MESSAGE_KIND_TEXT,
      body,
      replyToMessageId: composerState.mode === "reply" ? composerState.messageId : null,
      forwardedFromMessageId: null,
      clientMessageId: createClientMessageId(),
      createdAtUtc: new Date().toISOString(),
      editedAtUtc: "",
      deletedAtUtc: ""
    });
    clearComposerIntent();
    renderMessages(activeChatId);
    scrollMessagesToBottom();
    renderRailList();
    return true;
  };

  const sendMessage = async () => {
    if (isSendingMessage || isLoadingMessages || isLoadingOlderMessages) return;
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || !store.isFeatureEnabled()) return;

    const body = normalizeToken(chatShellInput instanceof HTMLInputElement ? chatShellInput.value : "");
    if (!body && composerState.mode !== "forward") return;

    if (store.isUsingMockData()) {
      const applied = applyMockSend();
      if (applied && chatShellInput instanceof HTMLInputElement && composerState.mode !== "forward") {
        chatShellInput.value = "";
        chatShellInput.focus();
      }
      return;
    }

    isSendingMessage = true;
    syncComposerUi();

    let payload = null;
    let optimisticClientMessageId = "";
    let optimisticMessage = null;
    if (composerState.mode === "edit") {
      payload = await api.editMessage(activeChatId, composerState.messageId, body);
    } else if (composerState.mode === "reply") {
      optimisticClientMessageId = createClientMessageId();
      optimisticMessage = {
        id: -Date.now(),
        senderUserId: Number(getActorUserId()) || 0,
        kind: CHAT_MESSAGE_KIND_TEXT,
        body,
        replyToMessageId: composerState.messageId,
        forwardedFromMessageId: null,
        clientMessageId: optimisticClientMessageId,
        createdAtUtc: new Date().toISOString(),
        editedAtUtc: "",
        deletedAtUtc: ""
      };
      store.reconcileMessage(activeChatId, optimisticClientMessageId, optimisticMessage);
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();
      payload = await api.replyToMessage(activeChatId, composerState.messageId, {
        kind: CHAT_MESSAGE_KIND_TEXT,
        bodyCipher: body,
        clientMessageId: optimisticClientMessageId
      });
    } else if (composerState.mode === "forward") {
      const source = getMessageById(composerState.chatId || activeChatId, composerState.messageId);
      optimisticClientMessageId = createClientMessageId();
      optimisticMessage = {
        id: -Date.now(),
        senderUserId: Number(getActorUserId()) || 0,
        kind: CHAT_MESSAGE_KIND_TEXT,
        body: source?.body || "Пересланное сообщение",
        replyToMessageId: null,
        forwardedFromMessageId: composerState.messageId,
        clientMessageId: optimisticClientMessageId,
        createdAtUtc: new Date().toISOString(),
        editedAtUtc: "",
        deletedAtUtc: ""
      };
      store.reconcileMessage(activeChatId, optimisticClientMessageId, optimisticMessage);
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();
      payload = await api.forwardMessage(activeChatId, composerState.messageId);
      if (payload && !payload.clientMessageId) {
        payload.clientMessageId = optimisticClientMessageId;
      }
    } else if (composerState.mode === "bulk-forward") {
      const sourceMessageIds = Array.isArray(composerState.messageIds) ? composerState.messageIds : [];
      const forwardedMessages = [];
      for (const sourceMessageId of sourceMessageIds) {
        // eslint-disable-next-line no-await-in-loop
        const forwarded = await api.forwardMessage(activeChatId, sourceMessageId);
        if (forwarded) {
          forwardedMessages.push(forwarded);
        }
      }
      payload = forwardedMessages[forwardedMessages.length - 1] || null;
      if (forwardedMessages.length > 1) {
        forwardedMessages.forEach((forwarded) => {
          const normalizedForward = normalizeChatMessage(forwarded);
          if (normalizedForward?.id) {
            store.reconcileMessage(activeChatId, normalizedForward.clientMessageId, normalizedForward);
          }
        });
      }
    } else {
      optimisticClientMessageId = createClientMessageId();
      optimisticMessage = {
        id: -Date.now(),
        senderUserId: Number(getActorUserId()) || 0,
        kind: CHAT_MESSAGE_KIND_TEXT,
        body,
        replyToMessageId: null,
        forwardedFromMessageId: null,
        clientMessageId: optimisticClientMessageId,
        createdAtUtc: new Date().toISOString(),
        editedAtUtc: "",
        deletedAtUtc: ""
      };
      store.reconcileMessage(activeChatId, optimisticClientMessageId, optimisticMessage);
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();
      payload = await api.sendMessage(activeChatId, {
        kind: CHAT_MESSAGE_KIND_TEXT,
        bodyCipher: body,
        clientMessageId: optimisticClientMessageId
      });
    }

    isSendingMessage = false;
    stopTyping();
    if (!payload) {
      if (optimisticClientMessageId) {
        store.removeMessageByClientMessageId(activeChatId, optimisticClientMessageId);
        renderMessages(activeChatId);
        renderRailList();
      }
      syncComposerUi();
      return;
    }

    const normalized = normalizeChatMessage(payload);
    if (normalized?.id) {
      store.reconcileMessage(activeChatId, optimisticClientMessageId, normalized);
      renderMessages(activeChatId);
      scrollMessagesToBottom();
      renderRailList();
      await markActiveChatAsRead();
    } else {
      await loadMessages(activeChatId);
    }

    clearComposerIntent();
    if (chatShellInput instanceof HTMLInputElement) {
      chatShellInput.value = "";
      chatShellInput.focus();
    }
    syncComposerUi();
  };

  const refreshChats = async () => {
    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      setSettingsOpen(false);
      store.clear();
      clearAttachmentState();
      clearRealtimeState();
      uploadQueue = [];
      renderUploadQueue();
      void realtimeClient.stop();
      renderRailList();
      showChatPlaceholder("Выберите чат", "Диалог внутри проекта", "Выберите чат слева, чтобы открыть диалог.");
      return;
    }

    const previousActiveChatId = store.getActiveChatId();
    const result = await api.getChats(workspaceId);
    if (result.disabled) {
      setMockData();
      return;
    }

    if (!result.ok) {
      setSettingsOpen(false);
      store.clear();
      clearAttachmentState();
      clearRealtimeState();
      setChatAvailabilityState(false, "Не удалось загрузить список чатов.");
      renderRailList();
      showChatPlaceholder("Чаты недоступны", "REST integration", "Не удалось получить список комнат.");
      return;
    }

    const chats = result.data
      .map((chat) => normalizeChatRoom(chat))
      .filter(Boolean);

    store.clear();
    clearAttachmentState();
    clearRealtimeState();
    uploadQueue = [];
    renderUploadQueue();
    store.setChats(chats);
    store.setUseMockData(false);
    setChatAvailabilityState(true);
    renderRailList();
    await realtimeClient.syncChats(chats.map((chat) => chat.id));
    await fetchLatestPreviews();

    const activeChatId = previousActiveChatId;
    if (activeChatId && store.getChatById(activeChatId)) {
      store.setActiveChatId(activeChatId);
      await openChat(activeChatId);
      return;
    }

    setSettingsOpen(false);
    showChatPlaceholder("Выберите чат", "Диалог внутри проекта", "Выберите чат слева, чтобы открыть диалог.");
  };

  const activateTasks = () => {
    store.setActiveChatId(null);
    clearComposerIntent();
    clearSelectedMessages();
    resetVoiceRecorder();
    stopTyping();
    closeMessageContextMenu();
    setSettingsOpen(false);
    renderRailList();
    onOpenTasks();
  };

  const clearWorkspaceData = () => {
    store.clear();
    clearSelectedMessages();
    clearAttachmentState();
    clearRealtimeState();
    closeMessageContextMenu();
    uploadQueue = [];
    renderUploadQueue();
    resetVoiceRecorder();
    void realtimeClient.stop();
    setSettingsOpen(false);
    renderRailList();
    showChatPlaceholder("Выберите чат", "Диалог внутри проекта", "Выберите чат слева, чтобы открыть диалог.");
  };

  const syncMembers = () => {
    renderRailList();
    const activeChatId = store.getActiveChatId();
    if (activeChatId) {
      renderMessages(activeChatId);
      renderRealtimePresence();
    }
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

    if (chatShellSettingsBtn instanceof HTMLButtonElement) {
      chatShellSettingsBtn.addEventListener("click", () => {
        if (!store.getActiveChatId()) return;
        setSettingsOpen(!isSettingsOpen);
      });
    }

    if (chatShellBulkForwardBtn instanceof HTMLButtonElement) {
      chatShellBulkForwardBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startBulkForwardSelectedMessages();
      });
    }

    if (chatShellBulkCancelBtn instanceof HTMLButtonElement) {
      chatShellBulkCancelBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        exitSelectionMode();
      });
    }

    if (chatShellBulkDeleteBtn instanceof HTMLButtonElement) {
      chatShellBulkDeleteBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteSelectedMessages();
      });
    }

    if (chatSettingsSaveBtn instanceof HTMLButtonElement) {
      chatSettingsSaveBtn.addEventListener("click", () => {
        void saveChatSettings();
      });
    }

    if (chatSettingsSwatches instanceof HTMLElement) {
      chatSettingsSwatches.querySelectorAll("[data-bg-value]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedBackground = String(button.getAttribute("data-bg-value") || "default");
          applyChatBackground(store.getActiveChatId(), selectedBackground);
          syncSettingsPanel();
        });
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
      chatShellInput.addEventListener("input", () => {
        if (composerState.mode === "edit") {
          composerState = {
            ...composerState,
            body: chatShellInput.value
          };
        }
        notifyTyping();
        syncComposerUi();
      });
      chatShellInput.addEventListener("blur", () => {
        stopTyping();
      });
    }

    if (chatShellLoadMoreBtn instanceof HTMLButtonElement) {
      chatShellLoadMoreBtn.addEventListener("click", () => {
        void loadOlderMessages();
      });
    }

    if (chatMsgMenuReplyBtn instanceof HTMLButtonElement) {
      chatMsgMenuReplyBtn.addEventListener("click", () => {
        void applyContextMenuAction("reply");
      });
    }

    if (chatMsgMenuForwardBtn instanceof HTMLButtonElement) {
      chatMsgMenuForwardBtn.addEventListener("click", () => {
        void applyContextMenuAction("forward");
      });
    }

    if (chatMsgMenuEditBtn instanceof HTMLButtonElement) {
      chatMsgMenuEditBtn.addEventListener("click", () => {
        void applyContextMenuAction("edit");
      });
    }

    if (chatMsgMenuDeleteBtn instanceof HTMLButtonElement) {
      chatMsgMenuDeleteBtn.addEventListener("click", () => {
        void applyContextMenuAction("delete");
      });
    }

    if (chatShellJumpBottomBtn instanceof HTMLButtonElement) {
      chatShellJumpBottomBtn.addEventListener("click", () => {
        scrollMessagesToBottom();
      });
    }

    if (chatShellFeed instanceof HTMLElement) {
      chatShellFeed.addEventListener("scroll", () => {
        closeMessageContextMenu();
        syncJumpBottomButton();
        if (shouldAutoLoadOlderMessages()) {
          void loadOlderMessages();
        }
      }, { passive: true });
    }

    document.addEventListener("click", (event) => {
      if (!(chatMsgMenu instanceof HTMLElement) || chatMsgMenu.hidden) return;
      if (chatMsgMenu.contains(event.target)) return;
      closeMessageContextMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMessageContextMenu();
      }
    });

    if (chatShellContextCancelBtn instanceof HTMLButtonElement) {
      chatShellContextCancelBtn.addEventListener("click", () => {
        clearComposerIntent();
      });
    }

    if (chatShellAttachBtn instanceof HTMLButtonElement) {
      chatShellAttachBtn.addEventListener("click", () => {
        chatShellFileInput?.click();
      });
    }

    if (chatShellFileInput instanceof HTMLInputElement) {
      chatShellFileInput.addEventListener("change", () => {
        const files = chatShellFileInput.files ? Array.from(chatShellFileInput.files) : [];
        chatShellFileInput.value = "";
        void handleSelectedFiles(files);
      });
    }

    if (chatShellVoiceBtn instanceof HTMLButtonElement) {
      chatShellVoiceBtn.addEventListener("click", () => {
        void onVoiceToggleClick();
      });
    }

    if (chatShellRecordingCancelBtn instanceof HTMLButtonElement) {
      chatShellRecordingCancelBtn.addEventListener("click", () => {
        void cancelVoiceRecording();
      });
    }

    if (chatShellRecordingPauseBtn instanceof HTMLButtonElement) {
      chatShellRecordingPauseBtn.addEventListener("click", () => {
        void toggleVoiceRecordingPause();
      });
    }

    if (chatShellRecordingSendBtn instanceof HTMLButtonElement) {
      chatShellRecordingSendBtn.addEventListener("click", () => {
        void finalizeVoiceRecording();
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

    renderUploadQueue();
    setVoiceStatus("Голосовые сообщения готовы");
    syncJumpBottomButton();
    syncComposerUi();
  };

  return {
    init,
    refreshChats,
    openChat,
    ensureTaskChat,
    activateTasks,
    clearWorkspaceData,
    syncMembers
  };
};
