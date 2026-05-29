/**
 * Мост к карте в MAIN world (контекст страницы).
 *
 * Запускается из контент-скрипта `entrypoints/map-bridge.content.ts` с `world: "MAIN"`,
 * поэтому имеет доступ к глобальному `ymaps` и не блокируется CSP страницы
 * (в отличие от inline-`<script>`). Общается с изолированным миром через postMessage
 * по протоколу из `map-bridge-protocol.ts`.
 */

import {
  FOLLOW_MSG,
  INSTALL_FLAG,
  LIVE_MSG,
  PAN_VISUAL_MSG,
  RENDER_MODE_MSG,
  STROKES_MSG,
  ZOOM_STATE_MSG,
  type GeoStrokePayload,
} from "./map-bridge-protocol";

type BridgeMap = {
  provider: "yandex" | "google";
  lat: number;
  lng: number;
  zoom: number | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export function runMapBridge(): void {
  const w = window as any;
  if (w[INSTALL_FLAG]) {
    return;
  }
  w[INSTALL_FLAG] = true;

  const maps: any[] = (w.__vgfMaps = w.__vgfMaps || []);
  let lastSent = "";
  let followActive = false;
  let anchor: BridgeMap | null = null;
  let panDx = 0;
  let panDy = 0;
  let panLastClientX: number | null = null;
  let panLastClientY: number | null = null;
  let dragging = false;
  let dragPoll: ReturnType<typeof setInterval> | null = null;
  // После отпускания Яндекс ещё какое-то время держит в URL старый (до-пановый)
  // центр. Чтобы не «прыгнуть» рисунком на старое место, принимаем URL только
  // когда он реально сдвинулся к ожидаемому центру (ближе к нему, чем к старому).
  let panStartCenter: BridgeMap | null = null;
  let panExpected: BridgeMap | null = null;
  let awaitingMove = false;

  // Нативный слой ymaps (вариант A): завершённые штрихи как гео-объекты.
  let currentMap: any = null;
  let myCollection: any = null;
  let pendingStrokes: GeoStrokePayload[] = [];

  function announceRenderMode(native: boolean): void {
    window.postMessage({ type: RENDER_MODE_MSG, native }, "*");
  }

  function rebuildGeoObjects(): void {
    const ymaps = w.ymaps;
    if (!ymaps || !currentMap || !currentMap.geoObjects) {
      return;
    }
    try {
      if (!myCollection) {
        myCollection = new ymaps.GeoObjectCollection(null, {});
        currentMap.geoObjects.add(myCollection);
      }
      myCollection.removeAll();
      for (const s of pendingStrokes) {
        let obj: any = null;
        if (s.kind === "brush" || s.kind === "arrow") {
          if (!s.coords || s.coords.length < 2) {
            continue;
          }
          obj = new ymaps.GeoObject(
            { geometry: { type: "LineString", coordinates: s.coords } },
            {
              strokeColor: s.color,
              strokeWidth: s.width,
              strokeOpacity: 1,
            },
          );
        } else if (s.kind === "square") {
          obj = new ymaps.GeoObject(
            {
              geometry: {
                type: "Rectangle",
                coordinates: [
                  [s.lat0, s.lng0],
                  [s.lat1, s.lng1],
                ],
              },
            },
            {
              strokeColor: s.color,
              strokeWidth: s.width,
              strokeOpacity: 1,
              fillOpacity: 0,
            },
          );
        }
        if (obj) {
          myCollection.add(obj);
        }
      }
    } catch {
      /* ymaps мог не успеть инициализироваться */
    }
  }

  function parseUrlMap(): BridgeMap | null {
    try {
      const href = location.href;
      let m = href.match(/[?&#]ll=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
      if (m) {
        const z = href.match(/[?&#]z=(\d+(?:\.\d+)?)/i);
        return {
          provider: "yandex",
          lat: parseFloat(m[2]!),
          lng: parseFloat(m[1]!),
          zoom: z ? parseFloat(z[1]!) : null,
        };
      }
      m = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/i);
      if (m) {
        return {
          provider: "google",
          lat: parseFloat(m[1]!),
          lng: parseFloat(m[2]!),
          zoom: parseFloat(m[3]!),
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function send(map: BridgeMap | null): void {
    if (!map || typeof map.lat !== "number" || typeof map.lng !== "number") {
      return;
    }
    const z = map.zoom != null ? Number(map.zoom).toFixed(3) : "";
    const key = map.lat.toFixed(8) + ":" + map.lng.toFixed(8) + ":" + z;
    if (key === lastSent) {
      return;
    }
    lastSent = key;
    window.postMessage({ type: LIVE_MSG, map }, "*");
  }

  // Коалесцируем отправку до 1 раза в кадр: ymaps шлёт actiontick пачками,
  // без этого изолированный мир захлёбывается postMessage и redraw отстаёт.
  let pendingSend: BridgeMap | null = null;
  let sendRaf: number | null = null;

  function flushSend(): void {
    sendRaf = null;
    const m = pendingSend;
    pendingSend = null;
    if (m) {
      send(m);
    }
  }

  function queueSend(map: BridgeMap | null): void {
    if (!map) {
      return;
    }
    pendingSend = map;
    if (sendRaf == null) {
      sendRaf = requestAnimationFrame(flushSend);
    }
  }

  function geoFromPixelOffset(
    lat: number,
    lng: number,
    zoom: number,
    dx: number,
    dy: number,
  ): { lat: number; lng: number } {
    const z = zoom > 0 ? zoom : 16;
    const scale = 256 * Math.pow(2, z);
    const lng2 = lng + (dx / scale) * 360;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    const y2 = y + dy;
    const lat2 = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y2) / scale)));
    return { lat: lat2, lng: lng2 };
  }

  function sendPanVisual(): void {
    window.postMessage({ type: PAN_VISUAL_MSG, dx: panDx, dy: panDy, dragging }, "*");
  }

  function effFromPan(): BridgeMap | null {
    if (!anchor) {
      return null;
    }
    const z = anchor.zoom && anchor.zoom > 0 ? anchor.zoom : 16;
    const eff = geoFromPixelOffset(anchor.lat, anchor.lng, z, -panDx, -panDy);
    return {
      provider: anchor.provider || "yandex",
      lat: eff.lat,
      lng: eff.lng,
      zoom: z,
    };
  }

  function sendEffectiveFromPan(): void {
    if (!followActive) {
      return;
    }
    const next = effFromPan();
    if (!next) {
      return;
    }
    send(next);
    // Якорь = центр на момент отпускания, чтобы цепочка пан→пан и догон
    // инерции через URL считались от актуальной позиции.
    anchor = next;
  }

  // Быстрый дозор после отпускания/зума: карта Яндекса доезжает по инерции,
  // живого API нет → финальный центр берём из URL. Фоновый опрос (66 мс)
  // ловит его поздно, поэтому на ~1.2 с включаем опрос ~24 мс — догоняем
  // и промежуточные кадры инерции, и финал заметно раньше.
  let settlePoll: ReturnType<typeof setInterval> | null = null;
  let settleUntil = 0;
  const SETTLE_POLL_MS = 24;
  const SETTLE_WINDOW_MS = 1200;

  function startSettlePoll(): void {
    settleUntil = Date.now() + SETTLE_WINDOW_MS;
    if (settlePoll) {
      return;
    }
    settlePoll = setInterval(() => {
      if (followActive && !dragging) {
        syncFromMapsOrUrl();
      }
      if (Date.now() > settleUntil && settlePoll) {
        clearInterval(settlePoll);
        settlePoll = null;
        // URL так и не сдвинулся к ожидаемому центру — фиксируем рисунок
        // по месту отпускания, без скачка, чтобы смещение не «зависло».
        if (!dragging && (panDx !== 0 || panDy !== 0)) {
          sendEffectiveFromPan();
          panDx = panDy = 0;
          sendPanVisual();
        }
        awaitingMove = false;
      }
    }, SETTLE_POLL_MS);
  }

  function readYmaps2State(inst: any): BridgeMap | null {
    if (!inst || typeof inst.getCenter !== "function") {
      return null;
    }
    try {
      const c = inst.getCenter();
      const z = typeof inst.getZoom === "function" ? inst.getZoom() : null;
      if (!c || c.length < 2) {
        return null;
      }
      return {
        provider: "yandex",
        lat: c[0],
        lng: c[1],
        zoom: z != null && z > 0 ? z : null,
      };
    } catch {
      return null;
    }
  }

  function readLiveFromMaps(): BridgeMap | null {
    for (let i = maps.length - 1; i >= 0; i--) {
      const st = readYmaps2State(maps[i]);
      if (st) {
        return st;
      }
    }
    return null;
  }

  function syncFromMapsOrUrl(): void {
    const st = readLiveFromMaps();
    if (st) {
      anchor = st;
      panDx = panDy = 0;
      awaitingMove = false;
      queueSend(st);
      return;
    }
    const urlMap = parseUrlMap();
    if (!urlMap) {
      return;
    }
    // Пока ждём реального сдвига после пана: игнорируем URL, который ещё
    // показывает до-пановый центр (ближе к старому, чем к ожидаемому).
    if (awaitingMove && panStartCenter && panExpected) {
      const dStart =
        (urlMap.lat - panStartCenter.lat) ** 2 + (urlMap.lng - panStartCenter.lng) ** 2;
      const dExp =
        (urlMap.lat - panExpected.lat) ** 2 + (urlMap.lng - panExpected.lng) ** 2;
      if (dStart <= dExp) {
        return;
      }
      awaitingMove = false;
    }
    if (
      !anchor ||
      Math.abs(urlMap.lat - anchor.lat) > 1e-7 ||
      Math.abs(urlMap.lng - anchor.lng) > 1e-7 ||
      (urlMap.zoom != null && anchor.zoom != null && urlMap.zoom !== anchor.zoom)
    ) {
      anchor = urlMap;
      panDx = panDy = 0;
      queueSend(urlMap);
    }
  }

  function register2(inst: any): void {
    if (!inst || inst.__vgfLiveAttached) {
      return;
    }
    inst.__vgfLiveAttached = true;
    if (maps.indexOf(inst) < 0) {
      maps.push(inst);
    }
    currentMap = inst;
    announceRenderMode(true);
    rebuildGeoObjects();
    const push = (): void => {
      const st = readYmaps2State(inst);
      if (st) {
        anchor = st;
        panDx = panDy = 0;
        queueSend(st);
      }
    };
    push();
    if (inst.events && typeof inst.events.add === "function") {
      inst.events.add("boundschange", push);
      inst.events.add("actionend", push);
      inst.events.add("action", push);
      inst.events.add("actiontick", push);
    }
  }

  function scanDomForMap(): void {
    try {
      if (typeof w.ymaps === "undefined") {
        return;
      }
      const el =
        document.querySelector(".ymaps-2-1-map") ||
        document.querySelector("[class*='map-main']");
      if (!el) {
        return;
      }
      const inst = (el as any).__ymaps_map || (el as any)._ymaps;
      if (inst) {
        register2(inst);
      }
    } catch {
      /* ignore */
    }
  }

  function patchYmaps2(): void {
    const ymaps = w.ymaps;
    if (typeof ymaps === "undefined" || !ymaps.Map || ymaps.Map.__vgfPatched) {
      return;
    }
    const Orig = ymaps.Map;
    function Wrapped(this: any, ...args: any[]): any {
      const inst = Reflect.construct(Orig, args);
      register2(inst);
      return inst;
    }
    Wrapped.prototype = Orig.prototype;
    (Wrapped as any).__vgfPatched = true;
    ymaps.Map = Wrapped;
    if (typeof ymaps.ready === "function") {
      ymaps.ready(scanDomForMap);
    }
  }

  // Анимация зума: на WebGL-картах (yandex.ru/maps) нет реального масштаба
  // по кадрам, поэтому overlay прячет штрихи на время зума и точно показывает
  // их после оседания. Детект — по вводу (колесо/двойной клик/клавиши).
  let zooming = false;
  let zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;
  const ZOOM_SETTLE_MS = 320;

  function postZoom(state: boolean): void {
    window.postMessage({ type: ZOOM_STATE_MSG, zooming: state }, "*");
  }

  function endZoom(): void {
    zoomSettleTimer = null;
    if (zooming) {
      zooming = false;
      postZoom(false);
    }
    syncFromMapsOrUrl();
    startSettlePoll();
  }

  function markZoom(): void {
    if (!followActive) {
      return;
    }
    awaitingMove = false;
    if (!zooming) {
      zooming = true;
      postZoom(true);
    }
    if (zoomSettleTimer) {
      clearTimeout(zoomSettleTimer);
    }
    zoomSettleTimer = setTimeout(endZoom, ZOOM_SETTLE_MS);
  }

  function isOverlayUi(ev: Event): boolean {
    try {
      const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
      for (let i = 0; i < path.length; i++) {
        const n = path[i] as any;
        if (n && n.getAttribute && n.getAttribute("data-vgraffiti-overlay") === "1") {
          return true;
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function stopDragPoll(): void {
    if (dragPoll) {
      clearInterval(dragPoll);
      dragPoll = null;
    }
  }

  function hookHistory(): void {
    const onUrl = (): void => {
      syncFromMapsOrUrl();
    };
    window.addEventListener("popstate", onUrl);
    window.addEventListener("hashchange", onUrl);
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = function (this: History, ...args: any[]): any {
      const r = push.apply(this, args as any);
      onUrl();
      return r;
    };
    history.replaceState = function (this: History, ...args: any[]): any {
      const r = replace.apply(this, args as any);
      onUrl();
      return r;
    };
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window || !event.data || typeof event.data !== "object") {
      return;
    }
    const data = event.data as any;
    if (data.type === STROKES_MSG) {
      pendingStrokes = Array.isArray(data.strokes) ? data.strokes : [];
      rebuildGeoObjects();
      announceRenderMode(!!currentMap && !!w.ymaps);
      return;
    }
    if (data.type !== FOLLOW_MSG) {
      return;
    }
    followActive = !!data.active;
    if (currentMap && w.ymaps) {
      announceRenderMode(true);
    }
    if (data.map && typeof data.map.lat === "number") {
      anchor = data.map;
      panDx = panDy = 0;
      lastSent = "";
      send(data.map);
    } else if (!anchor) {
      anchor = parseUrlMap();
    }
    if (!followActive) {
      dragging = false;
      awaitingMove = false;
      stopDragPoll();
    }
  });

  window.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      if (!followActive || e.button !== 0 || isOverlayUi(e)) {
        return;
      }
      dragging = true;
      if (!anchor) {
        anchor = parseUrlMap();
      }
      panDx = panDy = 0;
      panStartCenter = anchor;
      panExpected = null;
      awaitingMove = false;
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
    (e: PointerEvent) => {
      if (!followActive || !dragging || isOverlayUi(e)) {
        return;
      }
      let ddx = 0;
      let ddy = 0;
      if (e.movementX || e.movementY) {
        ddx = e.movementX;
        ddy = e.movementY;
      } else if (
        panLastClientX != null &&
        panLastClientY != null &&
        typeof e.clientX === "number" &&
        typeof e.clientY === "number"
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
    () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      panLastClientX = null;
      panLastClientY = null;
      // Фиксируем позицию по пиксельной математике (точна для пана). До прихода
      // реально сдвинутого URL держим её — не принимаем устаревший центр.
      sendEffectiveFromPan();
      panExpected = anchor;
      awaitingMove = !!panStartCenter && Math.abs(panDx) + Math.abs(panDy) > 8;
      panDx = panDy = 0;
      sendPanVisual();
      stopDragPoll();
      syncFromMapsOrUrl();
      startSettlePoll();
    },
    true,
  );

  window.addEventListener(
    "pointercancel",
    () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      panLastClientX = null;
      panLastClientY = null;
      sendEffectiveFromPan();
      panExpected = anchor;
      awaitingMove = !!panStartCenter && Math.abs(panDx) + Math.abs(panDy) > 8;
      panDx = panDy = 0;
      sendPanVisual();
      stopDragPoll();
      syncFromMapsOrUrl();
      startSettlePoll();
    },
    true,
  );

  window.addEventListener(
    "wheel",
    (e: Event) => {
      if (!isOverlayUi(e)) {
        markZoom();
      }
    },
    true,
  );

  window.addEventListener(
    "dblclick",
    (e: Event) => {
      if (!isOverlayUi(e)) {
        markZoom();
      }
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "_") {
        markZoom();
      }
    },
    true,
  );

  hookHistory();
  patchYmaps2();
  scanDomForMap();
  anchor = parseUrlMap();
  if (anchor) {
    send(anchor);
  }
  setInterval(() => {
    patchYmaps2();
    scanDomForMap();
  }, 2000);
  setInterval(() => {
    if (followActive && !dragging) {
      syncFromMapsOrUrl();
    }
  }, 66);
}
