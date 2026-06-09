import type { StreetViewContext } from "./streetview-context";
import { normalizeHeading, normalizeHeadingDelta } from "./streetview-context";
import type { ViewportFrame } from "./map-projection";

/**
 * Калибровка масштаба проекции (пикс/градус). >1 — рисунок смещается сильнее на
 * градус поворота, <1 — слабее. Подбирается вживую, чтобы убрать дрейф.
 */
let calX = 1;
let calY = 1;

export function getSvCalibration(): { x: number; y: number } {
  return { x: calX, y: calY };
}

export function setSvCalibration(x: number, y: number): void {
  calX = Math.max(0.2, Math.min(3, x));
  calY = Math.max(0.2, Math.min(3, y));
}

export function nudgeSvCalibration(dx: number, dy: number): void {
  setSvCalibration(calX + dx, calY + dy);
}

/** Google …y в URL — вертикальный FOV (°). Горизонтальный выводим через aspect. */
function fovsFromVertical(vFovDeg: number, aspect: number): { hFov: number; vFov: number } {
  const vFov = (Math.max(vFovDeg, 1) * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.01));
  return { hFov, vFov };
}

/**
 * Перенос рисунка (px) при изменении ракурса камеры относительно ракурса, в
 * котором он нарисован. Линейная модель: поворот камеры = равномерный сдвиг.
 * На исходном ракурсе сдвиг = 0 при любой калибровке.
 */
export function povTranslation(
  cam: StreetViewContext,
  anchorHeading: number,
  anchorPitch: number,
  frame: ViewportFrame,
): { dx: number; dy: number } {
  const aspect = frame.w / Math.max(frame.h, 1);
  const { hFov, vFov } = fovsFromVertical(cam.fov, aspect);
  const hFovDeg = (hFov * 180) / Math.PI;
  const vFovDeg = (vFov * 180) / Math.PI;
  const dH = normalizeHeadingDelta(cam.heading, anchorHeading);
  const dP = cam.pitch - anchorPitch;
  return {
    dx: dH * (frame.w / Math.max(hFovDeg, 1)) * calX,
    dy: dP * (frame.h / Math.max(vFovDeg, 1)) * calY,
  };
}

/** Экранная точка → абсолютное направление взгляда (heading/pitch). */
export function screenToViewDirection(
  sx: number,
  sy: number,
  cam: StreetViewContext,
  frame: ViewportFrame,
): { heading: number; pitch: number } {
  const aspect = frame.w / Math.max(frame.h, 1);
  const { hFov, vFov } = fovsFromVertical(cam.fov, aspect);

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
  const { hFov, vFov } = fovsFromVertical(cam.fov, aspect);

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
