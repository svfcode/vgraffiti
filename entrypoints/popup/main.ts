import {
  bgAuthEmail,
  bgAuthVerify,
  bgLogout,
  bgMeta,
  bgSetApiBaseUrl,
} from "../../src/lib/extension-api";
import { ensureApiOriginFromExtensionPage } from "../../src/lib/ensure-api-origin";
import { normalizeApiBaseUrl } from "../../src/lib/url";
import { getApiBaseUrl, getSession } from "../../src/lib/storage";

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

async function refreshPanels(): Promise<void> {
  const base = await getApiBaseUrl();
  const s = await getSession();
  const panelAuthed = document.getElementById("panelAuthed")!;
  const panelGuest = document.getElementById("panelGuest")!;
  const authedSummary = document.getElementById("authedSummary")!;
  const guestHint = document.getElementById("guestHint")!;

  if (s.accessToken) {
    panelAuthed.hidden = false;
    panelGuest.hidden = true;
    authedSummary.textContent = `Сервер: ${base ?? "—"} — вошли как ${s.email ?? "?"}.`;
    return;
  }

  panelAuthed.hidden = true;
  panelGuest.hidden = false;
  if (!base) {
    guestHint.textContent =
      "Сервер не задан — рисование на карте доступно без входа. Укажите URL API ниже, затем почту и код.";
  } else {
    guestHint.textContent = `Сервер: ${base} — выполните вход по почте ниже для синхронизации и меты прогулок.`;
  }
}

function $(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

async function resolveApiBaseFromUi(): Promise<string | null> {
  const raw = $("apiUrl").value.trim();
  if (raw) {
    try {
      return normalizeApiBaseUrl(raw);
    } catch {
      return null;
    }
  }
  return getApiBaseUrl();
}

void refreshPanels();

$("apiUrl").value = (await getApiBaseUrl()) ?? "";

document.getElementById("btnSaveServer")!.addEventListener("click", async () => {
  clearErr();
  const url = $("apiUrl").value;
  const r = await bgSetApiBaseUrl(url);
  if (!r.ok) {
    showErr(r.error);
    return;
  }
  await refreshPanels();
});

document.getElementById("btnCheckMeta")!.addEventListener("click", async () => {
  clearErr();
  const base = await resolveApiBaseFromUi();
  if (!base) {
    showErr("Укажите корректный URL API в поле выше или сохраните сервер.");
    return;
  }
  const granted = await ensureApiOriginFromExtensionPage(base);
  if (!granted) {
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    return;
  }
  const r = await bgMeta();
  const out = document.getElementById("metaOut")!;
  if (!r.ok) {
    showErr(r.error + (r.body ? `\n${r.body}` : ""));
    out.hidden = true;
    return;
  }
  out.textContent = JSON.stringify(r.data, null, 2);
  out.hidden = false;
});

document.getElementById("btnSendCode")!.addEventListener("click", async () => {
  clearErr();
  const email = $("email").value.trim();
  if (!email) {
    showErr("Введите email");
    return;
  }
  const base = await resolveApiBaseFromUi();
  if (!base) {
    showErr("Укажите корректный URL API в поле выше или сохраните сервер.");
    return;
  }
  const granted = await ensureApiOriginFromExtensionPage(base);
  if (!granted) {
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    return;
  }
  const r = await bgAuthEmail(email);
  if (!r.ok) {
    showErr(r.error + (r.body ? `\n${r.body}` : ""));
    return;
  }
  await refreshPanels();
});

document.getElementById("btnVerify")!.addEventListener("click", async () => {
  clearErr();
  const email = $("email").value.trim();
  const code = $("code").value.trim();
  if (!email || !code) {
    showErr("Нужны email и код");
    return;
  }
  const base = await resolveApiBaseFromUi();
  if (!base) {
    showErr("Укажите корректный URL API в поле выше или сохраните сервер.");
    return;
  }
  const granted = await ensureApiOriginFromExtensionPage(base);
  if (!granted) {
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    return;
  }
  const r = await bgAuthVerify(email, code);
  if (!r.ok) {
    showErr(r.error + (r.body ? `\n${r.body}` : ""));
    return;
  }
  await refreshPanels();
});

document.getElementById("btnLogout")!.addEventListener("click", async () => {
  clearErr();
  const r = await bgLogout();
  if (!r.ok) {
    showErr(r.error);
    return;
  }
  await refreshPanels();
});

document.body.classList.add("ready");
