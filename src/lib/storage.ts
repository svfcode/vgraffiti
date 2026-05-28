import { STORAGE_API_BASE } from "./constants";

export async function getApiBaseUrl(): Promise<string | null> {
  const r = await chrome.storage.local.get(STORAGE_API_BASE);
  const v = r[STORAGE_API_BASE];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_API_BASE]: url });
}
