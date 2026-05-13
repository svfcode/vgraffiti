import { getApiBaseUrl, getSession } from "../../src/lib/storage";

type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; status?: number; body?: string };

async function send(msg: object): Promise<BgResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: unknown) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as BgResponse);
    });
  });
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

void refreshPanels();

$("apiUrl").value = (await getApiBaseUrl()) ?? "";

document.getElementById("btnSaveServer")!.addEventListener("click", async () => {
  clearErr();
  const url = $("apiUrl").value;
  const r = await send({ type: "config.setApiBase", url });
  if (!r.ok) {
    showErr(r.error);
    return;
  }
  await refreshPanels();
});

document.getElementById("btnCheckMeta")!.addEventListener("click", async () => {
  clearErr();
  const perm = await send({ type: "permissions.ensureApiOrigin" });
  if (!perm.ok) {
    showErr(perm.error);
    return;
  }
  if (!perm.data) {
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    return;
  }
  const r = await send({ type: "api.meta" });
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
  const r = await send({ type: "api.authEmail", email });
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
  const r = await send({ type: "api.authVerify", email, code });
  if (!r.ok) {
    showErr(r.error + (r.body ? `\n${r.body}` : ""));
    return;
  }
  await refreshPanels();
});

document.getElementById("btnLogout")!.addEventListener("click", async () => {
  clearErr();
  const r = await send({ type: "api.logout" });
  if (!r.ok) {
    showErr(r.error);
    return;
  }
  await refreshPanels();
});

document.body.classList.add("ready");
