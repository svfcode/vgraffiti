import type { StreetViewContext } from "../../lib/streetview-context";
import type { ViewportFrame } from "../../lib/map-projection";
import type { WallCanvas } from "./memory-types";
import { projectStreetViewStroke } from "./sv-stroke";
import { drawArrow, drawSquareStroke } from "./shapes";
import { renderEraserStroke, renderStroke } from "./stroke";
import { normToCanvas } from "./view-memory";

export type WallCanvasRect = { u0: number; v0: number; u1: number; v1: number };

export function normalizeWallRect(r: WallCanvasRect): { u: number; v: number; w: number; h: number } {
  const u = Math.min(r.u0, r.u1);
  const v = Math.min(r.v0, r.v1);
  const w = Math.max(0.02, Math.abs(r.u1 - r.u0));
  const h = Math.max(0.02, Math.abs(r.v1 - r.v0));
  return { u, v, w, h };
}

export function wallCanvasScreenRect(
  wc: Pick<WallCanvas, "u" | "v" | "w" | "h" | "offsetU" | "offsetV">,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame,
): { x: number; y: number; w: number; h: number } {
  const ou = wc.offsetU ?? 0;
  const ov = wc.offsetV ?? 0;
  const tl = normToCanvas(wc.u + ou, wc.v + ov, canvas, frame);
  const br = normToCanvas(wc.u + ou + wc.w, wc.v + ov + wc.h, canvas, frame);
  return {
    x: tl.x,
    y: tl.y,
    w: br.x - tl.x,
    h: br.y - tl.y,
  };
}

export function isPointInWallRect(
  x: number,
  y: number,
  wc: Pick<WallCanvas, "u" | "v" | "w" | "h" | "offsetU" | "offsetV">,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame,
): boolean {
  const r = wallCanvasScreenRect(wc, canvas, frame);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function renderWallCanvasFrame(
  ctx: CanvasRenderingContext2D,
  wc: Pick<WallCanvas, "u" | "v" | "w" | "h" | "offsetU" | "offsetV">,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame,
  options?: { label?: string; dashed?: boolean; fill?: string },
): void {
  const r = wallCanvasScreenRect(wc, canvas, frame);
  ctx.save();
  if (options?.fill) {
    ctx.fillStyle = options.fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.strokeStyle = options?.dashed ? "rgba(255, 214, 102, 0.95)" : "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  if (options?.dashed) {
    ctx.setLineDash([6, 4]);
  }
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  if (options?.label) {
    ctx.fillStyle = "rgba(255, 214, 102, 0.95)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(options.label, r.x + 4, r.y - 4);
  }
  ctx.restore();
}

export function renderWallCanvasStrokes(
  ctx: CanvasRenderingContext2D,
  wc: WallCanvas,
  cam: StreetViewContext,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame,
): void {
  const screen = wallCanvasScreenRect(wc, canvas, frame);
  ctx.save();
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, screen.w, screen.h);
  ctx.clip();
  for (const s of wc.strokes) {
    const projected = projectStreetViewStroke(s, cam, frame);
    if (!projected) {
      continue;
    }
    if (projected.kind === "brush") {
      renderStroke(ctx, projected.points, { color: projected.color, size: projected.size });
    } else if (projected.kind === "eraser") {
      renderEraserStroke(ctx, projected.points, projected.size);
    } else if (projected.kind === "arrow") {
      drawArrow(ctx, projected.x0, projected.y0, projected.x1, projected.y1, projected.color, projected.lw);
    } else {
      drawSquareStroke(ctx, projected.x0, projected.y0, projected.x1, projected.y1, projected.color, projected.lw);
    }
  }
  ctx.restore();
}

export function renderWallRectPreview(
  ctx: CanvasRenderingContext2D,
  rect: WallCanvasRect,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame,
): void {
  const { u, v, w, h } = normalizeWallRect(rect);
  renderWallCanvasFrame(ctx, { u, v, w, h, offsetU: 0, offsetV: 0 }, canvas, frame, {
    dashed: true,
    fill: "rgba(255, 214, 102, 0.12)",
    label: "Холст",
  });
}
