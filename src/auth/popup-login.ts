import { bgAuthEmail, bgAuthVerify, bgLogout } from "./client";
import {
  getLastAuthCodeSentAt,
  getSession,
  remainingSendCodeCooldownMs,
  setLastAuthCodeSentNow,
} from "./session";
import { ensureApiOriginFromExtensionPage } from "../lib/ensure-api-origin";
import { getApiBaseUrl } from "../lib/storage";
import { DEFAULT_API_BASE_URL } from "../lib/constants";
import { wpAdminProfileUrlFromApiBase } from "../lib/url";

let sendCodeCooldownIntervalId: number | null = null;

export type AuthPopupDeps = {
  showErr: (text: string) => void;
  clearErr: () => void;
  withButtonLoad: <T>(btn: HTMLButtonElement, fn: () => Promise<T>) => Promise<T>;
  resolveApiBaseFromUi: () => Promise<string | null>;
};

function getSendCodeBtn(): HTMLButtonElement {
  return document.getElementById("btnSendCode") as HTMLButtonElement;
}

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stopSendCodeCooldownTicker(): void {
  if (sendCodeCooldownIntervalId != null) {
    clearInterval(sendCodeCooldownIntervalId);
    sendCodeCooldownIntervalId = null;
  }
}

export async function syncSendCodeCooldownUi(): Promise<void> {
  const btn = getSendCodeBtn();
  const last = await getLastAuthCodeSentAt();
  const rem = remainingSendCodeCooldownMs(last);
  const live = document.getElementById("sendCodeCooldownLive")!;
  const busy = document.body.classList.contains("popup--loading");

  if (rem > 0) {
    live.hidden = false;
    live.textContent = `Следующая отправка через ${formatMmSs(rem)}.`;
    btn.disabled = true;
    btn.title = `Повторная отправка через ${formatMmSs(rem)}`;
    if (sendCodeCooldownIntervalId == null) {
      sendCodeCooldownIntervalId = window.setInterval(() => {
        void syncSendCodeCooldownUi();
      }, 1000);
    }
  } else {
    live.hidden = true;
    live.textContent = "";
    btn.title = "";
    stopSendCodeCooldownTicker();
    if (!busy) {
      btn.disabled = false;
    }
  }
}

function hideCodeStep(): void {
  const step = document.getElementById("codeStep")!;
  step.hidden = true;
  const code = document.getElementById("code") as HTMLInputElement | null;
  if (code) {
    code.value = "";
  }
}

function showCodeStep(): void {
  document.getElementById("codeStep")!.hidden = false;
}

export async function refreshAuthPanels(): Promise<void> {
  const base = await getApiBaseUrl();
  const s = await getSession();
  const panelAuthed = document.getElementById("panelAuthed")!;
  const panelGuest = document.getElementById("panelGuest")!;
  const authedSummary = document.getElementById("authedSummary")!;
  const guestHint = document.getElementById("guestHint")!;

  if (s.accessToken) {
    panelAuthed.hidden = false;
    panelGuest.hidden = true;
    authedSummary.textContent = `Вошли как ${s.email ?? "?"}. Сервер: ${base ?? "—"}.`;
    const profileLink = document.getElementById("profileSiteLink") as HTMLAnchorElement;
    const profileRow = profileLink.closest(".authed-profile-row") as HTMLElement;
    const profileUrl =
      s.profileDrawingsUrl ?? (base ? wpAdminProfileUrlFromApiBase(base) : null);
    if (profileUrl) {
      profileRow.hidden = false;
      profileLink.href = profileUrl;
    } else {
      profileRow.hidden = true;
      profileLink.removeAttribute("href");
    }
    return;
  }

  panelAuthed.hidden = true;
  panelGuest.hidden = false;
  if (!base) {
    guestHint.textContent =
      `В поле «Базовый URL API» по умолчанию указан локальный адрес (${DEFAULT_API_BASE_URL}). Нажмите «Сохранить», чтобы записать его, или замените на свой сервер, затем почту и код.`;
  } else {
    guestHint.textContent = `Сервер: ${base} — выполните вход по почте ниже для синхронизации и меты прогулок.`;
  }
}

export function initAuthPopup(deps: AuthPopupDeps): void {
  const btnSendCode = document.getElementById("btnSendCode") as HTMLButtonElement;
  const btnVerify = document.getElementById("btnVerify") as HTMLButtonElement;
  const btnLogout = document.getElementById("btnLogout") as HTMLButtonElement;

  btnSendCode.addEventListener("click", async () => {
    deps.clearErr();
    try {
      const email = (document.getElementById("email") as HTMLInputElement).value.trim();
      if (!email) {
        deps.showErr("Введите email");
        return;
      }
      const base = await deps.resolveApiBaseFromUi();
      if (!base) {
        deps.showErr("Укажите корректный URL API в поле выше или сохраните сервер.");
        return;
      }
      const rem = remainingSendCodeCooldownMs(await getLastAuthCodeSentAt());
      if (rem > 0) {
        deps.showErr(`Повторная отправка кода возможна через ${formatMmSs(rem)}.`);
        return;
      }
      showCodeStep();
      const flow = await deps.withButtonLoad(btnSendCode, async () => {
        const granted = await ensureApiOriginFromExtensionPage(base);
        if (!granted) {
          return { kind: "permission" as const };
        }
        const r = await bgAuthEmail(email);
        if (r.ok) {
          await setLastAuthCodeSentNow();
        }
        return { kind: "auth" as const, r };
      });

      if (flow.kind === "permission") {
        deps.showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
        hideCodeStep();
        return;
      }
      const r = flow.r;
      if (!r.ok) {
        deps.showErr(r.error + (r.body ? `\n${r.body}` : ""));
        hideCodeStep();
        return;
      }
      await refreshAuthPanels();
    } finally {
      await syncSendCodeCooldownUi();
    }
  });

  btnVerify.addEventListener("click", async () => {
    deps.clearErr();
    const email = (document.getElementById("email") as HTMLInputElement).value.trim();
    const code = (document.getElementById("code") as HTMLInputElement).value.trim();
    if (!email || !code) {
      deps.showErr("Нужны email и код");
      return;
    }
    const base = await deps.resolveApiBaseFromUi();
    if (!base) {
      deps.showErr("Укажите корректный URL API в поле выше или сохраните сервер.");
      return;
    }
    const flow = await deps.withButtonLoad(btnVerify, async () => {
      const granted = await ensureApiOriginFromExtensionPage(base);
      if (!granted) {
        return { kind: "permission" as const };
      }
      return { kind: "auth" as const, r: await bgAuthVerify(email, code) };
    });

    if (flow.kind === "permission") {
      deps.showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
      return;
    }
    const r = flow.r;
    if (!r.ok) {
      deps.showErr(r.error + (r.body ? `\n${r.body}` : ""));
      return;
    }
    await refreshAuthPanels();
  });

  btnLogout.addEventListener("click", async () => {
    deps.clearErr();
    const r = await deps.withButtonLoad(btnLogout, () => bgLogout());
    if (!r.ok) {
      deps.showErr(r.error);
      return;
    }
    await refreshAuthPanels();
    hideCodeStep();
    await syncSendCodeCooldownUi();
  });

  hideCodeStep();
}

export function resetAuthPopupUi(): void {
  hideCodeStep();
  void syncSendCodeCooldownUi();
}
