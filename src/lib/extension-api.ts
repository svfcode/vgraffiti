/** Вызовы в service worker из popup и content script. */

export type BgResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; status?: number; body?: string };

export async function sendToBackground(msg: Record<string, unknown>): Promise<BgResult> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: unknown) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as BgResult);
    });
  });
}

export async function bgSetApiBaseUrl(url: string): Promise<BgResult> {
  return sendToBackground({ type: "config.setApiBase", url });
}

export async function bgMeta(): Promise<BgResult> {
  return sendToBackground({ type: "api.meta" });
}

export async function bgAuthEmail(email: string): Promise<BgResult> {
  return sendToBackground({ type: "api.authEmail", email });
}

export async function bgAuthVerify(email: string, code: string): Promise<BgResult> {
  return sendToBackground({ type: "api.authVerify", email, code: code.trim() });
}

export async function bgLogout(): Promise<BgResult> {
  return sendToBackground({ type: "api.logout" });
}

export async function bgUploadDrawing(payload: {
  buffer: ArrayBuffer;
  mimeType: string;
  meta: Record<string, unknown>;
}): Promise<BgResult> {
  return sendToBackground({
    type: "api.uploadDrawing",
    buffer: payload.buffer,
    mimeType: payload.mimeType,
    meta: payload.meta,
  });
}
