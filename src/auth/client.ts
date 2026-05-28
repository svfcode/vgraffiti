import { sendToBackground, type BgResult } from "../lib/extension-api";

export async function bgAuthEmail(email: string): Promise<BgResult> {
  return sendToBackground({ type: "api.authEmail", email });
}

export async function bgAuthVerify(email: string, code: string): Promise<BgResult> {
  return sendToBackground({ type: "api.authVerify", email, code: code.trim() });
}

export async function bgLogout(): Promise<BgResult> {
  return sendToBackground({ type: "api.logout" });
}
