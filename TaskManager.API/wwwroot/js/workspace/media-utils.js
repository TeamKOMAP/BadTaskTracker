import { normalizeToken } from "../shared/utils.js";

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("File read failed"));
  reader.readAsDataURL(file);
});

export const optimizeImageForStorage = async (file) => {
  if (!file) return "";
  const type = normalizeToken(file.type).toLowerCase();
  if (!type.startsWith("image/") || typeof document === "undefined") {
    return readFileAsDataUrl(file);
  }

  const fallback = () => readFileAsDataUrl(file);
  if (typeof window.createImageBitmap !== "function") {
    return fallback();
  }

  try {
    const bitmap = await window.createImageBitmap(file);
    const width = Number(bitmap.width) || 0;
    const height = Number(bitmap.height) || 0;
    if (width <= 0 || height <= 0) {
      bitmap.close?.();
      return fallback();
    }

    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) {
      bitmap.close?.();
      return fallback();
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const outputType = scale < 1 ? "image/jpeg" : (type === "image/png" ? "image/png" : "image/jpeg");
    return outputType === "image/jpeg"
      ? canvas.toDataURL(outputType, 0.82)
      : canvas.toDataURL(outputType);
  } catch {
    return fallback();
  }
};

export const runWhenIdle = (callback) => {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 400 });
  }
  return window.setTimeout(callback, 80);
};
