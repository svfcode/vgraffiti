import { drawArrow, drawSquareStroke } from "./inc/shapes";
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
  for (const s of host.strokes) {
    if (s.kind === "brush") {
      renderStroke(c, s.points, { color: s.color, size: s.size });
    } else if (s.kind === "eraser") {
      renderEraserStroke(c, s.points, s.size);
    } else if (s.kind === "arrow") {
      drawArrow(c, s.x0, s.y0, s.x1, s.y1, s.color, s.lw);
    } else {
      drawSquareStroke(c, s.x0, s.y0, s.x1, s.y1, s.color, s.lw);
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
