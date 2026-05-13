/** Базовый URL API без завершающего слэша (включая префикс, напр. …/wp-json/vgraffiti/v1). */
export const STORAGE_API_BASE = "vgf_api_base_url";
/** Bearer после успешного /auth/verify */
export const STORAGE_ACCESS_TOKEN = "vgf_access_token";
export const STORAGE_TOKEN_EXPIRES_AT = "vgf_token_expires_at";
export const STORAGE_USER_EMAIL = "vgf_user_email";

export const MESSAGE_API_FETCH = "vgf:apiFetch" as const;
export const MESSAGE_REQUEST_HOST = "vgf:requestHost" as const;

export interface StoredSession {
  apiBaseUrl: string;
  accessToken: string;
  /** ISO или unix ms — по факту хранения */
  expiresAt: string | null;
  email: string;
}
