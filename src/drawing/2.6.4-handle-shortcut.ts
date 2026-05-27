import { isEditableKeyTarget, type DrawingOverlayHost } from "./2.1-overlay-types";

export function bindShortcutEvents(host: DrawingOverlayHost): void {
  window.addEventListener("keydown", (e) => onWindowKeyDown(host, e), true);
}

function onWindowKeyDown(host: DrawingOverlayHost, e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    return;
  }
  if (isEditableKeyTarget(e.target)) {
    return;
  }
  const k = e.key.toLowerCase();
  if (k === "z" && e.shiftKey) {
    host.performRedo();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (k === "z" && !e.shiftKey) {
    host.performUndo();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (k === "x" && !e.shiftKey) {
    host.swapFgBgColors();
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (k === "q" && !e.shiftKey) {
    host.cycleToolForward();
    e.preventDefault();
    e.stopPropagation();
  }
}
