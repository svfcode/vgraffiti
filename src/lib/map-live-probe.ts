/**
 * Следит за центром карты: ymaps / URL / сдвиг указателем (режим просмотра и «Нав»).
 */

import type { MapContext } from "./map-context";

const LIVE_MSG = "vgf:mapLiveUpdate";
const FOLLOW_MSG = "vgf:setMapFollow";
const PAN_VISUAL_MSG = "vgf:mapPanVisual";
const INSTALL_FLAG = "__vgfMapLiveInstalled";

type LiveListener = (map: MapContext) => void;
type PanListener = (pan: { dx: number; dy: number; dragging: boolean }) => void;

let liveMap: MapContext | null = null;
let listener: LiveListener | null = null;
let panListener: PanListener | null = null;
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

/** Устанавливает page-bridge (можно вызывать из MAIN world на document_start). */
export function ensureMapBridgeInstalled(): void {
  try {
    injectLiveMapScript();
  } catch {
    /* ignore */
  }
}

function injectLiveMapScript(): void {
  const script = document.createElement("script");
  script.textContent = `
(function () {
  if (window.${INSTALL_FLAG}) return;
  window.${INSTALL_FLAG} = true;
  var MSG = ${JSON.stringify(LIVE_MSG)};
  var FOLLOW = ${JSON.stringify(FOLLOW_MSG)};
  var PAN = ${JSON.stringify(PAN_VISUAL_MSG)};
  var maps = window.__vgfMaps = window.__vgfMaps || [];
  var lastSent = "";
  var followActive = false;
  var anchor = null;
  var panDx = 0;
  var panDy = 0;
  var panLastClientX = null;
  var panLastClientY = null;
  var dragging = false;
  var dragPoll = null;

  function parseUrlMap() {
    try {
      var href = location.href;
      var m = href.match(/[?&#]ll=(-?\\d+(?:\\.\\d+)?)[,%2C](-?\\d+(?:\\.\\d+)?)/i);
      if (m) {
        var z = href.match(/[?&#]z=(\\d+(?:\\.\\d+)?)/i);
        return {
          provider: "yandex",
          lat: parseFloat(m[2]),
          lng: parseFloat(m[1]),
          zoom: z ? parseFloat(z[1]) : null,
        };
      }
      m = href.match(/@(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(\\d+(?:\\.\\d+)?)z/i);
      if (m) {
        return {
          provider: "google",
          lat: parseFloat(m[1]),
          lng: parseFloat(m[2]),
          zoom: parseFloat(m[3]),
        };
      }
    } catch (e) {}
    return null;
  }

  function send(map) {
    if (!map || typeof map.lat !== "number" || typeof map.lng !== "number") return;
    var z = map.zoom != null ? Number(map.zoom).toFixed(3) : "";
    var key = map.lat.toFixed(8) + ":" + map.lng.toFixed(8) + ":" + z;
    if (key === lastSent) return;
    lastSent = key;
    window.postMessage({ type: MSG, map: map }, "*");
  }

  function geoFromPixelOffset(lat, lng, zoom, dx, dy) {
    var z = zoom > 0 ? zoom : 16;
    var scale = 256 * Math.pow(2, z);
    var lng2 = lng + (dx / scale) * 360;
    var sinLat = Math.sin((lat * Math.PI) / 180);
    var y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    var y2 = y + dy;
    var lat2 = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y2) / scale)));
    return { lat: lat2, lng: lng2 };
  }

  function sendPanVisual() {
    window.postMessage({ type: PAN, dx: panDx, dy: panDy, dragging: dragging }, "*");
  }

  function sendEffectiveFromPan() {
    if (!followActive || !anchor) return;
    var z = anchor.zoom > 0 ? anchor.zoom : 16;
    var eff = geoFromPixelOffset(anchor.lat, anchor.lng, z, -panDx, -panDy);
    send({
      provider: anchor.provider || "yandex",
      lat: eff.lat,
      lng: eff.lng,
      zoom: z,
    });
  }

  function readYmaps2State(inst) {
    if (!inst || typeof inst.getCenter !== "function") return null;
    try {
      var c = inst.getCenter();
      var z = typeof inst.getZoom === "function" ? inst.getZoom() : null;
      if (!c || c.length < 2) return null;
      return {
        provider: "yandex",
        lat: c[0],
        lng: c[1],
        zoom: z != null && z > 0 ? z : null,
      };
    } catch (e) {
      return null;
    }
  }

  function readLiveFromMaps() {
    for (var i = maps.length - 1; i >= 0; i--) {
      var st = readYmaps2State(maps[i]);
      if (st) return st;
    }
    return null;
  }

  function syncFromMapsOrUrl() {
    var st = readLiveFromMaps();
    if (st) {
      anchor = st;
      panDx = panDy = 0;
      send(st);
      return;
    }
    var urlMap = parseUrlMap();
    if (!urlMap) return;
    if (
      !anchor ||
      Math.abs(urlMap.lat - anchor.lat) > 1e-7 ||
      Math.abs(urlMap.lng - anchor.lng) > 1e-7 ||
      (urlMap.zoom != null && anchor.zoom != null && urlMap.zoom !== anchor.zoom)
    ) {
      anchor = urlMap;
      panDx = panDy = 0;
      send(urlMap);
    }
  }

  function register2(inst) {
    if (!inst || inst.__vgfLiveAttached) return;
    inst.__vgfLiveAttached = true;
    if (maps.indexOf(inst) < 0) maps.push(inst);
    function push() {
      var st = readYmaps2State(inst);
      if (st) {
        anchor = st;
        panDx = panDy = 0;
        send(st);
      }
    }
    push();
    if (inst.events && typeof inst.events.add === "function") {
      inst.events.add("boundschange", push);
      inst.events.add("actionend", push);
      inst.events.add("action", push);
    }
  }

  function scanDomForMap() {
    try {
      if (typeof ymaps === "undefined") return;
      var el = document.querySelector(".ymaps-2-1-map") || document.querySelector("[class*='map-main']");
      if (!el) return;
      var inst = el.__ymaps_map || el._ymaps;
      if (inst) register2(inst);
    } catch (e) {}
  }

  function patchYmaps2() {
    if (typeof ymaps === "undefined" || !ymaps.Map || ymaps.Map.__vgfPatched) return;
    var Orig = ymaps.Map;
    function Wrapped() {
      var inst = new (Function.prototype.bind.apply(Orig, [null].concat(Array.prototype.slice.call(arguments))));
      register2(inst);
      return inst;
    }
    Wrapped.prototype = Orig.prototype;
    Wrapped.__vgfPatched = true;
    ymaps.Map = Wrapped;
    if (typeof ymaps.ready === "function") {
      ymaps.ready(scanDomForMap);
    }
  }

  function isOverlayUi(ev) {
    try {
      var path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n && n.getAttribute && n.getAttribute("data-vgraffiti-overlay") === "1") return true;
      }
    } catch (e) {}
    return false;
  }

  function stopDragPoll() {
    if (dragPoll) {
      clearInterval(dragPoll);
      dragPoll = null;
    }
  }

  function hookHistory() {
    function onUrl() {
      var urlMap = parseUrlMap();
      if (urlMap) {
        anchor = urlMap;
        panDx = panDy = 0;
        send(urlMap);
      }
    }
    window.addEventListener("popstate", onUrl);
    window.addEventListener("hashchange", onUrl);
    var push = history.pushState;
    var replace = history.replaceState;
    history.pushState = function () {
      var r = push.apply(this, arguments);
      onUrl();
      return r;
    };
    history.replaceState = function () {
      var r = replace.apply(this, arguments);
      onUrl();
      return r;
    };
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window || !event.data || typeof event.data !== "object") return;
    if (event.data.type !== FOLLOW) return;
    followActive = !!event.data.active;
    if (event.data.map && typeof event.data.map.lat === "number") {
      anchor = event.data.map;
      panDx = panDy = 0;
      lastSent = "";
      send(event.data.map);
    } else if (!anchor) {
      anchor = parseUrlMap();
    }
    if (!followActive) {
      dragging = false;
      stopDragPoll();
    }
  });

  window.addEventListener(
    "pointerdown",
    function (e) {
      if (!followActive || e.button !== 0 || isOverlayUi(e)) return;
      dragging = true;
      if (!anchor) anchor = parseUrlMap();
      panDx = panDy = 0;
      panLastClientX = typeof e.clientX === "number" ? e.clientX : null;
      panLastClientY = typeof e.clientY === "number" ? e.clientY : null;
      sendPanVisual();
      stopDragPoll();
      dragPoll = setInterval(syncFromMapsOrUrl, 24);
    },
    true,
  );

  window.addEventListener(
    "pointermove",
    function (e) {
      if (!followActive || !dragging || isOverlayUi(e)) return;
      var ddx = 0;
      var ddy = 0;
      if (e.movementX || e.movementY) {
        ddx = e.movementX;
        ddy = e.movementY;
      } else if (
        panLastClientX != null &&
        panLastClientY != null &&
        (typeof e.clientX === "number" && typeof e.clientY === "number")
      ) {
        ddx = e.clientX - panLastClientX;
        ddy = e.clientY - panLastClientY;
      }
      if (typeof e.clientX === "number" && typeof e.clientY === "number") {
        panLastClientX = e.clientX;
        panLastClientY = e.clientY;
      }
      if (ddx || ddy) {
        panDx += ddx;
        panDy += ddy;
        sendPanVisual();
      }
    },
    true,
  );

  window.addEventListener(
    "pointerup",
    function () {
      if (!dragging) return;
      dragging = false;
      sendEffectiveFromPan();
      panDx = panDy = 0;
      panLastClientX = null;
      panLastClientY = null;
      sendPanVisual();
      stopDragPoll();
      syncFromMapsOrUrl();
    },
    true,
  );

  window.addEventListener(
    "pointercancel",
    function () {
      if (!dragging) return;
      dragging = false;
      sendEffectiveFromPan();
      panDx = panDy = 0;
      panLastClientX = null;
      panLastClientY = null;
      sendPanVisual();
      stopDragPoll();
    },
    true,
  );

  hookHistory();
  patchYmaps2();
  scanDomForMap();
  anchor = parseUrlMap();
  if (anchor) send(anchor);
  setInterval(function () {
    patchYmaps2();
    scanDomForMap();
  }, 2000);
  setInterval(function () {
    if (followActive && !dragging) {
      syncFromMapsOrUrl();
    }
  }, 66);
})();
`;
  (document.documentElement || document.head).appendChild(script);
  script.remove();
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
export function installLiveMapProbe(onUpdate: LiveListener, onPan?: PanListener): () => void {
  listener = onUpdate;
  panListener = onPan ?? null;
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
  };
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
