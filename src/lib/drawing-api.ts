/**
 * Загрузка рисунка.
 * - HTTP API с HTTPS-страницы (Яндекс.Карты) → только service worker (mixed content).
 * - иначе сначала fetch из content script, при сбое — fallback в background.
 */

import type { MapContext } from "./map-context";
import type { BgResult } from "./extension-api";
import { bgUploadDrawing } from "./extension-api";
import { getApiBaseUrl, getSession } from "./storage";
import { mustUploadViaBackground, originFromApiBase } from "./url";

export type DrawingUploadPayload = {
  imageBase64: string;
  mimeType: string;
  meta: Record<string, unknown>;
  map?: MapContext | null;
};

export async function uploadDrawing(payload: DrawingUploadPayload): Promise<BgResult> {
  const base = await getApiBaseUrl();
  if (!base) {
    return { ok: false, error: "Сервер не настроен: укажите URL API в окне расширения" };
  }

  const { accessToken } = await getSession();
  if (!accessToken) {
    return { ok: false, error: "Нет сессии: войдите по почте в окне расширения" };
  }

  if (!payload.imageBase64) {
    return { ok: false, error: "Пустое изображение" };
  }

  if (mustUploadViaBackground(base)) {
    console.info(
      "[vgraffiti] POST via service worker (HTTPS-страница + HTTP API, mixed content)",
      `${base}/drawings`,
    );
    return bgUploadDrawing({
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
      meta: payload.meta,
      map: payload.map,
    });
  }

  const direct = await uploadDrawingDirect(base, accessToken, payload);
  if (direct.ok) {
    return direct;
  }

  if (shouldFallbackToBackground(direct)) {
    console.info("[vgraffiti] direct upload failed, retry via service worker");
    return bgUploadDrawing({
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
      meta: payload.meta,
      map: payload.map,
    });
  }

  return direct;
}

function shouldFallbackToBackground(result: BgResult): boolean {
  if (result.ok) {
    return false;
  }
  const err = result.error.toLowerCase();
  const body = (result.body ?? "").toLowerCase();
  return (
    err.includes("failed to fetch") ||
    err.includes("network") ||
    err.includes("сеть:") ||
    err.includes("нет доступа") ||
    err.includes("permission") ||
    err.includes("cors") ||
    err.includes("mixed") ||
    err.includes("blocked") ||
    err.includes("insecure") ||
    body.includes("mixed content")
  );
}

async function uploadDrawingDirect(
  base: string,
  accessToken: string,
  payload: DrawingUploadPayload,
): Promise<BgResult> {
  const url = `${base}/drawings`;
  const origin = originFromApiBase(base);

  console.info("[vgraffiti] POST", url);

  const body: Record<string, unknown> = {
    image_base64: payload.imageBase64,
    mime_type: payload.mimeType || "image/png",
    meta: payload.meta ?? {},
    title: "",
    description: "",
  };
  if (payload.map) {
    body.lat = payload.map.lat;
    body.lng = payload.map.lng;
    body.map_provider = payload.map.provider;
    if (payload.map.zoom != null) {
      body.zoom = payload.map.zoom;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Сеть: ${msg}. Проверьте URL API (${origin}) и «Проверить адрес» в popup расширения.`,
    };
  }

  const text = await res.text();
  if (res.status >= 400) {
    return {
      ok: false,
      status: res.status,
      body: text,
      error: `HTTP ${res.status}`,
    };
  }

  let data: unknown = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  return { ok: true, data };
}
