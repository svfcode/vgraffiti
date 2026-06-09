import type { StreetViewContext } from "../../lib/streetview-context";
import { povTranslation, strokeSizeAtFov } from "../../lib/streetview-projection";
import {
  getOverlayViewportFrame,
  getStreetViewViewportFrame,
  type ViewportFrame,
} from "../../lib/map-projection";
import type { StoredStroke } from "../2.1-overlay-types";
import type { StrokePoint } from "./stroke";

/** Кадр панорамы Google (точное соответствие угол↔пиксель), иначе кадр оверлея. */
export function getStreetViewDrawFrame(canvas?: HTMLCanvasElement | null): ViewportFrame {
  return getStreetViewViewportFrame() ?? getOverlayViewportFrame(canvas);
}

export function isStreetViewStroke(stroke: StoredStroke): boolean {
  return stroke.coordSpace === "streetview";
}

function scaledSvSize(stroke: StoredStroke, cam: StreetViewContext): number {
  const fov = stroke.coordSpace === "streetview" ? stroke.fov : 90;
  if (stroke.kind === "brush" || stroke.kind === "eraser") {
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

  const { dx, dy } = povTranslation(cam, stroke.aHeading, stroke.aPitch, frame);
  const size = scaledSvSize(stroke, cam);

  if (stroke.kind === "brush") {
    const points: StrokePoint[] = stroke.points.map(([x, y, p]) => [x + dx, y + dy, p]);
    return { kind: "brush", points, color: stroke.color, size };
  }
  if (stroke.kind === "eraser") {
    const points: StrokePoint[] = stroke.points.map(([x, y, p]) => [x + dx, y + dy, p]);
    return { kind: "eraser", points, size };
  }
  if (stroke.kind === "arrow") {
    return {
      kind: "arrow",
      x0: stroke.x0 + dx,
      y0: stroke.y0 + dy,
      x1: stroke.x1 + dx,
      y1: stroke.y1 + dy,
      color: stroke.color,
      lw: size,
    };
  }
  return {
    kind: "square",
    x0: stroke.x0 + dx,
    y0: stroke.y0 + dy,
    x1: stroke.x1 + dx,
    y1: stroke.y1 + dy,
    color: stroke.color,
    lw: size,
  };
}
