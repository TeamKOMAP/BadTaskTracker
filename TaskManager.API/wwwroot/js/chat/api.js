import { buildApiUrl, apiFetch, handleApiError } from "../shared/api.js?v=auth5";

const ACCESS_TOKEN_KEY = "gtt-access-token";

const JSON_HEADERS = {
  Accept: "application/json"
};

const JSON_BODY_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json"
};

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const request = async (url, options, context) => {
  try {
    return await apiFetch(url, options);
  } catch (error) {
    console.error(`${context} failed: network error`, error);
    return null;
  }
};

const getAccessToken = () => {
  try {
    return String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
};

const createUploadWithProgress = (url, file, messageId, onProgress) => {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve) => {
    xhr.open("POST", url, true);
    xhr.responseType = "json";

    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress(percent);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve({ ok: false, data: null, status: xhr.status, statusText: xhr.statusText, aborted: false });
        return;
      }

      resolve({ ok: true, data: xhr.response || null, status: xhr.status, statusText: xhr.statusText, aborted: false });
    });

    xhr.addEventListener("error", () => {
      resolve({ ok: false, data: null, status: 0, statusText: "Network Error", aborted: false });
    });

    xhr.addEventListener("abort", () => {
      resolve({ ok: false, data: null, status: 0, statusText: "Aborted", aborted: true });
    });

    const form = new FormData();
    form.append("messageId", String(messageId));
    form.append("file", file, file?.name || "attachment");
    xhr.send(form);
  });

  return {
    promise,
    cancel: () => {
      try {
        xhr.abort();
      } catch {
        // ignore abort errors
      }
    }
  };
};

export const createChatApi = () => {
  const getChats = async (workspaceId) => {
    const response = await request(
      buildApiUrl("/chats", { workspaceId }),
      { headers: JSON_HEADERS },
      "Загрузка списка чатов"
    );

    if (!response) {
      return { ok: false, disabled: false, data: [] };
    }

    if (response.status === 404) {
      return { ok: true, disabled: true, data: [] };
    }

    if (!response.ok) {
      await handleApiError(response, "Загрузка списка чатов");
      return { ok: false, disabled: false, data: [] };
    }

    const payload = await parseJson(response);
    return {
      ok: true,
      disabled: false,
      data: Array.isArray(payload) ? payload : []
    };
  };

  const getMessages = async (chatId, options = {}) => {
    const limit = Number(options.limit) > 0 ? Number(options.limit) : 30;
    const beforeMessageId = Number(options.beforeMessageId);
    const response = await request(
      buildApiUrl(`/chats/${chatId}/messages`, {
        limit,
        beforeMessageId: Number.isFinite(beforeMessageId) && beforeMessageId > 0 ? beforeMessageId : undefined
      }),
      { headers: JSON_HEADERS },
      "Загрузка сообщений чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Загрузка сообщений чата");
      }
      return { ok: false, data: [], hasMore: false };
    }

    const payload = await parseJson(response);
    const data = Array.isArray(payload) ? payload : [];
    return {
      ok: true,
      data,
      hasMore: data.length >= limit
    };
  };

  const openDirectChat = async (workspaceId, userId) => {
    const response = await request(
      buildApiUrl(`/chats/direct/${userId}`, { workspaceId }),
      {
        method: "POST",
        headers: JSON_HEADERS
      },
      "Открытие личного чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Открытие личного чата");
      }
      return null;
    }

    return await parseJson(response);
  };

  const createGroupChat = async (workspaceId, title) => {
    const response = await request(
      buildApiUrl("/chats/groups"),
      {
        method: "POST",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify({
          workspaceId,
          title
        })
      },
      "Создание группового чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Создание группового чата");
      }
      return null;
    }

    return await parseJson(response);
  };

  const openTaskChat = async (workspaceId, taskId) => {
    const response = await request(
      buildApiUrl(`/tasks/${taskId}/chat/open`, { workspaceId }),
      {
        method: "POST",
        headers: JSON_HEADERS
      },
      "Открытие task-чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Открытие task-чата");
      }
      return null;
    }

    return await parseJson(response);
  };

  const getPreferences = async (chatId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/preferences`),
      { headers: JSON_HEADERS },
      "Загрузка настроек чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Загрузка настроек чата");
      }
      return null;
    }

    return await parseJson(response);
  };

  const getMembers = async (chatId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/members`),
      { headers: JSON_HEADERS },
      "Загрузка участников чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Загрузка участников чата");
      }
      return [];
    }

    const payload = await parseJson(response);
    return Array.isArray(payload) ? payload : [];
  };

  const updatePreferences = async (chatId, payload) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/preferences`),
      {
        method: "PATCH",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify(payload || {})
      },
      "Сохранение настроек чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Сохранение настроек чата");
      }
      return null;
    }

    return await parseJson(response);
  };

  const updateChatSettings = async (chatId, payload) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/settings`),
      {
        method: "PATCH",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify(payload || {})
      },
      "Сохранение параметров комнаты"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Сохранение параметров комнаты");
      }
      return false;
    }

    return true;
  };

  const getAttachments = async (chatId, messageId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/attachments`, { messageId }),
      { headers: JSON_HEADERS },
      "Загрузка вложений сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Загрузка вложений сообщения");
      }
      return [];
    }

    const payload = await parseJson(response);
    return Array.isArray(payload) ? payload : [];
  };

  const getAllAttachments = async (chatId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/attachments/all`),
      { headers: JSON_HEADERS },
      "Загрузка всех вложений чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Загрузка всех вложений чата");
      }
      return [];
    }

    const payload = await parseJson(response);
    return Array.isArray(payload) ? payload : [];
  };

  const uploadAttachment = async (chatId, messageId, file, options = {}) => {
    const upload = createUploadWithProgress(buildApiUrl(`/chats/${chatId}/attachments`), file, messageId, options?.onProgress);
    const result = await upload.promise;

    if (!result.ok) {
      console.error("Загрузка вложения сообщения failed", result.status, result.statusText);
      return null;
    }

    return result.data;
  };

  const startAttachmentUpload = (chatId, messageId, file, options = {}) => {
    const upload = createUploadWithProgress(buildApiUrl(`/chats/${chatId}/attachments`), file, messageId, options?.onProgress);
    return {
      cancel: upload.cancel,
      promise: upload.promise.then((result) => {
        if (!result.ok) {
          if (!result.aborted) {
            console.error("Загрузка вложения сообщения failed", result.status, result.statusText);
          }
          return null;
        }
        return result.data;
      }),
      rawPromise: upload.promise
    };
  };

  const downloadAttachmentBlob = async (chatId, attachmentId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/attachments/${attachmentId}`),
      { method: "GET" },
      "Скачивание вложения сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Скачивание вложения сообщения");
      }
      return null;
    }

    try {
      return await response.blob();
    } catch {
      return null;
    }
  };

  const deleteAttachment = async (chatId, attachmentId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/attachments/${attachmentId}`),
      { method: "DELETE" },
      "Удаление вложения сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Удаление вложения сообщения");
      }
      return false;
    }

    return true;
  };

  const sendMessage = async (chatId, payload) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/messages`),
      {
        method: "POST",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify(payload || {})
      },
      "Отправка сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Отправка сообщения");
      }
      return null;
    }

    return await parseJson(response);
  };

  const editMessage = async (chatId, messageId, bodyCipher) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/messages/${messageId}`),
      {
        method: "PATCH",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify({ bodyCipher })
      },
      "Редактирование сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Редактирование сообщения");
      }
      return null;
    }

    return await parseJson(response);
  };

  const deleteMessage = async (chatId, messageId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/messages/${messageId}`),
      { method: "DELETE" },
      "Удаление сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Удаление сообщения");
      }
      return false;
    }

    return true;
  };

  const replyToMessage = async (chatId, messageId, payload) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/messages/${messageId}/reply`),
      {
        method: "POST",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify(payload || {})
      },
      "Ответ на сообщение"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Ответ на сообщение");
      }
      return null;
    }

    return await parseJson(response);
  };

  const forwardMessage = async (chatId, messageId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/messages/${messageId}/forward`),
      {
        method: "POST",
        headers: JSON_HEADERS
      },
      "Пересылка сообщения"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Пересылка сообщения");
      }
      return null;
    }

    return await parseJson(response);
  };

  const markAsRead = async (chatId, lastReadMessageId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/read`),
      {
        method: "POST",
        headers: JSON_BODY_HEADERS,
        body: JSON.stringify({ lastReadMessageId })
      },
      "Отметка сообщений как прочитанных"
    );

    if (!response || !response.ok) {
      return false;
    }

    return true;
  };

  const getReadStates = async (chatId) => {
    const response = await request(
      buildApiUrl(`/chats/${chatId}/read-states`),
      { headers: JSON_HEADERS },
      "Загрузка read-state чата"
    );

    if (!response || !response.ok) {
      if (response) {
        await handleApiError(response, "Загрузка read-state чата");
      }
      return [];
    }

    const payload = await parseJson(response);
    return Array.isArray(payload) ? payload : [];
  };

  const getLatestPreview = async (chatId) => {
    const result = await getMessages(chatId, { limit: 1 });
    if (!result.ok || !Array.isArray(result.data) || !result.data.length) {
      return null;
    }

    return result.data[0];
  };

  return {
    getChats,
    getMessages,
    openDirectChat,
    createGroupChat,
    openTaskChat,
    getMembers,
    getPreferences,
    updatePreferences,
    updateChatSettings,
    getAttachments,
    getAllAttachments,
    uploadAttachment,
    startAttachmentUpload,
    downloadAttachmentBlob,
    deleteAttachment,
    sendMessage,
    editMessage,
    deleteMessage,
    replyToMessage,
    forwardMessage,
    markAsRead,
    getReadStates,
    getLatestPreview
  };
};
