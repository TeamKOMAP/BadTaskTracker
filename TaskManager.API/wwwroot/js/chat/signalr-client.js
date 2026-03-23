const ACCESS_TOKEN_KEY = "gtt-access-token";

const getAccessToken = () => {
  try {
    return String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
};

const toChatId = (value) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const noop = () => {};

const createNoopClient = () => ({
  start: async () => false,
  stop: async () => {},
  syncChats: async () => {},
  joinChat: async () => {},
  leaveChat: async () => {},
  setTyping: async () => {},
  isConnected: () => false
});

export const createChatSignalRClient = (options = {}) => {
  const signalR = globalThis.signalR;
  if (!signalR?.HubConnectionBuilder) {
    return createNoopClient();
  }

  const onMessageCreated = typeof options.onMessageCreated === "function" ? options.onMessageCreated : noop;
  const onMessageUpdated = typeof options.onMessageUpdated === "function" ? options.onMessageUpdated : noop;
  const onMessageDeleted = typeof options.onMessageDeleted === "function" ? options.onMessageDeleted : noop;
  const onReadUpdated = typeof options.onReadUpdated === "function" ? options.onReadUpdated : noop;
  const onAttachmentUploaded = typeof options.onAttachmentUploaded === "function" ? options.onAttachmentUploaded : noop;
  const onAttachmentDeleted = typeof options.onAttachmentDeleted === "function" ? options.onAttachmentDeleted : noop;
  const onTypingUpdated = typeof options.onTypingUpdated === "function" ? options.onTypingUpdated : noop;
  const onStateChanged = typeof options.onStateChanged === "function" ? options.onStateChanged : noop;

  const joinedChats = new Set();
  let startingPromise = null;

  const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/chat", {
      accessTokenFactory: () => getAccessToken()
    })
    .withAutomaticReconnect([0, 1000, 3000, 5000, 10000])
    .build();

  connection.on("chat.message.created", onMessageCreated);
  connection.on("chat.message.updated", onMessageUpdated);
  connection.on("chat.message.deleted", onMessageDeleted);
  connection.on("chat.read.updated", onReadUpdated);
  connection.on("chat.attachment.uploaded", onAttachmentUploaded);
  connection.on("chat.attachment.deleted", onAttachmentDeleted);
  connection.on("chat.typing.updated", onTypingUpdated);

  connection.onreconnecting(() => {
    onStateChanged("reconnecting");
  });

  connection.onreconnected(async () => {
    onStateChanged("connected");
    const chatIds = Array.from(joinedChats.values());
    for (const chatId of chatIds) {
      // eslint-disable-next-line no-await-in-loop
      await connection.invoke("JoinChat", chatId).catch(() => {});
    }
  });

  connection.onclose(() => {
    onStateChanged("disconnected");
  });

  const ensureStarted = async () => {
    if (connection.state === signalR.HubConnectionState.Connected) {
      return true;
    }
    if (startingPromise) {
      return startingPromise;
    }

    onStateChanged("connecting");
    startingPromise = connection.start()
      .then(() => {
        onStateChanged("connected");
        return true;
      })
      .catch((error) => {
        console.error("Chat SignalR start failed", error);
        onStateChanged("disconnected");
        return false;
      })
      .finally(() => {
        startingPromise = null;
      });

    return startingPromise;
  };

  return {
    async start() {
      return ensureStarted();
    },

    async stop() {
      joinedChats.clear();
      if (connection.state === signalR.HubConnectionState.Disconnected) {
        onStateChanged("disconnected");
        return;
      }
      await connection.stop().catch(() => {});
      onStateChanged("disconnected");
    },

    async syncChats(chatIds) {
      const normalized = new Set((Array.isArray(chatIds) ? chatIds : []).map(toChatId).filter(Boolean));
      const connected = await ensureStarted();
      if (!connected) return;

      const toLeave = Array.from(joinedChats.values()).filter((chatId) => !normalized.has(chatId));
      const toJoin = Array.from(normalized.values()).filter((chatId) => !joinedChats.has(chatId));

      for (const chatId of toLeave) {
        // eslint-disable-next-line no-await-in-loop
        await connection.invoke("LeaveChat", chatId).catch(() => {});
        joinedChats.delete(chatId);
      }

      for (const chatId of toJoin) {
        // eslint-disable-next-line no-await-in-loop
        await connection.invoke("JoinChat", chatId).catch(() => {});
        joinedChats.add(chatId);
      }
    },

    async joinChat(chatId) {
      const normalized = toChatId(chatId);
      if (!normalized) return;
      const connected = await ensureStarted();
      if (!connected || joinedChats.has(normalized)) return;
      await connection.invoke("JoinChat", normalized).catch(() => {});
      joinedChats.add(normalized);
    },

    async leaveChat(chatId) {
      const normalized = toChatId(chatId);
      if (!normalized || !joinedChats.has(normalized)) return;
      if (connection.state === signalR.HubConnectionState.Connected) {
        await connection.invoke("LeaveChat", normalized).catch(() => {});
      }
      joinedChats.delete(normalized);
    },

    async setTyping(chatId, isTyping) {
      const normalized = toChatId(chatId);
      if (!normalized) return;
      const connected = await ensureStarted();
      if (!connected) return;
      await connection.invoke("SetTyping", normalized, Boolean(isTyping)).catch(() => {});
    },

    isConnected() {
      return connection.state === signalR.HubConnectionState.Connected;
    }
  };
};
