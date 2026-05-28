/** Базовый URL API без завершающего слэша (включая префикс, напр. …/wp-json/vgraffiti/v1). */
export const STORAGE_API_BASE = "vgf_api_base_url";

/** Подставляется в поле URL в popup, пока пользователь не сохранил свой адрес в storage. */
export const DEFAULT_API_BASE_URL = "http://drawonit.loc/wp-json/vgraffiti/v1";

export const MESSAGE_API_FETCH = "vgf:apiFetch" as const;
export const MESSAGE_REQUEST_HOST = "vgf:requestHost" as const;
