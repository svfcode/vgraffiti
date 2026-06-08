import { drawArrow, drawSquareStroke } from "./inc/shapes";
import { projectStoredStroke } from "./inc/geo-stroke";
import { getStreetViewContext, getViewportMap } from "./inc/map-binding";
import { renderEraserStroke, renderStroke } from "./inc/stroke";
import { getMapViewportFrame } from "../lib/map-projection";
import { getDisplayStrokes } from "./handlers/2.6.5-handle-journeys";
import { projectStreetViewStroke } from "./inc/sv-stroke";
import { filledCanvases } from "./inc/memory-types";
import { getMemoryViewportFrame } from "./inc/view-memory";
import {
  renderWallCanvasFrame,
  renderWallCanvasStrokes,
  renderWallRectPreview,
  wallCanvasOffsetPx,
  wallCanvasScreenRect,
} from "./inc/wall-canvas";
import type { DrawingOverlayHost, StoredStroke } from "./2.1-overlay-types";
import type { WallCanvas } from "./inc/memory-types";
import type { StreetViewContext } from "../lib/streetview-context";
import type { ViewportFrame } from "../lib/map-projection";

export function scheduleRedraw(host: DrawingOverlayHost): void {
  cancelAnimationFrame(host.raf);
  host.raf = requestAnimationFrame(() => {
    redraw(host);
  });
}

function renderSvStrokesClipped(
  ctx: CanvasRenderingContext2D,
  strokes: StoredStroke[],
  sv: StreetViewContext,
  wc: Pick<WallCanvas, "u" | "v" | "w" | "h" | "offsetU" | "offsetV">,
  canvas: HTMLCanvasElement,
  mapFrame: ViewportFrame,
  memFrame: ViewportFrame,
): void {
  const screen = wallCanvasScreenRect(wc, canvas, memFrame);
  const { dx, dy } = wallCanvasOffsetPx(wc, canvas, memFrame);
  ctx.save();
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, screen.w, screen.h);
  ctx.clip();
  if (dx !== 0 || dy !== 0) {
    ctx.translate(dx, dy);
  }
  for (const s of strokes) {
    const projected = projectStreetViewStroke(s, sv, mapFrame);
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

function renderCurrentInWall(
  host: DrawingOverlayHost,
  ctx: CanvasRenderingContext2D,
  wc: WallCanvas,
  memFrame: ViewportFrame,
): void {
  if (!host.current) {
    return;
  }
  const screen = wallCanvasScreenRect(wc, host.canvas, memFrame);
  const { dx, dy } = wallCanvasOffsetPx(wc, host.canvas, memFrame);
  const cur = host.current;
  ctx.save();
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, screen.w, screen.h);
  ctx.clip();
  if (dx !== 0 || dy !== 0) {
    ctx.translate(dx, dy);
  }
  if (cur.tool === "brush") {
    renderStroke(ctx, cur.points, { color: host.fgColor, size: host.getBrushSize() });
  } else if (cur.tool === "eraser") {
    renderEraserStroke(ctx, cur.points, host.getEraserSize());
  } else if (cur.tool === "arrow") {
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([5, 5]);
    drawArrow(ctx, cur.x0, cur.y0, cur.x1, cur.y1, host.fgColor, host.getBrushSize());
  } else {
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([5, 5]);
    drawSquareStroke(ctx, cur.x0, cur.y0, cur.x1, cur.y1, host.fgColor, host.getBrushSize());
  }
  ctx.restore();
}

export function redraw(host: DrawingOverlayHost): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const c = host.ctx;
  c.clearRect(0, 0, w, h);

  const map = getViewportMap(host);
  const sv = host.viewportMode === "streetview" ? getStreetViewContext(host) : null;
  const frame = getMapViewportFrame();
  const memFrame = getMemoryViewportFrame();

  if (host.viewportMode === "streetview" && sv) {
    if (host.unfoldLocationId) {
      const loc = host.memories.find((m) => m.id === host.unfoldLocationId);
      const filled = loc ? filledCanvases(loc) : [];
      const wc = filled[host.unfoldCanvasIndex] ?? filled[0];
      if (wc) {
        renderWallCanvasFrame(c, wc, host.canvas, memFrame, {
          fill: "rgba(255, 250, 230, 0.88)",
        });
        renderWallCanvasStrokes(c, wc, sv, host.canvas, frame, memFrame);
      }
    }

    if (host.activeWallCanvas) {
      renderWallCanvasFrame(c, host.activeWallCanvas, host.canvas, memFrame, {
        fill: "rgba(255, 250, 230, 0.75)",
        label: "Холст на стене",
      });
      renderSvStrokesClipped(c, host.strokes, sv, host.activeWallCanvas, host.canvas, frame, memFrame);
      renderCurrentInWall(host, c, host.activeWallCanvas, memFrame);
    }

    if (host.wallCanvasDraftRect) {
      renderWallRectPreview(c, host.wallCanvasDraftRect, host.canvas, memFrame);
    }
  } else if (!host.mapNativeRender) {
    for (const s of getDisplayStrokes(host)) {
      const projected = map ? projectStoredStroke(s, map, frame) : null;
      if (!projected) {
        continue;
      }
      if (projected.kind === "brush") {
        renderStroke(c, projected.points, { color: projected.color, size: projected.size });
      } else if (projected.kind === "eraser") {
        renderEraserStroke(c, projected.points, projected.size);
      } else if (projected.kind === "arrow") {
        drawArrow(c, projected.x0, projected.y0, projected.x1, projected.y1, projected.color, projected.lw);
      } else {
        drawSquareStroke(c, projected.x0, projected.y0, projected.x1, projected.y1, projected.color, projected.lw);
      }
    }
  }

  if (host.uiMode === "wallCanvas" || host.viewportMode === "streetview") {
    return;
  }
  if (!host.current) {
    return;
  }
  const cur = host.current;
  if (cur.tool === "brush") {
    renderStroke(c, cur.points, { color: host.fgColor, size: host.getBrushSize() });
  } else if (cur.tool === "eraser") {
    renderEraserStroke(c, cur.points, host.getEraserSize());
  } else if (cur.tool === "arrow") {
    c.save();
    c.globalAlpha = 0.45;
    c.setLineDash([5, 5]);
    drawArrow(c, cur.x0, cur.y0, cur.x1, cur.y1, host.fgColor, host.getBrushSize());
    c.restore();
  } else {
    c.save();
    c.globalAlpha = 0.45;
    c.setLineDash([5, 5]);
    drawSquareStroke(c, cur.x0, cur.y0, cur.x1, cur.y1, host.fgColor, host.getBrushSize());
    c.restore();
  }
}
