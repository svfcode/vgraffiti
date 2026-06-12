import { coalescedOrSelf, pointFromEvent } from "../inc/stroke";
import { xyCanvas, type DrawingOverlayHost } from "../2.1-overlay-types";

export type CanvasElements = {
  canvas: HTMLCanvasElement;
  sizeCursorEl: HTMLDivElement;
  svMinimapWrap: HTMLDivElement;
  svMinimapCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  svMinimapCtx: CanvasRenderingContext2D;
};

export function createCanvas(root: HTMLDivElement, bar: HTMLDivElement): CanvasElements {
  const canvas = document.createElement("canvas");
  canvas.className = "layer";

  const sizeCursorEl = document.createElement("div");
  sizeCursorEl.className = "size-cursor";
  sizeCursorEl.hidden = true;

  const svMinimapWrap = document.createElement("div");
  svMinimapWrap.className = "sv-minimap-wrap";
  svMinimapWrap.hidden = true;
  svMinimapWrap.title = "Рисунки прогулки — направление от вас";

  const svMinimapCanvas = document.createElement("canvas");
  svMinimapCanvas.className = "sv-minimap";
  svMinimapWrap.appendChild(svMinimapCanvas);

  root.appendChild(canvas);
  root.appendChild(bar);
  root.appendChild(svMinimapWrap);
  root.appendChild(sizeCursorEl);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("DrawingOverlay: 2d context unavailable");
  }
  const svMinimapCtx = svMinimapCanvas.getContext("2d");
  if (!svMinimapCtx) {
    throw new Error("DrawingOverlay: minimap 2d context unavailable");
  }

  return { canvas, sizeCursorEl, svMinimapWrap, svMinimapCanvas, ctx, svMinimapCtx };
}

export function bindCanvasEvents(host: DrawingOverlayHost): void {
  host.canvas.addEventListener("pointerdown", (ev) => onCanvasPointerDown(host, ev));
  host.canvas.addEventListener("pointermove", (ev) => onCanvasPointerMove(host, ev));
  host.canvas.addEventListener("pointerenter", (ev) => onCanvasPointerEnter(host, ev));
  host.canvas.addEventListener("pointerleave", () => onCanvasPointerLeave(host));
  host.canvas.addEventListener("pointerup", (ev) => onCanvasPointerUp(host, ev));
  host.canvas.addEventListener("pointercancel", (ev) => onCanvasPointerUp(host, ev));
  window.addEventListener("resize", () => {
    resizeCanvas(host);
    host.scheduleRedraw();
  });
}

export function resizeCanvas(host: DrawingOverlayHost): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = host.canvas;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  host.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  host.scheduleRedraw();
}

function onCanvasPointerDown(host: DrawingOverlayHost, ev: PointerEvent): void {
  if (ev.button !== 0 || host.uiMode !== "draw") {
    return;
  }
  const { x, y } = xyCanvas(ev, host.canvas);

  ev.preventDefault();
  host.isDrawing = true;
  host.activePointerId = ev.pointerId;
  host.canvas.setPointerCapture(ev.pointerId);
  window.addEventListener("pointerup", host.onGlobalPointerUp, true);

  if (host.activeTool === "brush") {
    host.current = { tool: "brush", points: [pointFromEvent(ev, host.canvas)] };
  } else if (host.activeTool === "eraser") {
    host.current = { tool: "eraser", points: [pointFromEvent(ev, host.canvas)] };
  } else if (host.activeTool === "arrow") {
    host.current = { tool: "arrow", x0: x, y0: y, x1: x, y1: y };
  } else {
    host.current = { tool: "square", x0: x, y0: y, x1: x, y1: y };
  }
  host.scheduleRedraw();
  host.lastHoverClient.x = ev.clientX;
  host.lastHoverClient.y = ev.clientY;
  if (host.wantsSizeCursor()) {
    host.showSizeCursorAt(ev.clientX, ev.clientY);
  }
}

function onCanvasPointerMove(host: DrawingOverlayHost, ev: PointerEvent): void {
  host.lastHoverClient.x = ev.clientX;
  host.lastHoverClient.y = ev.clientY;

  if (host.wantsSizeCursor()) {
    host.showSizeCursorAt(ev.clientX, ev.clientY);
  } else {
    host.hideSizeCursor();
  }

  if (!host.isDrawing || !(ev.buttons & 1) || !host.current) {
    return;
  }
  if (ev.pointerId !== host.activePointerId) {
    return;
  }
  ev.preventDefault();
  const { x, y } = xyCanvas(ev, host.canvas);
  const cur = host.current;
  if (cur.tool === "brush" || cur.tool === "eraser") {
    for (const pe of coalescedOrSelf(ev)) {
      cur.points.push(pointFromEvent(pe, host.canvas));
    }
  } else {
    cur.x1 = x;
    cur.y1 = y;
  }
  host.scheduleRedraw();
}

function onCanvasPointerUp(host: DrawingOverlayHost, ev: PointerEvent): void {
  host.finishStroke(ev);
}

function onCanvasPointerEnter(host: DrawingOverlayHost, ev: PointerEvent): void {
  host.lastHoverClient.x = ev.clientX;
  host.lastHoverClient.y = ev.clientY;
  if (host.wantsSizeCursor()) {
    host.showSizeCursorAt(ev.clientX, ev.clientY);
  }
}

function onCanvasPointerLeave(host: DrawingOverlayHost): void {
  if (!host.isDrawing) {
    host.hideSizeCursor();
  }
}
