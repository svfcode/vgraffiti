import { normalizeApiBaseUrl, originFromApiBase } from "./url";

/**
 * Запрос host permission к домену API.
 * Вызывать только из popup/options (есть chrome.permissions и user gesture после клика).
 * Не вызывать из content script и не через sendMessage → service worker.
 */
export async function ensureApiOriginFromExtensionPage(apiBaseUrl: string): Promise<boolean> {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  const originPattern = `${originFromApiBase(normalized)}/*`;
  const has = await chrome.permissions.contains({ origins: [originPattern] });
  if (has) return true;
  return chrome.permissions.request({ origins: [originPattern] });
}
