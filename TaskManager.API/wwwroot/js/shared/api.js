const ACCESS_TOKEN_KEY = "gtt-access-token";

const resolveApiBase = () => {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = String(params.get("api") ?? "").trim();
  if (fromQuery) {
    return fromQuery.endsWith("/api") ? fromQuery : `${fromQuery.replace(/\/$/, "")}/api`;
  }

  return "/api";
};

export const API_BASE = resolveApiBase();

export const getAccessToken = () => {
  try {
    return String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
};

export const hasAccessToken = () => {
  return !!getAccessToken();
};

export const setAccessToken = (token) => {
  const value = String(token || "").trim();
  try {
    if (!value) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    } else {
      localStorage.setItem(ACCESS_TOKEN_KEY, value);
    }
  } catch {
    // ignore
  }
};

export const clearAccessToken = () => {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore
  }
};

export const isAuthPage = () => {
  const path = String(window.location.pathname || "").toLowerCase();
  return path.endsWith("/auth-email.html") || path.endsWith("/auth-code.html");
};

export const redirectToAuthPage = () => {
  if (isAuthPage()) return;
  const returnUrl = `${window.location.pathname}${window.location.search}`;
  const nextUrl = `auth-email.html?returnUrl=${encodeURIComponent(returnUrl)}`;
  window.location.href = nextUrl;
};

export const ensureAuthOrRedirect = () => {
  if (hasAccessToken()) {
    return true;
  }
  redirectToAuthPage();
  return false;
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
  const token = getAccessToken();
  if (token) {
    merged.set("Authorization", `Bearer ${token}`);
  }
  return merged;
};

export const apiFetch = async (url, options) => {
  const nextOptions = options && typeof options === "object" ? { ...options } : {};
  nextOptions.headers = buildApiHeaders(nextOptions.headers);

  const response = await fetch(url, nextOptions);
  if (response.status === 401 && !nextOptions.skipAuthRedirect) {
    clearAccessToken();
    redirectToAuthPage();
  }

  return response;
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
