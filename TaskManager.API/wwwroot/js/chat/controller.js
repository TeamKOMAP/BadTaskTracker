import {
  CHAT_RAIL_MIN_WIDTH,
  CHAT_RAIL_MAX_WIDTH,
  CHAT_RAIL_DEFAULT_WIDTH,
  CHAT_RAIL_EXPANDED_THRESHOLD,
  clampChatRailWidth,
  isChatRailExpanded,
  readStoredChatRailWidth,
  storeChatRailWidth
} from "../workspace/chat-state.js?v=chatstate7";
import { createChatApi } from "./api.js?v=chat5";
import { createChatStore } from "./store.js?v=chat4";
import { createChatSignalRClient } from "./signalr-client.js?v=chatrt1";

const CHAT_MESSAGE_KIND_TEXT = 1;
const CHAT_PAGE_SIZE = 30;
const CHAT_SETTINGS_STORAGE_KEY = "gtt-chat-ui-settings-v1";
const CHAT_BOTTOM_THRESHOLD_PX = 96;
const CHAT_TOP_THRESHOLD_PX = 56;
const CHAT_MESSAGE_WINDOW_SIZE = 140;
const CHAT_MESSAGE_WINDOW_EXPAND_STEP = 70;
const CHAT_RAIL_AVATAR_ONLY_THRESHOLD = Math.min(CHAT_RAIL_EXPANDED_THRESHOLD - 1, CHAT_RAIL_MIN_WIDTH + 28);
const CHAT_IMAGE_VIEWER_MIN_SCALE = 0.75;
const CHAT_IMAGE_VIEWER_MAX_SCALE = 4;
const CHAT_IMAGE_VIEWER_SCALE_STEP = 0.2;

const CHAT_TYPE_LABELS = {
  1: "General",
  2: "Group",
  3: "DM",
  4: "Task"
};

const CHAT_RAIL_TABS = [
  { key: "all", label: "Все" },
  { key: "general", label: "Общие" },
  { key: "groups", label: "Группы" },
  { key: "tasks", label: "Задачи" },
  { key: "direct", label: "ЛС" }
];

const CHAT_RAIL_TAB_ICONS = {
  all: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>',
  general: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M4 12h16" /><path d="M12 4a12 12 0 0 1 0 16" /><path d="M12 4a12 12 0 0 0 0 16" /></svg>',
  groups: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 18a5.5 5.5 0 0 1 11 0" /><path d="M13 18a4.5 4.5 0 0 1 8 0" /></svg>',
  tasks: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>',
  direct: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" /></svg>'
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
    return "Изображение";
  }
  return name || "Файл";
};

const formatMediaTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const isInteractiveMessageTarget = (target) => {
  return target instanceof Element && Boolean(target.closest("button, input, a, audio, [role='button']"));
};

const suppressMessageSelectionEvent = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

const getAudioDurationMs = async (fileOrBlob) => {
  if (!(fileOrBlob instanceof Blob)) return null;

  return await new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(fileOrBlob);
    const cleanup = () => {
      audio.src = "";
      URL.revokeObjectURL(url);
    };

    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : null;
      cleanup();
      resolve(duration);
    }, { once: true });
    audio.addEventListener("error", () => {
      cleanup();
      resolve(null);
    }, { once: true });
    audio.src = url;
  });
};

const resizeImageToDataUrl = async (file) => {
  if (!(file instanceof Blob)) return "";

  return await new Promise((resolve) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
        const width = Math.max(1, Math.round((image.width || 1) * scale));
        const height = Math.max(1, Math.round((image.height || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(String(fileReader.result || ""));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => resolve(String(fileReader.result || ""));
      image.src = String(fileReader.result || "");
    };
    fileReader.onerror = () => resolve("");
    fileReader.readAsDataURL(file);
  });
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
      directPeerUserId: peerId,
      directPeerDisplayName: peerName,
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
  const chatRailTabs = deps.chatRailTabs ?? null;
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
  const chatSettingsModal = deps.chatSettingsModal ?? null;
  const chatSettingsModalAvatar = deps.chatSettingsModalAvatar ?? null;
  const chatSettingsAvatarInput = deps.chatSettingsAvatarInput ?? null;
  const chatSettingsModalMain = deps.chatSettingsModalMain ?? null;
  const chatSettingsModalName = deps.chatSettingsModalName ?? null;
  const chatSettingsModalSub = deps.chatSettingsModalSub ?? null;
  const chatSettingsPanel = deps.chatSettingsPanel ?? null;
  const chatSettingsMuted = deps.chatSettingsMuted ?? null;
  const chatSettingsSkipActive = deps.chatSettingsSkipActive ?? null;
  const chatSettingsRoomBlock = deps.chatSettingsRoomBlock ?? null;
  const chatSettingsTitleWrap = deps.chatSettingsTitleWrap ?? null;
  const chatSettingsTitle = deps.chatSettingsTitle ?? null;
  const chatSettingsBgBlock = deps.chatSettingsBgBlock ?? null;
  const chatSettingsBgHeading = deps.chatSettingsBgHeading ?? null;
  const chatSettingsBgPreview = deps.chatSettingsBgPreview ?? null;
  const chatSettingsBgUploadBtn = deps.chatSettingsBgUploadBtn ?? null;
  const chatSettingsBgRemoveBtn = deps.chatSettingsBgRemoveBtn ?? null;
  const chatSettingsBgInput = deps.chatSettingsBgInput ?? null;
  const chatSettingsNote = deps.chatSettingsNote ?? null;
  const chatSettingsSaveBtn = deps.chatSettingsSaveBtn ?? null;
  const chatSettingsMembersCount = deps.chatSettingsMembersCount ?? null;
  const chatSettingsMembers = deps.chatSettingsMembers ?? null;
  const chatSettingsMembersEmpty = deps.chatSettingsMembersEmpty ?? null;
  const chatSettingsAttachmentTabs = deps.chatSettingsAttachmentTabs ?? null;
  const chatSettingsAttachments = deps.chatSettingsAttachments ?? null;
  const chatSettingsAttachmentsEmpty = deps.chatSettingsAttachmentsEmpty ?? null;
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
  const applyAccountAvatarToElement = typeof deps.applyAccountAvatarToElement === "function" ? deps.applyAccountAvatarToElement : (element, textElement, initials) => {
    if (textElement) {
      textElement.textContent = initials;
    } else if (element) {
      element.textContent = initials;
    }
  };
  const getWorkspaceId = typeof deps.getWorkspaceId === "function" ? deps.getWorkspaceId : () => null;
  const getWorkspaceName = typeof deps.getWorkspaceName === "function" ? deps.getWorkspaceName : () => "Проект";
  const getWorkspaceAvatarPath = typeof deps.getWorkspaceAvatarPath === "function" ? deps.getWorkspaceAvatarPath : () => "";
  const getActorUserId = typeof deps.getActorUserId === "function" ? deps.getActorUserId : () => null;
  const getActorDisplayName = typeof deps.getActorDisplayName === "function" ? deps.getActorDisplayName : () => "Вы";
  const getMemberById = typeof deps.getMemberById === "function" ? deps.getMemberById : () => null;
  const getWorkspaceMembers = typeof deps.getWorkspaceMembers === "function" ? deps.getWorkspaceMembers : () => [];
  const getWorkspaceRole = typeof deps.getWorkspaceRole === "function" ? deps.getWorkspaceRole : () => "Member";
  const onOpenTasks = typeof deps.onOpenTasks === "function" ? deps.onOpenTasks : () => {};
  const onOpenChat = typeof deps.onOpenChat === "function" ? deps.onOpenChat : () => {};
  const onOpenProfile = typeof deps.onOpenProfile === "function" ? deps.onOpenProfile : () => {};

  const api = createChatApi();
  const store = createChatStore();

  let initialized = false;
  let currentRailWidth = CHAT_RAIL_DEFAULT_WIDTH;
  let activeRailTab = "all";
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
  let selectedBackground = null;
  let settingsSaving = false;
  let contextMenuState = null;
  let activeAttachmentTab = "all";

  const attachmentsByMessageId = new Map();
  const attachmentLoadingByMessageId = new Map();
  const attachmentObjectUrls = new Map();
  const pendingVoiceUploadsByMessageId = new Map();
  const modalMembersByChatId = new Map();
  const modalAttachmentsByChatId = new Map();
  const messageRenderWindowByChatId = new Map();
  const pendingMessageRenderByChatId = new Map();
  const unreadByChatId = new Map();
  const readStateByChatId = new Map();
  const typingByChatId = new Map();
  const preferencesByChatId = new Map();
  const typingTimersByChatId = new Map();
  let typingStopTimeoutId = 0;
  let isTypingSent = false;
  let messageRenderRafId = 0;
  let imageViewerRoot = null;
  let imageViewerImage = null;
  let imageViewerMenu = null;
  let imageViewerMenuBtn = null;
  let imageViewerZoomOutBtn = null;
  let imageViewerZoomInBtn = null;
  let imageViewerZoomLabel = null;
  let imageViewerScale = 1;
  let imageViewerChatId = "";
  let imageViewerAttachment = null;
  let nowPlayingPanel = null;
  let nowPlayingToggleBtn = null;
  let nowPlayingSenderEl = null;
  let nowPlayingProgressEl = null;
  let nowPlayingTimeEl = null;
  let nowPlayingCloseBtn = null;
  let nowPlayingVolumeWrap = null;
  let nowPlayingVolumeBtn = null;
  let nowPlayingVolumeSlider = null;
  let nowPlayingVolumeHideTimerId = 0;
  let activeAudioPlayback = null;
  let audioOutputVolume = 1;
  let audioOutputUnmutedVolume = 1;
  let audioOutputMuted = false;

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
    const directPeerUserIdRaw = Number(chat?.directPeerUserId ?? chat?.DirectPeerUserId);
    const directPeerDisplayName = normalizeToken(chat?.directPeerDisplayName ?? chat?.DirectPeerDisplayName);
    const title = normalizeToken(chat?.title ?? chat?.Title);
    const taskIdRaw = Number(chat?.taskId ?? chat?.TaskId);
    const taskId = Number.isFinite(taskIdRaw) && taskIdRaw > 0 ? taskIdRaw : null;
    const updatedAtUtc = normalizeUtcDateValue(chat?.updatedAtUtc ?? chat?.UpdatedAtUtc ?? "");
    const avatarPath = normalizeToken(chat?.avatarPath ?? chat?.AvatarPath);

    return {
      id,
      workspaceId: Number.isFinite(workspaceIdRaw) && workspaceIdRaw > 0 ? workspaceIdRaw : null,
      type,
      title: (type === 3 ? (directPeerDisplayName || title) : title) || buildFallbackChatTitle({ taskId }),
      taskId,
      directPeerUserId: Number.isFinite(directPeerUserIdRaw) && directPeerUserIdRaw > 0 ? directPeerUserIdRaw : null,
      directPeerDisplayName: directPeerDisplayName || null,
      createdByUserId: Number.isFinite(createdByUserIdRaw) && createdByUserIdRaw > 0 ? createdByUserIdRaw : null,
      updatedAtUtc,
      avatarPath: avatarPath || null
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
    const forwardedFromSenderUserId = Number(message?.forwardedFromSenderUserId ?? message?.ForwardedFromSenderUserId);
    const forwardedFromSenderDisplayName = normalizeToken(message?.forwardedFromSenderDisplayName ?? message?.ForwardedFromSenderDisplayName);

    return {
      id,
      senderUserId,
      kind: Number(message?.kind ?? message?.Kind) || CHAT_MESSAGE_KIND_TEXT,
      body: body || "-",
      replyToMessageId: Number.isFinite(replyToMessageId) && replyToMessageId > 0 ? replyToMessageId : null,
      forwardedFromMessageId: Number.isFinite(forwardedFromMessageId) && forwardedFromMessageId > 0 ? forwardedFromMessageId : null,
      forwardedFromSenderUserId: Number.isFinite(forwardedFromSenderUserId) && forwardedFromSenderUserId > 0 ? forwardedFromSenderUserId : null,
      forwardedFromSenderDisplayName: forwardedFromSenderDisplayName || null,
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

  const normalizeModalMember = (member) => {
    const userId = Number(member?.userId ?? member?.UserId);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return {
      userId,
      name: normalizeToken(member?.name ?? member?.Name) || `User ${userId}`,
      email: normalizeToken(member?.email ?? member?.Email) || "",
      avatarPath: normalizeToken(member?.avatarPath ?? member?.AvatarPath) || "",
      role: String(member?.role ?? member?.Role ?? "Member")
    };
  };

  const normalizeModalAttachment = (attachment) => {
    const id = toChatId(attachment?.id ?? attachment?.Id);
    const messageId = Number(attachment?.messageId ?? attachment?.MessageId);
    const senderUserId = Number(attachment?.senderUserId ?? attachment?.SenderUserId);
    if (!id || !Number.isFinite(messageId) || messageId <= 0) return null;
    return {
      id,
      messageId,
      senderUserId: Number.isFinite(senderUserId) && senderUserId > 0 ? senderUserId : null,
      fileName: normalizeToken(attachment?.fileName ?? attachment?.FileName) || "attachment",
      contentType: normalizeToken(attachment?.contentType ?? attachment?.ContentType) || "application/octet-stream",
      size: Number(attachment?.size ?? attachment?.Size) || 0,
      durationMs: Number(attachment?.durationMs ?? attachment?.DurationMs) || null,
      createdAtUtc: normalizeUtcDateValue(attachment?.createdAtUtc ?? attachment?.CreatedAtUtc ?? "")
    };
  };

  const getRailCollapseProgress = (width) => {
    const railWidth = clampChatRailWidth(width);
    if (railWidth >= CHAT_RAIL_EXPANDED_THRESHOLD) return 0;
    const range = CHAT_RAIL_EXPANDED_THRESHOLD - CHAT_RAIL_MIN_WIDTH;
    if (range <= 0) return 1;
    return Math.max(0, Math.min(1, (CHAT_RAIL_EXPANDED_THRESHOLD - railWidth) / Math.max(1, range)));
  };

  const setRailExpandedClass = (width) => {
    if (!(chatRail instanceof HTMLElement)) return;
    const expanded = isChatRailExpanded(width);
    const dockedTabs = true;
    const avatarOnly = width <= CHAT_RAIL_AVATAR_ONLY_THRESHOLD;
    chatRail.classList.toggle("is-expanded", expanded);
    chatRail.classList.remove("is-icons-only");
    chatRail.classList.toggle("is-docked-tabs", dockedTabs);
    chatRail.classList.toggle("is-avatar-only", avatarOnly);
    chatRail.style.setProperty("--chat-rail-collapse-progress", getRailCollapseProgress(width).toFixed(3));
  };

  const setRailWidth = (width, persist = true) => {
    currentRailWidth = clampChatRailWidth(width);
    if (chatRail instanceof HTMLElement) {
      chatRail.style.setProperty("--chat-rail-width", `${currentRailWidth}px`);
      chatRail.style.flex = `0 0 ${currentRailWidth}px`;
      chatRail.style.flexBasis = `${currentRailWidth}px`;
      chatRail.style.width = `${currentRailWidth}px`;
      chatRail.style.minWidth = `${currentRailWidth}px`;
      chatRail.style.maxWidth = `${currentRailWidth}px`;
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
    if (chatShellInput instanceof HTMLTextAreaElement) {
      chatShellInput.value = "";
    }
    resizeComposerInput();
    syncComposerUi();
  };

  const resizeComposerInput = () => {
    if (!(chatShellInput instanceof HTMLTextAreaElement)) {
      return;
    }

    const minHeight = 44;
    const maxHeight = 168;
    chatShellInput.style.height = "auto";
    const contentHeight = Number(chatShellInput.scrollHeight) || minHeight;
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, contentHeight));
    chatShellInput.style.height = `${nextHeight}px`;
    chatShellInput.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  };

  const getChatTypeLabel = (type) => {
    return CHAT_TYPE_LABELS[Number(type)] || "Chat";
  };

  const getMemberAvatarPath = (userId) => {
    const member = getMemberById(userId);
    return normalizeToken(member?.avatarPath);
  };

  const getAttachmentTypeKey = (contentType) => {
    if (isImageContentType(contentType)) return "images";
    if (isVoiceContentType(contentType)) return "voice";
    return "files";
  };

  const applyChatAvatar = (element, chat, fallbackTitle) => {
    if (!(element instanceof HTMLElement)) return;

    const type = Number(chat?.type);
    if (type === 1 || type === 4) {
      applyAccountAvatarToElement(element, null, toInitials(getWorkspaceName(), type === 1 ? "GN" : "TK"), getWorkspaceAvatarPath());
      return;
    }

    if (type === 3) {
      const peerUserId = Number(chat?.directPeerUserId);
      const peerName = normalizeToken(chat?.directPeerDisplayName) || fallbackTitle || chat?.title || "DM";
      applyAccountAvatarToElement(element, null, toInitials(peerName, "DM"), getMemberAvatarPath(peerUserId));
      return;
    }

    const chatId = toChatId(chat?.id);
    const avatarFromUi = getStoredGroupAvatarDataUrl(chatId);
    const avatarFromApi = normalizeToken(chat?.avatarPath);
    applyAccountAvatarToElement(
      element,
      null,
      toInitials(fallbackTitle || chat?.title || "GR", "GR"),
      avatarFromUi || avatarFromApi
    );
  };

  const syncHomeButtonAvatar = () => {
    if (!(chatHomeBtn instanceof HTMLButtonElement)) return;
    const avatar = chatHomeBtn.querySelector(".chat-rail-avatar--home");
    if (!(avatar instanceof HTMLElement)) return;
    applyAccountAvatarToElement(avatar, null, toInitials(getWorkspaceName(), "TS"), getWorkspaceAvatarPath());
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

  const openProfileForUser = (userId) => {
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      return;
    }

    const member = getMemberById(normalizedUserId);
    if (member) {
      onOpenProfile(member);
      return;
    }

    onOpenProfile({
      id: normalizedUserId,
      name: resolveMemberName(normalizedUserId),
      email: "",
      role: "Member",
      avatarPath: ""
    });
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
      renderMessages(chatId, { stickToBottom });
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

  const loadReadStatesForChat = async (chatId) => {
    if (!chatId || store.isUsingMockData()) return;
    const states = await api.getReadStates(chatId);
    const map = getReadMap(chatId);
    map.clear();
    states.forEach((state) => {
      const userId = Number(state?.userId);
      const lastReadMessageId = Number(state?.lastReadMessageId);
      if (Number.isFinite(userId) && userId > 0 && Number.isFinite(lastReadMessageId) && lastReadMessageId > 0) {
        map.set(userId, lastReadMessageId);
      }
    });
    if (store.getActiveChatId() === chatId) {
      renderMessages(chatId);
    }
  };

  const renderSettingsMembers = (chatId) => {
    if (!(chatSettingsMembers instanceof HTMLElement)) return;
    const members = Array.isArray(modalMembersByChatId.get(String(chatId || ""))) ? modalMembersByChatId.get(String(chatId || "")) : [];
    chatSettingsMembers.innerHTML = "";
    if (chatSettingsMembersCount instanceof HTMLElement) {
      chatSettingsMembersCount.textContent = `${members.length} участников`;
    }
    if (!members.length) {
      if (chatSettingsMembersEmpty instanceof HTMLElement) {
        chatSettingsMembersEmpty.hidden = false;
      }
      return;
    }

    if (chatSettingsMembersEmpty instanceof HTMLElement) {
      chatSettingsMembersEmpty.hidden = true;
    }

    const fragment = document.createDocumentFragment();
    members.forEach((member) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chat-settings-member";

      const avatar = document.createElement("span");
      avatar.className = "chat-settings-member-avatar";
      applyAccountAvatarToElement(avatar, null, toInitials(member.name, "U"), member.avatarPath);

      const meta = document.createElement("span");
      meta.className = "chat-settings-member-meta";
      const name = document.createElement("span");
      name.className = "chat-settings-member-name";
      name.textContent = member.name;
      const sub = document.createElement("span");
      sub.className = "chat-settings-member-sub";
      sub.textContent = member.email || member.role;
      meta.append(name, sub);

      item.append(avatar, meta);
      item.addEventListener("click", () => {
        closeSettingsModal();
        onOpenProfile({
          id: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          avatarPath: member.avatarPath
        });
      });
      fragment.appendChild(item);
    });

    chatSettingsMembers.appendChild(fragment);
  };

  const renderSettingsAttachments = (chatId) => {
    if (!(chatSettingsAttachments instanceof HTMLElement)) return;
    const allAttachments = Array.isArray(modalAttachmentsByChatId.get(String(chatId || ""))) ? modalAttachmentsByChatId.get(String(chatId || "")) : [];
    const filtered = activeAttachmentTab === "all"
      ? allAttachments
      : allAttachments.filter((attachment) => getAttachmentTypeKey(attachment.contentType) === activeAttachmentTab);

    if (chatSettingsAttachmentTabs instanceof HTMLElement) {
      chatSettingsAttachmentTabs.querySelectorAll("[data-attachment-tab]").forEach((button) => {
        button.classList.toggle("is-active", String(button.getAttribute("data-attachment-tab") || "") === activeAttachmentTab);
      });
    }

    chatSettingsAttachments.innerHTML = "";
    if (!filtered.length) {
      if (chatSettingsAttachmentsEmpty instanceof HTMLElement) {
        chatSettingsAttachmentsEmpty.hidden = false;
        chatSettingsAttachmentsEmpty.textContent = allAttachments.length ? "Нет вложений этого типа." : "Нет вложений.";
      }
      return;
    }

    if (chatSettingsAttachmentsEmpty instanceof HTMLElement) {
      chatSettingsAttachmentsEmpty.hidden = true;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((attachment) => {
      const item = document.createElement("div");
      item.className = "chat-settings-attachment-item";
      const title = document.createElement("div");
      title.className = "chat-settings-attachment-title";
      title.textContent = attachment.fileName;
      const sub = document.createElement("div");
      sub.className = "chat-settings-attachment-sub";
      const sender = attachment.senderUserId ? resolveMemberName(attachment.senderUserId) : "Участник";
      sub.textContent = `${sender} · ${formatBytes(attachment.size)}${attachment.createdAtUtc ? ` · ${formatMessageTime(attachment.createdAtUtc)}` : ""}`;
      const actions = document.createElement("div");
      actions.className = "chat-settings-attachment-actions";
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "chat-msg-action";
      openBtn.textContent = "Открыть";
      openBtn.addEventListener("click", async () => {
        const blob = await api.downloadAttachmentBlob(chatId, attachment.id);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.className = "chat-msg-action";
      downloadBtn.textContent = "Скачать";
      downloadBtn.addEventListener("click", async () => {
        const blob = await api.downloadAttachmentBlob(chatId, attachment.id);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
      actions.append(openBtn, downloadBtn);
      item.append(title, sub, actions);
      fragment.appendChild(item);
    });

    chatSettingsAttachments.appendChild(fragment);
  };

  const loadSettingsModalData = async (chatId) => {
    if (!chatId) return;
    const [members, attachments] = await Promise.all([
      api.getMembers(chatId),
      api.getAllAttachments(chatId)
    ]);
    modalMembersByChatId.set(String(chatId), members.map((member) => normalizeModalMember(member)).filter(Boolean));
    modalAttachmentsByChatId.set(String(chatId), attachments.map((attachment) => normalizeModalAttachment(attachment)).filter(Boolean));
    if (store.getActiveChatId() === chatId && isSettingsOpen) {
      renderSettingsMembers(chatId);
      renderSettingsAttachments(chatId);
    }
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
    if (chatShellInput instanceof HTMLTextAreaElement) {
      chatShellInput.value = "";
      resizeComposerInput();
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
    if (chatShellInput instanceof HTMLTextAreaElement) {
      chatShellInput.value = message.body || "";
      resizeComposerInput();
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
      renderMessages(chatId, { stickToBottom: true });
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
    renderMessages(chatId, { stickToBottom: true });
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

  const getForwardedFromText = (chatId, messageId) => {
    const linked = getMessageById(chatId, messageId);
    if (linked) {
      return resolveMemberName(linked.senderUserId);
    }
    return "неизвестного пользователя";
  };

  const getForwardedSenderDisplayText = (chatId, message) => {
    const explicitName = normalizeToken(message?.forwardedFromSenderDisplayName);
    if (explicitName) {
      return explicitName;
    }

    const explicitUserId = Number(message?.forwardedFromSenderUserId);
    if (Number.isFinite(explicitUserId) && explicitUserId > 0) {
      return resolveMemberName(explicitUserId);
    }

    return getForwardedFromText(chatId, message?.forwardedFromMessageId);
  };

  const getReadStateLevel = (chatId, message) => {
    const actorId = Number(getActorUserId());
    if (!Number.isFinite(actorId) || actorId <= 0) return 0;
    if (Number(message?.senderUserId) !== actorId) return 0;
    const messageId = Number(message?.id);
    if (!Number.isFinite(messageId) || messageId <= 0) return 0;

    const readers = Array.from(getReadMap(chatId).entries())
      .filter(([userId, lastReadMessageId]) => Number(userId) !== actorId && Number(lastReadMessageId) >= messageId);

    return readers.length > 0 ? 2 : 1;
  };

  const updateHeader = (chat) => {
    if (chatShellTitle) {
      chatShellTitle.textContent = chat?.title || "Чат";
    }
    if (chatShellSub) {
      chatShellSub.textContent = getChatTypeLabel(chat?.type);
    }
    if (chatShellAvatar) {
      applyChatAvatar(chatShellAvatar, chat || {}, chat?.title || "Чат");
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

  const resolveFirstUnreadMessageId = (chatId) => {
    const normalizedChatId = toChatId(chatId);
    if (!normalizedChatId) return null;

    const actorId = Number(getActorUserId());
    if (!Number.isFinite(actorId) || actorId <= 0) return null;

    const actorLastReadMessageId = Number(getReadMap(normalizedChatId).get(actorId) || 0);
    const messages = store.getMessages(normalizedChatId);
    const firstUnread = messages.find((message) => {
      const messageId = Number(message?.id);
      if (!Number.isFinite(messageId) || messageId <= actorLastReadMessageId) return false;
      if (Number(message?.senderUserId) === actorId) return false;
      if (message?.deletedAtUtc) return false;
      return true;
    });

    const unreadId = Number(firstUnread?.id);
    return Number.isFinite(unreadId) && unreadId > 0 ? unreadId : null;
  };

  const focusFirstUnreadMessage = (chatId) => {
    const normalizedChatId = toChatId(chatId);
    if (!normalizedChatId || !(chatShellFeed instanceof HTMLElement) || !(chatShellMessages instanceof HTMLElement)) {
      return false;
    }

    const firstUnreadMessageId = resolveFirstUnreadMessageId(normalizedChatId);
    if (!Number.isFinite(firstUnreadMessageId) || firstUnreadMessageId <= 0) {
      return false;
    }

    const list = store.getMessages(normalizedChatId);
    const unreadIndex = list.findIndex((message) => Number(message?.id) === firstUnreadMessageId);
    if (unreadIndex < 0) {
      return false;
    }

    const start = Math.max(0, unreadIndex - Math.floor(CHAT_MESSAGE_WINDOW_SIZE * 0.35));
    messageRenderWindowByChatId.set(normalizedChatId, {
      start,
      total: list.length
    });
    renderMessages(normalizedChatId, { stickToBottom: false });

    window.requestAnimationFrame(() => {
      const target = chatShellMessages.querySelector(`[data-message-id="${firstUnreadMessageId}"]`);
      if (!(target instanceof HTMLElement)) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("is-first-unread-focus");
      window.setTimeout(() => {
        if (target.isConnected) {
          target.classList.remove("is-first-unread-focus");
        }
      }, 1400);
      syncJumpBottomButton();
    });

    return true;
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

  const getPlaybackDuration = (playback) => {
    const audio = playback?.audio;
    const fallback = Number(playback?.initialDuration) || 0;
    const fromAudio = audio instanceof HTMLAudioElement && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : 0;
    return Math.max(fromAudio, fallback, 0);
  };

  const getPlaybackCurrent = (playback) => {
    const audio = playback?.audio;
    if (!(audio instanceof HTMLAudioElement) || !Number.isFinite(audio.currentTime) || audio.currentTime < 0) {
      return 0;
    }
    return audio.currentTime;
  };

  const clampAudioOutputVolume = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.max(0, Math.min(1, numeric));
  };

  const applyAudioOutputState = (playback = activeAudioPlayback) => {
    const audio = playback?.audio;
    if (!(audio instanceof HTMLAudioElement)) {
      return;
    }
    audio.volume = clampAudioOutputVolume(audioOutputVolume);
    audio.muted = Boolean(audioOutputMuted);
  };

  const syncNowPlayingVolumeUi = () => {
    if (nowPlayingVolumeSlider instanceof HTMLInputElement) {
      nowPlayingVolumeSlider.value = String(clampAudioOutputVolume(audioOutputVolume));
    }
    if (nowPlayingVolumeBtn instanceof HTMLButtonElement) {
      nowPlayingVolumeBtn.dataset.muted = audioOutputMuted ? "true" : "false";
      nowPlayingVolumeBtn.setAttribute("aria-label", audioOutputMuted ? "Включить звук" : "Выключить звук");
      nowPlayingVolumeBtn.title = audioOutputMuted ? "Включить звук" : "Выключить звук";
    }
  };

  const clearNowPlayingVolumeHideTimer = () => {
    if (nowPlayingVolumeHideTimerId) {
      window.clearTimeout(nowPlayingVolumeHideTimerId);
      nowPlayingVolumeHideTimerId = 0;
    }
  };

  const setNowPlayingVolumeOpen = (open) => {
    if (!(nowPlayingVolumeWrap instanceof HTMLElement)) {
      return;
    }
    if (open) {
      clearNowPlayingVolumeHideTimer();
      nowPlayingVolumeWrap.classList.add("is-open");
      return;
    }
    nowPlayingVolumeWrap.classList.remove("is-open");
  };

  const scheduleNowPlayingVolumeClose = (delayMs = 180) => {
    clearNowPlayingVolumeHideTimer();
    nowPlayingVolumeHideTimerId = window.setTimeout(() => {
      nowPlayingVolumeHideTimerId = 0;
      setNowPlayingVolumeOpen(false);
    }, delayMs);
  };

  const ensureNowPlayingPanel = () => {
    if (nowPlayingPanel instanceof HTMLElement) {
      return;
    }

    const shell = chatShell instanceof HTMLElement ? chatShell : null;
    if (!(shell instanceof HTMLElement)) {
      return;
    }

    const host = chatShellFeed instanceof HTMLElement && chatShellFeed.parentElement === shell
      ? chatShellFeed
      : shell.querySelector(".chat-shell-feed");

    const panel = document.createElement("div");
    panel.className = "chat-shell-now-playing";
    panel.hidden = true;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "icon-btn chat-shell-now-playing-toggle";
    toggleBtn.setAttribute("aria-label", "Пауза");
    toggleBtn.title = "Пауза";
    toggleBtn.innerHTML = '<svg class="chat-shell-now-playing-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6z" /></svg><svg class="chat-shell-now-playing-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12" /><path d="M15 6v12" /></svg>';

    const main = document.createElement("div");
    main.className = "chat-shell-now-playing-main";

    const sender = document.createElement("span");
    sender.className = "chat-shell-now-playing-sender";
    sender.textContent = "";

    const track = document.createElement("div");
    track.className = "chat-shell-now-playing-track";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "chat-shell-now-playing-progress";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.01";
    slider.value = "0";

    const time = document.createElement("span");
    time.className = "chat-shell-now-playing-time";
    time.textContent = "0:00 / 0:00";

    track.append(slider, time);
    main.append(sender, track);

    const volumeWrap = document.createElement("div");
    volumeWrap.className = "chat-shell-now-playing-volume";

    const volumeBtn = document.createElement("button");
    volumeBtn.type = "button";
    volumeBtn.className = "icon-btn chat-shell-now-playing-volume-btn";
    volumeBtn.setAttribute("aria-label", "Выключить звук");
    volumeBtn.title = "Выключить звук";
    volumeBtn.innerHTML = '<svg class="chat-shell-now-playing-icon-volume" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h4l5 4V6L8 10H4z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a8 8 0 0 1 0 11" /></svg><svg class="chat-shell-now-playing-icon-muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h4l5 4V6L8 10H4z" /><path d="M16 9l4 4" /><path d="M20 9l-4 4" /></svg>';

    const volumePopover = document.createElement("div");
    volumePopover.className = "chat-shell-now-playing-volume-popover";

    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.className = "chat-shell-now-playing-volume-slider";
    volumeSlider.min = "0";
    volumeSlider.max = "1";
    volumeSlider.step = "0.01";
    volumeSlider.value = String(audioOutputVolume);

    volumePopover.appendChild(volumeSlider);
    volumeWrap.append(volumeBtn, volumePopover);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn chat-shell-now-playing-close";
    closeBtn.setAttribute("aria-label", "Убрать плеер");
    closeBtn.title = "Закрыть";
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10" /><path d="M17 7L7 17" /></svg>';

    panel.append(toggleBtn, main, volumeWrap, closeBtn);

    if (host instanceof HTMLElement && host.parentElement === shell) {
      shell.insertBefore(panel, host);
    } else {
      shell.appendChild(panel);
    }

    nowPlayingPanel = panel;
    nowPlayingToggleBtn = toggleBtn;
    nowPlayingSenderEl = sender;
    nowPlayingProgressEl = slider;
    nowPlayingTimeEl = time;
    nowPlayingCloseBtn = closeBtn;
    nowPlayingVolumeWrap = volumeWrap;
    nowPlayingVolumeBtn = volumeBtn;
    nowPlayingVolumeSlider = volumeSlider;

    syncNowPlayingVolumeUi();

    toggleBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      const playback = activeAudioPlayback;
      if (!(playback?.audio instanceof HTMLAudioElement)) return;

      if (playback.audio.paused || playback.audio.ended) {
        try {
          await playback.audio.play();
        } catch {
          // ignore playback failures
        }
      } else {
        playback.audio.pause();
      }
      playback.syncPlayState?.();
      playback.syncTime?.();
      syncNowPlayingPanel();
    });

    slider.addEventListener("input", () => {
      const playback = activeAudioPlayback;
      if (!(playback?.audio instanceof HTMLAudioElement)) return;
      const duration = getPlaybackDuration(playback);
      if (!duration) return;
      playback.audio.currentTime = Math.max(0, Math.min(duration, Number(slider.value) * duration));
      playback.syncTime?.();
      syncNowPlayingPanel();
    });

    volumeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setNowPlayingVolumeOpen(true);
      if (audioOutputMuted) {
        audioOutputMuted = false;
        if (audioOutputVolume <= 0) {
          audioOutputVolume = clampAudioOutputVolume(audioOutputUnmutedVolume || 1);
        }
      } else {
        audioOutputMuted = true;
        if (audioOutputVolume > 0) {
          audioOutputUnmutedVolume = clampAudioOutputVolume(audioOutputVolume);
        }
      }
      applyAudioOutputState();
      syncNowPlayingVolumeUi();
      syncNowPlayingPanel();
    });

    const openVolumePopover = () => {
      setNowPlayingVolumeOpen(true);
    };

    const closeVolumePopoverDeferred = () => {
      scheduleNowPlayingVolumeClose(220);
    };

    volumeWrap.addEventListener("mouseenter", openVolumePopover);
    volumeWrap.addEventListener("mouseleave", closeVolumePopoverDeferred);
    volumeWrap.addEventListener("focusin", openVolumePopover);
    volumeWrap.addEventListener("focusout", (event) => {
      const nextFocused = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (nextFocused && volumeWrap.contains(nextFocused)) {
        return;
      }
      closeVolumePopoverDeferred();
    });

    volumeSlider.addEventListener("input", () => {
      const nextVolume = clampAudioOutputVolume(volumeSlider.value);
      audioOutputVolume = nextVolume;
      if (nextVolume > 0) {
        audioOutputUnmutedVolume = nextVolume;
        audioOutputMuted = false;
      } else {
        audioOutputMuted = true;
      }
      applyAudioOutputState();
      syncNowPlayingVolumeUi();
      syncNowPlayingPanel();
    });

    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      clearActiveAudioPlayback({ pause: true, reset: false, hide: true });
    });
  };

  const syncNowPlayingPanel = () => {
    ensureNowPlayingPanel();
    if (!(nowPlayingPanel instanceof HTMLElement)) {
      return;
    }

    const playback = activeAudioPlayback;
    if (!(playback?.audio instanceof HTMLAudioElement)) {
      nowPlayingPanel.classList.remove("is-animate-in");
      nowPlayingPanel.hidden = true;
      setNowPlayingVolumeOpen(false);
      syncNowPlayingVolumeUi();
      return;
    }

    const duration = getPlaybackDuration(playback);
    const current = getPlaybackCurrent(playback);
    const ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
    const isPlaying = !playback.audio.paused && !playback.audio.ended;

    if (nowPlayingPanel.hidden) {
      nowPlayingPanel.hidden = false;
      nowPlayingPanel.classList.remove("is-animate-in");
      void nowPlayingPanel.offsetWidth;
      nowPlayingPanel.classList.add("is-animate-in");
    }

    if (nowPlayingSenderEl instanceof HTMLElement) {
      nowPlayingSenderEl.textContent = playback.senderName
        ? `Слушаете: ${playback.senderName}`
        : "Слушаете аудио";
    }
    if (nowPlayingProgressEl instanceof HTMLInputElement) {
      nowPlayingProgressEl.value = String(ratio);
    }
    if (nowPlayingTimeEl instanceof HTMLElement) {
      nowPlayingTimeEl.textContent = `${formatMediaTime(current)} / ${formatMediaTime(duration)}`;
    }
    if (nowPlayingToggleBtn instanceof HTMLButtonElement) {
      nowPlayingToggleBtn.dataset.playing = isPlaying ? "true" : "false";
      nowPlayingToggleBtn.setAttribute("aria-label", isPlaying ? "Пауза" : "Воспроизвести");
      nowPlayingToggleBtn.title = isPlaying ? "Пауза" : "Воспроизвести";
    }
    syncNowPlayingVolumeUi();
  };

  const clearActiveAudioPlayback = ({ pause = true, reset = false, hide = true } = {}) => {
    const previous = activeAudioPlayback;
    activeAudioPlayback = null;

    if (previous?.audio instanceof HTMLAudioElement) {
      if (pause && !previous.audio.paused) {
        previous.audio.pause();
      }
      if (reset) {
        previous.audio.currentTime = 0;
      }
    }

    previous?.syncPlayState?.();
    previous?.syncTime?.();

    if (hide && nowPlayingPanel instanceof HTMLElement) {
      nowPlayingPanel.classList.remove("is-animate-in");
      nowPlayingPanel.hidden = true;
    }
    clearNowPlayingVolumeHideTimer();
    setNowPlayingVolumeOpen(false);
    syncNowPlayingVolumeUi();
  };

  const setActiveAudioPlayback = (playback) => {
    if (!(playback?.audio instanceof HTMLAudioElement)) {
      return;
    }

    const previous = activeAudioPlayback;
    if (previous?.audio instanceof HTMLAudioElement && previous.audio !== playback.audio) {
      previous.audio.pause();
      previous.syncPlayState?.();
      previous.syncTime?.();
    }

    activeAudioPlayback = playback;
    applyAudioOutputState(playback);
    syncNowPlayingPanel();
  };

  const clearAttachmentState = () => {
    clearActiveAudioPlayback({ pause: true, reset: false, hide: true });
    closeImageViewer();
    attachmentsByMessageId.clear();
    attachmentLoadingByMessageId.clear();
    pendingVoiceUploadsByMessageId.clear();
    revokeAttachmentUrls();
  };

  const downloadAttachmentToFile = async (chatId, attachment, fallbackName = "attachment") => {
    const normalizedChatId = toChatId(chatId);
    const attachmentId = toChatId(attachment?.id);
    if (!normalizedChatId || !attachmentId) return;
    const blob = await api.downloadAttachmentBlob(normalizedChatId, attachmentId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = normalizeToken(attachment?.fileName) || fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const clampImageViewerScale = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.max(CHAT_IMAGE_VIEWER_MIN_SCALE, Math.min(CHAT_IMAGE_VIEWER_MAX_SCALE, numeric));
  };

  const syncImageViewerZoomUi = () => {
    if (imageViewerImage instanceof HTMLImageElement) {
      imageViewerImage.style.transform = `scale(${imageViewerScale.toFixed(3)})`;
    }
    if (imageViewerZoomLabel instanceof HTMLElement) {
      imageViewerZoomLabel.textContent = `${Math.round(imageViewerScale * 100)}%`;
    }
    if (imageViewerZoomOutBtn instanceof HTMLButtonElement) {
      imageViewerZoomOutBtn.disabled = imageViewerScale <= CHAT_IMAGE_VIEWER_MIN_SCALE;
    }
    if (imageViewerZoomInBtn instanceof HTMLButtonElement) {
      imageViewerZoomInBtn.disabled = imageViewerScale >= CHAT_IMAGE_VIEWER_MAX_SCALE;
    }
  };

  const setImageViewerMenuOpen = (open) => {
    const visible = Boolean(open);
    if (imageViewerMenu instanceof HTMLElement) {
      imageViewerMenu.hidden = !visible;
    }
    if (imageViewerMenuBtn instanceof HTMLButtonElement) {
      imageViewerMenuBtn.setAttribute("aria-expanded", visible ? "true" : "false");
    }
  };

  const closeImageViewer = () => {
    if (!(imageViewerRoot instanceof HTMLElement) || imageViewerRoot.hidden) return false;
    setImageViewerMenuOpen(false);
    imageViewerRoot.hidden = true;
    imageViewerScale = 1;
    imageViewerChatId = "";
    imageViewerAttachment = null;
    if (imageViewerImage instanceof HTMLImageElement) {
      imageViewerImage.removeAttribute("src");
      imageViewerImage.style.removeProperty("transform");
    }
    document.body.classList.remove("is-chat-image-viewer-open");
    return true;
  };

  const ensureImageViewer = () => {
    if (imageViewerRoot instanceof HTMLElement) {
      return;
    }

    const root = document.createElement("div");
    root.className = "chat-image-viewer";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Просмотр изображения");

    const toolbar = document.createElement("div");
    toolbar.className = "chat-image-viewer-toolbar";

    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.type = "button";
    zoomOutBtn.className = "icon-btn chat-image-viewer-tool";
    zoomOutBtn.setAttribute("aria-label", "Уменьшить");
    zoomOutBtn.title = "Уменьшить";
    zoomOutBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>';

    const zoomLabel = document.createElement("span");
    zoomLabel.className = "chat-image-viewer-zoom-label";
    zoomLabel.textContent = "100%";

    const zoomInBtn = document.createElement("button");
    zoomInBtn.type = "button";
    zoomInBtn.className = "icon-btn chat-image-viewer-tool";
    zoomInBtn.setAttribute("aria-label", "Увеличить");
    zoomInBtn.title = "Увеличить";
    zoomInBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /><path d="M12 6v12" /></svg>';

    const menuWrap = document.createElement("div");
    menuWrap.className = "chat-image-viewer-menu-wrap";

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "icon-btn chat-image-viewer-tool";
    menuBtn.setAttribute("aria-label", "Действия");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.title = "Действия";
    menuBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18" cy="12" r="1.8" /></svg>';

    const menu = document.createElement("div");
    menu.className = "chat-image-viewer-menu";
    menu.hidden = true;

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "chat-image-viewer-menu-item";
    downloadBtn.textContent = "Скачать";
    menu.appendChild(downloadBtn);

    menuWrap.append(menuBtn, menu);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn chat-image-viewer-tool";
    closeBtn.setAttribute("aria-label", "Закрыть");
    closeBtn.title = "Закрыть";
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10" /><path d="M17 7L7 17" /></svg>';

    toolbar.append(zoomOutBtn, zoomLabel, zoomInBtn, menuWrap, closeBtn);

    const stage = document.createElement("div");
    stage.className = "chat-image-viewer-stage";

    const image = document.createElement("img");
    image.className = "chat-image-viewer-image";
    image.alt = "Изображение";
    image.decoding = "async";
    image.loading = "eager";
    stage.appendChild(image);

    root.append(toolbar, stage);

    toolbar.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && !target.closest(".chat-image-viewer-menu-wrap")) {
        setImageViewerMenuOpen(false);
      }
    });

    image.addEventListener("click", (event) => {
      setImageViewerMenuOpen(false);
      event.stopPropagation();
    });

    root.addEventListener("click", () => {
      closeImageViewer();
    });

    root.addEventListener("wheel", (event) => {
      if (root.hidden) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".chat-image-viewer-toolbar")) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY < 0 ? CHAT_IMAGE_VIEWER_SCALE_STEP : -CHAT_IMAGE_VIEWER_SCALE_STEP;
      imageViewerScale = clampImageViewerScale(imageViewerScale + delta);
      syncImageViewerZoomUi();
    }, { passive: false });

    zoomOutBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      imageViewerScale = clampImageViewerScale(imageViewerScale - CHAT_IMAGE_VIEWER_SCALE_STEP);
      syncImageViewerZoomUi();
    });

    zoomInBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      imageViewerScale = clampImageViewerScale(imageViewerScale + CHAT_IMAGE_VIEWER_SCALE_STEP);
      syncImageViewerZoomUi();
    });

    menuBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = imageViewerMenu instanceof HTMLElement ? !imageViewerMenu.hidden : false;
      setImageViewerMenuOpen(!isOpen);
    });

    downloadBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      setImageViewerMenuOpen(false);
      if (!imageViewerAttachment || !imageViewerChatId) return;
      await downloadAttachmentToFile(imageViewerChatId, imageViewerAttachment, "image");
    });

    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeImageViewer();
    });

    document.body.appendChild(root);

    imageViewerRoot = root;
    imageViewerImage = image;
    imageViewerMenu = menu;
    imageViewerMenuBtn = menuBtn;
    imageViewerZoomOutBtn = zoomOutBtn;
    imageViewerZoomInBtn = zoomInBtn;
    imageViewerZoomLabel = zoomLabel;
    imageViewerScale = 1;
    syncImageViewerZoomUi();
  };

  const openImageViewer = async (chatId, attachment) => {
    const normalizedChatId = toChatId(chatId);
    if (!normalizedChatId || !attachment?.id) return;
    const url = await ensureAttachmentMediaUrl(normalizedChatId, attachment);
    if (!url) return;

    ensureImageViewer();
    if (!(imageViewerRoot instanceof HTMLElement) || !(imageViewerImage instanceof HTMLImageElement)) {
      return;
    }

    imageViewerChatId = normalizedChatId;
    imageViewerAttachment = attachment;
    imageViewerScale = 1;
    imageViewerImage.src = url;
    imageViewerImage.alt = normalizeToken(attachment?.fileName) || "Изображение";
    imageViewerRoot.hidden = false;
    document.body.classList.add("is-chat-image-viewer-open");
    setImageViewerMenuOpen(false);
    syncImageViewerZoomUi();
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
    selectedBackground = null;
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

  const getStoredGroupAvatarDataUrl = (chatId) => {
    const key = String(chatId || "").trim();
    if (!key) return "";
    const ui = getStoredUiSetting(key);
    const value = normalizeToken(ui?.chatGroupAvatarDataUrl);
    if (!value || !value.startsWith("data:image/")) {
      return "";
    }
    return value;
  };

  const getPreference = (chatId) => {
    const key = String(chatId || "").trim();
    const persisted = preferencesByChatId.get(key) || { isMuted: false, soundEnabled: true, backgroundImageKey: null };
    const ui = getStoredUiSetting(key);
    return {
      isMuted: Boolean(persisted?.isMuted),
      soundEnabled: persisted?.soundEnabled !== false,
      backgroundImageKey: "",
      backgroundImageDataUrl: String(ui?.chatBackgroundImageDataUrl || "").trim(),
      suppressActiveSound: ui?.suppressActiveSound !== false
    };
  };

  const setPreference = (chatId, preference) => {
    const key = String(chatId || "").trim();
    if (!key) return;
    preferencesByChatId.set(key, {
      isMuted: Boolean(preference?.isMuted),
      soundEnabled: preference?.soundEnabled !== false,
      backgroundImageKey: ""
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
      showRoomSettings: Number(chat?.type) !== 3,
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

  const isDirectChat = (chat) => Number(chat?.type) === 3;
  const isGroupChat = (chat) => Number(chat?.type) === 2;

  const openSettingsModal = () => {
    const activeChatId = store.getActiveChatId();
    if (!store.getChatById(activeChatId)) return;
    selectedBackground = null;
    isSettingsOpen = true;
    syncSettingsPanel();
    void loadSettingsModalData(activeChatId);
  };

  const openActiveChatSettings = () => {
    const activeChatId = store.getActiveChatId();
    if (!store.getChatById(activeChatId)) return false;
    openSettingsModal();
    return true;
  };

  const closeSettingsModal = () => {
    if (!isSettingsOpen) return false;
    selectedBackground = null;
    isSettingsOpen = false;
    syncSettingsPanel();
    return true;
  };

  const openProfileFromSettingsModal = () => {
    const chat = store.getChatById(store.getActiveChatId());
    if (!isDirectChat(chat)) return;
    const peerUserId = Number(chat?.directPeerUserId);
    if (!Number.isFinite(peerUserId) || peerUserId <= 0) return;
    closeSettingsModal();
    openProfileForUser(peerUserId);
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
    const value = forcedValue !== null
      ? String(forcedValue || "").trim()
      : String(preference?.backgroundImageDataUrl || "").trim();
    selectedBackground = value;
    if (chatShell instanceof HTMLElement) {
      if (value) {
        chatShell.style.setProperty("--chat-custom-bg", `linear-gradient(180deg, rgba(6, 10, 18, 0.34), rgba(6, 10, 18, 0.14)), url('${value.replace(/'/g, "%27")}')`);
      } else {
        chatShell.style.removeProperty("--chat-custom-bg");
      }
    }
  };

  const syncSettingsPanel = () => {
    const activeChatId = store.getActiveChatId();
    const chat = store.getChatById(activeChatId);
    const preference = getPreference(activeChatId);
    const permissions = getCurrentChatPermissions();

    if (chatSettingsModal instanceof HTMLElement) {
      chatSettingsModal.hidden = !isSettingsOpen || !chat;
    }
    if (chatSettingsPanel instanceof HTMLElement) {
      chatSettingsPanel.hidden = !chat;
    }
    if (chatShellSettingsBtn instanceof HTMLButtonElement) {
      chatShellSettingsBtn.disabled = !chat;
      chatShellSettingsBtn.setAttribute("aria-label", "Настройки чата");
      chatShellSettingsBtn.title = "Настройки чата";
    }
    if (!chat) return;

    if (chatSettingsModalName instanceof HTMLElement) {
      chatSettingsModalName.textContent = chat?.title || "Чат";
    }
    if (chatSettingsModalSub instanceof HTMLElement) {
      chatSettingsModalSub.textContent = getChatTypeLabel(chat?.type);
    }

    const canEditGroupAvatar = isGroupChat(chat);

    if (chatSettingsModalAvatar instanceof HTMLElement) {
      applyChatAvatar(chatSettingsModalAvatar, chat, chat?.title || "Чат");
      if (isDirectChat(chat)) {
        chatSettingsModalAvatar.setAttribute("aria-label", "Открыть профиль пользователя");
      } else if (canEditGroupAvatar) {
        chatSettingsModalAvatar.setAttribute("aria-label", "Сменить аватар группы");
      } else {
        chatSettingsModalAvatar.setAttribute("aria-label", "Аватар чата");
      }

      chatSettingsModalAvatar.classList.toggle("is-group-editable", canEditGroupAvatar);
    }
    if (chatSettingsModalMain instanceof HTMLButtonElement) {
      chatSettingsModalMain.disabled = !isDirectChat(chat);
    }
    if (chatSettingsModalAvatar instanceof HTMLButtonElement) {
      chatSettingsModalAvatar.disabled = !(isDirectChat(chat) || canEditGroupAvatar);
    }

    if (chatSettingsMuted instanceof HTMLInputElement) {
      chatSettingsMuted.checked = Boolean(preference.isMuted);
    }
    if (chatSettingsSkipActive instanceof HTMLInputElement) {
      chatSettingsSkipActive.checked = preference.suppressActiveSound !== false;
    }
    if (chatSettingsTitleWrap instanceof HTMLElement) {
      chatSettingsTitleWrap.hidden = !permissions.showRoomSettings || !permissions.canEditRoomTitle;
    }
    if (chatSettingsTitle instanceof HTMLInputElement) {
      chatSettingsTitle.value = chat?.title || "";
      chatSettingsTitle.disabled = !permissions.canEditRoomTitle || settingsSaving;
    }
    if (chatSettingsRoomBlock instanceof HTMLElement) {
      chatSettingsRoomBlock.hidden = !permissions.showRoomSettings;
    }
    if (chatSettingsBgBlock instanceof HTMLElement) {
      chatSettingsBgBlock.hidden = !permissions.canEditBackground;
    }
    if (chatSettingsBgHeading instanceof HTMLElement) {
      chatSettingsBgHeading.textContent = permissions.backgroundLabel;
    }
    const backgroundValue = selectedBackground !== null
      ? String(selectedBackground || "")
      : String(preference.backgroundImageDataUrl || "");

    if (chatSettingsBgPreview instanceof HTMLElement) {
      chatSettingsBgPreview.textContent = backgroundValue ? "" : "Фон не установлен";
      if (backgroundValue) {
        chatSettingsBgPreview.style.backgroundImage = `linear-gradient(180deg, rgba(6, 10, 18, 0.22), rgba(6, 10, 18, 0.08)), url('${backgroundValue.replace(/'/g, "%27")}')`;
        chatSettingsBgPreview.style.backgroundSize = "cover";
        chatSettingsBgPreview.style.backgroundPosition = "center";
      } else {
        chatSettingsBgPreview.style.removeProperty("background-image");
        chatSettingsBgPreview.style.removeProperty("background-size");
        chatSettingsBgPreview.style.removeProperty("background-position");
      }
    }
    if (chatSettingsBgRemoveBtn instanceof HTMLButtonElement) {
      chatSettingsBgRemoveBtn.hidden = !backgroundValue;
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
    applyChatBackground(activeChatId, backgroundValue);
    renderSettingsMembers(activeChatId);
    renderSettingsAttachments(activeChatId);
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
    const pending = getPendingVoiceUpload(id);
    const list = [];
    const seen = new Set();

    (Array.isArray(attachments) ? attachments : [])
      .map((attachment) => normalizeAttachment(attachment))
      .filter(Boolean)
      .forEach((attachment) => {
        const key = String(attachment.id || "").trim();
        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);
        list.push({
          ...attachment,
          durationMs: attachment.durationMs ?? pending?.durationMs ?? null
        });

        if (pending?.localUrl) {
          setAttachmentUrl(attachment.id, pending.localUrl);
        }
      });

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
      durationMs: Number.isFinite(Number(state?.durationMs)) && Number(state?.durationMs) > 0 ? Number(state.durationMs) : null,
      localUrl: state?.localUrl || "",
      error: state?.error || ""
    });
  };

  const clearPendingVoiceUpload = (messageId) => {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    const pending = pendingVoiceUploadsByMessageId.get(id);
    if (pending?.localUrl) {
      const attachmentList = getMessageAttachments(id);
      const stillUsed = attachmentList.some((attachment) => getAttachmentUrl(attachment.id) === pending.localUrl);
      if (!stillUsed) {
        try {
          URL.revokeObjectURL(pending.localUrl);
        } catch {
          // ignore revoke errors
        }
      }
    }
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
    card.className = "chat-attachment-card is-uploading-voice is-audio";

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

    const time = document.createElement("div");
    time.className = "chat-voice-time";
    time.textContent = `${Math.round(Number(pending.progress) || 0)}%`;

    const status = document.createElement("div");
    status.className = "chat-voice-meta";
    status.textContent = "Отправка голосового сообщения";

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
    meta.className = "chat-voice-footer";
    const metaLeft = document.createElement("div");
    metaLeft.className = "chat-voice-meta-stack";
    metaLeft.append(time, status);
    const metaRight = document.createElement("div");
    metaRight.className = "chat-voice-meta-extra";
    metaRight.textContent = formatBytes(pending.size);
    meta.append(metaLeft, metaRight);

    main.append(waveform, meta);
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
        userId: Number(chat?.directPeerUserId) > 0 ? Number(chat.directPeerUserId) : null,
        type: 3,
        title: normalizeToken(chat?.directPeerDisplayName) || chat.title
      }));

    const existingUserIds = new Set(
      existingDirectChats
        .map((chat) => Number(chat?.userId))
        .filter((userId) => Number.isFinite(userId) && userId > 0)
    );

    const candidateEntries = (Array.isArray(getWorkspaceMembers()) ? getWorkspaceMembers() : [])
      .map((member) => {
        const userId = Number(member?.id);
        if (!Number.isFinite(userId) || userId <= 0) return null;
        if (Number.isFinite(actorId) && actorId === userId) return null;

        const title = normalizeToken(member?.name) || `User ${userId}`;
        if (existingUserIds.has(userId)) {
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

  const getRailTabIconMarkup = (tabKey) => {
    return CHAT_RAIL_TAB_ICONS[String(tabKey || "")] || CHAT_RAIL_TAB_ICONS.all;
  };

  const renderRailTabs = () => {
    if (!(chatRailTabs instanceof HTMLElement)) return;
    chatRailTabs.innerHTML = "";

    const fragment = document.createDocumentFragment();
    CHAT_RAIL_TABS.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-rail-tab";
      button.setAttribute("aria-label", tab.label);
      button.title = tab.label;
      button.dataset.tabKey = tab.key;
      button.innerHTML = `<span class="chat-rail-tab-icon" aria-hidden="true">${getRailTabIconMarkup(tab.key)}</span><span class="chat-rail-tab-label">${tab.label}</span>`;
      button.classList.toggle("is-active", tab.key === activeRailTab);
      button.addEventListener("click", () => {
        activeRailTab = tab.key;
        renderRailTabs();
        renderRailList();
      });
      fragment.appendChild(button);
    });

    chatRailTabs.appendChild(fragment);
  };

  const getEntriesForActiveRailTab = (sections) => {
    if (activeRailTab === "all") {
      return sections.flatMap((section) => section.entries);
    }
    const match = sections.find((section) => section.key === activeRailTab);
    return match?.entries || [];
  };

  const renderRailList = () => {
    if (!(chatRailList instanceof HTMLElement)) return;

    chatRailList.innerHTML = "";
    syncHomeButtonAvatar();
    const fragment = document.createDocumentFragment();
    const sections = buildSections();
    const entries = getEntriesForActiveRailTab(sections);
    const activeChatId = store.getActiveChatId();
    entries.forEach((entry) => {
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
      if (entry.kind === "chat") {
        const chat = store.getChatById(entry.chatId) || entry;
        applyChatAvatar(avatar, chat, entry.title || "Чат");
      } else {
        applyAccountAvatarToElement(avatar, null, toInitials(entry.title || "Чат", "DM"), getMemberAvatarPath(entry.userId));
      }

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

      fragment.appendChild(button);
    });

    chatRailList.appendChild(fragment);

    if (chatHomeBtn instanceof HTMLButtonElement) {
      chatHomeBtn.classList.toggle("is-active", !activeChatId);
    }

    if (chatRailEmpty instanceof HTMLElement) {
      chatRailEmpty.textContent = store.isFeatureEnabled() ? "В этой вкладке пока пусто." : "Чаты недоступны в этом окружении.";
      chatRailEmpty.toggleAttribute("hidden", entries.length > 0 || !store.isFeatureEnabled());
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
    const hasText = normalizeToken(chatShellInput instanceof HTMLTextAreaElement ? chatShellInput.value : "").length > 0;
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

    if (chatShellInput instanceof HTMLTextAreaElement) {
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
    if (chatShellInput instanceof HTMLTextAreaElement) {
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
    resizeComposerInput();
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

      if (isVoice) {
        card.classList.add("is-audio");
      }

      if (isImage) {
        card.classList.add("is-image");
        const img = document.createElement("img");
        img.className = "chat-attachment-preview";
        img.alt = attachment.fileName;
        img.loading = "lazy";
        img.decoding = "async";

        const applyImageRatio = () => {
          const width = Number(img.naturalWidth);
          const height = Number(img.naturalHeight);
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
          card.style.setProperty("--chat-image-ratio", `${width} / ${height}`);
        };

        img.addEventListener("load", applyImageRatio);

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
        img.addEventListener("click", (event) => {
          suppressMessageSelectionEvent(event);
          void openImageViewer(chatId, attachment);
        });
        img.addEventListener("dblclick", suppressMessageSelectionEvent);
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

        const time = document.createElement("div");
        time.className = "chat-voice-time";
        const initialDuration = Number(attachment.durationMs) > 0 ? Number(attachment.durationMs) / 1000 : 0;
        const senderName = resolveMemberName(message.senderUserId);
        time.textContent = `0:00 / ${formatMediaTime(initialDuration)}`;

        const speedBtn = document.createElement("button");
        speedBtn.type = "button";
        speedBtn.className = "chat-voice-speed";
        speedBtn.textContent = "1x";

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

        const footer = document.createElement("div");
        footer.className = "chat-voice-footer";

        const metaLeft = document.createElement("div");
        metaLeft.className = "chat-voice-meta-stack";
        const size = document.createElement("div");
        size.className = "chat-voice-meta";
        size.textContent = formatBytes(attachment.size);
        metaLeft.append(time, size);

        const actions = document.createElement("div");
        actions.className = "chat-voice-actions";

        const downloadBtn = document.createElement("button");
        downloadBtn.type = "button";
        downloadBtn.className = "chat-voice-download";
        downloadBtn.setAttribute("aria-label", "Скачать голосовое сообщение");
        downloadBtn.title = "Скачать";
        downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M5 18h14" /></svg>';
        downloadBtn.addEventListener("click", async () => {
          await downloadAttachmentToFile(chatId, attachment, "voice-message");
        });
        downloadBtn.addEventListener("dblclick", suppressMessageSelectionEvent);
        actions.appendChild(downloadBtn);
        actions.prepend(speedBtn);

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

        const playbackState = {
          audio,
          senderName,
          initialDuration,
          syncTime,
          syncPlayState
        };

        playBtn.addEventListener("click", async () => {
          setActiveAudioPlayback(playbackState);
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
          syncNowPlayingPanel();
        });
        playBtn.addEventListener("dblclick", suppressMessageSelectionEvent);

        speedBtn.addEventListener("click", () => {
          const steps = [1, 1.5, 2];
          const current = steps.findIndex((step) => step === audio.playbackRate);
          const nextRate = steps[(current + 1 + steps.length) % steps.length];
          audio.playbackRate = nextRate;
          speedBtn.textContent = `${nextRate}x`;
        });
        speedBtn.addEventListener("dblclick", suppressMessageSelectionEvent);

        progress.addEventListener("input", () => {
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : initialDuration;
          if (!duration) return;
          audio.currentTime = Math.max(0, Math.min(duration, Number(progress.value) * duration));
          syncTime();
          if (activeAudioPlayback?.audio === audio) {
            syncNowPlayingPanel();
          }
        });
        progress.addEventListener("dblclick", suppressMessageSelectionEvent);

        waveform.addEventListener("click", (event) => {
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : initialDuration;
          if (!duration) return;
          const rect = waveform.getBoundingClientRect();
          const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
          audio.currentTime = ratio * duration;
          syncTime();
          if (activeAudioPlayback?.audio === audio) {
            syncNowPlayingPanel();
          }
        });
        waveform.addEventListener("dblclick", suppressMessageSelectionEvent);

        audio.addEventListener("loadedmetadata", syncTime);
        audio.addEventListener("timeupdate", () => {
          syncTime();
          if (activeAudioPlayback?.audio === audio) {
            syncNowPlayingPanel();
          }
        });
        audio.addEventListener("play", () => {
          setActiveAudioPlayback(playbackState);
          syncPlayState();
          syncNowPlayingPanel();
        });
        audio.addEventListener("pause", () => {
          syncPlayState();
          if (activeAudioPlayback?.audio === audio) {
            syncNowPlayingPanel();
          }
        });
        audio.addEventListener("ended", () => {
          if (activeAudioPlayback?.audio === audio) {
            clearActiveAudioPlayback({ pause: false, reset: true, hide: true });
          }
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
        footer.append(metaLeft, actions);
        main.append(waveform, progress, footer);
        player.append(playBtn, main, audio);
        card.appendChild(player);
      }

      if (!isVoice && !isImage) {
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
          await downloadAttachmentToFile(chatId, attachment, "attachment");
        });
        downloadBtn.addEventListener("dblclick", suppressMessageSelectionEvent);
        actions.appendChild(downloadBtn);

        card.append(meta, actions);
      }
      wrap.appendChild(card);
    });

    parent.appendChild(wrap);
  };

  const resolveMessageRenderSlice = (chatId, totalCount, options = {}) => {
    const normalizedChatId = toChatId(chatId);
    if (!normalizedChatId || totalCount <= CHAT_MESSAGE_WINDOW_SIZE) {
      if (normalizedChatId) {
        messageRenderWindowByChatId.set(normalizedChatId, { start: 0, total: totalCount });
      }
      return { start: 0, end: totalCount };
    }

    const stickyToBottom = options?.stickToBottom === true;
    const prependCount = Number(options?.prependCount);
    const previous = messageRenderWindowByChatId.get(normalizedChatId);
    let start = Number(previous?.start);
    if (!Number.isFinite(start)) {
      start = Math.max(0, totalCount - CHAT_MESSAGE_WINDOW_SIZE);
    }

    if (stickyToBottom) {
      start = Math.max(0, totalCount - CHAT_MESSAGE_WINDOW_SIZE);
    } else if (Number.isFinite(prependCount) && prependCount > 0) {
      start += prependCount;
    }

    const maxStart = Math.max(0, totalCount - CHAT_MESSAGE_WINDOW_SIZE);
    start = Math.max(0, Math.min(start, maxStart));
    const end = Math.min(totalCount, start + CHAT_MESSAGE_WINDOW_SIZE);

    messageRenderWindowByChatId.set(normalizedChatId, { start, total: totalCount });
    return { start, end };
  };

  const renderMessages = (chatId, options = {}) => {
    if (!(chatShellMessages instanceof HTMLElement)) return;

    const list = store.getMessages(chatId);
    const currentChat = store.getChatById(chatId);
    const isDirectChat = Number(currentChat?.type) === 3;
    chatShellMessages.innerHTML = "";

    if (!list.length) {
      messageRenderWindowByChatId.delete(toChatId(chatId));
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
    const { start: sliceStart, end: sliceEnd } = resolveMessageRenderSlice(chatId, list.length, options);

    if (sliceStart > 0) {
      const marker = document.createElement("div");
      marker.className = "chat-shell-window-marker";
      marker.textContent = `Показаны последние ${sliceEnd - sliceStart} из ${list.length}. Прокрутите вверх, чтобы раскрыть историю.`;
      fragment.appendChild(marker);
    }

    const visibleMessages = list.slice(sliceStart, sliceEnd);
    visibleMessages.forEach((message, localIndex) => {
      const index = sliceStart + localIndex;
      const nextMessage = list[index + 1] || null;
      const shouldReserveAvatarSlot = !isDirectChat;
      const showSenderAvatar = shouldReserveAvatarSlot
        && !message.deletedAtUtc
        && (!nextMessage || Number(nextMessage?.senderUserId) !== Number(message?.senderUserId));
      const row = document.createElement("div");
      row.className = "chat-msg-row";
      const item = document.createElement("article");
      item.className = "chat-msg";
      const messageId = Number(message?.id);
      if (Number.isFinite(messageId) && messageId > 0) {
        row.dataset.messageId = String(messageId);
        item.dataset.messageId = String(messageId);
      }
      item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openMessageContextMenu(event, chatId, message);
      });
      item.addEventListener("dblclick", (event) => {
        if (isInteractiveMessageTarget(event.target)) return;
        if (!canSelectMessage(message)) return;
        event.preventDefault();
        toggleSelectedMessage(message.id);
        closeMessageContextMenu();
        setSettingsOpen(false);
        renderMessages(chatId);
        updateHeader(store.getChatById(chatId));
      });
      item.addEventListener("click", (event) => {
        if (isInteractiveMessageTarget(event.target)) return;
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
      const isOwnMessage = Number.isFinite(actorUserId) && Number(message.senderUserId) === actorUserId;
      const isImageMessage = Number(message.kind) === 3 && !message.deletedAtUtc;
      const hasVoiceAttachment = getMessageAttachments(message?.id).some((attachment) => isVoiceContentType(attachment?.contentType));
      const isAudioMessage = (Number(message.kind) === 4 || hasVoiceAttachment) && !message.deletedAtUtc;
      row.classList.toggle("is-own", isOwnMessage);
      row.classList.toggle("is-avatar-spaced", shouldReserveAvatarSlot && !showSenderAvatar);
      if (message.deletedAtUtc) {
        item.classList.add("is-deleted");
      }
      if (isImageMessage) {
        item.classList.add("is-image-message");
      }
      if (isAudioMessage) {
        item.classList.add("is-audio-message");
      }
      if (isSelectionMode() && canSelectMessage(message)) {
        item.classList.add("is-selection-mode");
        item.classList.toggle("is-selected", selectedMessageIds.has(Number(message?.id)));
      }

      const meta = document.createElement("div");
      meta.className = "chat-msg-meta";

      if (!isOwnMessage && !isDirectChat) {
        const author = document.createElement("button");
        author.type = "button";
        author.className = "chat-msg-author chat-msg-author-btn";
        author.textContent = resolveMemberName(message.senderUserId);
        author.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openProfileForUser(message.senderUserId);
        });
        author.addEventListener("dblclick", suppressMessageSelectionEvent);
        meta.appendChild(author);
      }

      if (meta.childElementCount > 0) {
        item.appendChild(meta);
      }

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
          forward.textContent = `Переслано от ${getForwardedSenderDisplayText(chatId, message)}`;
          refs.appendChild(forward);
        }

        item.appendChild(refs);
      }

      const messageKind = Number(message.kind);
      const shouldRenderBody = message.deletedAtUtc || (messageKind !== 3 && messageKind !== 4);
      let body = null;
      if (shouldRenderBody) {
        body = document.createElement("div");
        body.className = "chat-msg-body";
        const bodyText = document.createElement("span");
        bodyText.className = "chat-msg-body-text";
        bodyText.textContent = message.body;
        body.appendChild(bodyText);
        item.appendChild(body);
      }

      renderAttachmentCollection(chatId, message, item);

      const footer = document.createElement("div");
      footer.className = "chat-msg-footer";

      const time = document.createElement("span");
      time.className = "chat-msg-time";
      const editedSuffix = message.editedAtUtc ? " · изм." : "";
      time.textContent = `${formatMessageTime(message.createdAtUtc)}${editedSuffix}`.trim();
      footer.appendChild(time);

      const readStateLevel = getReadStateLevel(chatId, message);
      if (readStateLevel > 0) {
        const status = document.createElement("span");
        status.className = "chat-msg-status";
        status.classList.toggle("is-read", readStateLevel === 2);
        status.setAttribute("aria-label", readStateLevel === 2 ? "Прочитано" : "Отправлено");
        status.title = readStateLevel === 2 ? "Прочитано" : "Отправлено";
        status.textContent = readStateLevel === 2 ? "✓✓" : "✓";
        footer.appendChild(status);
      }

      if (body && Number(message.kind) === 1) {
        footer.classList.add("is-inline");
        body.classList.add("is-with-inline-footer");
        body.appendChild(footer);
      } else {
        item.appendChild(footer);
      }

      if (showSenderAvatar) {
        const senderAvatar = document.createElement("button");
        senderAvatar.type = "button";
        senderAvatar.className = "chat-msg-sender-avatar";
        applyAccountAvatarToElement(
          senderAvatar,
          null,
          toInitials(resolveMemberName(message.senderUserId), "U"),
          getMemberAvatarPath(message.senderUserId)
        );
        senderAvatar.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openProfileForUser(message.senderUserId);
        });
        senderAvatar.addEventListener("dblclick", suppressMessageSelectionEvent);
        if (isOwnMessage) {
          row.append(item, senderAvatar);
        } else {
          row.append(senderAvatar, item);
        }
      } else {
        row.appendChild(item);
      }

      fragment.appendChild(row);
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

  const scheduleRenderMessages = (chatId, options = {}) => {
    const normalizedChatId = toChatId(chatId);
    if (!normalizedChatId) return;

    const previous = pendingMessageRenderByChatId.get(normalizedChatId) || { stickToBottom: false, prependCount: 0 };
    const next = {
      stickToBottom: previous.stickToBottom || options?.stickToBottom === true,
      prependCount: Math.max(Number(previous.prependCount) || 0, Number(options?.prependCount) || 0)
    };

    pendingMessageRenderByChatId.set(normalizedChatId, next);
    if (messageRenderRafId) return;

    messageRenderRafId = window.requestAnimationFrame(() => {
      messageRenderRafId = 0;
      const pending = Array.from(pendingMessageRenderByChatId.entries());
      pendingMessageRenderByChatId.clear();
      pending.forEach(([targetChatId, targetOptions]) => {
        renderMessages(targetChatId, targetOptions);
      });
    });
  };

  const clearScheduledMessageRender = () => {
    if (messageRenderRafId) {
      window.cancelAnimationFrame(messageRenderRafId);
      messageRenderRafId = 0;
    }
    pendingMessageRenderByChatId.clear();
  };

  const expandMessageWindowForActiveChat = () => {
    const activeChatId = toChatId(store.getActiveChatId());
    if (!activeChatId || !(chatShellFeed instanceof HTMLElement)) return false;
    const list = store.getMessages(activeChatId);
    if (list.length <= CHAT_MESSAGE_WINDOW_SIZE) return false;

    const state = messageRenderWindowByChatId.get(activeChatId);
    const start = Number(state?.start);
    if (!Number.isFinite(start) || start <= 0) return false;

    const beforeHeight = chatShellFeed.scrollHeight;
    const nextStart = Math.max(0, start - CHAT_MESSAGE_WINDOW_EXPAND_STEP);
    if (nextStart === start) return false;

    messageRenderWindowByChatId.set(activeChatId, {
      start: nextStart,
      total: list.length
    });
    renderMessages(activeChatId);

    const afterHeight = chatShellFeed.scrollHeight;
    chatShellFeed.scrollTop += Math.max(0, afterHeight - beforeHeight);
    syncJumpBottomButton();
    return true;
  };

  const normalizeRealtimeMessage = (payload) => {
    return normalizeChatMessage({
      id: payload?.messageId,
      senderUserId: payload?.senderUserId,
      kind: payload?.kind,
      bodyCipher: payload?.bodyCipher,
      replyToMessageId: payload?.replyToMessageId,
      forwardedFromMessageId: payload?.forwardedFromMessageId,
      forwardedFromSenderUserId: payload?.forwardedFromSenderUserId,
      forwardedFromSenderDisplayName: payload?.forwardedFromSenderDisplayName,
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
      renderMessages(chatId, { stickToBottom: isOwn || wasNearBottom });
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
      scheduleRenderMessages(chatId);
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
      scheduleRenderMessages(chatId);
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
      scheduleRenderMessages(chatId);
    }
  };

  const handleRealtimeAttachmentUploaded = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const pending = getPendingVoiceUpload(payload?.messageId);
    const attachment = normalizeAttachment({
      id: payload?.attachmentId,
      messageId: payload?.messageId,
      fileName: payload?.fileName,
      contentType: payload?.contentType,
      size: payload?.size,
      durationMs: payload?.durationMs ?? pending?.durationMs
    });
    if (!chatId || !attachment) return;
    const current = getMessageAttachments(attachment.messageId);
    setMessageAttachments(attachment.messageId, [...current, attachment]);
    if (store.getActiveChatId() === chatId) {
      scheduleRenderMessages(chatId);
    }
  };

  const handleRealtimeAttachmentDeleted = (payload) => {
    const chatId = String(payload?.chatId || "").trim();
    const messageId = Number(payload?.messageId);
    if (!chatId || !Number.isFinite(messageId) || messageId <= 0) return;
    removeAttachmentFromMessage(messageId, payload?.attachmentId);
    if (store.getActiveChatId() === chatId) {
      scheduleRenderMessages(chatId);
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
    const currentText = normalizeToken(chatShellInput instanceof HTMLTextAreaElement ? chatShellInput.value : "");
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
    if (open) {
      openSettingsModal();
      return;
    }
    closeSettingsModal();
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
    const currentPreference = getPreference(activeChatId);
    const backgroundToPersist = selectedBackground !== null
      ? String(selectedBackground || "")
      : String(currentPreference.backgroundImageDataUrl || "");

    settingsSaving = true;
    syncSettingsPanel();

    const permissions = getCurrentChatPermissions();
    const nextPreference = {
      isMuted: chatSettingsMuted instanceof HTMLInputElement ? chatSettingsMuted.checked : false,
      soundEnabled: true,
      backgroundImageKey: null
    };

    const savedPreference = store.isUsingMockData()
      ? nextPreference
      : await api.updatePreferences(activeChatId, nextPreference);

    if (savedPreference) {
      setPreference(activeChatId, savedPreference);
    }

    setStoredUiSetting(activeChatId, {
      suppressActiveSound: chatSettingsSkipActive instanceof HTMLInputElement ? chatSettingsSkipActive.checked : true,
      chatBackgroundImageDataUrl: backgroundToPersist || ""
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
    selectedBackground = backgroundToPersist;
    applyChatBackground(activeChatId, backgroundToPersist || "");
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

  const focusFirstUnreadInActiveChat = async (options = {}) => {
    const activeChatId = store.getActiveChatId();
    if (!activeChatId) return false;

    const focused = focusFirstUnreadMessage(activeChatId);
    if (!focused && options?.fallbackToBottom !== false) {
      scrollMessagesToBottom();
    }

    if (options?.markAsRead !== false) {
      await markActiveChatAsRead();
    }

    return focused;
  };

  const loadMessages = async (chatId, options = {}) => {
    const appendOlder = Boolean(options.appendOlder);
    const skipInitialScrollBottom = Boolean(options.skipInitialScrollBottom);
    const skipInitialMarkAsRead = Boolean(options.skipInitialMarkAsRead);
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

    renderMessages(chatId, {
      stickToBottom: !appendOlder,
      prependCount: appendOlder ? normalized.length : 0
    });
    if (!appendOlder && !skipInitialScrollBottom) {
      scrollMessagesToBottom();
    }
    renderRailList();
    void loadAttachmentsForMessages(chatId, store.getMessages(chatId), { stickToBottom: !appendOlder });
    if (!appendOlder && !skipInitialMarkAsRead) {
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
    messageRenderWindowByChatId.clear();
    clearScheduledMessageRender();
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

  const openChat = async (chatId, options = {}) => {
    const targetId = toChatId(chatId);
    if (!targetId || !store.isFeatureEnabled()) return;
    const focusFirstUnread = options?.focusFirstUnread === true;
    const deferUnreadFocus = options?.deferUnreadFocus === true;

    const chat = store.getChatById(targetId);
    if (!chat) return;

    const previousChatId = store.getActiveChatId();
    if (previousChatId && previousChatId !== targetId) {
      clearActiveAudioPlayback({ pause: true, reset: false, hide: true });
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

    onOpenChat(chat, options);

    if (store.isUsingMockData()) {
      await loadPreferencesForChat(targetId);
      await loadReadStatesForChat(targetId);
      renderMessages(targetId, { stickToBottom: true });
      if (!focusFirstUnread || !focusFirstUnreadMessage(targetId)) {
        scrollMessagesToBottom();
      }
      renderRailList();
      renderRealtimePresence();
      syncComposerUi();
      if (chatShellInput instanceof HTMLTextAreaElement && composerState.mode !== "forward" && composerState.mode !== "bulk-forward") {
        resizeComposerInput();
        chatShellInput.focus();
      }
      return;
    }

    if (focusFirstUnread) {
      await loadReadStatesForChat(targetId);
    }

    isLoadingMessages = true;
    syncComposerUi();
    const loaded = await loadMessages(targetId, {
      skipInitialScrollBottom: focusFirstUnread,
      skipInitialMarkAsRead: focusFirstUnread
    });
    isLoadingMessages = false;
    syncComposerUi();
    renderRealtimePresence();
    await loadPreferencesForChat(targetId);
    if (!focusFirstUnread) {
      await loadReadStatesForChat(targetId);
    }

    if (loaded && focusFirstUnread && !deferUnreadFocus) {
      if (!focusFirstUnreadMessage(targetId)) {
        scrollMessagesToBottom();
      }
      await markActiveChatAsRead();
    }

    if (!loaded && previousChatId && previousChatId !== targetId) {
      store.setActiveChatId(previousChatId);
      renderRailList();
    }

    if (chatShellInput instanceof HTMLTextAreaElement && composerState.mode !== "forward" && composerState.mode !== "bulk-forward") {
      resizeComposerInput();
      chatShellInput.focus();
    }
  };

  const openDirectChat = async (userId) => {
    const targetUserId = Number(userId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) return;

    const existingDirectChat = store.getChats().find((chat) => Number(chat?.type) === 3 && Number(chat?.directPeerUserId) === targetUserId);
    if (existingDirectChat?.id) {
      await openChat(existingDirectChat.id);
      return;
    }

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
          directPeerUserId: targetUserId,
          directPeerDisplayName: title,
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

  const createGroupChat = async (title, options = {}) => {
    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      return null;
    }

    const safeTitle = normalizeToken(title);
    if (!safeTitle) {
      return null;
    }

    const openAfterCreate = options?.open !== false;

    if (store.isUsingMockData()) {
      const mockId = `mock-group-${Date.now()}`;
      const chat = {
        id: mockId,
        type: 2,
        title: safeTitle,
        taskId: null,
        updatedAtUtc: new Date().toISOString()
      };
      store.upsertChat(chat);
      store.setMessages(mockId, [], { hasMore: false });
      renderRailList();
      if (openAfterCreate) {
        const openOptions = options?.openOptions && typeof options.openOptions === "object"
          ? options.openOptions
          : {};
        await openChat(mockId, openOptions);
      }
      return chat;
    }

    const payload = await api.createGroupChat(workspaceId, safeTitle);
    const normalized = normalizeChatRoom(payload || {});
    if (!normalized?.id) {
      return null;
    }

    store.upsertChat(normalized);
    await realtimeClient.joinChat(normalized.id);
    renderRailList();

    if (openAfterCreate) {
      const openOptions = options?.openOptions && typeof options.openOptions === "object"
        ? options.openOptions
        : {};
      await openChat(normalized.id, openOptions);
    }

    return normalized;
  };

  const openDirectChatByUser = async (userId) => {
    await openDirectChat(userId);
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
      const openOptions = options?.openOptions && typeof options.openOptions === "object"
        ? options.openOptions
        : {};
      await openChat(normalized.id, openOptions);
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
    let localVoiceUrl = "";
    let localVoiceDurationMs = null;
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
      renderMessages(activeChatId, { stickToBottom: true });
      scrollMessagesToBottom();
      renderRailList();

      let attachment = null;
      if (isVoiceUpload) {
        localVoiceUrl = URL.createObjectURL(file);
        localVoiceDurationMs = await getAudioDurationMs(file);
        const upload = api.startAttachmentUpload(activeChatId, normalizedMessage.id, file, {
          onProgress: (progress) => {
            setPendingVoiceUpload(normalizedMessage.id, {
              chatId: activeChatId,
              messageId: normalizedMessage.id,
              uploadId,
              progress,
              cancel: upload.cancel,
              fileName: label,
              size: file.size,
              durationMs: localVoiceDurationMs,
              localUrl: localVoiceUrl
            });
            scheduleRenderMessages(activeChatId);
          }
        });

        setPendingVoiceUpload(normalizedMessage.id, {
          chatId: activeChatId,
          messageId: normalizedMessage.id,
          uploadId,
          progress: 5,
          cancel: upload.cancel,
          fileName: label,
          size: file.size,
          durationMs: localVoiceDurationMs,
          localUrl: localVoiceUrl
        });
        scheduleRenderMessages(activeChatId);
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

      setMessageAttachments(normalizedMessage.id, [{
        ...attachment,
        durationMs: attachment?.durationMs ?? localVoiceDurationMs
      }]);
      clearPendingVoiceUpload(normalizedMessage.id);
      if (!isVoiceUpload) {
        upsertUploadItem({ id: uploadId, label, status: "done", progress: 100, error: "" });
      }
      renderMessages(activeChatId, { stickToBottom: true });
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
    const body = normalizeToken(chatShellInput instanceof HTMLTextAreaElement ? chatShellInput.value : "");
    const actorIdRaw = Number(getActorUserId());
    const actorId = Number.isFinite(actorIdRaw) && actorIdRaw > 0 ? actorIdRaw : 1;

    if (composerState.mode === "edit") {
      store.patchMessage(activeChatId, composerState.messageId, {
        body,
        editedAtUtc: new Date().toISOString()
      });
      clearComposerIntent();
      renderMessages(activeChatId, { stickToBottom: true });
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
      renderMessages(activeChatId, { stickToBottom: true });
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
    renderMessages(activeChatId, { stickToBottom: true });
    scrollMessagesToBottom();
    renderRailList();
    return true;
  };

  const sendMessage = async () => {
    if (isSendingMessage || isLoadingMessages || isLoadingOlderMessages) return;
    const activeChatId = store.getActiveChatId();
    if (!activeChatId || !store.isFeatureEnabled()) return;

    const body = normalizeToken(chatShellInput instanceof HTMLTextAreaElement ? chatShellInput.value : "");
    if (!body && composerState.mode !== "forward") return;

    if (store.isUsingMockData()) {
      const applied = applyMockSend();
      if (applied && chatShellInput instanceof HTMLTextAreaElement && composerState.mode !== "forward") {
        chatShellInput.value = "";
        resizeComposerInput();
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
      renderMessages(activeChatId, { stickToBottom: true });
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
      renderMessages(activeChatId, { stickToBottom: true });
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
      renderMessages(activeChatId, { stickToBottom: true });
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
      renderMessages(activeChatId, { stickToBottom: true });
      scrollMessagesToBottom();
      renderRailList();
      await markActiveChatAsRead();
    } else {
      await loadMessages(activeChatId);
    }

    clearComposerIntent();
    if (chatShellInput instanceof HTMLTextAreaElement) {
      chatShellInput.value = "";
      resizeComposerInput();
      chatShellInput.focus();
    }
    syncComposerUi();
  };

  const refreshChats = async () => {
    const workspaceId = Number(getWorkspaceId());
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      setSettingsOpen(false);
      store.clear();
      messageRenderWindowByChatId.clear();
      clearScheduledMessageRender();
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
      messageRenderWindowByChatId.clear();
      clearScheduledMessageRender();
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
    messageRenderWindowByChatId.clear();
    clearScheduledMessageRender();
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
    clearActiveAudioPlayback({ pause: true, reset: false, hide: true });
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
    messageRenderWindowByChatId.clear();
    clearScheduledMessageRender();
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
    if (chatRailResizer instanceof HTMLElement && Number.isFinite(dragState.pointerId)) {
      try {
        chatRailResizer.releasePointerCapture(dragState.pointerId);
      } catch {
        // ignore pointer capture failures
      }
    }
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
      startWidth: currentRailWidth,
      pointerId: event.pointerId
    };
    if (chatRailResizer instanceof HTMLElement && Number.isFinite(event.pointerId)) {
      try {
        chatRailResizer.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture failures
      }
    }
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
    renderRailTabs();
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
        openSettingsModal();
      });
    }

    if (chatShellAvatar instanceof HTMLElement) {
      chatShellAvatar.addEventListener("click", () => {
        if (!store.getActiveChatId()) return;
        openSettingsModal();
      });
    }

    if (chatShellTitle instanceof HTMLElement) {
      chatShellTitle.addEventListener("click", () => {
        if (!store.getActiveChatId()) return;
        openSettingsModal();
      });
    }

    if (chatSettingsModalAvatar instanceof HTMLButtonElement) {
      chatSettingsModalAvatar.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const chat = store.getChatById(store.getActiveChatId());
        if (isDirectChat(chat)) {
          openProfileFromSettingsModal();
          return;
        }

        if (isGroupChat(chat)) {
          chatSettingsAvatarInput?.click();
        }
      });
    }

    if (chatSettingsModalMain instanceof HTMLButtonElement) {
      chatSettingsModalMain.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openProfileFromSettingsModal();
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

    if (chatSettingsAttachmentTabs instanceof HTMLElement) {
      chatSettingsAttachmentTabs.querySelectorAll("[data-attachment-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          activeAttachmentTab = String(button.getAttribute("data-attachment-tab") || "all");
          renderSettingsAttachments(store.getActiveChatId());
        });
      });
    }

    if (chatSettingsBgUploadBtn instanceof HTMLButtonElement) {
      chatSettingsBgUploadBtn.addEventListener("click", () => {
        chatSettingsBgInput?.click();
      });
    }

    if (chatSettingsBgRemoveBtn instanceof HTMLButtonElement) {
      chatSettingsBgRemoveBtn.addEventListener("click", () => {
        selectedBackground = "";
        applyChatBackground(store.getActiveChatId(), "");
        syncSettingsPanel();
      });
    }

    if (chatSettingsBgInput instanceof HTMLInputElement) {
      chatSettingsBgInput.addEventListener("change", async () => {
        const file = chatSettingsBgInput.files?.[0] || null;
        chatSettingsBgInput.value = "";
        if (!file) return;
        const dataUrl = await resizeImageToDataUrl(file);
        selectedBackground = String(dataUrl || "");
        applyChatBackground(store.getActiveChatId(), selectedBackground);
        syncSettingsPanel();
      });
    }

    if (chatSettingsAvatarInput instanceof HTMLInputElement) {
      chatSettingsAvatarInput.addEventListener("change", async () => {
        const file = chatSettingsAvatarInput.files?.[0] || null;
        chatSettingsAvatarInput.value = "";
        if (!file) return;

        const activeChatId = store.getActiveChatId();
        const chat = store.getChatById(activeChatId);
        if (!activeChatId || !isGroupChat(chat)) {
          return;
        }

        const dataUrl = await resizeImageToDataUrl(file);
        const avatarDataUrl = String(dataUrl || "").trim();
        if (!avatarDataUrl) {
          return;
        }

        setStoredUiSetting(activeChatId, {
          chatGroupAvatarDataUrl: avatarDataUrl
        });

        renderRailList();
        updateHeader(store.getChatById(activeChatId) || chat);
        syncSettingsPanel();
      });
    }

    if (chatShellForm instanceof HTMLFormElement) {
      chatShellForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void sendMessage();
      });
    }

    if (chatShellInput instanceof HTMLTextAreaElement) {
      chatShellInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void sendMessage();
        }
      });
      chatShellInput.addEventListener("input", () => {
        resizeComposerInput();
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
        if (expandMessageWindowForActiveChat()) {
          return;
        }
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
        if (closeImageViewer()) {
          return;
        }
        closeMessageContextMenu();
        closeSettingsModal();
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !(chatSettingsModal instanceof HTMLElement) || chatSettingsModal.hidden) return;
      if (target.closest("[data-close-chat-settings]")) {
        closeSettingsModal();
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
    resizeComposerInput();
    syncComposerUi();
  };

  return {
    init,
    refreshChats,
    openChat,
    openDirectChatByUser,
    createGroupChat,
    openActiveChatSettings,
    ensureTaskChat,
    focusFirstUnreadInActiveChat,
    activateTasks,
    clearWorkspaceData,
    syncMembers
  };
};
