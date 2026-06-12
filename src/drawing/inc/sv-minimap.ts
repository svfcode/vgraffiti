import type { DrawingOverlayHost } from "../2.1-overlay-types";
import {
  normalizeHeading,
  normalizeHeadingDelta,
  type StreetViewContext,
} from "../../lib/streetview-context";
import { syncPanoDrawingsForMinimap } from "./handle-pano";
import { getStreetViewContext } from "./map-binding";
import type { PanoDrawing } from "./pano-types";
import { readSvMinimapEnabled } from "../../lib/sv-prefs";
import {
  drawingSpotKey,
  getSvDrawingRangeM,
  isCurrentPanoDrawing,
  isPanoDrawingWithinRange,
  liveSpotKey,
  metersBetween,
} from "./sv-drawing-range";
import { walkBearingBetween } from "./sv-walk-graph";

const MINIMAP_PX = 128;
const PAD = 16;
const MARKER_COLOR = "#8ab4f8";
const CURRENT_COLOR = "#ffffff";
const MIN_GEO_RADIUS_M = 6;
/** Не чаще этого перерисовывать мини-карту (мс). */
const MINIMAP_PAINT_MS = 400;
/** Шаг heading для клина (°) — меньше перерисовок при повороте. */
const HEADING_BUCKET_DEG = 10;

type LatLng = { lat: number; lng: number };

let lastPaintSig = "";
let lastPaintAt = 0;
let cachedDpr = 0;

function isMinimapCurrentSpot(
  d: PanoDrawing,
  host: DrawingOverlayHost,
  cam: StreetViewContext,
): boolean {
  return isCurrentPanoDrawing(host, cam, d);
}

function hashAngle(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function inferBearingFromWalkOrder(
  host: DrawingOverlayHost,
  curKey: string,
  remKey: string,
  cam: StreetViewContext,
): number | null {
  const withStrokes = host.panoDrawings.filter((d) => d.strokes.length);
  const keys = withStrokes.map((d) => drawingSpotKey(d));
  const curIdx = keys.indexOf(curKey);
  const remIdx = keys.indexOf(remKey);
  if (curIdx < 0 || remIdx < 0 || curIdx === remIdx) {
    return null;
  }
  const curHeading = withStrokes[curIdx]?.visitHeading ?? cam.heading;
  const steps = remIdx - curIdx;
  const base = steps > 0 ? curHeading : normalizeHeading(curHeading + 180);
  const spread = Math.min(40, Math.abs(steps) * 10);
  const sign = steps > 0 ? 1 : -1;
  return normalizeHeading(base + sign * spread * 0.4);
}

/** Азимут к точке с рисунком от текущей позиции (° от севера). */
function worldBearingToSpot(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
): number {
  const curKey = liveSpotKey(host, cam);
  const remKey = drawingSpotKey(spot);

  const dist = metersBetween(cam, spot);
  if (dist >= MIN_GEO_RADIUS_M) {
    return bearingDeg(cam, spot);
  }

  const walkBearing = walkBearingBetween(curKey, remKey);
  if (walkBearing != null) {
    return walkBearing;
  }

  const orderBearing = inferBearingFromWalkOrder(host, curKey, remKey, cam);
  if (orderBearing != null) {
    return orderBearing;
  }

  const spread = (hashAngle(`${curKey}|${remKey}`) % 160) - 80;
  return normalizeHeading(cam.heading + spread);
}

/** Смещение на мини-карте: camera-up, угол от текущего взгляда. */
function plotCameraRelative(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
  slot: number,
): { right: number; forward: number } {
  const worldBearing = worldBearingToSpot(host, cam, spot);
  const relDeg = normalizeHeadingDelta(cam.heading, worldBearing);
  const rad = (relDeg * Math.PI) / 180;
  const r = MIN_GEO_RADIUS_M + slot * 2.5;
  return {
    forward: Math.cos(rad) * r,
    right: Math.sin(rad) * r,
  };
}

function remoteDrawingSpots(host: DrawingOverlayHost, cam: StreetViewContext): PanoDrawing[] {
  const seen = new Set<string>();
  const out: PanoDrawing[] = [];
  for (const d of host.panoDrawings) {
    if (!d.strokes.length || isMinimapCurrentSpot(d, host, cam)) {
      continue;
    }
    const key = drawingSpotKey(d);
    if (seen.has(key)) {
      continue;
    }
    if (!isPanoDrawingWithinRange(host, cam, d)) {
      continue;
    }
    seen.add(key);
    out.push(d);
  }
  return out;
}

export function shouldShowSvMinimap(host: DrawingOverlayHost): boolean {
  if (!readSvMinimapEnabled()) {
    return false;
  }
  if (host.viewportMode !== "streetview") {
    return false;
  }
  const cam = getStreetViewContext(host);
  if (!cam) {
    return false;
  }
  return remoteDrawingSpots(host, cam).length > 0;
}

export function syncSvMinimapVisibility(host: DrawingOverlayHost): void {
  host.svMinimapWrap.hidden = !shouldShowSvMinimap(host);
}

export function markSvMinimapDirty(): void {
  lastPaintSig = "";
}

function minimapPaintSignature(host: DrawingOverlayHost, cam: StreetViewContext): string {
  const remote = remoteDrawingSpots(host, cam);
  const keys = remote.map((d) => drawingSpotKey(d)).sort().join(",");
  const heading = Math.round(cam.heading / HEADING_BUCKET_DEG);
  return `${liveSpotKey(host, cam)}|${heading}|${getSvDrawingRangeM(host)}|${keys}`;
}

function ensureMinimapCanvas(host: DrawingOverlayHost): void {
  const dpr = window.devicePixelRatio || 1;
  if (cachedDpr === dpr && host.svMinimapCanvas.width > 0) {
    return;
  }
  cachedDpr = dpr;
  const canvas = host.svMinimapCanvas;
  canvas.style.width = `${MINIMAP_PX}px`;
  canvas.style.height = `${MINIMAP_PX}px`;
  canvas.width = Math.max(1, Math.floor(MINIMAP_PX * dpr));
  canvas.height = Math.max(1, Math.floor(MINIMAP_PX * dpr));
  host.svMinimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Клин «вперёд» — мини-карта camera-up. */
function drawForwardWedge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - len);
  ctx.lineTo(cx - len * 0.28, cy + len * 0.12);
  ctx.lineTo(cx + len * 0.28, cy + len * 0.12);
  ctx.closePath();
  ctx.fillStyle = CURRENT_COLOR;
  ctx.globalAlpha = 0.95;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  size: number,
  fill: string,
  stroke: string,
): void {
  const r = 10;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function paintSvMinimap(host: DrawingOverlayHost, cam: StreetViewContext): void {
  syncPanoDrawingsForMinimap(host);
  const remote = remoteDrawingSpots(host, cam);
  if (remote.length === 0) {
    host.svMinimapWrap.hidden = true;
    return;
  }
  host.svMinimapWrap.hidden = false;

  ensureMinimapCanvas(host);
  const ctx = host.svMinimapCtx;
  const size = MINIMAP_PX;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  drawRoundRect(ctx, size, "rgba(20, 22, 26, 0.88)", "rgba(138, 180, 248, 0.45)");

  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, PAD);
  ctx.lineTo(cx, size - PAD);
  ctx.moveTo(PAD, cy);
  ctx.lineTo(size - PAD, cy);
  ctx.stroke();

  const relOffsets = remote.map((spot, i) => plotCameraRelative(host, cam, spot, i));

  let maxRange = 10;
  for (const { right, forward } of relOffsets) {
    maxRange = Math.max(maxRange, Math.abs(right), Math.abs(forward));
  }
  const plotR = size / 2 - PAD;
  const scale = plotR / maxRange;

  remote.forEach((_spot, i) => {
    const { right, forward } = relOffsets[i]!;
    const x = cx + right * scale;
    const y = cy - forward * scale;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = MARKER_COLOR;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = CURRENT_COLOR;
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  drawForwardWedge(ctx, cx, cy, 15);
}

/** Отдельный тик мини-карты (не на каждый кадр оверлея). */
export function tickSvMinimap(host: DrawingOverlayHost, force = false): void {
  if (host.viewportMode !== "streetview") {
    if (!host.svMinimapWrap.hidden) {
      host.svMinimapWrap.hidden = true;
    }
    return;
  }

  const cam = getStreetViewContext(host);
  if (!cam || !shouldShowSvMinimap(host)) {
    syncSvMinimapVisibility(host);
    lastPaintSig = "";
    return;
  }

  const now = Date.now();
  const sig = minimapPaintSignature(host, cam);
  if (!force && sig === lastPaintSig && now - lastPaintAt < MINIMAP_PAINT_MS) {
    return;
  }
  lastPaintSig = sig;
  lastPaintAt = now;
  paintSvMinimap(host, cam);
}
