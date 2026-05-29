import { mapContextMoved, readMapContext, type MapContext } from "../../lib/map-context";
import { mapCenterFromPanPixels, mapZoom } from "../../lib/map-projection";
import {
  broadcastMapFollow,
  ensureMapBridgeInstalled,
  installLiveMapProbe,
  pickViewportMapContext,
} from "../../lib/map-live-probe";
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
      host.mapContext = map;
      if (mapContextMoved(prev, map)) {
        host.scheduleRedraw();
      }
    },
    (pan) => {
      host.panVisual = pan.dx !== 0 || pan.dy !== 0 || pan.dragging ? pan : null;
      host.scheduleRedraw();
    },
  );

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
