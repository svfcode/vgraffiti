import type { StreetViewContext } from "../../lib/streetview-context";
import { normalizeHeadingDelta } from "../../lib/streetview-context";
import {
  getProjectionViewportFrame,
  getStreetViewViewportFrame,
  type ViewportFrame,
} from "../../lib/map-projection";
import type { NormPoint, WalkLocation } from "./memory-types";

export const POV_THRESHOLDS = {
  latLngM: 15,
  headingDeg: 8,
  pitchDeg: 6,
  fovDeg: 5,
};

export function getMemoryViewportFrame(): ViewportFrame {
  return getProjectionViewportFrame(getStreetViewViewportFrame());
}

export function canvasToClient(
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + x, y: r.top + y };
}

export function clientToCanvas(
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: sx - r.left, y: sy - r.top };
}

export function normFromClient(
  sx: number,
  sy: number,
  frame: ViewportFrame,
): NormPoint {
  const u = (sx - (frame.cx - frame.w / 2)) / frame.w;
  const v = (sy - (frame.cy - frame.h / 2)) / frame.h;
  return [
    Math.max(0, Math.min(1, u)),
    Math.max(0, Math.min(1, v)),
  ];
}

export function normFromCanvas(
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame = getMemoryViewportFrame(),
): NormPoint {
  const c = canvasToClient(x, y, canvas);
  return normFromClient(c.x, c.y, frame);
}

export function normToCanvas(
  u: number,
  v: number,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame = getMemoryViewportFrame(),
): { x: number; y: number } {
  const sx = frame.cx - frame.w / 2 + u * frame.w;
  const sy = frame.cy - frame.h / 2 + v * frame.h;
  return clientToCanvas(sx, sy, canvas);
}

function metersBetween(a: StreetViewContext, b: StreetViewContext): number {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111320;
}

export type PovMatchLevel = "exact" | "nearby" | "none";

/** exact = тот же ракурс; nearby = та же панорама, другой heading. */
export function classifyPovMatch(
  anchor: StreetViewContext,
  current: StreetViewContext,
): PovMatchLevel {
  if (metersBetween(anchor, current) > POV_THRESHOLDS.latLngM) {
    return "none";
  }
  const dH = Math.abs(normalizeHeadingDelta(anchor.heading, current.heading));
  const dP = Math.abs(anchor.pitch - current.pitch);
  const dF = Math.abs(anchor.fov - current.fov);
  if (
    dH <= POV_THRESHOLDS.headingDeg &&
    dP <= POV_THRESHOLDS.pitchDeg &&
    dF <= POV_THRESHOLDS.fovDeg
  ) {
    return "exact";
  }
  return "nearby";
}

export function povMatch(anchor: StreetViewContext, current: StreetViewContext): boolean {
  return classifyPovMatch(anchor, current) === "exact";
}

export function headingHintDeg(anchor: StreetViewContext, current: StreetViewContext): number {
  return normalizeHeadingDelta(current.heading, anchor.heading);
}

export function generateLocationId(): string {
  return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** @deprecated */
export const generateMemoryId = generateLocationId;

export function panoramaKey(sv: StreetViewContext): string {
  return `${sv.lat.toFixed(5)},${sv.lng.toFixed(5)}`;
}

export function isAtSamePanorama(a: StreetViewContext, b: StreetViewContext): boolean {
  return metersBetween(a, b) <= POV_THRESHOLDS.latLngM;
}

/** Место на той же панораме (по координатам, без учёта поворота головы). */
export function findLocationAtPanorama(
  locations: WalkLocation[],
  current: StreetViewContext | null,
): WalkLocation | null {
  if (!current) {
    return null;
  }
  let best: WalkLocation | null = null;
  let bestDist = Infinity;
  for (const loc of locations) {
    const d = metersBetween(loc.anchor, current);
    if (d > POV_THRESHOLDS.latLngM) {
      continue;
    }
    if (!best || d < bestDist) {
      best = loc;
      bestDist = d;
    }
  }
  return best;
}

/** @deprecated используйте findLocationAtPanorama */
export function findLocationAtPov(
  locations: WalkLocation[],
  current: StreetViewContext | null,
): WalkLocation | null {
  return findLocationAtPanorama(locations, current);
}
