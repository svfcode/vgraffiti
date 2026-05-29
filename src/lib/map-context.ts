/** Контекст карты для привязки рисунка к координатам. */

export type MapProvider = "yandex" | "google";

export type MapContext = {
  provider: MapProvider;
  lat: number;
  lng: number;
  zoom?: number;
};

function parseCoord(value: string | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function parseYandexMapsUrl(href: string): MapContext | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const ll = url.searchParams.get("ll") ?? url.searchParams.get("pt");
  if (ll) {
    const parts = ll.split(",").map((s) => s.trim());
    const lng = parseCoord(parts[0]);
    const lat = parseCoord(parts[1]);
    if (lat != null && lng != null) {
      const zRaw = url.searchParams.get("z");
      const zoom = zRaw != null ? parseCoord(zRaw) : null;
      return {
        provider: "yandex",
        lat,
        lng,
        ...(zoom != null ? { zoom } : {}),
      };
    }
  }

  const m = href.match(/(?:^|[/?&#])ll=(-?\d+(?:\.\d+)?)[,%2C](-?\d+(?:\.\d+)?)/i);
  if (m) {
    const lng = parseCoord(m[1]);
    const lat = parseCoord(m[2]);
    if (lat != null && lng != null) {
      const zRaw = url.searchParams.get("z");
      const zoom = zRaw != null ? parseCoord(zRaw) : null;
      return {
        provider: "yandex",
        lat,
        lng,
        ...(zoom != null ? { zoom } : {}),
      };
    }
  }

  const hashLl = href.match(/[?&#]ll=(-?\d+(?:\.\d+)?)[,%2C](-?\d+(?:\.\d+)?)/i);
  if (hashLl) {
    const lng = parseCoord(hashLl[1]);
    const lat = parseCoord(hashLl[2]);
    if (lat != null && lng != null) {
      return { provider: "yandex", lat, lng };
    }
  }

  const geo = href.match(/\/(\d{1,3}\.\d+)[,%2C](\d{1,2}\.\d+)(?:\/|[?&#]|$)/i);
  if (geo) {
    const lng = parseCoord(geo[1]);
    const lat = parseCoord(geo[2]);
    if (lat != null && lng != null) {
      return { provider: "yandex", lat, lng };
    }
  }

  return null;
}

function parseGoogleMapsUrl(href: string): MapContext | null {
  const at = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/i);
  if (at) {
    const lat = parseCoord(at[1]);
    const lng = parseCoord(at[2]);
    const zoom = parseCoord(at[3]);
    if (lat != null && lng != null) {
      return {
        provider: "google",
        lat,
        lng,
        ...(zoom != null ? { zoom } : {}),
      };
    }
  }

  const d3d4d = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
  if (d3d4d) {
    const lat = parseCoord(d3d4d[1]);
    const lng = parseCoord(d3d4d[2]);
    if (lat != null && lng != null) {
      return { provider: "google", lat, lng };
    }
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const q = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (q) {
    const parts = q.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      const lat = parseCoord(parts[0]);
      const lng = parseCoord(parts[1]);
      if (lat != null && lng != null) {
        return { provider: "google", lat, lng };
      }
    }
  }

  return null;
}

/** Читает центр карты из URL текущей страницы (Яндекс / Google Maps). */
export function readMapContext(): MapContext | null {
  const href = location.href;
  const host = location.hostname.toLowerCase();

  if (
    host.includes("yandex.") ||
    host === "maps.yandex.ru" ||
    host.endsWith(".yandex.ru")
  ) {
    return parseYandexMapsUrl(href);
  }

  if (host.includes("google.") && href.includes("/maps")) {
    return parseGoogleMapsUrl(href);
  }

  return null;
}

/** Ключ ячейки карты — совпадает с map_cell на сервере (5 знаков). */
export function buildMapCell(provider: string, lat: number, lng: number): string {
  const p = provider.toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  const rlat = (Math.round(lat * 1e5) / 1e5).toFixed(5);
  const rlng = (Math.round(lng * 1e5) / 1e5).toFixed(5);
  return `${p}:${rlat}:${rlng}`;
}

export function mapCellFromContext(map: MapContext): string {
  return buildMapCell(map.provider, map.lat, map.lng);
}

/** Изменились центр или zoom карты (для перерисовки overlay). */
export function mapContextMoved(
  prev: MapContext | null,
  next: MapContext | null,
  epsilon = 1e-7,
): boolean {
  if (!prev || !next) {
    return prev !== next;
  }
  if (Math.abs(prev.lat - next.lat) > epsilon || Math.abs(prev.lng - next.lng) > epsilon) {
    return true;
  }
  return (prev.zoom ?? -1) !== (next.zoom ?? -1);
}
