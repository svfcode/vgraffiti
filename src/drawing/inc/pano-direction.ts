import type { DrawingOverlayHost } from "../2.1-overlay-types";
import type { StreetViewContext } from "../../lib/streetview-context";
import { normalizeHeadingDelta } from "../../lib/streetview-context";
import type { MapContext } from "../../lib/map-context";
import { mapGeoToScreen, type ViewportFrame } from "../../lib/map-projection";
import { getStreetViewDrawFrame } from "./sv-stroke";

/** Ближе этого точку считаем «текущей» — стрелку не показываем. */
const SAME_SPOT_M = 3;
/** До какой дистанции показывать стрелку-указатель в Street View, м. */
const SV_MAX_M = 5000;
/** Прозрачность стрелок. */
const ARROW_ALPHA = 0.4;
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

function nearestDrawing(
  host: DrawingOverlayHost,
  from: LatLng,
): { d: LatLng; dist: number } | null {
  let best: { d: LatLng; dist: number } | null = null;
  for (const d of host.panoDrawings) {
    if (!d.strokes.length) {
      continue;
    }
    const dist = metersBetween(from, d);
    if (!best || dist < best.dist) {
      best = { d, dist };
    }
  }
  return best;
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
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = ARROW_ALPHA;
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
  ctx.globalAlpha = Math.min(1, ARROW_ALPHA + 0.25);
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Street View: компасная стрелка снизу по центру к ближайшему рисунку. */
export function renderSvDirectionArrow(
  host: DrawingOverlayHost,
  ctx: CanvasRenderingContext2D,
  cam: StreetViewContext,
): void {
  const near = nearestDrawing(host, cam);
  if (!near || near.dist <= SAME_SPOT_M || near.dist > SV_MAX_M) {
    return;
  }
  const frame = getStreetViewDrawFrame(host.canvas);
  const rel = normalizeHeadingDelta(cam.heading, bearingDeg(cam, near.d));
  const x = frame.cx;
  const y = frame.cy + frame.h * 0.3;
  drawChevron(ctx, x, y, (rel * Math.PI) / 180, 30);
  drawLabel(ctx, x, y + 34, formatDist(near.dist));
}

/** 2D-карта: стрелка у края экрана к ближайшему рисунку (если он вне видимой области). */
export function renderMapDirectionArrow(
  host: DrawingOverlayHost,
  ctx: CanvasRenderingContext2D,
  map: MapContext,
  frame: ViewportFrame,
): void {
  const near = nearestDrawing(host, { lat: map.lat, lng: map.lng });
  if (!near) {
    return;
  }
  const pos = mapGeoToScreen(near.d.lat, near.d.lng, map, frame);
  const left = frame.cx - frame.w / 2;
  const right = frame.cx + frame.w / 2;
  const top = frame.cy - frame.h / 2;
  const bottom = frame.cy + frame.h / 2;
  const m = MAP_EDGE_PAD;
  if (pos.x >= left + m && pos.x <= right - m && pos.y >= top + m && pos.y <= bottom - m) {
    return; // точка видна на экране — стрелка не нужна
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
  drawLabel(ctx, ex, ey + 18, formatDist(near.dist));
}
