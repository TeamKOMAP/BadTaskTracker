import { apiFetch, buildApiUrl, setAccessToken } from "../shared/api.js?v=auth2";

const THEME_KEY = "gtt-theme";
const DEV_AUTH_CODE_KEY = "gtt-dev-auth-code";

const clearDevelopmentCode = () => {
  try {
    sessionStorage.removeItem(DEV_AUTH_CODE_KEY);
  } catch {
    // ignore
  }
};

const saveDevelopmentCode = (email, code) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").replace(/\D+/g, "").trim();
  try {
    if (!normalizedEmail || !normalizedCode) {
      sessionStorage.removeItem(DEV_AUTH_CODE_KEY);
      return;
    }

    sessionStorage.setItem(DEV_AUTH_CODE_KEY, JSON.stringify({
      email: normalizedEmail,
      code: normalizedCode
    }));
  } catch {
    // ignore
  }
};

const getDevelopmentCodeForEmail = (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return "";
  try {
    const raw = sessionStorage.getItem(DEV_AUTH_CODE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const storedEmail = String(parsed?.email || "").trim().toLowerCase();
    const storedCode = String(parsed?.code || "").replace(/\D+/g, "").trim();
    if (storedEmail !== normalizedEmail) return "";
    return storedCode;
  } catch {
    return "";
  }
};

const getPreferredTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }

  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

const setTheme = (theme) => {
  const next = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore
  }
};

const toggleTheme = () => {
  const current = document.body.dataset.theme || "dark";
  setTheme(current === "dark" ? "light" : "dark");
};

setTheme(getPreferredTheme());

const themeToggleBtn = document.getElementById("theme-toggle");
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    toggleTheme();
  });
}

const params = new URLSearchParams(window.location.search);
const rawEmail = String(params.get("email") || "").trim().toLowerCase();
const returnUrl = String(params.get("returnUrl") || "").trim();

const hasDotInDomain = (email) => {
  const value = String(email || "").trim();
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1].trim();
  if (!domain) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
};

const emailValidationEl = document.getElementById("email-validation");
const codeAlertEl = document.getElementById("code-alert");
const emailValueEl = document.getElementById("email-value");
const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code");
const confirmCodeBtn = document.getElementById("confirm-code");
const timerEl = document.getElementById("timer");
const resendBtn = document.getElementById("resend");

const applyDevelopmentCodeToInput = (code) => {
  const normalizedCode = String(code || "").replace(/\D+/g, "").trim();
  if (!normalizedCode || !codeInput) return;
  codeInput.value = normalizedCode;
};

const setEmailValidationMessage = (message) => {
  if (!emailValidationEl) return;
  const text = String(message || "").trim();
  if (!text) {
    emailValidationEl.setAttribute("hidden", "");
    emailValidationEl.textContent = "";
    return;
  }
  emailValidationEl.textContent = text;
  emailValidationEl.removeAttribute("hidden");
};

const setCodeAlert = (message) => {
  if (!codeAlertEl) return;
  const text = String(message || "").trim();
  if (!text) {
    codeAlertEl.setAttribute("hidden", "");
    codeAlertEl.textContent = "";
    return;
  }

  codeAlertEl.textContent = text;
  codeAlertEl.removeAttribute("hidden");
};

if (!rawEmail) {
  setEmailValidationMessage("Почта не указана. Вернитесь назад и введите адрес.");
} else if (!rawEmail.includes("@")) {
  setEmailValidationMessage("В адресе должна быть @.");
} else if (!hasDotInDomain(rawEmail)) {
  setEmailValidationMessage("В домене после @ должна быть точка (например example.com).");
} else {
  setEmailValidationMessage("");
}

if (emailValueEl) {
  emailValueEl.textContent = rawEmail || "-";
}

applyDevelopmentCodeToInput(getDevelopmentCodeForEmail(rawEmail));

let timerHandle = null;
let endsAt = 0;

const pad2 = (value) => String(value).padStart(2, "0");

const renderTimer = () => {
  const remainingMs = Math.max(0, endsAt - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);

  if (totalSeconds <= 0) {
    if (timerEl) timerEl.textContent = "00:00";
    if (resendBtn) resendBtn.disabled = false;
    if (timerHandle) {
      window.clearInterval(timerHandle);
      timerHandle = null;
    }
    return;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (timerEl) timerEl.textContent = `${pad2(minutes)}:${pad2(seconds)}`;
  if (resendBtn) resendBtn.disabled = true;
};

const startTimer = (seconds) => {
  const total = Number(seconds);
  endsAt = Date.now() + (Number.isFinite(total) && total > 0 ? total : 60) * 1000;

  if (timerHandle) {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }

  renderTimer();
  timerHandle = window.setInterval(renderTimer, 250);
};

const parseErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    const message = String(data?.error || data?.title || "").trim();
    if (message) return message;
  } catch {
    // ignore
  }
  return fallback;
};

const requestCode = async () => {
  const response = await apiFetch(buildApiUrl("/auth/email/request"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ email: rawEmail }),
    skipAuthRedirect: true
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response, "Не удалось отправить код. Попробуйте позже.");
    setCodeAlert(message);
    return null;
  }

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  const developmentCode = String(result?.developmentCode || "").replace(/\D+/g, "").trim();
  if (developmentCode) {
    saveDevelopmentCode(rawEmail, developmentCode);
    applyDevelopmentCodeToInput(developmentCode);
  }

  return result;
};

const verifyCode = async (code) => {
  const response = await apiFetch(buildApiUrl("/auth/email/verify"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ email: rawEmail, code }),
    skipAuthRedirect: true
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response, "Неверный код или код истёк.");
    setCodeAlert(message);
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
};

startTimer(60);

if (resendBtn) {
  resendBtn.addEventListener("click", () => {
    void (async () => {
      if (resendBtn.disabled) return;
      if (Date.now() < endsAt) return;
      setCodeAlert("");
      resendBtn.disabled = true;
      const result = await requestCode();
      const seconds = Number(result?.resendAfterSeconds || 60);
      startTimer(seconds);
    })();
  });
}

if (codeInput) {
  codeInput.addEventListener("input", () => {
    const digitsOnly = String(codeInput.value || "").replace(/\D+/g, "");
    if (digitsOnly !== codeInput.value) {
      codeInput.value = digitsOnly;
    }
    setCodeAlert("");
  });
}

if (codeForm) {
  codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      if (!rawEmail || !hasDotInDomain(rawEmail)) {
        setCodeAlert("Неверный email. Вернитесь на предыдущий шаг.");
        return;
      }

      const code = String(codeInput?.value || "").replace(/\D+/g, "").trim();
      if (!code || code.length < 4) {
        setCodeAlert("Введите корректный код из письма.");
        codeInput?.focus();
        return;
      }

      if (confirmCodeBtn) confirmCodeBtn.disabled = true;
      setCodeAlert("");

      const auth = await verifyCode(code);

      if (confirmCodeBtn) confirmCodeBtn.disabled = false;

      const token = String(auth?.accessToken || "").trim();
      if (!token) {
        setCodeAlert("Не удалось завершить вход. Попробуйте снова.");
        return;
      }

      setAccessToken(token);
      clearDevelopmentCode();

      if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
        window.location.href = returnUrl;
        return;
      }

      window.location.href = "index.html";
    })();
  });
}
