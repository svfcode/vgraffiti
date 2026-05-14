import {
  AUTH_CODE_COOLDOWN_MS,
  STORAGE_ACCESS_TOKEN,
  STORAGE_API_BASE,
  STORAGE_LAST_AUTH_CODE_SENT_AT,
  STORAGE_TOKEN_EXPIRES_AT,
  STORAGE_USER_EMAIL,
} from "./constants";

export async function getApiBaseUrl(): Promise<string | null> {
  const r = await chrome.storage.local.get(STORAGE_API_BASE);
  const v = r[STORAGE_API_BASE];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_API_BASE]: url });
}

export async function getSession(): Promise<{
  accessToken: string | null;
  expiresAt: string | null;
  email: string | null;
}> {
  const r = await chrome.storage.local.get([
    STORAGE_ACCESS_TOKEN,
    STORAGE_TOKEN_EXPIRES_AT,
    STORAGE_USER_EMAIL,
  ]);
  return {
    accessToken:
      typeof r[STORAGE_ACCESS_TOKEN] === "string"
        ? r[STORAGE_ACCESS_TOKEN]
        : null,
    expiresAt:
      typeof r[STORAGE_TOKEN_EXPIRES_AT] === "string"
        ? r[STORAGE_TOKEN_EXPIRES_AT]
        : null,
    email:
      typeof r[STORAGE_USER_EMAIL] === "string" ? r[STORAGE_USER_EMAIL] : null,
  };
}

export async function setSession(data: {
  accessToken: string;
  expiresAt: string | null;
  email: string;
}): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_ACCESS_TOKEN]: data.accessToken,
    [STORAGE_TOKEN_EXPIRES_AT]: data.expiresAt,
    [STORAGE_USER_EMAIL]: data.email,
  });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_ACCESS_TOKEN,
    STORAGE_TOKEN_EXPIRES_AT,
    STORAGE_USER_EMAIL,
    STORAGE_LAST_AUTH_CODE_SENT_AT,
  ]);
}

/** Остаток клиентского cooldown для «Отправить код», мс (0 — можно отправить). */
export function remainingSendCodeCooldownMs(lastSentAt: number | null, now = Date.now()): number {
  if (lastSentAt == null || lastSentAt <= 0) {
    return 0;
  }
  return Math.max(0, lastSentAt + AUTH_CODE_COOLDOWN_MS - now);
}

export async function getLastAuthCodeSentAt(): Promise<number | null> {
  const r = await chrome.storage.local.get(STORAGE_LAST_AUTH_CODE_SENT_AT);
  const v = r[STORAGE_LAST_AUTH_CODE_SENT_AT];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function setLastAuthCodeSentNow(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_LAST_AUTH_CODE_SENT_AT]: Date.now() });
}
