const normalizeUtcDateValue = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(raw)) {
    return raw
  }
  return `${raw}Z`
}

const byDateAsc = (left, right) => {
  const leftMs = Date.parse(normalizeUtcDateValue(left?.createdAtUtc || ""));
  const rightMs = Date.parse(normalizeUtcDateValue(right?.createdAtUtc || ""));
  const safeLeft = Number.isFinite(leftMs) ? leftMs : 0;
  const safeRight = Number.isFinite(rightMs) ? rightMs : 0;
  if (safeLeft !== safeRight) {
    return safeLeft - safeRight;
  }

  return Number(left?.id || 0) - Number(right?.id || 0);
};

const getMessageKey = (message) => {
  const messageId = Number(message?.id);
  if (Number.isFinite(messageId) && messageId > 0) {
    return `id:${messageId}`;
  }

  const clientMessageId = String(message?.clientMessageId || "").trim();
  if (clientMessageId) {
    return `client:${clientMessageId}`;
  }

  return `fallback:${String(message?.createdAtUtc || "")}:${String(message?.body || "")}`;
};

const mergeMessages = (...groups) => {
  const seen = new Map();
  groups
    .flat()
    .filter(Boolean)
    .forEach((message) => {
      seen.set(getMessageKey(message), message);
    });

  return Array.from(seen.values()).sort(byDateAsc);
};

const normalizeChatId = (chatId) => {
  const value = String(chatId || "").trim();
  return value || null;
};

export const createChatStore = () => {
  let chats = [];
  let activeChatId = null;
  let chatFeatureEnabled = true;
  let useMockData = false;

  const messagesByChatId = new Map();
  const previewByChatId = new Map();
  const historyMetaByChatId = new Map();

  const getMessages = (chatId) => {
    const key = normalizeChatId(chatId);
    if (!key) return [];
    return Array.isArray(messagesByChatId.get(key)) ? messagesByChatId.get(key) : [];
  };

  const setHistoryMeta = (chatId, meta) => {
    const key = normalizeChatId(chatId);
    if (!key) return;
    historyMetaByChatId.set(key, {
      hasMore: Boolean(meta?.hasMore)
    });
  };

  const syncPreviewFromMessages = (chatId) => {
    const key = normalizeChatId(chatId);
    if (!key) return "";
    const list = getMessages(key);
    const last = list.length ? list[list.length - 1] : null;
    const preview = String(last?.body || "").trim();
    if (preview) {
      previewByChatId.set(key, preview);
      return preview;
    }

    previewByChatId.delete(key);
    return "";
  };

  return {
    clear() {
      chats = [];
      activeChatId = null;
      chatFeatureEnabled = true;
      useMockData = false;
      messagesByChatId.clear();
      previewByChatId.clear();
      historyMetaByChatId.clear();
    },

    setChats(nextChats) {
      chats = Array.isArray(nextChats) ? [...nextChats] : [];
    },

    getChats() {
      return [...chats];
    },

    upsertChat(chat) {
      const chatId = normalizeChatId(chat?.id);
      if (!chatId) return;
      chats = [...chats.filter((item) => normalizeChatId(item?.id) !== chatId), chat];
    },

    getChatById(chatId) {
      const key = normalizeChatId(chatId);
      if (!key) return null;
      return chats.find((chat) => normalizeChatId(chat?.id) === key) || null;
    },

    setActiveChatId(chatId) {
      activeChatId = normalizeChatId(chatId);
    },

    getActiveChatId() {
      return activeChatId;
    },

    setFeatureEnabled(enabled) {
      chatFeatureEnabled = Boolean(enabled);
    },

    isFeatureEnabled() {
      return chatFeatureEnabled;
    },

    setUseMockData(enabled) {
      useMockData = Boolean(enabled);
    },

    isUsingMockData() {
      return useMockData;
    },

    setMessages(chatId, messages, meta = {}) {
      const key = normalizeChatId(chatId);
      if (!key) return;
      messagesByChatId.set(key, mergeMessages(messages));
      setHistoryMeta(key, meta);
      syncPreviewFromMessages(key);
    },

    prependMessages(chatId, messages, meta = {}) {
      const key = normalizeChatId(chatId);
      if (!key) return;
      const current = getMessages(key);
      messagesByChatId.set(key, mergeMessages(messages, current));
      setHistoryMeta(key, meta);
      syncPreviewFromMessages(key);
    },

    upsertMessage(chatId, message) {
      const key = normalizeChatId(chatId);
      if (!key || !message) return;
      const current = getMessages(key);
      messagesByChatId.set(key, mergeMessages(current, [message]));
      syncPreviewFromMessages(key);
    },

    reconcileMessage(chatId, clientMessageId, message) {
      const key = normalizeChatId(chatId);
      const clientKey = String(clientMessageId || message?.clientMessageId || "").trim();
      if (!key || !message) return;

      const messageId = Number(message?.id);
      const current = getMessages(key).filter((item) => {
        if (clientKey && String(item?.clientMessageId || "").trim() === clientKey) {
          return false;
        }
        if (Number.isFinite(messageId) && messageId > 0 && Number(item?.id) === messageId) {
          return false;
        }
        return true;
      });

      messagesByChatId.set(key, mergeMessages(current, [message]));
      syncPreviewFromMessages(key);
    },

    removeMessageByClientMessageId(chatId, clientMessageId) {
      const key = normalizeChatId(chatId);
      const clientKey = String(clientMessageId || "").trim();
      if (!key || !clientKey) return;
      const current = getMessages(key).filter((item) => String(item?.clientMessageId || "").trim() !== clientKey);
      messagesByChatId.set(key, mergeMessages(current));
      syncPreviewFromMessages(key);
    },

    patchMessage(chatId, messageId, patch) {
      const key = normalizeChatId(chatId);
      const id = Number(messageId);
      if (!key || !Number.isFinite(id) || id <= 0) return;
      const current = getMessages(key);
      const next = current.map((message) => {
        if (Number(message?.id) !== id) {
          return message;
        }
        return {
          ...message,
          ...(typeof patch === "function" ? patch(message) : patch)
        };
      });
      messagesByChatId.set(key, mergeMessages(next));
      syncPreviewFromMessages(key);
    },

    getMessages,

    setPreview(chatId, preview) {
      const key = normalizeChatId(chatId);
      if (!key) return;
      const value = String(preview || "").trim();
      if (!value) {
        previewByChatId.delete(key);
        return;
      }
      previewByChatId.set(key, value);
    },

    getPreview(chatId) {
      const key = normalizeChatId(chatId);
      if (!key) return "";
      return String(previewByChatId.get(key) || "").trim();
    },

    syncPreviewFromMessages,

    getHistoryMeta(chatId) {
      const key = normalizeChatId(chatId);
      if (!key) {
        return { hasMore: false };
      }
      return historyMetaByChatId.get(key) || { hasMore: false };
    }
  };
};
