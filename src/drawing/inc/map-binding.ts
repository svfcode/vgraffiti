import { mapContextMoved, readMapContext, type MapContext } from "../../lib/map-context";
import { mapCenterFromPanPixels, mapWithZoomVisual, mapZoom } from "../../lib/map-projection";
import {
  readStreetViewContext,
  type StreetViewContext,
} from "../../lib/streetview-context";
import {
  broadcastMapFollow,
  broadcastStrokes,
  ensureMapBridgeInstalled,
  installLiveMapProbe,
  pickViewportMapContext,
} from "../../lib/map-live-probe";
import { PANO_CONTEXT_MSG, type GeoStrokePayload } from "../../lib/map-bridge-protocol";
import { getDisplayStrokes, syncJourneyPanel } from "../handlers/2.6.5-handle-journeys";
import { onBridgePanoId, syncSpotFromPage } from "./handle-pano";
import type { DrawingOverlayHost } from "../2.1-overlay-types";

/** Время последнего live-обновления от page-bridge (ymaps). */
let lastLiveAt = 0;

/** Интервал опроса URL как CSP-safe fallback (page-bridge может быть заблокирован). */
const URL_POLL_MS = 250;
/** Если live-bridge давал данные недавно — URL не трогаем (bridge точнее). */
const LIVE_FRESH_MS = 1500;

export function getStreetViewContext(host: DrawingOverlayHost): StreetViewContext | null {
  return host.streetViewContext ?? readStreetViewContext();
}

export function syncStreetViewContext(host: DrawingOverlayHost): boolean {
  return syncSpotFromPage(host);
}

export function getViewportMap(host: DrawingOverlayHost): MapContext | null {
  if (host.viewportMode === "streetview") {
    return null;
  }
  let base = host.mapContext ?? readMapContext();
  if (!base) {
    return null;
  }
  const zv = host.zoomVisual;
  if (zv && Math.abs(zv.deltaZ) > 1e-6) {
    base = mapWithZoomVisual(zv.anchor, zv.deltaZ, zv.pivotX, zv.pivotY);
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
  syncJourneyPanel(host);
  syncMapFollow(host);

  const unbind = installLiveMapProbe(
    (map) => {
      if (host.viewportMode === "streetview") {
        return;
      }
      lastLiveAt = Date.now();
      if (host.mapZooming) {
        return;
      }
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
      if (host.viewportMode === "streetview") {
        return;
      }
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
      if (host.viewportMode === "streetview") {
        return;
      }
      if (host.mapZooming === zooming) {
        return;
      }
      host.mapZooming = zooming;
      if (!zooming) {
        host.zoomVisual = null;
        const urlMap = readMapContext();
        if (urlMap) {
          host.mapContext = urlMap;
          host.panVisual = null;
        }
      }
      host.scheduleRedraw();
    },
    (zoom) => {
      if (host.viewportMode === "streetview") {
        return;
      }
      if (
        !zoom.anchor ||
        typeof zoom.anchor.lat !== "number" ||
        typeof zoom.anchor.lng !== "number"
      ) {
        host.zoomVisual = null;
      } else if (Math.abs(zoom.deltaZ) < 1e-6 && !host.mapZooming) {
        host.zoomVisual = null;
      } else {
        host.zoomVisual = {
          anchor: zoom.anchor,
          deltaZ: zoom.deltaZ,
          pivotX: zoom.pivotX,
          pivotY: zoom.pivotY,
        };
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
    if (host.viewportMode === "streetview") {
      if (syncSpotFromPage(host)) {
        host.scheduleRedraw();
      }
      return;
    }
    if (host.mapZooming) {
      return;
    }
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

  // POV-привязка к сцене: часто перечитываем ракурс из URL и репроецируем штрихи.
  const svPoll = window.setInterval(() => {
    if (host.viewportMode !== "streetview") {
      return;
    }
    syncSpotFromPage(host);
    host.scheduleRedraw();
  }, 60);

  const onPanoMessage = (event: MessageEvent): void => {
    if (event.source !== window || !event.data || typeof event.data !== "object") {
      return;
    }
    const data = event.data as Record<string, unknown>;
    if (data.type !== PANO_CONTEXT_MSG) {
      return;
    }
    const panoId = typeof data.panoId === "string" && data.panoId ? data.panoId : undefined;
    if (panoId) {
      onBridgePanoId(host, panoId);
      return;
    }
    if (syncSpotFromPage(host)) {
      host.scheduleRedraw();
    }
  };
  window.addEventListener("message", onPanoMessage);

  return () => {
    unbind();
    window.removeEventListener("message", onPanoMessage);
    window.clearInterval(urlPoll);
    window.clearInterval(svPoll);
  };
}

export function captureZoom(host: DrawingOverlayHost): number {
  if (host.viewportMode === "streetview") {
    const sv = getStreetViewContext(host);
    return sv?.fov ?? 90;
  }
  const map = getViewportMap(host);
  return map ? mapZoom(map) : 16;
}

export function captureFov(host: DrawingOverlayHost): number {
  const sv = getStreetViewContext(host);
  return sv?.fov ?? 90;
}

/** Сериализует завершённые штрихи в гео-объекты для нативного слоя ymaps. */
export function syncStrokesToBridge(host: DrawingOverlayHost): void {
  if (host.viewportMode === "streetview") {
    broadcastStrokes([]);
    return;
  }
  const payload: GeoStrokePayload[] = [];
  for (const s of getDisplayStrokes(host)) {
    if (s.coordSpace === "streetview" || s.coordSpace === "screen" || s.coordSpace === "viewmemory") {
      continue;
    }
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
