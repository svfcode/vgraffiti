import type { StreetViewContext } from "../../lib/streetview-context";
import type { StoredStroke } from "../2.1-overlay-types";

/** Рисунок в одной точке Street View (экранные координаты). */
export type PanoDrawing = {
  lat: number;
  lng: number;
  panoId?: string;
  strokes: StoredStroke[];
};

/** Порог совпадения локации по координатам, м (если нет panoId). */
export const LOCATION_MATCH_M = 12;

export function locationKey(d: Pick<PanoDrawing, "lat" | "lng">): string {
  return `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`;
}

export function locationKeyFromSv(sv: StreetViewContext): string {
  return `ll:${locationKey(sv)}`;
}

export function spotKeyFromSv(sv: StreetViewContext): string {
  if (sv.panoId) {
    return `id:${sv.panoId}`;
  }
  return locationKeyFromSv(sv);
}

export function parseSpotKey(key: string): { panoId?: string; lat?: number; lng?: number } {
  if (key.startsWith("id:")) {
    return { panoId: key.slice(3) };
  }
  if (key.startsWith("ll:")) {
    const [latRaw, lngRaw] = key.slice(3).split(",");
    const lat = Number.parseFloat(latRaw ?? "");
    const lng = Number.parseFloat(lngRaw ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return {};
}

function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export function isSameLocation(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): boolean {
  return metersBetween(a, b) <= LOCATION_MATCH_M;
}

export function isSameSpot(
  a: Pick<PanoDrawing, "lat" | "lng" | "panoId">,
  b: Pick<StreetViewContext, "lat" | "lng" | "panoId">,
): boolean {
  if (a.panoId && b.panoId) {
    return a.panoId === b.panoId;
  }
  return isSameLocation(a, b);
}

export function isAnchoredStroke(stroke: StoredStroke): boolean {
  return stroke.coordSpace === "streetview";
}

export function filterAnchoredStrokes(strokes: StoredStroke[]): StoredStroke[] {
  return strokes.filter(isAnchoredStroke);
}

export function findPanoDrawingBySpotKey(
  drawings: PanoDrawing[],
  spotKey: string,
): PanoDrawing | null {
  const parsed = parseSpotKey(spotKey);
  if (parsed.panoId) {
    return drawings.find((d) => d.panoId === parsed.panoId) ?? null;
  }
  if (parsed.lat != null && parsed.lng != null) {
    const ll = locationKey({ lat: parsed.lat, lng: parsed.lng });
    const exact = drawings.find((d) => !d.panoId && locationKey(d) === ll);
    if (exact) {
      return exact;
    }
    return (
      drawings.find((d) => isSameLocation(d, { lat: parsed.lat!, lng: parsed.lng! })) ?? null
    );
  }
  return null;
}

export function findPanoDrawing(
  drawings: PanoDrawing[],
  sv: StreetViewContext,
): PanoDrawing | null {
  return findPanoDrawingBySpotKey(drawings, spotKeyFromSv(sv));
}

export function upsertPanoDrawingForSpotKey(
  drawings: PanoDrawing[],
  spotKey: string,
  strokes: StoredStroke[],
  sv?: StreetViewContext | null,
): void {
  const anchoredStrokes = filterAnchoredStrokes(strokes);
  const parsed = parseSpotKey(spotKey);
  let entry = findPanoDrawingBySpotKey(drawings, spotKey);
  if (!entry) {
    entry = {
      lat: parsed.lat ?? sv?.lat ?? 0,
      lng: parsed.lng ?? sv?.lng ?? 0,
      panoId: parsed.panoId ?? sv?.panoId,
      strokes: [],
    };
    drawings.push(entry);
  }
  if (sv) {
    entry.lat = sv.lat;
    entry.lng = sv.lng;
    if (sv.panoId) {
      entry.panoId = sv.panoId;
    }
  } else if (parsed.lat != null && parsed.lng != null) {
    entry.lat = parsed.lat;
    entry.lng = parsed.lng;
  }
  if (parsed.panoId) {
    entry.panoId = parsed.panoId;
  }
  entry.strokes = structuredClone(anchoredStrokes);
}

export function clonePanoDrawings(src: PanoDrawing[]): PanoDrawing[] {
  return structuredClone(src) as PanoDrawing[];
}

export function normalizePanoDrawing(raw: unknown): PanoDrawing | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const lat = typeof o.lat === "number" ? o.lat : null;
  const lng = typeof o.lng === "number" ? o.lng : null;
  if (lat == null || lng == null) {
    return null;
  }
  const panoId = typeof o.panoId === "string" && o.panoId ? o.panoId : undefined;
  const strokes = Array.isArray(o.strokes) ? filterAnchoredStrokes(o.strokes as StoredStroke[]) : [];
  return { lat, lng, panoId, strokes };
}

export function normalizePanoDrawings(raw: unknown): PanoDrawing[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(normalizePanoDrawing).filter((d): d is PanoDrawing => d != null);
}

/** @deprecated */
export function migrateMemoriesToPanoDrawings(): undefined {
  return undefined;
}
