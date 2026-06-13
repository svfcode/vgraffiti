import { DEFAULT_API_BASE_URL } from "../lib/constants";
import { parseVerifyResponse } from "./parse-verify-response";
import { clearSession, setSession } from "./session";

export type SiteSyncResult =
  | { ok: true; email: string }
  | { ok: false; guest: true }
  | { ok: false; guest: false; error: string };

function readWpRestNonce(): string | null {
  try {
    const w = window as Window & { wpApiSettings?: { nonce?: string } };
    const nonce = w.wpApiSettings?.nonce;
    return typeof nonce === "string" && nonce.length > 0 ? nonce : null;
  } catch {
    return null;
  }
}

/** Запрос сессии с cookies сайта (вызывать только из content script на vgraffiti.ru). */
export async function fetchSiteSession(): Promise<SiteSyncResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const nonce = readWpRestNonce();
  if (nonce) {
    headers["X-WP-Nonce"] = nonce;
  }

  let res: Response;
  try {
    res = await fetch(`${DEFAULT_API_BASE_URL}/auth/session`, {
      method: "GET",
      credentials: "include",
      headers,
    });
  } catch (e) {
    return {
      ok: false,
      guest: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, guest: true };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      guest: false,
      error: text.trim() || `HTTP ${res.status}`,
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, guest: false, error: "Неверный JSON в ответе /auth/session" };
  }

  const parsed = parseVerifyResponse(json);
  if (!parsed?.email) {
    return { ok: false, guest: false, error: "Нет access_token или email в ответе сервера" };
  }

  await setSession({
    accessToken: parsed.accessToken,
    expiresAt: parsed.expiresAt,
    email: parsed.email,
    profileDrawingsUrl: parsed.profileDrawingsUrl,
  });

  return { ok: true, email: parsed.email };
}

export async function clearSiteSession(): Promise<void> {
  await clearSession();
}
