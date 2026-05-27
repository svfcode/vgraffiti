/** Вызовы в service worker из popup и content script. */

import type { MapContext } from "./map-context";
import { searchRadiusDeg } from "./map-projection";

export type BgResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; status?: number; body?: string };

/** Читаемое сообщение об ошибке API (JSON с кириллицей или plain text). */
export function formatBgError(result: { error: string; body?: string }): string {
  if (result.body) {
    try {
      const parsed = JSON.parse(result.body) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
        return parsed.message;
      }
    } catch {
      // не JSON — покажем как есть ниже
    }
  }
  if (result.body && !result.body.startsWith("{")) {
    return result.body.trim();
  }
  return result.error;
}

export async function sendToBackground(msg: Record<string, unknown>): Promise<BgResult> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: unknown) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as BgResult);
    });
  });
}

export async function bgSetApiBaseUrl(url: string): Promise<BgResult> {
  return sendToBackground({ type: "config.setApiBase", url });
}

export async function bgMeta(): Promise<BgResult> {
  return sendToBackground({ type: "api.meta" });
}

export async function bgAuthEmail(email: string): Promise<BgResult> {
  return sendToBackground({ type: "api.authEmail", email });
}

export async function bgAuthVerify(email: string, code: string): Promise<BgResult> {
  return sendToBackground({ type: "api.authVerify", email, code: code.trim() });
}

export async function bgLogout(): Promise<BgResult> {
  return sendToBackground({ type: "api.logout" });
}

export async function bgUploadDrawing(payload: {
  imageBase64: string;
  mimeType: string;
  meta: Record<string, unknown>;
  map?: import("./map-context").MapContext | null;
}): Promise<BgResult> {
  return sendToBackground({
    type: "api.uploadDrawing",
    imageBase64: payload.imageBase64,
    mimeType: payload.mimeType,
    meta: payload.meta,
    map: payload.map ?? null,
  });
}

export async function bgListDrawingsNearMap(map: MapContext): Promise<BgResult> {
  return sendToBackground({
    type: "api.listDrawingsNearMap",
    lat: map.lat,
    lng: map.lng,
    mapProvider: map.provider,
    radius: searchRadiusDeg(map),
    zoom: map.zoom ?? null,
  });
}

/** @deprecated используйте bgListDrawingsNearMap */
export async function bgListDrawingsAtMap(map: import("./map-context").MapContext): Promise<BgResult> {
  return bgListDrawingsNearMap(map);
}

export async function bgFetchImageDataUrl(url: string): Promise<BgResult<string>> {
  return sendToBackground({ type: "api.fetchImageDataUrl", url }) as Promise<BgResult<string>>;
}
