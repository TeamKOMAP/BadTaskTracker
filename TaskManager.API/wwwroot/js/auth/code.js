const THEME_KEY = "gtt-theme";

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
const rawEmail = String(params.get("email") || "").trim();

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

if (!rawEmail) {
  setEmailValidationMessage("Почта не указана. Вернитесь назад и введите адрес.");
} else if (!rawEmail.includes("@")) {
  setEmailValidationMessage("В адресе должна быть @.");
} else if (!hasDotInDomain(rawEmail)) {
  setEmailValidationMessage("В домене после @ должна быть точка (например example.com).");
} else {
  setEmailValidationMessage("");
}

const emailValueEl = document.getElementById("email-value");
if (emailValueEl) {
  emailValueEl.textContent = rawEmail || "—";
}

const timerEl = document.getElementById("timer");
const resendBtn = document.getElementById("resend");

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

startTimer(60);

if (resendBtn) {
  resendBtn.addEventListener("click", () => {
    if (resendBtn.disabled) return;
    if (Date.now() < endsAt) return;
    startTimer(60);
  });
}
