/** Bearer после успешного /auth/verify */
export const STORAGE_ACCESS_TOKEN = "vgf_access_token";
export const STORAGE_TOKEN_EXPIRES_AT = "vgf_token_expires_at";
export const STORAGE_USER_EMAIL = "vgf_user_email";
export const STORAGE_PROFILE_DRAWINGS_URL = "vgf_profile_drawings_url";

/** Unix ms последней успешной отправки кода на /auth/email (клиентский cooldown). */
export const STORAGE_LAST_AUTH_CODE_SENT_AT = "vgf_last_auth_code_sent_ms";

/** Минимальный интервал между отправками кода (popup). */
export const AUTH_CODE_COOLDOWN_MS = 2 * 60 * 1000;

export interface StoredSession {
  apiBaseUrl: string;
  accessToken: string;
  /** ISO или unix ms — по факту хранения */
  expiresAt: string | null;
  email: string;
  profileDrawingsUrl: string | null;
}

export type AuthBgMessage =
  | { type: "api.authEmail"; email: string }
  | { type: "api.authVerify"; email: string; code: string }
  | { type: "api.logout" };
