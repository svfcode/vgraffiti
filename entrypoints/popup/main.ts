import { initAuthPopup, refreshAuthPanels } from "../../src/auth/popup-login";
import { bgRequestSiteSync } from "../../src/auth/client";

function setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
  btn.classList.toggle("is-loading", loading);
  btn.disabled = loading;
  btn.toggleAttribute("aria-busy", loading);
  if (loading) {
    if (!btn.querySelector(".btn-loader__spin")) {
      const spin = document.createElement("span");
      spin.className = "btn-loader__spin";
      spin.setAttribute("aria-hidden", "true");
      btn.insertBefore(spin, btn.firstChild);
    }
  } else {
    btn.querySelector(".btn-loader__spin")?.remove();
  }
}

async function withButtonLoad<T>(btn: HTMLButtonElement, fn: () => Promise<T>): Promise<T> {
  setButtonLoading(btn, true);
  document.body.classList.add("popup--loading");
  try {
    return await fn();
  } finally {
    setButtonLoading(btn, false);
    document.body.classList.remove("popup--loading");
  }
}

function showErr(text: string) {
  const el = document.getElementById("err")!;
  el.textContent = text;
  el.hidden = false;
}

function clearErr() {
  const el = document.getElementById("err")!;
  el.hidden = true;
  el.textContent = "";
}

void (async () => {
  await bgRequestSiteSync().catch(() => {});
  await refreshAuthPanels();
})();

initAuthPopup({
  showErr,
  clearErr,
  withButtonLoad,
});

document.body.classList.add("ready");
