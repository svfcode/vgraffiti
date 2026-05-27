/**
 * Чтение центра карты из page context (когда URL без ll=).
 */

import type { MapContext } from "./map-context";

const PROBE_MSG = "vgf:mapProbeResult";

/** Скрипт в контексте страницы: ymaps или координаты в URL/hash. */
function injectMapProbe(requestId: string): void {
  const script = document.createElement("script");
  script.textContent = `
(function () {
  var id = ${JSON.stringify(requestId)};
  function send(map) {
    window.postMessage({ type: ${JSON.stringify(PROBE_MSG)}, id: id, map: map }, "*");
  }
  try {
    var href = location.href;
    var m = href.match(/[?&#]ll=(-?\\d+(?:\\.\\d+)?)[,%2C](-?\\d+(?:\\.\\d+)?)/i);
    if (m) {
      send({ provider: "yandex", lat: parseFloat(m[2]), lng: parseFloat(m[1]), zoom: null });
      return;
    }
    m = href.match(/\\/(\\d{1,3}\\.\\d+)[,%2C](\\d{1,2}\\.\\d+)(?:\\/|[?&#]|$)/);
    if (m) {
      send({ provider: "yandex", lat: parseFloat(m[2]), lng: parseFloat(m[1]), zoom: null });
      return;
    }
    if (typeof ymaps !== "undefined" && ymaps.Map) {
      var nodes = document.querySelectorAll("[class*='map'], [class*='Map']");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el) continue;
        var inst = el.__ymaps_map || el._ymaps || (el.parentElement && el.parentElement.__ymaps_map);
        if (inst && typeof inst.getCenter === "function") {
          var c = inst.getCenter();
          var z = typeof inst.getZoom === "function" ? inst.getZoom() : null;
          if (c && c.length >= 2) {
            send({ provider: "yandex", lat: c[0], lng: c[1], zoom: z != null ? Math.round(z) : null });
            return;
          }
        }
      }
    }
  } catch (e) {}
  send(null);
})();
`;
  (document.documentElement || document.head).appendChild(script);
  script.remove();
}

function normalizeProbeMap(raw: unknown): MapContext | null {
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
  const zoom = typeof o.zoom === "number" && o.zoom > 0 ? Math.round(o.zoom) : undefined;
  return { provider, lat, lng, ...(zoom != null ? { zoom } : {}) };
}

/** Однократный опрос ymaps / URL в контексте страницы. */
export function probePageMapContext(timeoutMs = 600): Promise<MapContext | null> {
  return new Promise((resolve) => {
    const requestId = `vgf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let done = false;

    const finish = (map: MapContext | null) => {
      if (done) {
        return;
      }
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(map);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data || typeof event.data !== "object") {
        return;
      }
      const data = event.data as Record<string, unknown>;
      if (data.type !== PROBE_MSG || data.id !== requestId) {
        return;
      }
      finish(normalizeProbeMap(data.map));
    };

    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    try {
      injectMapProbe(requestId);
    } catch {
      finish(null);
    }
  });
}
