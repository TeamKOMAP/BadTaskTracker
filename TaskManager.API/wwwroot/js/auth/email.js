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

const emailForm = document.getElementById("email-form");
const emailInput = document.getElementById("email");

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

if (emailInput) {
  emailInput.addEventListener("input", () => {
    emailInput.setCustomValidity("");
  });
}

if (emailForm) {
  emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = String(emailInput?.value || "").trim();
    if (!emailInput) return;
    emailInput.setCustomValidity("");

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

    const nextUrl = `auth-code.html?email=${encodeURIComponent(email)}`;
    window.location.href = nextUrl;
  });
}
