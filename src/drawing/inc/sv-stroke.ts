import type { StreetViewContext } from "../../lib/streetview-context";
import {
  screenToViewDirection,
  strokeSizeAtFov,
  viewDirectionToScreen,
} from "../../lib/streetview-projection";
import { getOverlayViewportFrame, type ViewportFrame } from "../../lib/map-projection";
import type { StoredStroke, ViewPoint } from "../2.1-overlay-types";
import type { StrokePoint } from "./stroke";

export function getStreetViewDrawFrame(canvas?: HTMLCanvasElement | null): ViewportFrame {
  return getOverlayViewportFrame(canvas);
}

export function isStreetViewStroke(stroke: StoredStroke): boolean {
  return stroke.coordSpace === "streetview";
}

export function screenPointToView(
  x: number,
  y: number,
  pressure: number,
  cam: StreetViewContext,
  frame: ViewportFrame,
): ViewPoint {
  const { heading, pitch } = screenToViewDirection(x, y, cam, frame);
  return [heading, pitch, pressure];
}

export function viewPointToScreen(
  point: ViewPoint,
  cam: StreetViewContext,
  frame: ViewportFrame,
): StrokePoint | null {
  const pos = viewDirectionToScreen(point[0], point[1], cam, frame);
  if (!pos) {
    return null;
  }
  return [pos.x, pos.y, point[2]];
}

export function screenPointsToView(
  points: StrokePoint[],
  cam: StreetViewContext,
  frame: ViewportFrame,
): ViewPoint[] {
  return points.map(([x, y, p]) => screenPointToView(x, y, p, cam, frame));
}

export function viewPointsToScreen(
  points: ViewPoint[],
  cam: StreetViewContext,
  frame: ViewportFrame,
): StrokePoint[] {
  const out: StrokePoint[] = [];
  for (const pt of points) {
    const s = viewPointToScreen(pt, cam, frame);
    if (s) {
      out.push(s);
    }
  }
  return out;
}

function scaledSvSize(stroke: StoredStroke, cam: StreetViewContext): number {
  const fov = stroke.coordSpace === "streetview" ? stroke.fov : 90;
  if (stroke.kind === "brush") {
    return strokeSizeAtFov(stroke.size, fov, cam.fov);
  }
  if (stroke.kind === "eraser") {
    return strokeSizeAtFov(stroke.size, fov, cam.fov);
  }
  return strokeSizeAtFov(stroke.lw, fov, cam.fov);
}

export function projectStreetViewStroke(
  stroke: StoredStroke,
  cam: StreetViewContext,
  frame: ViewportFrame,
):
  | { kind: "brush"; points: StrokePoint[]; color: string; size: number }
  | { kind: "eraser"; points: StrokePoint[]; size: number }
  | { kind: "arrow"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | { kind: "square"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | null {
  if (stroke.coordSpace !== "streetview") {
    return null;
  }

  const size = scaledSvSize(stroke, cam);

  if (stroke.kind === "brush") {
    const points = viewPointsToScreen(stroke.points, cam, frame);
    if (points.length < 2) {
      return null;
    }
    return { kind: "brush", points, color: stroke.color, size };
  }
  if (stroke.kind === "eraser") {
    const points = viewPointsToScreen(stroke.points, cam, frame);
    if (points.length < 2) {
      return null;
    }
    return { kind: "eraser", points, size };
  }

  const p0 = viewDirectionToScreen(stroke.h0, stroke.p0, cam, frame);
  const p1 = viewDirectionToScreen(stroke.h1, stroke.p1, cam, frame);
  if (!p0 || !p1) {
    return null;
  }

  if (stroke.kind === "arrow") {
    return {
      kind: "arrow",
      x0: p0.x,
      y0: p0.y,
      x1: p1.x,
      y1: p1.y,
      color: stroke.color,
      lw: size,
    };
  }
  return {
    kind: "square",
    x0: p0.x,
    y0: p0.y,
    x1: p1.x,
    y1: p1.y,
    color: stroke.color,
    lw: size,
  };
}
