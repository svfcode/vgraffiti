import { clearSiteSession, fetchSiteSession } from "../src/auth/site-sync";

export default defineContentScript({
  matches: [
    "*://vgraffiti.ru/*",
    "*://*.vgraffiti.ru/*",
    "*://vgraffiti.loc/*",
    "*://*.vgraffiti.loc/*",
  ],
  runAt: "document_idle",
  main() {
    void applySiteSession();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }
      if (message.type === "auth.syncNow") {
        void applySiteSession().then(sendResponse);
        return true;
      }
      return;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void applySiteSession();
      }
    });
  },
});

async function applySiteSession(): Promise<{ ok: boolean; guest?: boolean; email?: string; error?: string }> {
  const r = await fetchSiteSession();
  if (r.ok) {
    return { ok: true, email: r.email };
  }
  if (r.guest) {
    await clearSiteSession();
    return { ok: false, guest: true };
  }
  return { ok: false, error: r.error };
}
