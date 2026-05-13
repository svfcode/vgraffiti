import { clearSession, getApiBaseUrl, getSession, setApiBaseUrl, setSession } from "../src/lib/storage";
import { normalizeApiBaseUrl, originFromApiBase } from "../src/lib/url";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string; status?: number; body?: string };
type Result<T> = Ok<T> | Err;

type BgMessage =
  | { type: "config.setApiBase"; url: string }
  | { type: "api.meta" }
  | { type: "api.authEmail"; email: string }
  | { type: "api.authVerify"; email: string; code: string }
  | { type: "api.logout" }
  | { type: "api.uploadDrawing"; buffer: ArrayBuffer; mimeType: string; meta: Record<string, unknown> };

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
      await setSession({
        accessToken: access_token,
        expiresAt:
          typeof expires_at === "string" || expires_at === null
            ? (expires_at as string | null)
            : null,
        email: msg.email,
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
      const { accessToken } = await getSession();
      if (!accessToken) {
        return { ok: false, error: "Нет сессии: войдите по почте" };
      }
      const base = await getApiBaseUrl();
      if (!base) {
        return { ok: false, error: "Сервер не настроен" };
      }
      const url = `${base}/drawings`;
      const blob = new Blob([msg.buffer], { type: msg.mimeType || "image/png" });
      const form = new FormData();
      form.append("file", blob, "drawing.png");
      form.append("meta", JSON.stringify(msg.meta ?? {}));
      form.append("title", "");
      form.append("description", "");
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      };
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body: form,
        });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      const text = await res.text();
      const json = text.length ? await parseJsonSafe(text) : null;
      if (res.status >= 400) {
        return {
          ok: false,
          status: res.status,
          body: text,
          error: `HTTP ${res.status}`,
        };
      }
      return { ok: true, data: json };
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
