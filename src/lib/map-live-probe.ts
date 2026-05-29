/**
 * Изолированный мир: слушает обновления карты от MAIN-world моста
 * (`entrypoints/map-bridge.content.ts` → `runMapBridge`) и отдаёт их overlay'ю.
 */

import type { MapContext } from "./map-context";
import {
  FOLLOW_MSG,
  LIVE_MSG,
  PAN_VISUAL_MSG,
  RENDER_MODE_MSG,
  STROKES_MSG,
  ZOOM_STATE_MSG,
  ZOOM_VISUAL_MSG,
  type GeoStrokePayload,
} from "./map-bridge-protocol";

type LiveListener = (map: MapContext) => void;
type PanListener = (pan: { dx: number; dy: number; dragging: boolean }) => void;
type RenderModeListener = (native: boolean) => void;
type ZoomStateListener = (zooming: boolean) => void;
type ZoomVisualListener = (zoom: {
  deltaZ: number;
  pivotX: number;
  pivotY: number;
  anchor: MapContext;
}) => void;

let liveMap: MapContext | null = null;
let listener: LiveListener | null = null;
let panListener: PanListener | null = null;
let renderModeListener: RenderModeListener | null = null;
let zoomStateListener: ZoomStateListener | null = null;
let zoomVisualListener: ZoomVisualListener | null = null;
let installed = false;

function normalizeLiveMap(raw: unknown): MapContext | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const lat = o.lat;
  const lng = o.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const provider = o.provider === "google" ? "google" : "yandex";
  const zoomRaw = o.zoom;
  const zoom =
    typeof zoomRaw === "number" && Number.isFinite(zoomRaw) && zoomRaw > 0
      ? zoomRaw
      : undefined;
  return { provider, lat, lng, ...(zoom != null ? { zoom } : {}) };
}

/**
 * Совместимость: установка моста теперь выполняется отдельным MAIN-world
 * контент-скриптом (`entrypoints/map-bridge.content.ts`). Здесь — no-op.
 */
export function ensureMapBridgeInstalled(): void {
  /* мост ставится из map-bridge.content.ts (world: MAIN) */
}

function onWindowMessage(event: MessageEvent): void {
  if (event.source !== window || !event.data || typeof event.data !== "object") {
    return;
  }
  const data = event.data as Record<string, unknown>;
  if (data.type === PAN_VISUAL_MSG) {
    const dx = typeof data.dx === "number" ? data.dx : 0;
    const dy = typeof data.dy === "number" ? data.dy : 0;
    const dragging = !!data.dragging;
    panListener?.({ dx, dy, dragging });
    return;
  }
  if (data.type === RENDER_MODE_MSG) {
    renderModeListener?.(!!data.native);
    return;
  }
  if (data.type === ZOOM_STATE_MSG) {
    zoomStateListener?.(!!data.zooming);
    return;
  }
  if (data.type === ZOOM_VISUAL_MSG) {
    const anchor = normalizeLiveMap(data.anchor);
    if (!anchor) {
      return;
    }
    const deltaZ = typeof data.deltaZ === "number" ? data.deltaZ : 0;
    const pivotX = typeof data.pivotX === "number" ? data.pivotX : window.innerWidth / 2;
    const pivotY = typeof data.pivotY === "number" ? data.pivotY : window.innerHeight / 2;
    zoomVisualListener?.({ deltaZ, pivotX, pivotY, anchor });
    return;
  }
  if (data.type !== LIVE_MSG) {
    return;
  }
  const map = normalizeLiveMap(data.map);
  if (!map) {
    return;
  }
  liveMap = map;
  listener?.(map);
}

/** Устанавливает слушатель сдвига карты. */
export function installLiveMapProbe(
  onUpdate: LiveListener,
  onPan?: PanListener,
  onRenderMode?: RenderModeListener,
  onZoomState?: ZoomStateListener,
  onZoomVisual?: ZoomVisualListener,
): () => void {
  listener = onUpdate;
  panListener = onPan ?? null;
  renderModeListener = onRenderMode ?? null;
  zoomStateListener = onZoomState ?? null;
  zoomVisualListener = onZoomVisual ?? null;
  if (!installed) {
    installed = true;
    window.addEventListener("message", onWindowMessage);
    ensureMapBridgeInstalled();
  }
  return () => {
    if (listener === onUpdate) {
      listener = null;
    }
    if (panListener === onPan) {
      panListener = null;
    }
    if (renderModeListener === onRenderMode) {
      renderModeListener = null;
    }
    if (zoomStateListener === onZoomState) {
      zoomStateListener = null;
    }
    if (zoomVisualListener === onZoomVisual) {
      zoomVisualListener = null;
    }
  };
}

/** Overlay → bridge: отправить завершённые штрихи для нативного слоя ymaps. */
export function broadcastStrokes(strokes: GeoStrokePayload[]): void {
  window.postMessage({ type: STROKES_MSG, strokes }, "*");
}

export function readLiveMapContext(): MapContext | null {
  return liveMap;
}

/** Выбирает наиболее актуальный центр карты (live ymaps vs URL). */
export function pickViewportMapContext(urlMap: MapContext | null): MapContext | null {
  if (liveMap) {
    return liveMap;
  }
  return urlMap;
}

/** Включает отслеживание сдвига карты (режим «Нав» или просмотр рисунков). */
export function broadcastMapFollow(active: boolean, map: MapContext | null): void {
  window.postMessage(
    {
      type: FOLLOW_MSG,
      active,
      map,
    },
    "*",
  );
}

/** @deprecated используйте broadcastMapFollow */
export function broadcastNavMode(active: boolean, map: MapContext | null): void {
  broadcastMapFollow(active, map);
}
