export const CHAT_RAIL_MIN_WIDTH = 92;
export const CHAT_RAIL_MAX_WIDTH = 345;
export const CHAT_RAIL_DEFAULT_WIDTH = 345;
export const CHAT_RAIL_EXPANDED_THRESHOLD = 225;

const CHAT_RAIL_WIDTH_STORAGE_KEY = "gtt-chat-rail-width-v2";

export const clampChatRailWidth = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return CHAT_RAIL_DEFAULT_WIDTH;
  }

  return Math.max(CHAT_RAIL_MIN_WIDTH, Math.min(CHAT_RAIL_MAX_WIDTH, Math.round(raw)));
};

export const isChatRailExpanded = (width) => {
  return clampChatRailWidth(width) >= CHAT_RAIL_EXPANDED_THRESHOLD;
};

export const readStoredChatRailWidth = () => {
  try {
    const raw = localStorage.getItem(CHAT_RAIL_WIDTH_STORAGE_KEY);
    return clampChatRailWidth(raw);
  } catch {
    return CHAT_RAIL_DEFAULT_WIDTH;
  }
};

export const storeChatRailWidth = (width) => {
  try {
    localStorage.setItem(CHAT_RAIL_WIDTH_STORAGE_KEY, String(clampChatRailWidth(width)));
  } catch {
    // ignore write failures
  }
};
