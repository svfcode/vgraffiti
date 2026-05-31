import type { StreetViewContext } from "../../lib/streetview-context";
import { normalizeHeadingDelta } from "../../lib/streetview-context";
import {
  getProjectionViewportFrame,
  getStreetViewViewportFrame,
  type ViewportFrame,
} from "../../lib/map-projection";
import type { MemoryStop, NormPoint } from "./memory-types";

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

export function generateMemoryId(): string {
  return `env_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Конверты видны на той же панораме (exact или nearby — допустимый drift UV). */
export function isEnvelopeVisible(
  anchor: StreetViewContext,
  current: StreetViewContext | null,
): boolean {
  if (!current) {
    return false;
  }
  const level = classifyPovMatch(anchor, current);
  return level === "exact" || level === "nearby";
}

const ENVELOPE_HIT_PX = 22;

export function findEnvelopeAtCanvasPoint(
  x: number,
  y: number,
  memories: MemoryStop[],
  current: StreetViewContext | null,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame = getMemoryViewportFrame(),
): MemoryStop | null {
  if (!current) {
    return null;
  }
  let best: { mem: MemoryStop; d: number } | null = null;
  for (const mem of memories) {
    if (!isEnvelopeVisible(mem.anchor, current)) {
      continue;
    }
    const p = normToCanvas(mem.u, mem.v, canvas, frame);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > ENVELOPE_HIT_PX) {
      continue;
    }
    if (!best || d < best.d) {
      best = { mem, d };
    }
  }
  return best?.mem ?? null;
}

export function renderEnvelopes(
  ctx: CanvasRenderingContext2D,
  memories: MemoryStop[],
  current: StreetViewContext | null,
  canvas: HTMLCanvasElement,
  openEnvelopeId: string | null,
  frame: ViewportFrame = getMemoryViewportFrame(),
): void {
  if (!current) {
    return;
  }
  for (const mem of memories) {
    if (!isEnvelopeVisible(mem.anchor, current)) {
      continue;
    }
    const { x, y } = normToCanvas(mem.u, mem.v, canvas, frame);
    const isOpen = mem.id === openEnvelopeId;
    const hasNote = mem.text.trim().length > 0;
    const hasWall = !!mem.wallCanvas?.strokes.length;
    drawEnvelopeIcon(ctx, x, y, { isOpen, hasNote, hasWall });
  }
}

function drawEnvelopeIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flags: { isOpen: boolean; hasNote: boolean; hasWall: boolean },
): void {
  const w = 28;
  const h = 18;
  const left = x - w / 2;
  const top = y - h / 2;
  ctx.save();
  ctx.translate(left, top);

  ctx.fillStyle = flags.isOpen ? "rgba(255, 214, 102, 0.95)" : "rgba(232, 234, 237, 0.92)";
  ctx.strokeStyle = flags.isOpen ? "rgba(180, 130, 40, 0.9)" : "rgba(95, 99, 104, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.35);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w, h * 0.35);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, h * 0.35);
  ctx.lineTo(w / 2, h * 0.62);
  ctx.lineTo(w, h * 0.35);
  ctx.strokeStyle = "rgba(66, 133, 244, 0.75)";
  ctx.stroke();

  if (flags.hasNote) {
    ctx.fillStyle = "#4285f4";
    ctx.beginPath();
    ctx.arc(w - 4, 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flags.hasWall) {
    ctx.fillStyle = "#34a853";
    ctx.beginPath();
    ctx.arc(w - 4, flags.hasNote ? 10 : 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** @deprecated use renderEnvelopes */
export function renderMemoryMarkers(
  ctx: CanvasRenderingContext2D,
  memories: MemoryStop[],
  current: StreetViewContext | null,
  canvas: HTMLCanvasElement,
  frame: ViewportFrame = getMemoryViewportFrame(),
): void {
  renderEnvelopes(ctx, memories, current, canvas, null, frame);
}

export function findBestNearbyMemory(
  memories: MemoryStop[],
  current: StreetViewContext | null,
): { memory: MemoryStop; deltaHeading: number } | null {
  if (!current || memories.length === 0) {
    return null;
  }
  let best: { memory: MemoryStop; deltaHeading: number } | null = null;
  for (const mem of memories) {
    if (classifyPovMatch(mem.anchor, current) !== "nearby") {
      continue;
    }
    const d = Math.abs(headingHintDeg(mem.anchor, current));
    if (!best || d < Math.abs(best.deltaHeading)) {
      best = { memory: mem, deltaHeading: headingHintDeg(mem.anchor, current) };
    }
  }
  return best;
}
