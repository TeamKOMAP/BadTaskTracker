import { buildApiUrl, apiFetch, handleApiError } from "../shared/api.js?v=auth5";

const JSON_HEADERS = {
  Accept: "application/json"
};

const fetchJsonAbortable = async (url, context, options) => {
  let response = null;
  try {
    response = await apiFetch(url, options);
  } catch (error) {
    if (error && typeof error === "object" && error.name === "AbortError") {
      return null;
    }
    console.error(`${context} failed: network error`, error);
    return null;
  }

  if (!response.ok) {
    await handleApiError(response, context);
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchTaskById = (taskId, signal) => fetchJsonAbortable(
  buildApiUrl(`/tasks/${taskId}`),
  "Загрузка задачи",
  {
    headers: JSON_HEADERS,
    signal
  }
);

export const fetchTaskAttachments = (taskId, signal) => fetchJsonAbortable(
  buildApiUrl(`/tasks/${taskId}/attachments`),
  "Загрузка вложений",
  {
    headers: JSON_HEADERS,
    signal
  }
);

export const uploadTaskAttachments = async (taskId, files) => {
  const list = Array.isArray(files) ? files.filter(Boolean) : Array.from(files || []).filter(Boolean);
  if (!list.length) {
    return true;
  }

  const form = new FormData();
  list.forEach((file) => form.append("files", file));

  const response = await apiFetch(buildApiUrl(`/tasks/${taskId}/attachments`), {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    await handleApiError(response, "Загрузка вложений");
    return false;
  }

  return true;
};

export const deleteTaskAttachment = async (taskId, attachmentId) => {
  const response = await apiFetch(buildApiUrl(`/tasks/${taskId}/attachments/${attachmentId}`), {
    method: "DELETE"
  });
  if (!response.ok) {
    await handleApiError(response, "Удалить вложение");
    return false;
  }
  return true;
};

export const downloadTaskAttachmentBlob = async (taskId, attachmentId) => {
  const response = await apiFetch(buildApiUrl(`/tasks/${taskId}/attachments/${attachmentId}`), {
    method: "GET"
  });
  if (!response.ok) {
    await handleApiError(response, "Скачать вложение");
    return null;
  }
  try {
    return await response.blob();
  } catch {
    return null;
  }
};
