import type { StreetViewContext } from "./streetview-context";
import { normalizeHeading, normalizeHeadingDelta } from "./streetview-context";
import type { ViewportFrame } from "./map-projection";

/** Google …y в URL — горизонтальный FOV (°). */
function fovsFromHorizontal(hFovDeg: number, aspect: number): { hFov: number; vFov: number } {
  const hFov = (Math.max(hFovDeg, 1) * Math.PI) / 180;
  const vFov = 2 * Math.atan(Math.tan(hFov / 2) / Math.max(aspect, 0.01));
  return { hFov, vFov };
}

/** Экранная точка → абсолютное направление взгляда (heading/pitch). */
export function screenToViewDirection(
  sx: number,
  sy: number,
  cam: StreetViewContext,
  frame: ViewportFrame,
): { heading: number; pitch: number } {
  const aspect = frame.w / Math.max(frame.h, 1);
  const { hFov, vFov } = fovsFromHorizontal(cam.fov, aspect);

  const ndcX = (sx - frame.cx) / (frame.w / 2);
  const ndcY = (sy - frame.cy) / (frame.h / 2);

  const relH = ndcX * (hFov / 2);
  const relP = -ndcY * (vFov / 2);

  return {
    heading: normalizeHeading(cam.heading + (relH * 180) / Math.PI),
    pitch: cam.pitch + (relP * 180) / Math.PI,
  };
}

/** Абсолютное направление → экран (null если за кадром). */
export function viewDirectionToScreen(
  heading: number,
  pitch: number,
  cam: StreetViewContext,
  frame: ViewportFrame,
): { x: number; y: number } | null {
  const aspect = frame.w / Math.max(frame.h, 1);
  const { hFov, vFov } = fovsFromHorizontal(cam.fov, aspect);

  const dH = normalizeHeadingDelta(cam.heading, heading);
  const dP = pitch - cam.pitch;

  const ndcX = (dH * Math.PI) / 180 / (hFov / 2);
  const ndcY = -(dP * Math.PI) / 180 / (vFov / 2);

  if (Math.abs(ndcX) > 4 || Math.abs(ndcY) > 4) {
    return null;
  }

  return {
    x: frame.cx + ndcX * (frame.w / 2),
    y: frame.cy + ndcY * (frame.h / 2),
  };
}

/** Масштаб толщины при смене FOV (zoom в Street View). */
export function strokeSizeAtFov(sizeAtCapture: number, captureFov: number, currentFov: number): number {
  const c0 = Math.tan(((captureFov > 0 ? captureFov : 90) * Math.PI) / 360);
  const c1 = Math.tan(((currentFov > 0 ? currentFov : 90) * Math.PI) / 360);
  if (c1 < 1e-6) {
    return sizeAtCapture;
  }
  return sizeAtCapture * (c0 / c1);
}
