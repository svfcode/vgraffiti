/** Базовый URL API без завершающего слэша (включая префикс, напр. …/wp-json/vgraffiti/v1). */
export const STORAGE_API_BASE = "vgf_api_base_url";

/** Подставляется в поле URL в popup, пока пользователь не сохранил свой адрес в storage. */
export const DEFAULT_API_BASE_URL = "http://drawonit.loc/wp-json/vgraffiti/v1";

/** Bearer после успешного /auth/verify */
export const STORAGE_ACCESS_TOKEN = "vgf_access_token";
export const STORAGE_TOKEN_EXPIRES_AT = "vgf_token_expires_at";
export const STORAGE_USER_EMAIL = "vgf_user_email";

/** Unix ms последней успешной отправки кода на /auth/email (клиентский cooldown). */
export const STORAGE_LAST_AUTH_CODE_SENT_AT = "vgf_last_auth_code_sent_ms";

/** Минимальный интервал между отправками кода (popup). */
export const AUTH_CODE_COOLDOWN_MS = 2 * 60 * 1000;

export const MESSAGE_API_FETCH = "vgf:apiFetch" as const;
export const MESSAGE_REQUEST_HOST = "vgf:requestHost" as const;

export interface StoredSession {
  apiBaseUrl: string;
  accessToken: string;
  /** ISO или unix ms — по факту хранения */
  expiresAt: string | null;
  email: string;
}
