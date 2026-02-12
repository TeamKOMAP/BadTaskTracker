const resolveApiBase = () => {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = String(params.get("api") ?? "").trim();
  if (fromQuery) {
    return fromQuery.endsWith("/api") ? fromQuery : `${fromQuery.replace(/\/$/, "")}/api`;
  }

  let fromStorage = "";
  try {
    fromStorage = String(localStorage.getItem("gtt-api-base") || "").trim();
  } catch {
    fromStorage = "";
  }
  if (fromStorage) {
    try {
      const storageUrl = new URL(fromStorage, window.location.origin);
      if (storageUrl.origin === window.location.origin) {
        const rawPath = `${storageUrl.origin}${storageUrl.pathname}`.replace(/\/$/, "");
        return rawPath.endsWith("/api") ? rawPath : `${rawPath}/api`;
      }
    } catch {
      // ignore invalid stored api base
    }

    try {
      localStorage.removeItem("gtt-api-base");
    } catch {
      // ignore
    }
  }

  return "/api";
};

export const API_BASE = resolveApiBase();

let contextProvider = () => ({
  actorUserId: null,
  workspaceId: null
});

export const setApiContextProvider = (provider) => {
  contextProvider = typeof provider === "function"
    ? provider
    : () => ({ actorUserId: null, workspaceId: null });
};

const getBaseUrl = () => {
  if (API_BASE.startsWith("http")) return API_BASE;
  return `${window.location.origin}${API_BASE}`;
};

export const buildApiUrl = (path, params) => {
  const url = new URL(`${getBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const buildApiHeaders = (headers) => {
  const merged = new Headers(headers || {});
  const context = contextProvider() || {};
  const actorUserId = Number(context.actorUserId);
  const workspaceId = Number(context.workspaceId);

  if (Number.isFinite(actorUserId) && actorUserId > 0) {
    merged.set("X-Actor-UserId", String(actorUserId));
  }

  if (Number.isFinite(workspaceId) && workspaceId > 0) {
    merged.set("X-Workspace-Id", String(workspaceId));
  }

  return merged;
};

export const apiFetch = (url, options) => {
  const nextOptions = options && typeof options === "object" ? { ...options } : {};
  nextOptions.headers = buildApiHeaders(nextOptions.headers);
  return fetch(url, nextOptions);
};

export const handleApiError = async (response, context) => {
  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }
  console.error(`${context} failed: ${response.status} ${response.statusText}`, details);
};

export const fetchJsonOrNull = async (url, context, options) => {
  let response = null;
  try {
    response = await apiFetch(url, options);
  } catch (error) {
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

export const withAccessQuery = (rawUrl, override) => {
  const context = override && typeof override === "object"
    ? override
    : (contextProvider() || {});

  const actorUserId = Number(context.actorUserId);
  const workspaceId = Number(context.workspaceId);

  if ((!Number.isFinite(actorUserId) || actorUserId <= 0)
    && (!Number.isFinite(workspaceId) || workspaceId <= 0)) {
    return rawUrl;
  }

  const url = new URL(rawUrl, window.location.origin);
  if (Number.isFinite(actorUserId) && actorUserId > 0) {
    url.searchParams.set("actorUserId", String(actorUserId));
  }
  if (Number.isFinite(workspaceId) && workspaceId > 0) {
    url.searchParams.set("workspaceId", String(workspaceId));
  }
  return url.toString();
};
