import type { MapContext } from "./map-context";

/** Web Mercator: пиксель на мировой карте при zoom. */
export function mercatorPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Обратная проекция Web Mercator → lat/lng. */
export function mercatorToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = 256 * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale)));
  return { lat, lng };
}

export function mapZoom(map: MapContext, fallback = 16): number {
  const z = map.zoom;
  return z != null && z > 0 ? z : fallback;
}

export type ViewportFrame = { cx: number; cy: number; w: number; h: number };

/** Canvas панорамы Google Street View (не overlay расширения). */
export function getStreetViewViewportFrame(): ViewportFrame | null {
  const scene =
    document.querySelector(".widget-scene canvas") ??
    document.querySelector(".scene-core-webgl canvas") ??
    document.querySelector(".widget-scene-canvas canvas") ??
    document.querySelector(".widget-scene");
  if (!scene) {
    return null;
  }
  const r = scene.getBoundingClientRect();
  if (r.width < 120 || r.height < 120) {
    return null;
  }
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    w: r.width,
    h: r.height,
  };
}

/** Кадр для проекции в Street View: панорама → fallback. */
export function getProjectionViewportFrame(svFrame: ViewportFrame | null): ViewportFrame {
  if (svFrame) {
    return svFrame;
  }
  const dom = getStreetViewViewportFrame();
  if (dom) {
    return dom;
  }
  return getMapViewportFrame();
}

/** Центр и размер области карты (крупнейший canvas на странице). */
export function getMapViewportFrame(): ViewportFrame {
  let best: DOMRect | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll("canvas")) {
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 200) {
      continue;
    }
    const area = r.width * r.height;
    if (area > bestArea) {
      bestArea = area;
      best = r;
    }
  }
  if (best) {
    return {
      cx: best.left + best.width / 2,
      cy: best.top + best.height / 2,
      w: best.width,
      h: best.height,
    };
  }
  return {
    cx: window.innerWidth / 2,
    cy: window.innerHeight / 2,
    w: window.innerWidth,
    h: window.innerHeight,
  };
}

/** Точка экрана (CSS px) → географические координаты. */
export function screenToMapGeo(
  sx: number,
  sy: number,
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
): { lat: number; lng: number } {
  const z = mapZoom(map);
  const center = mercatorPixel(map.lat, map.lng, z);
  const dx = sx - frame.cx;
  const dy = sy - frame.cy;
  return mercatorToLatLng(center.x + dx, center.y + dy, z);
}

/** lat/lng → точка на canvas (CSS px относительно viewport). */
export function mapGeoToScreen(
  lat: number,
  lng: number,
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
): { x: number; y: number } {
  const z = mapZoom(map);
  const { dx, dy } = pixelOffsetFromCenter(lat, lng, map.lat, map.lng, z);
  return { x: frame.cx + dx, y: frame.cy + dy };
}

/** Масштаб толщины штриха при смене zoom (размер задан при captureZoom). */
export function strokeSizeAtZoom(sizeAtCapture: number, captureZoom: number, currentZoom: number): number {
  return sizeAtCapture * 2 ** (currentZoom - captureZoom);
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
 * Эффективный контекст карты при визуальном зуме: масштаб z0+deltaZ и центр,
 * при котором geo-точка под pivot остаётся на экране (zoom-to-point).
 */
export function mapWithZoomVisual(
  anchor: MapContext,
  deltaZ: number,
  pivotX: number,
  pivotY: number,
  frame: ViewportFrame = getMapViewportFrame(),
): MapContext {
  if (Math.abs(deltaZ) < 1e-6) {
    return anchor;
  }
  const z0 = mapZoom(anchor);
  const z1 = z0 + deltaZ;
  const pivotGeo = screenToMapGeo(pivotX, pivotY, anchor, frame);
  const p = mercatorPixel(pivotGeo.lat, pivotGeo.lng, z1);
  const desiredDx = pivotX - frame.cx;
  const desiredDy = pivotY - frame.cy;
  const center = mercatorToLatLng(p.x - desiredDx, p.y - desiredDy, z1);
  return { ...anchor, lat: center.lat, lng: center.lng, zoom: z1 };
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
