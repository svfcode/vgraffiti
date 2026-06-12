import type { DrawingOverlayHost } from "../2.1-overlay-types";
import {
  normalizeHeadingDelta,
  spotSignatureFromHref,
  type StreetViewContext,
} from "../../lib/streetview-context";
import { readSvDrawingRangeM } from "../../lib/sv-prefs";
import {
  filterAnchoredStrokes,
  isSameLocation,
  locationKey,
  spotKeyFromSv,
  type PanoDrawing,
} from "./pano-types";
import { walkBearingBetween, walkGraphHops } from "./sv-walk-graph";

const MIN_GEO_RADIUS_M = 6;
/** Оценка шага между соседними панорамами прогулки, м. */
const PANO_HOP_M = 12;
/** Нет связи с точкой рисунка — считаем «очень далеко». */
const FAR_PANO_DISTANCE_M = 1_000_000;

type LatLng = { lat: number; lng: number };

export function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export function drawingSpotKey(d: PanoDrawing): string {
  return d.panoId ? `id:${d.panoId}` : `ll:${locationKey(d)}`;
}

export function panoIdKey(panoId: string): string {
  return `id:${panoId}`;
}

/** Ключ текущей панорамы: сначала живой URL. */
export function liveSpotKey(host: DrawingOverlayHost, cam: StreetViewContext): string {
  return spotSignatureFromHref(location.href) ?? spotKeyFromSv(cam) ?? host.activeSpotKey ?? "";
}

/** Та же панорама (только panoId или совпадающий id:-ключ). */
export function isSamePanoDrawing(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
): boolean {
  if (spot.panoId && cam.panoId) {
    return spot.panoId === cam.panoId;
  }
  const curKey = liveSpotKey(host, cam);
  const spotKey = drawingSpotKey(spot);
  if (curKey.startsWith("id:") && spotKey.startsWith("id:") && curKey === spotKey) {
    return true;
  }
  if (spot.panoId && curKey === panoIdKey(spot.panoId)) {
    return true;
  }
  if (cam.panoId && spotKey === panoIdKey(cam.panoId)) {
    return true;
  }
  if (!spot.panoId && !cam.panoId) {
    return isSameLocation(spot, cam);
  }
  return false;
}

function walkOrderHops(host: DrawingOverlayHost, cam: StreetViewContext, spot: PanoDrawing): number | null {
  const withStrokes = host.panoDrawings.filter((d) => d.strokes.length);
  let curIdx = -1;
  let remIdx = -1;
  for (let i = 0; i < withStrokes.length; i++) {
    const d = withStrokes[i]!;
    if (curIdx < 0 && isSamePanoDrawing(host, cam, d)) {
      curIdx = i;
    }
    if (
      remIdx < 0 &&
      (d === spot ||
        (spot.panoId && d.panoId === spot.panoId) ||
        drawingSpotKey(d) === drawingSpotKey(spot))
    ) {
      remIdx = i;
    }
  }
  if (curIdx < 0 || remIdx < 0) {
    return null;
  }
  return Math.abs(remIdx - curIdx);
}

function walkOrderHopsByPanoId(
  host: DrawingOverlayHost,
  camPanoId: string,
  spotPanoId: string,
): number | null {
  const withStrokes = host.panoDrawings.filter((d) => d.strokes.length);
  let curIdx = -1;
  let remIdx = -1;
  for (let i = 0; i < withStrokes.length; i++) {
    const d = withStrokes[i]!;
    if (curIdx < 0 && d.panoId === camPanoId) {
      curIdx = i;
    }
    if (remIdx < 0 && d.panoId === spotPanoId) {
      remIdx = i;
    }
  }
  if (curIdx < 0 || remIdx < 0) {
    return null;
  }
  return Math.abs(remIdx - curIdx);
}

/** Шаги между панорамами по id (ll:-ключи при одинаковом URL не считаем одной точкой). */
function resolveWalkHops(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
): number | null {
  if (spot.panoId && cam.panoId) {
    if (spot.panoId === cam.panoId) {
      return 0;
    }
    const from = panoIdKey(cam.panoId);
    const to = panoIdKey(spot.panoId);
    const graphHops = walkGraphHops(from, to);
    if (graphHops != null) {
      return graphHops;
    }
    return walkOrderHopsByPanoId(host, cam.panoId, spot.panoId);
  }

  const curKey = liveSpotKey(host, cam);
  const remKey = drawingSpotKey(spot);
  if (curKey.startsWith("id:") && remKey.startsWith("id:")) {
    if (curKey === remKey) {
      return 0;
    }
    const graphHops = walkGraphHops(curKey, remKey);
    if (graphHops != null) {
      return graphHops;
    }
  }

  return walkOrderHops(host, cam, spot);
}

/** Эффективная дистанция до точки с рисунком от текущей позиции, м. */
export function distanceToPanoDrawing(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
): number {
  if (isSamePanoDrawing(host, cam, spot)) {
    return 0;
  }

  const geo = metersBetween(cam, spot);
  if (geo >= MIN_GEO_RADIUS_M) {
    return geo;
  }

  const hops = resolveWalkHops(host, cam, spot);
  if (hops != null && hops > 0) {
    return hops * PANO_HOP_M;
  }

  return FAR_PANO_DISTANCE_M;
}

export function isCurrentPanoDrawing(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
): boolean {
  return isSamePanoDrawing(host, cam, spot);
}

export function getSvDrawingRangeM(host?: DrawingOverlayHost | null): number {
  if (host && Number.isFinite(host.svDrawingRangeM)) {
    return host.svDrawingRangeM;
  }
  return readSvDrawingRangeM();
}

export function isPanoDrawingWithinRange(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
  spot: PanoDrawing,
  rangeM = getSvDrawingRangeM(host),
): boolean {
  return distanceToPanoDrawing(host, cam, spot) <= rangeM;
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Поправка heading при показе рисунка с другой панорамы. */
export function panoParallaxHeading(
  host: DrawingOverlayHost,
  source: PanoDrawing,
  cam: StreetViewContext,
): number {
  if (isSamePanoDrawing(host, cam, source)) {
    return 0;
  }
  const dist = distanceToPanoDrawing(host, cam, source);
  const k = Math.min(1, dist / 36);
  const srcKey = drawingSpotKey(source);
  const curKey = liveSpotKey(host, cam);
  const walkFwd = walkBearingBetween(srcKey, curKey);
  if (walkFwd != null) {
    const visitH = source.visitHeading ?? walkFwd;
    return normalizeHeadingDelta(visitH, cam.heading) * k * 0.55;
  }
  const geo = metersBetween(cam, source);
  if (geo >= MIN_GEO_RADIUS_M) {
    return normalizeHeadingDelta(bearingDeg(cam, source), cam.heading) * k * 0.4;
  }
  return 0;
}

/** Панорамы с рисунками в пределах дальности (включая текущую). */
export function collectPanoDrawingsInRange(
  host: DrawingOverlayHost,
  cam: StreetViewContext,
): PanoDrawing[] {
  const out: PanoDrawing[] = [];
  const seen = new Set<string>();

  for (const d of host.panoDrawings) {
    if (!d.strokes.length) {
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

    if (isSamePanoDrawing(host, cam, d) && host.strokes.length > 0) {
      out.push({ ...d, strokes: filterAnchoredStrokes(host.strokes) });
    } else {
      out.push(d);
    }
  }

  if (host.strokes.length > 0) {
    const live: PanoDrawing = {
      lat: cam.lat,
      lng: cam.lng,
      panoId: cam.panoId,
      strokes: filterAnchoredStrokes(host.strokes),
    };
    if (isSamePanoDrawing(host, cam, live)) {
      const liveKey = drawingSpotKey(live);
      if (!seen.has(liveKey)) {
        out.push(live);
      }
    }
  }

  return out;
}
