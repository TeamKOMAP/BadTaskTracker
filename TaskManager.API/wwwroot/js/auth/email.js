import { apiFetch, buildApiUrl, clearAccessToken } from "../shared/api.js?v=auth4";

const THEME_KEY = "gtt-theme";
const DEV_AUTH_CODE_KEY = "gtt-dev-auth-code";

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

const clearDevelopmentCode = () => {
  try {
    sessionStorage.removeItem(DEV_AUTH_CODE_KEY);
  } catch {
    // ignore
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

const emailForm = document.getElementById("email-form");
const emailInput = document.getElementById("email");
const emailAlert = document.getElementById("email-alert");
const confirmEmailBtn = document.getElementById("confirm-email");

const setAlert = (message) => {
  if (!emailAlert) return;
  const text = String(message || "").trim();
  if (!text) {
    emailAlert.textContent = "";
    emailAlert.setAttribute("hidden", "");
    return;
  }

  emailAlert.textContent = text;
  emailAlert.removeAttribute("hidden");
};

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

if (emailInput) {
  emailInput.addEventListener("input", () => {
    emailInput.setCustomValidity("");
    setAlert("");
  });
}

clearAccessToken();
clearDevelopmentCode();

if (emailForm) {
  emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const email = String(emailInput?.value || "").trim().toLowerCase();
      if (!emailInput) return;
      emailInput.setCustomValidity("");
      setAlert("");

      if (!emailInput.checkValidity()) {
        emailForm.reportValidity();
        return;
      }

      if (!hasDotInDomain(email)) {
        emailInput.setCustomValidity("В домене после @ должна быть точка (например example.com)");
        emailForm.reportValidity();
        emailInput.focus();
        return;
      }

      if (confirmEmailBtn) {
        confirmEmailBtn.disabled = true;
        confirmEmailBtn.textContent = "Отправляем...";
      }

      let response = null;
      try {
        response = await apiFetch(buildApiUrl("/auth/email/request"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ email }),
          skipAuthRedirect: true
        });
      } catch {
        setAlert("Не удалось подключиться к серверу. Убедись, что API запущен и страница открыта по https.");
        return;
      } finally {
        if (confirmEmailBtn) {
          confirmEmailBtn.disabled = false;
          confirmEmailBtn.textContent = "Подтвердить";
        }
      }

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Не удалось отправить код. Попробуйте ещё раз.");
        setAlert(message);
        return;
      }

      let requestResult = null;
      try {
        requestResult = await response.json();
      } catch {
        requestResult = null;
      }

      const developmentCode = String(requestResult?.developmentCode || "").replace(/\D+/g, "").trim();
      if (developmentCode) {
        saveDevelopmentCode(email, developmentCode);
      }

      const params = new URLSearchParams(window.location.search);
      const returnUrl = String(params.get("returnUrl") || "").trim();
      const next = new URL("auth-code.html", window.location.href);
      next.searchParams.set("email", email);
      if (returnUrl) {
        next.searchParams.set("returnUrl", returnUrl);
      }
      window.location.href = `${next.pathname}${next.search}`;
    })();
  });
}
