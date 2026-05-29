import { mapContextMoved, readMapContext, type MapContext } from "../../lib/map-context";
import { mapCenterFromPanPixels, mapZoom } from "../../lib/map-projection";
import {
  broadcastMapFollow,
  broadcastStrokes,
  ensureMapBridgeInstalled,
  installLiveMapProbe,
  pickViewportMapContext,
} from "../../lib/map-live-probe";
import type { GeoStrokePayload } from "../../lib/map-bridge-protocol";
import type { DrawingOverlayHost } from "../2.1-overlay-types";

/** Время последнего live-обновления от page-bridge (ymaps). */
let lastLiveAt = 0;

/** Интервал опроса URL как CSP-safe fallback (page-bridge может быть заблокирован). */
const URL_POLL_MS = 250;
/** Если live-bridge давал данные недавно — URL не трогаем (bridge точнее). */
const LIVE_FRESH_MS = 1500;

export function getViewportMap(host: DrawingOverlayHost): MapContext | null {
  const base = host.mapContext ?? readMapContext();
  if (!base) {
    return null;
  }
  const pan = host.panVisual;
  if (pan && (pan.dx !== 0 || pan.dy !== 0)) {
    return mapCenterFromPanPixels(base, { dx: pan.dx, dy: pan.dy });
  }
  return base;
}

export function syncMapFollow(host: DrawingOverlayHost): void {
  broadcastMapFollow(host.uiMode === "nav", host.mapContext ?? readMapContext());
}

export function installMapBinding(host: DrawingOverlayHost): () => void {
  ensureMapBridgeInstalled();
  host.mapContext = pickViewportMapContext(readMapContext());
  syncMapFollow(host);

  const unbind = installLiveMapProbe(
    (map) => {
      lastLiveAt = Date.now();
      const prev = host.mapContext;
      // Новый центр уже учитывает накопленный pan — сбрасываем смещение
      // атомарно с обновлением центра, иначе кадр со старым центром + pan=0
      // (или новым центром + старым pan) даёт «пропадание»/прыжок после пана.
      const hadPan = host.panVisual != null;
      host.mapContext = map;
      host.panVisual = null;
      if (mapContextMoved(prev, map) || hadPan) {
        host.scheduleRedraw();
      }
    },
    (pan) => {
      host.panVisual = pan.dx !== 0 || pan.dy !== 0 || pan.dragging ? pan : null;
      host.scheduleRedraw();
    },
    (native) => {
      if (host.mapNativeRender === native) {
        return;
      }
      host.mapNativeRender = native;
      if (native) {
        // ymaps теперь рисует завершённые штрихи сам — отдаём ему актуальные.
        syncStrokesToBridge(host);
      }
      host.scheduleRedraw();
    },
    (zooming) => {
      if (host.mapZooming === zooming) {
        return;
      }
      host.mapZooming = zooming;
      if (!zooming) {
        // Зум осел — подхватываем актуальный центр/зум из URL и репроецируем.
        const urlMap = readMapContext();
        if (urlMap) {
          host.mapContext = urlMap;
          host.panVisual = null;
        }
      }
      host.scheduleRedraw();
    },
  );

  // Если мост уже знает карту — сразу отдадим штрихи (на случай перезагрузки overlay).
  syncStrokesToBridge(host);

  // CSP-safe fallback: на Яндекс/Google CSP может блокировать inline page-bridge,
  // тогда live-события не приходят. Опрашиваем URL (ll=/z= или @lat,lng,z) —
  // карта обновляет его после pan/zoom, и рисунок «прилипает» к месту.
  const urlPoll = window.setInterval(() => {
    if (Date.now() - lastLiveAt < LIVE_FRESH_MS) {
      return;
    }
    const urlMap = readMapContext();
    if (!urlMap) {
      return;
    }
    if (mapContextMoved(host.mapContext, urlMap)) {
      host.mapContext = urlMap;
      host.scheduleRedraw();
    }
  }, URL_POLL_MS);

  return () => {
    unbind();
    window.clearInterval(urlPoll);
  };
}

export function captureZoom(host: DrawingOverlayHost): number {
  const map = getViewportMap(host);
  return map ? mapZoom(map) : 16;
}

/** Сериализует завершённые штрихи в гео-объекты для нативного слоя ymaps. */
export function syncStrokesToBridge(host: DrawingOverlayHost): void {
  const payload: GeoStrokePayload[] = [];
  for (const s of host.strokes) {
    if (s.kind === "brush") {
      payload.push({
        kind: "brush",
        coords: s.points.map((p) => [p[0], p[1]] as [number, number]),
        color: s.color,
        width: s.size,
      });
    } else if (s.kind === "arrow") {
      payload.push({
        kind: "arrow",
        coords: [
          [s.lat0, s.lng0],
          [s.lat1, s.lng1],
        ],
        color: s.color,
        width: s.lw,
      });
    } else if (s.kind === "square") {
      payload.push({
        kind: "square",
        lat0: s.lat0,
        lng0: s.lng0,
        lat1: s.lat1,
        lng1: s.lng1,
        color: s.color,
        width: s.lw,
      });
    }
    // eraser не имеет смысла как нативный гео-объект — пропускаем.
  }
  broadcastStrokes(payload);
}
