import type { DrawingOverlayHost } from "../2.1-overlay-types";

export function applyPanelOpacity(host: DrawingOverlayHost): void {
  const pct = Math.min(100, Math.max(25, Number(host.panelOpacityEl.value) || 100));
  host.bar.style.opacity = String(pct / 100);
}

export function applyBarPosition(host: DrawingOverlayHost): void {
  if (host.barLeftPx != null && host.barTopPx != null) {
    host.bar.style.left = `${host.barLeftPx}px`;
    host.bar.style.top = `${host.barTopPx}px`;
    host.bar.style.right = "auto";
  } else {
    host.bar.style.left = "auto";
    host.bar.style.top = "10px";
    host.bar.style.right = "10px";
  }
}

export function bindPanelMoveEvents(host: DrawingOverlayHost): void {
  host.panelOpacityEl.addEventListener("input", () => applyPanelOpacity(host));
  host.dragHandle.addEventListener("pointerdown", (e) => onDragPointerDown(host, e));
  host.dragHandle.addEventListener("pointermove", (e) => onDragPointerMove(host, e));
  host.dragHandle.addEventListener("pointerup", () => onDragPointerEnd(host));
  host.dragHandle.addEventListener("pointercancel", () => onDragPointerEnd(host));
}

function onDragPointerDown(host: DrawingOverlayHost, e: PointerEvent): void {
  e.stopPropagation();
  const br = host.bar.getBoundingClientRect();
  if (host.barLeftPx == null || host.barTopPx == null) {
    host.barLeftPx = br.left;
    host.barTopPx = br.top;
    applyBarPosition(host);
  }
  host.dragBar = {
    dx: e.clientX - (host.barLeftPx ?? br.left),
    dy: e.clientY - (host.barTopPx ?? br.top),
  };
  host.dragHandle.setPointerCapture(e.pointerId);
}

function onDragPointerMove(host: DrawingOverlayHost, e: PointerEvent): void {
  if (!host.dragBar) {
    return;
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const br = host.bar.getBoundingClientRect();
  let nx = e.clientX - host.dragBar.dx;
  let ny = e.clientY - host.dragBar.dy;
  nx = Math.max(4, Math.min(nx, vw - br.width - 4));
  ny = Math.max(4, Math.min(ny, vh - br.height - 4));
  host.barLeftPx = nx;
  host.barTopPx = ny;
  host.bar.style.left = `${nx}px`;
  host.bar.style.top = `${ny}px`;
  host.bar.style.right = "auto";
}

function onDragPointerEnd(host: DrawingOverlayHost): void {
  host.dragBar = null;
}
