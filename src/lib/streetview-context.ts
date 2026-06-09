/** Параметры камеры Google Street View (из URL / DOM). */

export type StreetViewContext = {
  provider: "google";
  /** Google panorama id из URL (!1s…) или сетевых ответов. */
  panoId?: string;
  lat: number;
  lng: number;
  /** Горизонтальный угол обзора, ° (параметр …y в URL). */
  fov: number;
  /** Азимут камеры, ° (…h). */
  heading: number;
  /** Угол наклона, ° — 90 ≈ горизонт (…t). */
  pitch: number;
};

function parseNum(raw: string | undefined): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** `@lat,lng,3a,75y,210h,90t` (или 2a для фото-сфер) в Google Maps. */
export function parseGoogleStreetViewUrl(href: string): StreetViewContext | null {
  const m = href.match(
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),[23]a,(-?\d+(?:\.\d+)?)y,(-?\d+(?:\.\d+)?)h,(-?\d+(?:\.\d+)?)t/i,
  );
  if (!m) {
    return null;
  }
  const lat = parseNum(m[1]);
  const lng = parseNum(m[2]);
  const fov = parseNum(m[3]);
  const heading = parseNum(m[4]);
  const pitch = parseNum(m[5]);
  if (lat == null || lng == null) {
    return null;
  }
  return {
    provider: "google",
    lat,
    lng,
    fov: fov != null && fov > 0 ? fov : 90,
    heading: heading ?? 0,
    pitch: pitch ?? 90,
  };
}

const SV_AT_POV =
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),[23]a,(-?\d+(?:\.\d+)?)y,(-?\d+(?:\.\d+)?)h,(-?\d+(?:\.\d+)?)t/i;
const SV_DATA_POV = /,[23]a,(-?\d+(?:\.\d+)?)y,(-?\d+(?:\.\d+)?)h,(-?\d+(?:\.\d+)?)t/i;

function parsePovFromHref(href: string): Pick<StreetViewContext, "fov" | "heading" | "pitch"> | null {
  const at = href.match(SV_AT_POV);
  if (at) {
    const fov = parseNum(at[3]);
    const heading = parseNum(at[4]);
    const pitch = parseNum(at[5]);
    return {
      fov: fov != null && fov > 0 ? fov : 90,
      heading: heading ?? 0,
      pitch: pitch ?? 90,
    };
  }
  const dataIdx = href.indexOf("/data=");
  const data = dataIdx >= 0 ? href.slice(dataIdx) : href;
  const emb = data.match(SV_DATA_POV);
  if (emb) {
    const fov = parseNum(emb[1]);
    const heading = parseNum(emb[2]);
    const pitch = parseNum(emb[3]);
    return {
      fov: fov != null && fov > 0 ? fov : 90,
      heading: heading ?? 0,
      pitch: pitch ?? 90,
    };
  }
  const heading = parseNum(data.match(/!3f(-?\d+(?:\.\d+)?)/)?.[1]);
  const pitch = parseNum(data.match(/!4b(-?\d+(?:\.\d+)?)/)?.[1]);
  const fov = parseNum(data.match(/!2z([\d.]+)/)?.[1]);
  if (heading != null || pitch != null || fov != null) {
    return {
      fov: fov != null && fov > 0 ? fov : 90,
      heading: heading ?? 0,
      pitch: pitch ?? 90,
    };
  }
  return null;
}

/** `!3d…!4d…` в /data= — реальная позиция панорамы (обновляется при переходе). */
export function parseDataLatLng(href: string): { lat: number; lng: number } | null {
  const m = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
  if (!m) {
    return null;
  }
  const lat = parseNum(m[1]);
  const lng = parseNum(m[2]);
  if (lat == null || lng == null) {
    return null;
  }
  return { lat, lng };
}

function decodePanoToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `!1s…` в сегменте /data= Google Maps Street View. */
export function parsePanoIdFromHref(href: string): string | null {
  const m = href.match(/!1s([^!]+)/i);
  if (!m?.[1]) {
    return null;
  }
  return decodePanoToken(m[1]);
}

/**
 * Похоже ли значение на id панорамы Google (base64url, ~22 символа).
 * Исключаем hex-id места (`0x…:0x…`, есть `:`) и поисковый текст (есть `+`/пробел).
 */
function looksLikePanoId(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,}$/.test(token);
}

/** Id панорамы из /data=: первый !1s/!2s токен, похожий на pano id (не place/cell id). */
export function parseStreetViewPanoId(href: string): string | null {
  const dataIdx = href.indexOf("/data=");
  const data = dataIdx >= 0 ? href.slice(dataIdx) : href;

  const tokens: string[] = [];
  for (const m of data.matchAll(/!1s([^!]+)/gi)) {
    tokens.push(decodePanoToken(m[1]!));
  }
  for (const m of data.matchAll(/!2s([^!]+)/gi)) {
    tokens.push(decodePanoToken(m[1]!));
  }

  const pano = tokens.find(looksLikePanoId);
  return pano ?? null;
}

function isStreetViewHref(href: string): boolean {
  return (
    /google\./i.test(href) &&
    /\/maps/i.test(href) &&
    (/@[^/]+,[23]a,/i.test(href) || /!1e1!/i.test(href))
  );
}

/** Ключ точки из URL — для опроса смены панорамы. */
export function spotSignatureFromHref(href: string): string | null {
  if (!isStreetViewHref(href)) {
    return null;
  }
  const panoId = parseStreetViewPanoId(href);
  if (panoId) {
    return `id:${panoId}`;
  }
  const dataPos = parseDataLatLng(href);
  if (dataPos) {
    return `ll:${dataPos.lat.toFixed(5)},${dataPos.lng.toFixed(5)}`;
  }
  const at = parseGoogleStreetViewUrl(href);
  if (at) {
    return `ll:${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
  }
  return null;
}

/** Текущая камера Street View со страницы. */
export function readStreetViewContext(): StreetViewContext | null {
  const href = location.href;
  if (!isStreetViewHref(href)) {
    return null;
  }

  const dataPos = parseDataLatLng(href);
  const at = parseGoogleStreetViewUrl(href);
  const pov = parsePovFromHref(href);
  const panoId = parseStreetViewPanoId(href) ?? undefined;

  const lat = dataPos?.lat ?? at?.lat;
  const lng = dataPos?.lng ?? at?.lng;
  if (lat == null || lng == null) {
    return null;
  }

  return {
    provider: "google",
    panoId,
    lat,
    lng,
    fov: at?.fov ?? pov?.fov ?? 90,
    heading: at?.heading ?? pov?.heading ?? 0,
    pitch: at?.pitch ?? pov?.pitch ?? 90,
  };
}

const POS_EPS = 0.00002; // ~2 м

export function streetViewContextMoved(
  prev: StreetViewContext | null,
  next: StreetViewContext | null,
  posEpsilon = POS_EPS,
): boolean {
  if (!prev || !next) {
    return prev !== next;
  }
  if (prev.panoId !== next.panoId) {
    return true;
  }
  if (
    Math.abs(prev.lat - next.lat) > posEpsilon ||
    Math.abs(prev.lng - next.lng) > posEpsilon
  ) {
    return true;
  }
  return false;
}

const GOOGLE_SV_AT =
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),3a,(-?\d+(?:\.\d+)?)y,(-?\d+(?:\.\d+)?)h,(-?\d+(?:\.\d+)?)t/i;
const GOOGLE_MAP_AT = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/i;

function roundSv(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

/** Сегмент `@lat,lng,3a,fovy,headingh,pitcht` для Google Maps Street View. */
export function formatGoogleStreetViewAt(ctx: StreetViewContext): string {
  const fov = Math.max(10, Math.min(120, ctx.fov));
  const heading = normalizeHeading(ctx.heading);
  return `@${ctx.lat},${ctx.lng},3a,${roundSv(fov)}y,${roundSv(heading)}h,${roundSv(ctx.pitch)}t`;
}

/** Подставляет ракурс Street View в URL Google Maps (без навигации). */
export function buildGoogleStreetViewHref(href: string, ctx: StreetViewContext): string | null {
  if (!/google\./i.test(href) || !/\/maps/i.test(href)) {
    return null;
  }
  const at = formatGoogleStreetViewAt(ctx);
  if (GOOGLE_SV_AT.test(href)) {
    return href.replace(GOOGLE_SV_AT, at);
  }
  if (GOOGLE_MAP_AT.test(href)) {
    return href.replace(GOOGLE_MAP_AT, at);
  }
  const dataIdx = href.indexOf("/data=");
  if (dataIdx > 0 && /!1e1!/i.test(href)) {
    const base = href.slice(0, dataIdx).replace(/@[^/]*$/, "");
    return `${base}${at}${href.slice(dataIdx)}`;
  }
  return null;
}

export function normalizeHeading(deg: number): number {
  let h = deg % 360;
  if (h < 0) {
    h += 360;
  }
  return h;
}

export function normalizeHeadingDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) {
    d -= 360;
  }
  while (d < -180) {
    d += 360;
  }
  return d;
}
