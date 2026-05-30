import { mercatorPixel, mercatorToLatLng, mapZoom } from "../../lib/map-projection";
import type { MapContext } from "../../lib/map-context";
import type { StoredStroke } from "../2.1-overlay-types";

const NUDGE_PX = 6;

function shiftLatLng(lat: number, lng: number, dxPx: number, dyPx: number, zoom: number): [number, number] {
  const mp = mercatorPixel(lat, lng, zoom);
  const ll = mercatorToLatLng(mp.x + dxPx, mp.y + dyPx, zoom);
  return [ll.lat, ll.lng];
}

/** Сдвигает все точки штрихов на dx/dy пикселей (Web Mercator при zoom). */
export function shiftStoredStrokes(
  strokes: StoredStroke[],
  dxPx: number,
  dyPx: number,
  map: MapContext,
): void {
  const z = mapZoom(map);
  for (const s of strokes) {
    if (s.kind === "brush" || s.kind === "eraser") {
      for (const p of s.points) {
        const [lat, lng] = shiftLatLng(p[0], p[1], dxPx, dyPx, z);
        p[0] = lat;
        p[1] = lng;
      }
    } else {
      const [lat0, lng0] = shiftLatLng(s.lat0, s.lng0, dxPx, dyPx, z);
      const [lat1, lng1] = shiftLatLng(s.lat1, s.lng1, dxPx, dyPx, z);
      s.lat0 = lat0;
      s.lng0 = lng0;
      s.lat1 = lat1;
      s.lng1 = lng1;
    }
  }
}

export function nudgeDirectionToPixels(dir: "up" | "down" | "left" | "right"): { dx: number; dy: number } {
  switch (dir) {
    case "up":
      return { dx: 0, dy: -NUDGE_PX };
    case "down":
      return { dx: 0, dy: NUDGE_PX };
    case "left":
      return { dx: -NUDGE_PX, dy: 0 };
    case "right":
      return { dx: NUDGE_PX, dy: 0 };
  }
}

/** Центр массы всех точек рисунка (для переноса вида карты). */
export function getStrokesGeoCenter(strokes: StoredStroke[]): { lat: number; lng: number } | null {
  let sumLat = 0;
  let sumLng = 0;
  let n = 0;
  for (const s of strokes) {
    if (s.kind === "brush" || s.kind === "eraser") {
      for (const p of s.points) {
        sumLat += p[0];
        sumLng += p[1];
        n++;
      }
    } else {
      sumLat += s.lat0 + s.lat1;
      sumLng += s.lng0 + s.lng1;
      n += 2;
    }
  }
  if (n === 0) {
    return null;
  }
  return { lat: sumLat / n, lng: sumLng / n };
}
