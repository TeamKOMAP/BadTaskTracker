import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");

const domPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "js", "workspace", "dom.js");
const htmlPath = path.join(repoRoot, "TaskManager.API", "wwwroot", "workspace.html");

const [domSource, htmlSource] = await Promise.all([
  fs.readFile(domPath, "utf8"),
  fs.readFile(htmlPath, "utf8")
]);

const referencedIds = new Set();
const domIdRegex = /getElementById\(\s*["']([^"']+)["']\s*\)/g;
for (const match of domSource.matchAll(domIdRegex)) {
  const id = String(match[1] || "").trim();
  if (id) {
    referencedIds.add(id);
  }
}

const htmlIds = new Set();
const duplicateIds = new Set();
const htmlIdRegex = /\sid=["']([^"']+)["']/g;
for (const match of htmlSource.matchAll(htmlIdRegex)) {
  const id = String(match[1] || "").trim();
  if (!id) continue;
  if (htmlIds.has(id)) {
    duplicateIds.add(id);
  }
  htmlIds.add(id);
}

const missingIds = Array.from(referencedIds).filter((id) => !htmlIds.has(id)).sort((a, b) => a.localeCompare(b));
const duplicateIdList = Array.from(duplicateIds).sort((a, b) => a.localeCompare(b));

if (missingIds.length || duplicateIdList.length) {
  console.error("[dom-id-check] FAILED");
  if (missingIds.length) {
    console.error(`- Missing ids in workspace.html (${missingIds.length}):`);
    missingIds.forEach((id) => {
      console.error(`  - ${id}`);
    });
  }
  if (duplicateIdList.length) {
    console.error(`- Duplicate ids in workspace.html (${duplicateIdList.length}):`);
    duplicateIdList.forEach((id) => {
      console.error(`  - ${id}`);
    });
  }
  process.exit(1);
}

console.log(`[dom-id-check] OK: ${referencedIds.size} DOM id references are valid.`);
