import type { MapContext } from "./map-context";

/** Web Mercator: пиксель на мировой карте при zoom. */
export function mercatorPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Смещение точки от центра карты в пикселях (при текущем zoom). */
export function pixelOffsetFromCenter(
  pointLat: number,
  pointLng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
): { dx: number; dy: number } {
  const c = mercatorPixel(centerLat, centerLng, zoom);
  const p = mercatorPixel(pointLat, pointLng, zoom);
  return { dx: p.x - c.x, dy: p.y - c.y };
}

/** Радиус поиска в градусах — примерно половина видимой области карты. */
export function searchRadiusDeg(map: MapContext, viewportW = window.innerWidth): number {
  const z = map.zoom ?? 16;
  const latRad = (map.lat * Math.PI) / 180;
  const scale = 256 * 2 ** z;
  const metersPerPixel = (156543.03392 * Math.cos(latRad)) / scale;
  const halfWidthM = (viewportW / 2) * metersPerPixel;
  const degLat = halfWidthM / 111320;
  const cosLat = Math.max(0.01, Math.cos(latRad));
  const degLng = halfWidthM / (111320 * cosLat);
  return Math.max(degLat, degLng) * 1.25;
}

export type PlacedRect = { x: number; y: number; w: number; h: number };

export type PanPixelOffset = { dx: number; dy: number };

/** Смещение центра карты по накопленному pan в пикселях окна (inverse Web Mercator). */
export function mapCenterFromPanPixels(anchor: MapContext, panPx: PanPixelOffset): MapContext {
  const z = anchor.zoom ?? 16;
  const scale = 256 * 2 ** z;
  const lng = anchor.lng + (-panPx.dx / scale) * 360;
  const sinLat = Math.sin((anchor.lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  const y2 = y + -panPx.dy;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y2) / scale)));
  return { ...anchor, lat, lng, zoom: z };
}

/**
 * Прямоугольник рисунка на экране: смещение от центра + масштаб по разнице zoom.
 * Рисунок сохранялся на весь viewport при savedZoom с центром в (lat, lng).
 * panPx — доп. смещение при перетаскивании карты (пиксели окна).
 */
export function placedDrawingRect(
  viewW: number,
  viewH: number,
  currentMap: MapContext,
  drawing: { lat: number; lng: number; zoom: number },
  panPx: PanPixelOffset | null = null,
): PlacedRect {
  const z = currentMap.zoom ?? drawing.zoom ?? 16;
  const savedZoom = drawing.zoom > 0 ? drawing.zoom : z;
  const scale = 2 ** (z - savedZoom);
  const { dx, dy } = pixelOffsetFromCenter(
    drawing.lat,
    drawing.lng,
    currentMap.lat,
    currentMap.lng,
    z,
  );
  const w = viewW * scale;
  const h = viewH * scale;
  const px = panPx?.dx ?? 0;
  const py = panPx?.dy ?? 0;
  return {
    x: viewW / 2 + dx - w / 2 - px,
    y: viewH / 2 + dy - h / 2 - py,
    w,
    h,
  };
}
