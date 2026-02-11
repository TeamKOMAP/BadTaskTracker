export const normalizeToken = (value) => String(value || "").trim();

export const normalizeEmail = (value) => {
  const raw = normalizeToken(value);
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  return `${raw.toLowerCase()}@goodtask.com`;
};

export const toWorkspaceRole = (value) => {
  const token = normalizeToken(value);
  if (token === "3" || token.toLowerCase() === "owner") return "Owner";
  if (token === "2" || token.toLowerCase() === "admin") return "Admin";
  return "Member";
};

export const toInitials = (name, fallback) => {
  const source = normalizeToken(name) || normalizeToken(fallback) || "GT";
  const tokens = source
    .split(/[\s@._-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!tokens.length) return "GT";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
};

export const pad2 = (value) => String(value).padStart(2, "0");

export const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
