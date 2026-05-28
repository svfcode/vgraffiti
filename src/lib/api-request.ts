import { getSession } from "../auth/session";
import { getApiBaseUrl } from "./storage";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; status?: number; body?: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function parseJsonSafe(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function apiRequest(opts: {
  path: string;
  method: string;
  body?: unknown;
  auth: "none" | "bearer";
  idempotencyKey?: string;
}): Promise<ApiResult<{ status: number; json: unknown | null; text: string }>> {
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
