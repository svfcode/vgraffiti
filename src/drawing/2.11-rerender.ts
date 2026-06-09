import { drawArrow, drawSquareStroke } from "./inc/shapes";
import { projectStoredStroke } from "./inc/geo-stroke";
import { getStreetViewContext, getViewportMap } from "./inc/map-binding";
import { renderEraserStroke, renderStroke } from "./inc/stroke";
import { getMapViewportFrame } from "../lib/map-projection";
import { getDisplayStrokes } from "./handlers/2.6.5-handle-journeys";
import { spotSignatureFromHref } from "../lib/streetview-context";
import { spotKeyFromSv } from "./inc/pano-types";
import type { DrawingOverlayHost, StoredStroke } from "./2.1-overlay-types";

/** Временный отладочный HUD для диагностики смены панорамы. */
const VGF_DEBUG_SV = true;

export function scheduleRedraw(host: DrawingOverlayHost): void {
  cancelAnimationFrame(host.raf);
  host.raf = requestAnimationFrame(() => {
    redraw(host);
  });
}

function drawDebugHud(host: DrawingOverlayHost): void {
  const c = host.ctx;
  const sv = getStreetViewContext(host);
  const live = sv ? (spotSignatureFromHref(location.href) ?? spotKeyFromSv(sv)) : "—";
  const active = host.activeSpotKey ?? "—";
  const match = active === live;
  const lines = [
    `mode=${host.viewportMode} ui=${host.uiMode}`,
    `live   = ${live.slice(0, 40)}`,
    `active = ${active.slice(0, 40)}`,
    `match=${match} strokes=${host.strokes.length}`,
  ];
  c.save();
  c.font = "12px monospace";
  c.textBaseline = "top";
  const pad = 6;
  const lineH = 16;
  const boxW = 360;
  const boxH = pad * 2 + lineH * lines.length;
  c.fillStyle = "rgba(0,0,0,0.7)";
  c.fillRect(8, 8, boxW, boxH);
  c.fillStyle = match ? "#7CFC00" : "#FF5555";
  lines.forEach((t, i) => {
    c.fillText(t, 8 + pad, 8 + pad + i * lineH);
  });
  c.restore();
}

function renderScreenStrokeList(ctx: CanvasRenderingContext2D, strokes: StoredStroke[]): void {
  for (const s of strokes) {
    if (s.coordSpace !== "screen") {
      continue;
    }
    if (s.kind === "brush") {
      renderStroke(ctx, s.points, { color: s.color, size: s.size });
    } else if (s.kind === "eraser") {
      renderEraserStroke(ctx, s.points, s.size);
    } else if (s.kind === "arrow") {
      drawArrow(ctx, s.x0, s.y0, s.x1, s.y1, s.color, s.lw);
    } else {
      drawSquareStroke(ctx, s.x0, s.y0, s.x1, s.y1, s.color, s.lw);
    }
  }
}

export function redraw(host: DrawingOverlayHost): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const c = host.ctx;
  c.clearRect(0, 0, w, h);

  const map = getViewportMap(host);
  const frame = getMapViewportFrame();

  if (host.viewportMode === "streetview") {
    const sv = getStreetViewContext(host);
    if (
      sv &&
      host.strokes.length > 0 &&
      host.activeSpotKey &&
      host.activeSpotKey === (spotSignatureFromHref(location.href) ?? spotKeyFromSv(sv))
    ) {
      renderScreenStrokeList(c, host.strokes);
    }
    if (VGF_DEBUG_SV) {
      drawDebugHud(host);
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

  if (!host.current) {
    return;
  }
  if (host.viewportMode === "streetview" && host.uiMode !== "draw") {
    return;
  }
  if (host.viewportMode !== "streetview" && host.uiMode !== "draw") {
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
