import { apiFetch, buildApiUrl, setAccessToken } from "../shared/api.js?v=auth5";
import {
  getPreferredTheme,
  setTheme,
  toggleTheme,
  hasDotInDomain,
  parseApiErrorMessage,
  clearDevelopmentCode,
  saveDevelopmentCode,
  getDevelopmentCodeForEmail
} from "../shared/auth-utils.js?v=auth1";

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
const initialResendAfterSeconds = Number(params.get("resendAfterSeconds") || "");

const emailValidationEl = document.getElementById("email-validation");
const codeAlertEl = document.getElementById("code-alert");
const emailValueEl = document.getElementById("email-value");
const changeEmailLink = document.getElementById("change-email");
const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code");
const confirmCodeBtn = document.getElementById("confirm-code");
const timerEl = document.getElementById("timer");
const resendBtn = document.getElementById("resend");

if (changeEmailLink) {
  const next = new URL("auth-email.html", window.location.href);
  if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
    next.searchParams.set("returnUrl", returnUrl);
  }
  changeEmailLink.href = `${next.pathname}${next.search}`;
}

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
    // Keep timer space but hide the countdown visually
    if (timerEl) timerEl.style.visibility = "hidden";
    if (resendBtn) {
      resendBtn.disabled = false;
      resendBtn.setAttribute("aria-disabled", "false");
      resendBtn.classList.remove("is-disabled");
    }
    if (timerHandle) {
      window.clearInterval(timerHandle);
      timerHandle = null;
    }
    return;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (timerEl) {
    timerEl.style.visibility = "visible"; // ensure timer is visible while counting
    timerEl.textContent = `${pad2(minutes)}:${pad2(seconds)}`;
  }
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.setAttribute("aria-disabled", "true");
    resendBtn.classList.add("is-disabled");
  }
};

const startTimer = (seconds) => {
  const total = Number(seconds);
  endsAt = Date.now() + (Number.isFinite(total) && total > 0 ? total : 60) * 1000;

  if (timerHandle) {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }

  // Ensure timer is visible when starting
  if (timerEl) timerEl.style.visibility = "visible";
  renderTimer();
  timerHandle = window.setInterval(renderTimer, 1000);
};

const requestCode = async () => {
  let response = null;
  try {
    response = await apiFetch(buildApiUrl("/auth/email/request"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email: rawEmail }),
      skipAuthRedirect: true
    });
  } catch {
    setCodeAlert("Не удалось подключиться к серверу. Убедись, что API запущен и страница открыта по https.");
    return null;
  }

  if (!response.ok) {
    const message = await parseApiErrorMessage(response, "Не удалось отправить код. Попробуйте позже.");
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
  let response = null;
  try {
    response = await apiFetch(buildApiUrl("/auth/email/verify"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email: rawEmail, code }),
      skipAuthRedirect: true
    });
  } catch {
    setCodeAlert("Не удалось подключиться к серверу. Убедись, что API запущен и страница открыта по https.");
    return null;
  }

  if (!response.ok) {
    const message = await parseApiErrorMessage(response, "Неверный код или код истёк.");
    setCodeAlert(message);
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
};

const resolveBrowserTimeZoneId = () => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const token = String(zone || "").trim();
    return token || "UTC";
  } catch {
    return "UTC";
  }
};

const syncUserTimeZone = async () => {
  const timeZoneId = resolveBrowserTimeZoneId();

  try {
    const response = await apiFetch(buildApiUrl("/auth/timezone"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ timeZoneId })
    });

    if (!response.ok) {
      return;
    }

    try {
      await response.json();
    } catch {
      // ignore response parse errors for best-effort sync
    }
  } catch {
    // ignore timezone sync errors for best-effort login flow
  }
};

const initialCooldownSeconds = Number.isFinite(initialResendAfterSeconds) && initialResendAfterSeconds > 0
  ? initialResendAfterSeconds
  : 60;

startTimer(initialCooldownSeconds);

if (resendBtn) {
  resendBtn.addEventListener("click", () => {
    void (async () => {
      if (resendBtn.disabled) return;
      if (Date.now() < endsAt) return;
      setCodeAlert("");
      resendBtn.disabled = true;
      const result = await requestCode();
      // Determine next cooldown: prefer server-provided, fall back to 60s
      const provided = Number(result?.resendAfterSeconds);
      const nextSeconds = Number.isFinite(provided) && provided > 0 ? provided : 60;
      // Start the cooldown regardless of server response
      startTimer(nextSeconds);
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

      if (confirmCodeBtn) {
        confirmCodeBtn.disabled = true;
        confirmCodeBtn.textContent = "Проверяем...";
      }
      setCodeAlert("");

      let auth = null;
      try {
        auth = await verifyCode(code);
      } finally {
        if (confirmCodeBtn) {
          confirmCodeBtn.disabled = false;
          confirmCodeBtn.textContent = "Войти";
        }
      }

      const token = String(auth?.accessToken || "").trim();
      if (!token) {
        setCodeAlert("Не удалось завершить вход. Попробуйте снова.");
        return;
      }

      setAccessToken(token);
      clearDevelopmentCode();
      await syncUserTimeZone();

      if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
        window.location.href = returnUrl;
        return;
      }

      window.location.href = "index.html";
    })();
  });
}
