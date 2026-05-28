/**
 * Загрузка рисунков с сервера для текущей области карты.
 */

import type { BgResult } from "./extension-api";
import { bgFetchImageDataUrl, bgListDrawingsNearMap } from "./extension-api";
import type { MapContext } from "./map-context";
import { searchRadiusDeg } from "./map-projection";
import { getApiBaseUrl } from "./storage";
import { getSession } from "../auth/session";
import { isHttpsPage, mustUploadViaBackground } from "./url";

export type RemoteDrawing = {
  id: number;
  file_url: string;
  lat: number;
  lng: number;
  zoom: number;
  map_provider?: string | null;
  updated_at?: string | null;
};

function parseDrawingRecord(raw: unknown): RemoteDrawing | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const id = o.id;
  const file_url = o.file_url;
  if (typeof id !== "number" || typeof file_url !== "string" || file_url.length === 0) {
    return null;
  }

  let lat = typeof o.lat === "number" ? o.lat : null;
  let lng = typeof o.lng === "number" ? o.lng : null;
  let zoom = typeof o.zoom === "number" && o.zoom > 0 ? o.zoom : 16;
  let map_provider = typeof o.map_provider === "string" ? o.map_provider : null;

  if ((lat == null || lng == null) && o.meta && typeof o.meta === "object") {
    const meta = o.meta as Record<string, unknown>;
    const map = meta.map;
    if (map && typeof map === "object") {
      const m = map as Record<string, unknown>;
      if (lat == null && typeof m.lat === "number") {
        lat = m.lat;
      }
      if (lng == null && typeof m.lng === "number") {
        lng = m.lng;
      }
      if (typeof m.zoom === "number" && m.zoom > 0) {
        zoom = m.zoom;
      }
      if (!map_provider && typeof m.provider === "string") {
        map_provider = m.provider;
      }
    }
  }

  if (lat == null || lng == null) {
    return null;
  }

  return {
    id,
    file_url,
    lat,
    lng,
    zoom,
    map_provider,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : null,
  };
}

export function parseDrawingList(data: unknown): RemoteDrawing[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const out: RemoteDrawing[] = [];
  for (const item of data) {
    const d = parseDrawingRecord(item);
    if (d) {
      out.push(d);
    }
  }
  return out;
}

function shouldFallbackToBackground(result: BgResult): boolean {
  if (result.ok) {
    return false;
  }
  const err = result.error.toLowerCase();
  return (
    err.includes("failed to fetch") ||
    err.includes("network") ||
    err.includes("permission") ||
    err.includes("cors") ||
    err.includes("mixed")
  );
}

function buildNearbyQuery(map: MapContext): URLSearchParams {
  return new URLSearchParams({
    lat: String(map.lat),
    lng: String(map.lng),
    map_provider: map.provider,
    near: "1",
    radius: String(searchRadiusDeg(map)),
    ...(map.zoom != null ? { zoom: String(map.zoom) } : {}),
  });
}

async function fetchNearbyDrawingsDirect(
  base: string,
  accessToken: string,
  map: MapContext,
): Promise<BgResult<RemoteDrawing[]>> {
  const url = `${base}/drawings?${buildNearbyQuery(map).toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const text = await res.text();
  if (res.status >= 400) {
    return { ok: false, status: res.status, body: text, error: `HTTP ${res.status}` };
  }

  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "Неверный JSON в ответе сервера" };
    }
  }

  return { ok: true, data: parseDrawingList(json) };
}

export async function fetchNearbyDrawings(map: MapContext): Promise<BgResult<RemoteDrawing[]>> {
  const base = await getApiBaseUrl();
  if (!base) {
    return { ok: false, error: "Сервер не настроен" };
  }
  const { accessToken } = await getSession();
  if (!accessToken) {
    return { ok: true, data: [] };
  }

  if (mustUploadViaBackground(base)) {
    const r = await bgListDrawingsNearMap(map);
    if (!r.ok) {
      return r;
    }
    return { ok: true, data: parseDrawingList(r.data) };
  }

  const direct = await fetchNearbyDrawingsDirect(base, accessToken, map);
  if (direct.ok) {
    return direct;
  }
  if (shouldFallbackToBackground(direct)) {
    const r = await bgListDrawingsNearMap(map);
    if (!r.ok) {
      return r;
    }
    return { ok: true, data: parseDrawingList(r.data) };
  }
  return direct;
}

export async function loadRemoteDrawingImage(fileUrl: string): Promise<BgResult<HTMLImageElement>> {
  const base = await getApiBaseUrl();
  const viaBg = isHttpsPage() || (base ? mustUploadViaBackground(base) : true);

  let dataUrl: string;
  if (viaBg) {
    const r = await bgFetchImageDataUrl(fileUrl);
    if (!r.ok || typeof r.data !== "string") {
      return { ok: false, error: r.ok ? "Пустой ответ изображения" : r.error };
    }
    dataUrl = r.data;
  } else {
    let res: Response;
    try {
      res = await fetch(fileUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    dataUrl = await blobToDataUrl(blob);
  }

  try {
    const img = await decodeDataUrlImage(dataUrl);
    return { ok: true, data: img };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

function decodeDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось декодировать изображение"));
    img.src = dataUrl;
  });
}
