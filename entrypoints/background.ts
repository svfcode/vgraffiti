import { clearSession, getApiBaseUrl, getSession, setApiBaseUrl, setSession } from "../src/lib/storage";
import { normalizeApiBaseUrl, originFromApiBase } from "../src/lib/url";
import type { MapContext } from "../src/lib/map-context";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string; status?: number; body?: string };
type Result<T> = Ok<T> | Err;

type BgMessage =
  | { type: "config.setApiBase"; url: string }
  | { type: "api.meta" }
  | { type: "api.authEmail"; email: string }
  | { type: "api.authVerify"; email: string; code: string }
  | { type: "api.logout" }
  | { type: "api.uploadDrawing"; imageBase64: string; mimeType: string; meta: Record<string, unknown>; map?: MapContext | null }
  | { type: "api.listDrawingsNearMap"; lat: number; lng: number; mapProvider: string; radius: number; zoom: number | null }
  | { type: "api.fetchImageDataUrl"; url: string };

async function parseJsonSafe(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function apiRequest(opts: {
  path: string;
  method: string;
  body?: unknown;
  auth: "none" | "bearer";
  idempotencyKey?: string;
}): Promise<Result<{ status: number; json: unknown | null; text: string }>> {
  const base = await getApiBaseUrl();
  if (!base) {
    return { ok: false, error: "Сервер не настроен: укажите API root в popup" };
  }
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  if (opts.auth === "bearer") {
    const { accessToken } = await getSession();
    if (!accessToken) {
      return { ok: false, error: "Нет сессии: войдите по почте" };
    }
    headers.Authorization = `Bearer ${accessToken}`;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const text = await res.text();
  const json = text.length ? await parseJsonSafe(text) : null;
  return { ok: true, data: { status: res.status, json, text } };
}

const NEED_API_HOST_HINT =
  "Нет доступа к домену API в браузере. Откройте окно расширения (иконка пазла → vgraffiti) и нажмите «Проверить адрес», разрешите доступ, затем повторите действие на карте.";

/** В SW нельзя вызывать chrome.permissions.request (нет user gesture) — только проверка. */
async function hasApiOriginPermission(): Promise<Result<boolean>> {
  const base = await getApiBaseUrl();
  if (!base) {
    return { ok: false, error: "Сначала сохраните URL API в окне расширения" };
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
  switch (msg.type) {
    case "config.setApiBase": {
      try {
        const normalized = normalizeApiBaseUrl(msg.url);
        await setApiBaseUrl(normalized);
        return { ok: true, data: { apiBaseUrl: normalized } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "api.meta": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      const r = await apiRequest({
        path: "/meta",
        method: "GET",
        auth: "none",
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
    case "api.authEmail": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      const r = await apiRequest({
        path: "/auth/email",
        method: "POST",
        auth: "none",
        body: { email: msg.email },
        idempotencyKey: crypto.randomUUID(),
      });
      if (!r.ok) {
        return r;
      }
      const { status, text } = r.data;
      if (status >= 400) {
        return {
          ok: false,
          status,
          body: text,
          error: `HTTP ${status}`,
        };
      }
      return { ok: true, data: { sent: true } };
    }
    case "api.authVerify": {
      const perm = await hasApiOriginPermission();
      if (!perm.ok) {
        return perm;
      }
      if (!perm.data) {
        return { ok: false, error: NEED_API_HOST_HINT };
      }
      const r = await apiRequest({
        path: "/auth/verify",
        method: "POST",
        auth: "none",
        body: { email: msg.email, code: msg.code.trim() },
        idempotencyKey: crypto.randomUUID(),
      });
      if (!r.ok) {
        return r;
      }
      const { status, json, text } = r.data;
      if (status >= 400 || !json || typeof json !== "object") {
        return {
          ok: false,
          status,
          body: text,
          error: `HTTP ${status}`,
        };
      }
      const o = json as Record<string, unknown>;
      const access_token = o.access_token;
      const expires_at = o.expires_at;
      if (typeof access_token !== "string") {
        return { ok: false, error: "Неверный ответ сервера: нет access_token" };
      }
      let profileDrawingsUrl: string | null = null;
      const userObj = o.user;
      if (userObj && typeof userObj === "object") {
        const u = userObj as Record<string, unknown>;
        if (typeof u.profile_drawings_url === "string" && u.profile_drawings_url.length > 0) {
          profileDrawingsUrl = u.profile_drawings_url;
        }
      }
      await setSession({
        accessToken: access_token,
        expiresAt:
          typeof expires_at === "string" || expires_at === null
            ? (expires_at as string | null)
            : null,
        email: msg.email,
        profileDrawingsUrl,
      });
      return { ok: true, data: { ok: true } };
    }
    case "api.logout": {
      const { accessToken } = await getSession();
      if (accessToken) {
        await apiRequest({
          path: "/auth/logout",
          method: "POST",
          auth: "bearer",
        });
      }
      await clearSession();
      return { ok: true, data: { ok: true } };
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
