import type { DrawingOverlayHost } from "../2.1-overlay-types";
import type { StreetViewContext } from "../../lib/streetview-context";
import { normalizeHeadingDelta } from "../../lib/streetview-context";
import type { MapContext } from "../../lib/map-context";
import { mapGeoToScreen, type ViewportFrame } from "../../lib/map-projection";
import { getStreetViewDrawFrame } from "./sv-stroke";
import { flushPanoStrokes } from "./handle-pano";
import { isSameSpot } from "./pano-types";
import { distanceToPanoDrawing, getSvDrawingRangeM } from "./sv-drawing-range";

/** Ближе этого не показывать указатель (текущая точка). */
const MIN_ARROW_M = 3;
/** Прозрачность стрелок к рисункам. */
const ARROW_ALPHA = 0.72;
/** Цвет стрелок. */
const ARROW_COLOR = "#8ab4f8";
/** Отступ стрелки от края экрана на 2D-карте, px. */
const MAP_EDGE_PAD = 36;

type LatLng = { lat: number; lng: number };

function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} км` : `${Math.round(m)} м`;
}

/** Шеврон-стрелка, по умолчанию остриём вверх (-y), повёрнутая на rot (рад). */
function drawChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  size: number,
  alpha = ARROW_ALPHA,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.66, size * 0.55);
  ctx.lineTo(0, size * 0.2);
  ctx.lineTo(-size * 0.66, size * 0.55);
  ctx.closePath();
  ctx.fillStyle = ARROW_COLOR;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

type DrawingTarget = { lat: number; lng: number; dist: number };

function remoteDrawingTargets(host: DrawingOverlayHost, cam: StreetViewContext): DrawingTarget[] {
  flushPanoStrokes(host);
  const out: DrawingTarget[] = [];
  const seen = new Set<string>();
  for (const d of host.panoDrawings) {
    if (!d.strokes.length || isSameSpot(d, cam)) {
      continue;
    }
    const dist = distanceToPanoDrawing(host, cam, d);
    const maxM = getSvDrawingRangeM(host);
    if (dist <= MIN_ARROW_M || dist > maxM) {
      continue;
    }
    const key = d.panoId ?? `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ lat: d.lat, lng: d.lng, dist });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

/** Street View: стрелки к рисункам прогулки (все точки, не только ближайшая). */
export function renderSvDirectionArrow(
  host: DrawingOverlayHost,
  ctx: CanvasRenderingContext2D,
  cam: StreetViewContext,
): void {
  const targets = remoteDrawingTargets(host, cam);
  if (targets.length === 0) {
    return;
  }
  const frame = getStreetViewDrawFrame(host.canvas);
  const pad = 42;
  const left = frame.cx - frame.w / 2 + pad;
  const right = frame.cx + frame.w / 2 - pad;
  const top = frame.cy - frame.h / 2 + pad;
  const bottom = frame.cy + frame.h / 2 - pad;

  const nearest = targets[0]!;
  const nearRel = normalizeHeadingDelta(cam.heading, bearingDeg(cam, nearest));
  drawChevron(ctx, frame.cx, frame.cy + frame.h * 0.28, (nearRel * Math.PI) / 180, 28);
  drawLabel(ctx, frame.cx, frame.cy + frame.h * 0.28 + 32, formatDist(nearest.dist));

  for (let i = 1; i < Math.min(targets.length, 5); i++) {
    const t = targets[i]!;
    const rel = normalizeHeadingDelta(cam.heading, bearingDeg(cam, t));
    const rad = (rel * Math.PI) / 180;
    const dirX = Math.sin(rad);
    const dirY = -Math.cos(rad);
    const halfW = frame.w / 2 - pad;
    const halfH = frame.h / 2 - pad;
    const scale = Math.min(
      halfW / Math.max(Math.abs(dirX), 1e-6),
      halfH / Math.max(Math.abs(dirY), 1e-6),
    );
    const x = frame.cx + dirX * scale;
    const y = frame.cy + dirY * scale;
    const clampedX = Math.max(left, Math.min(right, x));
    const clampedY = Math.max(top, Math.min(bottom, y));
    drawChevron(ctx, clampedX, clampedY, rad + Math.PI / 2, 20, 0.55);
  }
}

/** 2D-карта: стрелка у края экрана к ближайшему рисунку (если он вне видимой области). */
export function renderMapDirectionArrow(
  host: DrawingOverlayHost,
  ctx: CanvasRenderingContext2D,
  map: MapContext,
  frame: ViewportFrame,
): void {
  flushPanoStrokes(host);
  let best: { d: LatLng; dist: number } | null = null;
  for (const d of host.panoDrawings) {
    if (!d.strokes.length) {
      continue;
    }
    const dist = metersBetween(map, d);
    if (!best || dist < best.dist) {
      best = { d, dist };
    }
  }
  if (!best) {
    return;
  }
  const pos = mapGeoToScreen(best.d.lat, best.d.lng, map, frame);
  const left = frame.cx - frame.w / 2;
  const right = frame.cx + frame.w / 2;
  const top = frame.cy - frame.h / 2;
  const bottom = frame.cy + frame.h / 2;
  const m = MAP_EDGE_PAD;
  if (pos.x >= left + m && pos.x <= right - m && pos.y >= top + m && pos.y <= bottom - m) {
    return;
  }
  const ang = Math.atan2(pos.y - frame.cy, pos.x - frame.cx);
  const halfW = frame.w / 2 - m;
  const halfH = frame.h / 2 - m;
  const dirX = Math.cos(ang);
  const dirY = Math.sin(ang);
  const scale = Math.min(
    halfW / Math.max(Math.abs(dirX), 1e-6),
    halfH / Math.max(Math.abs(dirY), 1e-6),
  );
  const ex = frame.cx + dirX * scale;
  const ey = frame.cy + dirY * scale;
  drawChevron(ctx, ex, ey, ang + Math.PI / 2, 26);
  drawLabel(ctx, ex, ey + 18, formatDist(best.dist));
}
