import { DEFAULT_API_BASE_URL } from "./constants";

/** API root захардкожен; позже вынесем в конфиг прод-сборки. */
export async function getApiBaseUrl(): Promise<string> {
  return DEFAULT_API_BASE_URL;
}

/** @deprecated Сервер больше не настраивается вручную. */
export async function setApiBaseUrl(_url: string): Promise<void> {
  /* no-op */
}
