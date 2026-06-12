import type { StreetViewContext } from "../../lib/streetview-context";
import { normalizeHeading } from "../../lib/streetview-context";
import {
  povTranslation,
  screenToViewDirection,
  strokeSizeAtFov,
  viewDirectionToScreen,
} from "../../lib/streetview-projection";
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

type ProjectedSvStroke = NonNullable<ReturnType<typeof projectStreetViewStroke>>;

function anchorCamFromStroke(
  stroke: StoredStroke & { aHeading: number; aPitch: number; fov: number },
  cam: StreetViewContext,
): StreetViewContext {
  return {
    ...cam,
    heading: stroke.aHeading,
    pitch: stroke.aPitch,
    fov: stroke.fov,
  };
}

function projectSvPoint(
  x: number,
  y: number,
  anchorCam: StreetViewContext,
  cam: StreetViewContext,
  frame: ViewportFrame,
  parallaxHeading: number,
): { x: number; y: number } | null {
  const dir = screenToViewDirection(x, y, anchorCam, frame);
  const heading = normalizeHeading(dir.heading + parallaxHeading);
  return viewDirectionToScreen(heading, dir.pitch, cam, frame);
}

/** Проекция штриха с другой панорамы (поправка parallaxHeading, °). */
export function projectStreetViewStrokeFromPano(
  stroke: StoredStroke,
  cam: StreetViewContext,
  frame: ViewportFrame,
  parallaxHeading = 0,
): ProjectedSvStroke | null {
  if (stroke.coordSpace !== "streetview") {
    return null;
  }
  if (Math.abs(parallaxHeading) < 1e-6) {
    return projectStreetViewStroke(stroke, cam, frame);
  }

  const anchorCam = anchorCamFromStroke(
    stroke as StoredStroke & { aHeading: number; aPitch: number; fov: number },
    cam,
  );
  const size = scaledSvSize(stroke, cam);

  if (stroke.kind === "brush") {
    const points: StrokePoint[] = [];
    for (const [x, y, p] of stroke.points) {
      const pt = projectSvPoint(x, y, anchorCam, cam, frame, parallaxHeading);
      if (pt) {
        points.push([pt.x, pt.y, p]);
      }
    }
    if (points.length < 2) {
      return null;
    }
    return { kind: "brush", points, color: stroke.color, size };
  }
  if (stroke.kind === "eraser") {
    const points: StrokePoint[] = [];
    for (const [x, y, p] of stroke.points) {
      const pt = projectSvPoint(x, y, anchorCam, cam, frame, parallaxHeading);
      if (pt) {
        points.push([pt.x, pt.y, p]);
      }
    }
    if (points.length < 2) {
      return null;
    }
    return { kind: "eraser", points, size };
  }
  if (stroke.kind === "arrow") {
    const p0 = projectSvPoint(stroke.x0, stroke.y0, anchorCam, cam, frame, parallaxHeading);
    const p1 = projectSvPoint(stroke.x1, stroke.y1, anchorCam, cam, frame, parallaxHeading);
    if (!p0 || !p1) {
      return null;
    }
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
  const p0 = projectSvPoint(stroke.x0, stroke.y0, anchorCam, cam, frame, parallaxHeading);
  const p1 = projectSvPoint(stroke.x1, stroke.y1, anchorCam, cam, frame, parallaxHeading);
  if (!p0 || !p1) {
    return null;
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
