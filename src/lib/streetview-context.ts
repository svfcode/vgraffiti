/** Параметры камеры Google Street View (из URL / DOM). */

export type StreetViewContext = {
  provider: "google";
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

/** `@lat,lng,3a,75y,210h,90t` в Google Maps. */
export function parseGoogleStreetViewUrl(href: string): StreetViewContext | null {
  const m = href.match(
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),3a,(-?\d+(?:\.\d+)?)y,(-?\d+(?:\.\d+)?)h,(-?\d+(?:\.\d+)?)t/i,
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

/** Текущая камера Street View со страницы. */
export function readStreetViewContext(): StreetViewContext | null {
  const href = location.href;
  if (!/google\./i.test(href) || !/\/maps/i.test(href)) {
    return null;
  }
  const parsed = parseGoogleStreetViewUrl(href);
  if (parsed) {
    return parsed;
  }
  if (!/@[^/]+,3a,/i.test(href) && !/!1e1!/i.test(href)) {
    return null;
  }
  const d3d4d = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
  if (d3d4d) {
    const lat = parseNum(d3d4d[1]);
    const lng = parseNum(d3d4d[2]);
    if (lat != null && lng != null) {
      return {
        provider: "google",
        lat,
        lng,
        fov: 90,
        heading: 0,
        pitch: 90,
      };
    }
  }
  return null;
}

export function streetViewContextMoved(
  prev: StreetViewContext | null,
  next: StreetViewContext | null,
  epsilon = 0.02,
): boolean {
  if (!prev || !next) {
    return prev !== next;
  }
  if (
    Math.abs(prev.lat - next.lat) > epsilon ||
    Math.abs(prev.lng - next.lng) > epsilon
  ) {
    return true;
  }
  if (Math.abs(prev.fov - next.fov) > epsilon) {
    return true;
  }
  if (Math.abs(normalizeHeadingDelta(prev.heading, next.heading)) > epsilon) {
    return true;
  }
  if (Math.abs(prev.pitch - next.pitch) > epsilon) {
    return true;
  }
  return false;
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
