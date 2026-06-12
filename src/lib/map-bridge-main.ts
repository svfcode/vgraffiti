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
  SET_CENTER_MSG,
  PANO_CONTEXT_MSG,
  SET_STREET_VIEW_POV_MSG,
  STROKES_MSG,
  SV_WALK_LINKS_MSG,
  ZOOM_STATE_MSG,
  ZOOM_VISUAL_MSG,
  type GeoStrokePayload,
} from "./map-bridge-protocol";
import {
  buildGoogleStreetViewHref,
  parsePanoIdFromHref,
  parseStreetViewPanoId,
  type StreetViewContext,
} from "./streetview-context";

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

  function isStreetViewPage(): boolean {
    try {
      return /,3a,/i.test(location.href) || !!document.querySelector(".widget-scene");
    } catch {
      return false;
    }
  }

  let walkLinksTimer: ReturnType<typeof setInterval> | null = null;

  function pulseStreetViewHover(): void {
    if (!isStreetViewPage()) {
      return;
    }
    const scene = document.querySelector(".widget-scene") as HTMLElement | null;
    if (!scene) {
      return;
    }
    const rect = scene.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      return;
    }
    const probes = [
      { x: 0.5, y: 0.62 },
      { x: 0.34, y: 0.58 },
      { x: 0.66, y: 0.58 },
      { x: 0.5, y: 0.5 },
      { x: 0.42, y: 0.66 },
      { x: 0.58, y: 0.66 },
    ];
    const targets = new Set<HTMLElement>([scene]);
    for (const el of scene.querySelectorAll<HTMLElement>(".scene-core-webgl, canvas")) {
      targets.add(el);
    }
    for (const target of targets) {
      for (const p of probes) {
        const clientX = rect.left + rect.width * p.x;
        const clientY = rect.top + rect.height * p.y;
        const init: MouseEventInit = {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          view: window,
        };
        target.dispatchEvent(new MouseEvent("mousemove", init));
        target.dispatchEvent(new PointerEvent("pointermove", { ...init, pointerId: 1, pointerType: "mouse" }));
      }
    }
  }

  function setWalkLinksAlways(enabled: boolean): void {
    if (walkLinksTimer) {
      clearInterval(walkLinksTimer);
      walkLinksTimer = null;
    }
    if (!enabled) {
      return;
    }
    pulseStreetViewHover();
    walkLinksTimer = setInterval(pulseStreetViewHover, 280);
  }

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
    if (!inst) {
      return null;
    }
    if (typeof inst.getCenter === "function") {
      try {
        const c = inst.getCenter();
        const z = typeof inst.getZoom === "function" ? inst.getZoom() : null;
        if (c && c.length >= 2) {
          return {
            provider: "yandex",
            lat: c[0],
            lng: c[1],
            zoom: z != null && z > 0 ? z : null,
          };
        }
      } catch {
        /* ignore */
      }
    }
    try {
      const loc = inst.location ?? inst._location;
      const center = loc?.center ?? loc?.value?.center;
      if (Array.isArray(center) && center.length >= 2) {
        const zoom = loc?.zoom ?? loc?.value?.zoom ?? null;
        return {
          provider: "yandex",
          lat: center[1],
          lng: center[0],
          zoom: typeof zoom === "number" && zoom > 0 ? zoom : null,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
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
    if (zooming) {
      syncZoomFromUrl();
      return;
    }
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

  function findMapInstances(): any[] {
    const found: any[] = [];
    const seen = new Set<any>();
    const add = (inst: any): void => {
      if (inst && !seen.has(inst)) {
        seen.add(inst);
        found.push(inst);
      }
    };
    for (const inst of maps) {
      add(inst);
    }
    if (currentMap) {
      add(currentMap);
    }
    const selectors = [".ymaps-2-1-map", "[class*='ymaps-2-1-map']", "[class*='map-main']"];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const node = el as any;
        add(node.__ymaps_map || node._ymaps || node.ymaps);
      });
    }
    return found;
  }

  function afterMapCenterApplied(lat: number, lng: number, zoom: number | null): void {
    window.setTimeout(() => {
      scanDomForMap();
      const st = currentMap ? readYmaps2State(currentMap) : null;
      if (st) {
        anchor = st;
        panDx = panDy = 0;
        queueSend(st);
        return;
      }
      anchor = {
        provider: location.href.includes("google.") ? "google" : "yandex",
        lat,
        lng,
        zoom,
      };
      panDx = panDy = 0;
      queueSend(anchor);
    }, 320);
  }

  function trySetMapCenterOnInstance(inst: any, lat: number, lng: number, zoom: number | null): boolean {
    if (!inst) {
      return false;
    }
    const opts = { duration: 300, checkZoomRange: false };
    try {
      if (typeof inst.setLocation === "function") {
        inst.setLocation({
          center: [lng, lat],
          ...(zoom != null ? { zoom } : {}),
          duration: 300,
        });
        currentMap = inst;
        return true;
      }
      if (typeof inst.setCenter === "function") {
        if (zoom != null) {
          inst.setCenter([lat, lng], zoom, opts);
        } else {
          inst.setCenter([lat, lng], undefined, opts);
        }
        currentMap = inst;
        return true;
      }
      if (typeof inst.panTo === "function") {
        inst.panTo([lat, lng], { duration: 300, flying: true });
        if (zoom != null && typeof inst.setZoom === "function") {
          inst.setZoom(zoom, opts);
        }
        currentMap = inst;
        return true;
      }
    } catch {
      /* try next instance */
    }
    return false;
  }

  function applyMapCenterViaUrl(lat: number, lng: number, zoom: number | null): boolean {
    const href = location.href;
    if (href.includes("yandex.") && href.includes("/maps")) {
      const url = new URL(href);
      url.searchParams.set("ll", `${lng},${lat}`);
      if (zoom != null) {
        url.searchParams.set("z", String(Math.round(zoom)));
      }
      const next = url.toString();
      if (next === href) {
        return false;
      }
      history.pushState(null, "", next);
      window.dispatchEvent(new PopStateEvent("popstate"));
      syncFromMapsOrUrl();
      return true;
    }
    if (href.includes("google.") && href.includes("/maps")) {
      const zMatch = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/i);
      const zVal = zoom != null ? zoom : zMatch ? parseFloat(zMatch[3]!) : 15;
      const next = href.replace(
        /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/i,
        `@${lat},${lng},${zVal}z`,
      );
      if (next === href) {
        return false;
      }
      history.pushState(null, "", next);
      window.dispatchEvent(new PopStateEvent("popstate"));
      syncFromMapsOrUrl();
      return true;
    }
    return false;
  }

  function parseStreetViewPovDetail(raw: unknown): StreetViewContext | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const o = raw as Record<string, unknown>;
    const lat = o.lat;
    const lng = o.lng;
    const fov = o.fov;
    const heading = o.heading;
    const pitch = o.pitch;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      typeof fov !== "number" ||
      typeof heading !== "number" ||
      typeof pitch !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(fov) ||
      !Number.isFinite(heading) ||
      !Number.isFinite(pitch)
    ) {
      return null;
    }
    return { provider: "google", lat, lng, fov, heading, pitch };
  }

  function applyStreetViewPovViaUrl(ctx: StreetViewContext): boolean {
    const href = location.href;
    const next = buildGoogleStreetViewHref(href, ctx);
    if (!next || next === href) {
      return false;
    }
    history.pushState(null, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  }

  function applyStreetViewPov(raw: unknown): void {
    const ctx = parseStreetViewPovDetail(raw);
    if (!ctx) {
      return;
    }
    applyStreetViewPovViaUrl(ctx);
  }

  function applyMapCenter(lat: number, lng: number, zoom: number | null): void {
    scanDomForMap();
    patchYmaps2();
    patchYmaps3();
    for (const inst of findMapInstances()) {
      if (trySetMapCenterOnInstance(inst, lat, lng, zoom)) {
        afterMapCenterApplied(lat, lng, zoom);
        return;
      }
    }
    if (applyMapCenterViaUrl(lat, lng, zoom)) {
      afterMapCenterApplied(lat, lng, zoom);
    }
  }

  function patchYmaps3(): void {
    const boot = (): void => {
      const y3 = w.ymaps3;
      if (!y3?.YMap || y3.YMap.__vgfPatched) {
        return;
      }
      const Orig = y3.YMap;
      function Wrapped(this: unknown, ...args: unknown[]): unknown {
        const inst = new Orig(...args);
        register2(inst);
        return inst;
      }
      Wrapped.prototype = Orig.prototype;
      (Wrapped as any).__vgfPatched = true;
      y3.YMap = Wrapped;
      scanDomForMap();
    };
    if (w.ymaps3?.YMap) {
      boot();
    }
    if (w.ymaps3?.ready && typeof w.ymaps3.ready.then === "function") {
      w.ymaps3.ready.then(boot).catch(() => undefined);
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

  // Анимация зума: на WebGL-картах (yandex.ru/maps) z в URL отстаёт от анимации.
  // Накапливаем deltaZ с колеса (zoom-to-point) и подхватываем z из URL, когда
  // он обновится — overlay репроецирует штрихи без дрифта.
  let zooming = false;
  let zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomPoll: ReturnType<typeof setInterval> | null = null;
  const ZOOM_SETTLE_MS = 320;
  let zoomDeltaZ = 0;
  let zoomPivotX = 0;
  let zoomPivotY = 0;
  let zoomAnchor: BridgeMap | null = null;
  let zoomStartZ: number | null = null;
  let zoomEndStarted = 0;
  const ZOOM_MAX_WAIT_MS = 2500;

  function wheelToDeltaZ(e: WheelEvent): number {
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dy *= window.innerHeight;
    }
    // Колесо мыши — дискретный шаг ±1; тачпад — плавный дробный.
    if (Math.abs(dy) >= 40) {
      return dy > 0 ? -1 : 1;
    }
    return -dy / 120;
  }

  /** Центр крупнейшего canvas карты — pivot для +/- и fallback. */
  function findMapPivot(): { x: number; y: number } {
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
      return { x: best.left + best.width / 2, y: best.top + best.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function beginZoomVisual(pivotX?: number, pivotY?: number): void {
    if (!zoomAnchor) {
      zoomAnchor = anchor ? { ...anchor } : parseUrlMap();
      zoomDeltaZ = 0;
      zoomStartZ =
        zoomAnchor?.zoom != null && zoomAnchor.zoom > 0 ? zoomAnchor.zoom : null;
    }
    if (typeof pivotX === "number" && typeof pivotY === "number") {
      zoomPivotX = pivotX;
      zoomPivotY = pivotY;
    } else {
      const p = findMapPivot();
      zoomPivotX = p.x;
      zoomPivotY = p.y;
    }
  }

  function sendZoomVisual(): void {
    if (!zoomAnchor) {
      return;
    }
    window.postMessage(
      {
        type: ZOOM_VISUAL_MSG,
        deltaZ: zoomDeltaZ,
        pivotX: zoomPivotX,
        pivotY: zoomPivotY,
        anchor: zoomAnchor,
      },
      "*",
    );
  }

  function stopZoomPoll(): void {
    if (zoomPoll) {
      clearInterval(zoomPoll);
      zoomPoll = null;
    }
  }

  function startZoomPoll(): void {
    if (zoomPoll) {
      return;
    }
    zoomPoll = setInterval(() => {
      if (followActive && zooming) {
        syncZoomFromUrl();
      } else {
        stopZoomPoll();
      }
    }, 24);
  }

  /** Во время зума подхватываем только z из URL — ll меняется позже и ломает pivot. */
  function syncZoomFromUrl(): void {
    const urlMap = parseUrlMap();
    if (!urlMap || !zoomAnchor) {
      return;
    }
    const startZ = zoomAnchor.zoom && zoomAnchor.zoom > 0 ? zoomAnchor.zoom : null;
    const urlZ = urlMap.zoom != null && urlMap.zoom > 0 ? urlMap.zoom : null;
    if (startZ != null && urlZ != null && Math.abs(urlZ - startZ) > 0.001) {
      const nextDelta = urlZ - startZ;
      if (Math.abs(nextDelta - zoomDeltaZ) > 0.001) {
        zoomDeltaZ = nextDelta;
        sendZoomVisual();
      }
    }
  }

  function postZoom(state: boolean): void {
    window.postMessage({ type: ZOOM_STATE_MSG, zooming: state }, "*");
  }

  function tryEndZoom(): void {
    const urlMap = parseUrlMap();
    const startZ = zoomStartZ ?? zoomAnchor?.zoom ?? null;
    const urlZ = urlMap?.zoom != null && urlMap.zoom > 0 ? urlMap.zoom : null;
    const urlReady =
      startZ == null ||
      urlZ == null ||
      Math.abs(urlZ - startZ) > 0.001 ||
      Math.abs(zoomDeltaZ) < 0.001;
    const timedOut = Date.now() - zoomEndStarted > ZOOM_MAX_WAIT_MS;

    if (!urlReady && !timedOut) {
      syncZoomFromUrl();
      zoomSettleTimer = setTimeout(tryEndZoom, 80);
      return;
    }

    zoomSettleTimer = null;
    stopZoomPoll();
    if (zooming) {
      zooming = false;
      postZoom(false);
    }
    zoomDeltaZ = 0;
    zoomAnchor = null;
    zoomStartZ = null;
    syncFromMapsOrUrl();
    startSettlePoll();
  }

  function endZoom(): void {
    zoomEndStarted = Date.now();
    tryEndZoom();
  }

  function markZoom(deltaOverride?: number, pivotX?: number, pivotY?: number): void {
    if (!followActive) {
      return;
    }
    awaitingMove = false;
    beginZoomVisual(pivotX, pivotY);
    if (typeof deltaOverride === "number") {
      zoomDeltaZ += deltaOverride;
      sendZoomVisual();
    }
    if (!zooming) {
      zooming = true;
      sendZoomVisual();
      postZoom(true);
      startZoomPoll();
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

  let lastBridgePanoId = "";

  function postPanoId(panoId: string): void {
    if (!panoId || panoId === lastBridgePanoId) {
      return;
    }
    lastBridgePanoId = panoId;
    window.postMessage({ type: PANO_CONTEXT_MSG, panoId }, "*");
  }

  function emitPanoContext(): void {
    if (!isStreetViewPage()) {
      return;
    }
    const panoId = parseStreetViewPanoId(location.href) ?? parsePanoIdFromHref(location.href);
    if (panoId) {
      postPanoId(panoId);
    }
  }

  function hookHistory(): void {
    const onUrl = (): void => {
      syncFromMapsOrUrl();
      emitPanoContext();
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

  document.addEventListener(SET_CENTER_MSG, (ev: Event) => {
    const detail = (ev as CustomEvent<{ lat: number; lng: number; zoom?: number }>).detail;
    if (!detail) {
      return;
    }
    const lat = detail.lat;
    const lng = detail.lng;
    const zoom = typeof detail.zoom === "number" && detail.zoom > 0 ? detail.zoom : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    applyMapCenter(lat, lng, zoom);
  });

  document.addEventListener(SET_STREET_VIEW_POV_MSG, (ev: Event) => {
    const detail = (ev as CustomEvent).detail;
    applyStreetViewPov(detail);
  });

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
    if (data.type === SET_CENTER_MSG) {
      const lat = typeof data.lat === "number" ? data.lat : NaN;
      const lng = typeof data.lng === "number" ? data.lng : NaN;
      const zoom = typeof data.zoom === "number" && data.zoom > 0 ? data.zoom : null;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      applyMapCenter(lat, lng, zoom);
      return;
    }
    if (data.type === SET_STREET_VIEW_POV_MSG) {
      applyStreetViewPov(data);
      return;
    }
    if (data.type === SV_WALK_LINKS_MSG) {
      setWalkLinksAlways(!!data.enabled);
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
      if (!followActive || e.button !== 0 || isOverlayUi(e) || isStreetViewPage()) {
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
      if (!followActive || !dragging || isOverlayUi(e) || isStreetViewPage()) {
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
      const we = e as WheelEvent;
      if (!followActive || isOverlayUi(e) || isStreetViewPage()) {
        return;
      }
      markZoom(undefined, we.clientX, we.clientY);
      zoomDeltaZ += wheelToDeltaZ(we);
      zoomDeltaZ = Math.max(-5, Math.min(5, zoomDeltaZ));
      sendZoomVisual();
    },
    true,
  );

  window.addEventListener(
    "dblclick",
    (e: Event) => {
      const de = e as MouseEvent;
      if (!followActive || isOverlayUi(e)) {
        return;
      }
      markZoom(1, de.clientX, de.clientY);
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (!followActive) {
        return;
      }
      if (e.key === "+" || e.key === "=") {
        markZoom(1);
      } else if (e.key === "-" || e.key === "_") {
        markZoom(-1);
      }
    },
    true,
  );

  hookHistory();
  patchYmaps2();
  patchYmaps3();
  scanDomForMap();
  anchor = parseUrlMap();
  if (anchor) {
    send(anchor);
  }
  emitPanoContext();

  // pano id берём из URL (единый формат с контент-скриптом), не из сети.
  setInterval(() => {
    if (isStreetViewPage()) {
      emitPanoContext();
    }
  }, 200);
  setInterval(() => {
    patchYmaps2();
    patchYmaps3();
    scanDomForMap();
  }, 2000);
  setInterval(() => {
    if (followActive && !dragging) {
      syncFromMapsOrUrl();
    }
  }, 66);
}
