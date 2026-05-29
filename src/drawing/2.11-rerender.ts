import { drawArrow, drawSquareStroke } from "./inc/shapes";
import { projectStoredStroke } from "./inc/geo-stroke";
import { getViewportMap } from "./inc/map-binding";
import { renderEraserStroke, renderStroke } from "./inc/stroke";
import type { DrawingOverlayHost } from "./2.1-overlay-types";

export function scheduleRedraw(host: DrawingOverlayHost): void {
  cancelAnimationFrame(host.raf);
  host.raf = requestAnimationFrame(() => {
    redraw(host);
  });
}

export function redraw(host: DrawingOverlayHost): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const c = host.ctx;
  c.clearRect(0, 0, w, h);

  const map = getViewportMap(host);
  if (map) {
    for (const s of host.strokes) {
      const projected = projectStoredStroke(s, map, w, h);
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
