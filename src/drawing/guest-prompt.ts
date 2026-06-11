import { SITE_LOGIN_URL } from "../lib/constants";
import { STORAGE_ACCESS_TOKEN } from "../auth/constants";
import { getSession } from "../auth/session";
import { isExtensionContextValid } from "../lib/extension-context";

const HOST_ATTR = "data-vgraffiti-guest";

export function mountGuestPrompt(onInvalidate?: (teardown: () => void) => void): void {
  if (document.querySelector(`[${HOST_ATTR}]`)) {
    return;
  }

  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "1");
  host.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483646;font:13px system-ui,sans-serif;";

  const card = document.createElement("div");
  card.style.cssText =
    "max-width:260px;padding:12px 14px;border-radius:10px;background:#202124;color:#e8eaed;box-shadow:0 2px 12px rgba(0,0,0,.35);border:1px solid #5f6368;";

  const title = document.createElement("div");
  title.textContent = "vgraffiti";
  title.style.cssText = "font-weight:600;margin-bottom:6px;";

  const text = document.createElement("p");
  text.textContent = "Войдите на сайте, чтобы рисовать на карте.";
  text.style.cssText = "margin:0 0 10px;line-height:1.4;color:#9aa0a6;";

  const link = document.createElement("a");
  link.href = SITE_LOGIN_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Войти на drawonit.loc";
  link.style.cssText = "color:#8ab4f8;font-weight:500;text-decoration:none;";
  link.addEventListener("mouseenter", () => {
    link.style.textDecoration = "underline";
  });
  link.addEventListener("mouseleave", () => {
    link.style.textDecoration = "none";
  });

  card.append(title, text, link);
  host.append(card);
  document.documentElement.append(host);

  const teardown = () => host.remove();
  onInvalidate?.(teardown);
}

export function watchSessionForOverlay(
  onAuthed: () => void,
  onInvalidate?: (teardown: () => void) => void,
): () => void {
  if (!isExtensionContextValid()) {
    return () => {};
  }

  let done = false;

  const tryAuthed = () => {
    if (done) {
      return;
    }
    void getSession().then((s) => {
      if (done || !s.accessToken) {
        return;
      }
      done = true;
      window.clearInterval(pollId);
      chrome.storage.onChanged.removeListener(onStorage);
      onAuthed();
    });
  };

  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (done || area !== "local" || !changes[STORAGE_ACCESS_TOKEN]) {
      return;
    }
    const next = changes[STORAGE_ACCESS_TOKEN].newValue;
    if (typeof next === "string" && next.length > 0) {
      tryAuthed();
    }
  };

  chrome.storage.onChanged.addListener(onStorage);

  void tryAuthed();
  const pollId = window.setInterval(tryAuthed, 2500);

  const teardown = () => {
    done = true;
    window.clearInterval(pollId);
    chrome.storage.onChanged.removeListener(onStorage);
  };
  onInvalidate?.(teardown);
  return teardown;
}

export async function isAuthedForOverlay(): Promise<boolean> {
  const s = await getSession();
  return Boolean(s.accessToken);
}
