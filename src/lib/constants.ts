/** Базовый URL API без завершающего слэша (включая префикс, напр. …/wp-json/vgraffiti/v1). */
export const STORAGE_API_BASE = "vgf_api_base_url";

/** Захардкоженный API root (позже заменить на прод). */
export const DEFAULT_API_BASE_URL = "http://drawonit.loc/wp-json/vgraffiti/v1";

/** Страница входа на сайте (тот же origin, что и API). */
export const SITE_LOGIN_URL = "http://drawonit.loc/wp-login.php";

export const MESSAGE_API_FETCH = "vgf:apiFetch" as const;
export const MESSAGE_REQUEST_HOST = "vgf:requestHost" as const;
