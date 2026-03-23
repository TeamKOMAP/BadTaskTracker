import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");

const workspaceHtmlPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "workspace.html");
const workspaceMainPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "js", "workspace", "main.js");
const chatControllerPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "js", "chat", "controller.js");
const workspaceCssPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "css", "workspace.css");
const chatCssPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "css", "chat.css");

const [htmlSource, mainSource, chatControllerSource, workspaceCss, chatCss] = await Promise.all([
  fs.readFile(workspaceHtmlPath, "utf8"),
  fs.readFile(workspaceMainPath, "utf8"),
  fs.readFile(chatControllerPath, "utf8"),
  fs.readFile(workspaceCssPath, "utf8"),
  fs.readFile(chatCssPath, "utf8")
]);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const htmlIds = new Set();
const idRegex = /\sid=["']([^"']+)["']/g;
for (const match of htmlSource.matchAll(idRegex)) {
  const id = String(match[1] || "").trim();
  if (id) {
    htmlIds.add(id);
  }
}

const requiredIds = [
  "app-shell",
  "workspace-body",
  "workspace-content",
  "workspace-main",
  "chat-rail",
  "chat-home-btn",
  "chat-shell",
  "chat-shell-feed",
  "chat-shell-messages",
  "chat-shell-input",
  "chat-shell-send",
  "chat-shell-settings-btn",
  "chat-shell-load-more",
  "chat-shell-voice-status"
];

const missingIds = requiredIds.filter((id) => !htmlIds.has(id));
assert(missingIds.length === 0, `Missing required workspace/chat ids: ${missingIds.join(", ")}`);

assert(mainSource.includes("createWorkspaceChatBridge"), "Chat bridge is not wired in workspace/main.js");
assert(mainSource.includes("workspaceContent.classList.toggle(\"is-chat-active\", showChat)"), "workspace-content chat toggle is missing");
assert(mainSource.includes("workspaceMain.classList.toggle(\"is-chat-active\", showChat)"), "workspace-main chat toggle is missing");
assert(mainSource.includes("appShell.classList.toggle(\"is-chat-active\", showChat)"), "app-shell chat toggle is missing");
assert(mainSource.includes("appShell.classList.toggle(\"is-panel-open\", open)"), "drawer panel toggle is missing");

assert(/\.topbar\s*,\s*\.workspace-body\s*\{/.test(workspaceCss), "Compression rule for .topbar and .workspace-body is missing");

assert(!workspaceCss.includes(".chat-shell-header"), "workspace.css still contains chat detail styles");
assert(!workspaceCss.includes(".chat-msg-row"), "workspace.css still contains chat message styles");

assert(chatCss.includes(".chat-shell-header"), "chat.css is missing chat-shell header styles");
assert(chatCss.includes(".chat-msg-row"), "chat.css is missing chat message layout styles");
assert(chatCss.includes(".chat-shell-window-marker"), "chat.css is missing message window marker styles");
assert(chatCss.includes(".chat-rail.is-docked-tabs"), "chat.css is missing docked tabs rail mode styles");
assert(chatCss.includes(".chat-rail-tab-icon"), "chat.css is missing chat folder icon styles");
assert(chatCss.includes(".chat-rail.is-docked-tabs .chat-rail-divider"), "chat.css is missing divider rule for docked tabs mode");
assert(chatCss.includes("grid-auto-rows: 1fr;"), "chat.css is missing equal-height rows for docked folder tabs");
assert(chatCss.includes(".chat-rail.is-docked-tabs .chat-rail-home"), "chat.css is missing full-width home button rule in docked mode");
assert(chatCss.includes(".chat-rail.is-docked-tabs .chat-rail-tab.is-active"), "chat.css is missing selected state for docked chat folders");
assert(chatCss.includes(".chat-rail.is-avatar-only .chat-rail-meta"), "chat.css is missing avatar-only compact chat list mode");

assert(chatControllerSource.includes("CHAT_MESSAGE_WINDOW_SIZE"), "chat/controller.js is missing message window constant");
assert(chatControllerSource.includes("scheduleRenderMessages"), "chat/controller.js is missing render scheduling");
assert(chatControllerSource.includes("expandMessageWindowForActiveChat"), "chat/controller.js is missing message window expansion");
assert(chatControllerSource.includes("if (expandMessageWindowForActiveChat())"), "scroll handler does not expand local message window");
assert(chatControllerSource.includes("is-docked-tabs"), "chat/controller.js does not switch rail to docked tabs mode");
assert(chatControllerSource.includes("classList.remove(\"is-icons-only\")"), "chat/controller.js should remove legacy icons-only auto mode");
assert(chatControllerSource.includes("const dockedTabs = true"), "chat/controller.js should keep tabs docked for all rail widths");
assert(chatControllerSource.includes("CHAT_RAIL_AVATAR_ONLY_THRESHOLD"), "chat/controller.js is missing avatar-only threshold for collapsed rail");

console.log("[workspace-smoke] OK: drawer/chat contracts are valid.");
