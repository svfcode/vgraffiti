import { getApiBaseUrl } from "../src/lib/storage";
import { apiRequest } from "../src/lib/api-request";
import {
  handleAuthBackgroundMessage,
  isAuthBgMessage,
} from "../src/auth/background-handlers";
import { originFromApiBase } from "../src/lib/url";
import { SITE_HOST } from "../src/lib/constants";
import type { MapContext } from "../src/lib/map-context";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string; status?: number; body?: string };
type Result<T> = Ok<T> | Err;

type BgMessage =
  | { type: "api.logout" }
  | { type: "auth.requestSiteSync" }
  | { type: "api.uploadDrawing"; imageBase64: string; mimeType: string; meta: Record<string, unknown>; map?: MapContext | null }
  | { type: "api.listDrawingsNearMap"; lat: number; lng: number; mapProvider: string; radius: number; zoom: number | null }
  | { type: "api.syncJourneys"; journeys: unknown[]; visibleClientIds: string[]; deletedClientIds: string[] }
  | { type: "api.fetchImageDataUrl"; url: string };

const NEED_API_HOST_HINT =
  `Нет доступа к ${SITE_HOST}. Переустановите расширение или проверьте разрешения в настройках браузера.`;

/** В SW нельзя вызывать chrome.permissions.request (нет user gesture) — только проверка. */
async function hasApiOriginPermission(): Promise<Result<boolean>> {
  const base = await getApiBaseUrl();
  if (!base) {
    return { ok: false, error: "API не настроен" };
  }
  const originPattern = `${originFromApiBase(base)}/*`;
  try {
    const has = await chrome.permissions.contains({
      origins: [originPattern],
    });
    return { ok: true, data: has };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function handleMessage(msg: BgMessage): Promise<Result<unknown>> {
  if (isAuthBgMessage(msg)) {
    return handleAuthBackgroundMessage(msg, hasApiOriginPermission);
  }

  switch (msg.type) {
    case "auth.requestSiteSync": {
      return requestSiteSync();
    }
    case "api.uploadDrawing": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      const body: Record<string, unknown> = {
        image_base64: msg.imageBase64,
        mime_type: msg.mimeType || "image/png",
        meta: msg.meta ?? {},
        title: "",
        description: "",
      };
      if (msg.map) {
        body.lat = msg.map.lat;
        body.lng = msg.map.lng;
        body.map_provider = msg.map.provider;
        if (msg.map.zoom != null) {
          body.zoom = msg.map.zoom;
        }
      }
      const r = await apiRequest({
        path: "/drawings",
        method: "POST",
        auth: "bearer",
        idempotencyKey: crypto.randomUUID(),
        body,
      });
      if (!r.ok) {
        return r;
      }
      const { status, json, text } = r.data;
      if (status >= 400) {
        return {
          ok: false,
          status,
          body: text,
          error: `HTTP ${status}`,
        };
      }
      return { ok: true, data: json };
    }
    case "api.listDrawingsNearMap": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      const qs = new URLSearchParams({
        lat: String(msg.lat),
        lng: String(msg.lng),
        map_provider: msg.mapProvider,
        near: "1",
        radius: String(msg.radius),
      });
      if (msg.zoom != null) {
        qs.set("zoom", String(msg.zoom));
      }
      const r = await apiRequest({
        path: `/drawings?${qs.toString()}`,
        method: "GET",
        auth: "bearer",
      });
      if (!r.ok) {
        return r;
      }
      const { status, json, text } = r.data;
      if (status >= 400) {
        return {
          ok: false,
          status,
          body: text,
          error: `HTTP ${status}`,
        };
      }
      return { ok: true, data: json };
    }
    case "api.syncJourneys": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      const r = await apiRequest({
        path: "/journeys/sync",
        method: "POST",
        auth: "bearer",
        idempotencyKey: crypto.randomUUID(),
        body: {
          journeys: msg.journeys,
          visible_client_ids: msg.visibleClientIds,
          deleted_client_ids: msg.deletedClientIds,
        },
      });
      if (!r.ok) {
        return r;
      }
      const { status, json, text } = r.data;
      if (status >= 400) {
        return {
          ok: false,
          status,
          body: text,
          error: `HTTP ${status}`,
        };
      }
      return { ok: true, data: json };
    }
    case "api.fetchImageDataUrl": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      let res: Response;
      try {
        res = await fetch(msg.url);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      const dataUrl = `data:${mime};base64,${btoa(binary)}`;
      return { ok: true, data: dataUrl };
    }
    default:
      return { ok: false, error: "Неизвестный тип сообщения" };
  }
}

async function requestSiteSync(): Promise<Result<unknown>> {
  const sitePatterns = [
    `*://${SITE_HOST}/*`,
    `*://*.${SITE_HOST}/*`,
    "*://vgraffiti.loc/*",
    "*://*.vgraffiti.loc/*",
  ];
  const tabs = await chrome.tabs.query({ url: sitePatterns });
  if (tabs.length === 0) {
    return {
      ok: false,
      error: `Откройте ${SITE_HOST} в браузере, войдите в аккаунт и повторите.`,
    };
  }

  const ordered = [...tabs].sort(
    (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
  );

  let lastGuest: { ok: false; guest: true } | null = null;

  for (const tab of ordered) {
    if (tab.id == null) {
      continue;
    }
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "auth.syncNow" });
      if (!r || typeof r !== "object") {
        continue;
      }
      if ("ok" in r && r.ok === true) {
        return { ok: true, data: r };
      }
      if ("guest" in r && r.guest === true) {
        lastGuest = r as { ok: false; guest: true };
      }
    } catch {
      /* вкладка без content script */
    }
  }

  if (lastGuest) {
    return { ok: true, data: lastGuest };
  }

  return {
    ok: false,
    error: `Откройте любую страницу ${SITE_HOST} (не карту), затем повторите.`,
  };
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (r: Result<unknown>) => void,
    ) => {
    if (!message || typeof message !== "object" || !("type" in message)) {
      void Promise.resolve({ ok: false as const, error: "Некорректное сообщение" }).then(
        sendResponse,
      );
      return true;
    }
    void handleMessage(message as BgMessage).then(sendResponse);
    return true;
  });
});
