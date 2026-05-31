import type { MemoryUvPoint, StoredStroke } from "../2.1-overlay-types";
import type { StrokePoint } from "./stroke";
import { normFromCanvas, normToCanvas, getMemoryViewportFrame } from "./view-memory";
import type { ViewportFrame } from "../../lib/map-projection";
import { drawArrow, drawSquareStroke } from "./shapes";
import { renderEraserStroke, renderStroke } from "./stroke";

function uvToCanvas(
  u: number,
  v: number,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame,
): StrokePoint {
  const p = normToCanvas(u, v, canvas, frame);
  return [p.x, p.y, 1];
}

export function screenPointsToMemoryUv(
  points: StrokePoint[],
  canvas: HTMLCanvasElement,
  frame = getMemoryViewportFrame(),
): MemoryUvPoint[] {
  return points.map(([x, y, pr]) => {
    const [u, v] = normFromCanvas(x, y, canvas, frame);
    return [u, v, pr];
  });
}

export function screenPointToMemoryUv(
  x: number,
  y: number,
  pressure: number,
  canvas: HTMLCanvasElement,
  frame = getMemoryViewportFrame(),
): MemoryUvPoint {
  const [u, v] = normFromCanvas(x, y, canvas, frame);
  return [u, v, pressure];
}

export function projectMemorySketchStroke(
  stroke: StoredStroke,
  canvas: HTMLCanvasElement,
  frame = getMemoryViewportFrame(),
):
  | { kind: "brush"; points: StrokePoint[]; color: string; size: number }
  | { kind: "eraser"; points: StrokePoint[]; size: number }
  | { kind: "arrow"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | { kind: "square"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | null {
  if (stroke.coordSpace !== "viewmemory") {
    return null;
  }

  if (stroke.kind === "brush") {
    const points = stroke.points.map(([u, v, pr]) => {
      const p = normToCanvas(u, v, canvas, frame);
      return [p.x, p.y, pr] as StrokePoint;
    });
    if (points.length < 2) {
      return null;
    }
    return { kind: "brush", points, color: stroke.color, size: stroke.size };
  }
  if (stroke.kind === "eraser") {
    const points = stroke.points.map(([u, v, pr]) => {
      const p = normToCanvas(u, v, canvas, frame);
      return [p.x, p.y, pr] as StrokePoint;
    });
    if (points.length < 2) {
      return null;
    }
    return { kind: "eraser", points, size: stroke.size };
  }

  const a = uvToCanvas(stroke.u0, stroke.v0, canvas, frame);
  const b = uvToCanvas(stroke.u1, stroke.v1, canvas, frame);
  if (stroke.kind === "arrow") {
    return {
      kind: "arrow",
      x0: a[0],
      y0: a[1],
      x1: b[0],
      y1: b[1],
      color: stroke.color,
      lw: stroke.lw,
    };
  }
  return {
    kind: "square",
    x0: a[0],
    y0: a[1],
    x1: b[0],
    y1: b[1],
    color: stroke.color,
    lw: stroke.lw,
  };
}

export function renderMemorySketchStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: StoredStroke[],
  canvas: HTMLCanvasElement,
): void {
  for (const s of strokes) {
    const projected = projectMemorySketchStroke(s, canvas);
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
}
