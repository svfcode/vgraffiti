import { sendToBackground, type BgResult } from "../lib/extension-api";

export async function bgLogout(): Promise<BgResult> {
  return sendToBackground({ type: "api.logout" });
}

/** Попросить вкладку vgraffiti.ru синхронизировать сессию с сайта. */
export async function bgRequestSiteSync(): Promise<BgResult> {
  return sendToBackground({ type: "auth.requestSiteSync" });
}
