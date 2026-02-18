import { apiFetch, buildApiUrl, clearAccessToken } from "../shared/api.js?v=auth5";
import {
  getPreferredTheme,
  setTheme,
  toggleTheme,
  hasDotInDomain,
  parseApiErrorMessage,
  saveDevelopmentCode,
  clearDevelopmentCode
} from "../shared/auth-utils.js?v=auth1";

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
        const message = await parseApiErrorMessage(response, "Не удалось отправить код. Попробуйте ещё раз.");
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
      const resendAfterSeconds = Number(requestResult?.resendAfterSeconds);
      if (Number.isFinite(resendAfterSeconds) && resendAfterSeconds > 0) {
        next.searchParams.set("resendAfterSeconds", String(Math.ceil(resendAfterSeconds)));
      }
      if (returnUrl) {
        next.searchParams.set("returnUrl", returnUrl);
      }
      window.location.href = `${next.pathname}${next.search}`;
    })();
  });
}
