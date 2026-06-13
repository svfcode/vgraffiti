/** Продакшен-сайт vgraffiti (захардкожен). */
export const SITE_ORIGIN = "https://vgraffiti.ru";
export const SITE_HOST = "vgraffiti.ru";

/** Базовый URL API без завершающего слэша (включая префикс, напр. …/wp-json/vgraffiti/v1). */
export const STORAGE_API_BASE = "vgf_api_base_url";

export const DEFAULT_API_BASE_URL = `${SITE_ORIGIN}/wp-json/vgraffiti/v1`;

/** Страница входа на сайте (тот же origin, что и API). */
export const SITE_LOGIN_URL = `${SITE_ORIGIN}/wp-login.php`;

export const MESSAGE_API_FETCH = "vgf:apiFetch" as const;
export const MESSAGE_REQUEST_HOST = "vgf:requestHost" as const;
