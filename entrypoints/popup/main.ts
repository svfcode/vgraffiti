import {
  bgAuthEmail,
  bgAuthVerify,
  bgLogout,
  bgMeta,
  bgSetApiBaseUrl,
} from "../../src/lib/extension-api";
import { ensureApiOriginFromExtensionPage } from "../../src/lib/ensure-api-origin";
import { normalizeApiBaseUrl } from "../../src/lib/url";
import { DEFAULT_API_BASE_URL } from "../../src/lib/constants";
import { formatMetaHuman } from "../../src/lib/format-meta-human";
import { getApiBaseUrl, getSession } from "../../src/lib/storage";

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

/** При каждом открытии popup — снять зависшее состояние загрузки. */
function resetAllButtonLoaders(): void {
  document.body.classList.remove("popup--loading");
  document.querySelectorAll("button").forEach((el) => {
    if (!(el instanceof HTMLButtonElement)) {
      return;
    }
    el.classList.remove("is-loading");
    el.removeAttribute("aria-busy");
    el.querySelector(".btn-loader__spin")?.remove();
    el.disabled = false;
  });
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

function firstLine(text: string): string {
  const i = text.indexOf("\n");
  return i === -1 ? text : text.slice(0, i);
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

function clearMetaOut() {
  const out = document.getElementById("metaOut")!;
  out.replaceChildren();
  out.hidden = true;
}

function renderMetaSuccess(humanText: string) {
  const out = document.getElementById("metaOut")!;
  out.replaceChildren();
  const lines = humanText.split("\n");
  const first = (lines[0]?.trim() || "Сервер доступен.").trim();
  const rest = lines.slice(1).join("\n").trimEnd();

  const status = document.createElement("div");
  status.className = "meta-status meta-status--ok";
  status.appendChild(document.createTextNode("✓ "));
  status.appendChild(document.createTextNode(first));
  out.appendChild(status);

  if (rest.length > 0) {
    const body = document.createElement("div");
    body.className = "meta-body";
    body.textContent = rest;
    out.appendChild(body);
  }
  out.hidden = false;
}

function renderMetaFailure(shortMsg: string, detail?: string) {
  const out = document.getElementById("metaOut")!;
  out.replaceChildren();

  const status = document.createElement("div");
  status.className = "meta-status meta-status--err";
  status.appendChild(document.createTextNode("✗ "));
  status.appendChild(document.createTextNode(shortMsg));
  out.appendChild(status);

  const d = detail?.trim();
  if (d) {
    const body = document.createElement("div");
    body.className = "meta-body";
    body.textContent = d;
    out.appendChild(body);
  }
  out.hidden = false;
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
      `В поле «Базовый URL API» по умолчанию указан локальный адрес (${DEFAULT_API_BASE_URL}). Нажмите «Сохранить», чтобы записать его, или замените на свой сервер, затем почту и код.`;
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

$("apiUrl").value = (await getApiBaseUrl()) ?? DEFAULT_API_BASE_URL;

const btnSaveServer = document.getElementById("btnSaveServer") as HTMLButtonElement;
const btnCheckMeta = document.getElementById("btnCheckMeta") as HTMLButtonElement;
const btnSendCode = document.getElementById("btnSendCode") as HTMLButtonElement;
const btnVerify = document.getElementById("btnVerify") as HTMLButtonElement;
const btnLogout = document.getElementById("btnLogout") as HTMLButtonElement;

btnSaveServer.addEventListener("click", async () => {
  clearErr();
  const url = $("apiUrl").value;
  const r = await withButtonLoad(btnSaveServer, () => bgSetApiBaseUrl(url));
  if (!r.ok) {
    showErr(r.error);
    return;
  }
  clearMetaOut();
  await refreshPanels();
});

btnCheckMeta.addEventListener("click", async () => {
  clearErr();
  clearMetaOut();
  const base = await resolveApiBaseFromUi();
  if (!base) {
    showErr("Укажите корректный URL API в поле выше или сохраните сервер.");
    return;
  }
  const flow = await withButtonLoad(btnCheckMeta, async () => {
    const granted = await ensureApiOriginFromExtensionPage(base);
    if (!granted) {
      return { kind: "permission" as const };
    }
    const meta = await bgMeta();
    return { kind: "meta" as const, meta };
  });

  if (flow.kind === "permission") {
    const short = "Нет доступа к домену API.";
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    renderMetaFailure(short);
    return;
  }

  const { meta: r } = flow;
  if (!r.ok) {
    const full = r.error + (r.body ? `\n${r.body}` : "");
    showErr(full);
    renderMetaFailure(firstLine(r.error), r.body);
    return;
  }
  renderMetaSuccess(formatMetaHuman(r.data));
});

btnSendCode.addEventListener("click", async () => {
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
  showCodeStep();
  const flow = await withButtonLoad(btnSendCode, async () => {
    const granted = await ensureApiOriginFromExtensionPage(base);
    if (!granted) {
      return { kind: "permission" as const };
    }
    return { kind: "auth" as const, r: await bgAuthEmail(email) };
  });

  if (flow.kind === "permission") {
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    hideCodeStep();
    return;
  }
  const r = flow.r;
  if (!r.ok) {
    showErr(r.error + (r.body ? `\n${r.body}` : ""));
    hideCodeStep();
    return;
  }
  await refreshPanels();
});

btnVerify.addEventListener("click", async () => {
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
  const flow = await withButtonLoad(btnVerify, async () => {
    const granted = await ensureApiOriginFromExtensionPage(base);
    if (!granted) {
      return { kind: "permission" as const };
    }
    return { kind: "auth" as const, r: await bgAuthVerify(email, code) };
  });

  if (flow.kind === "permission") {
    showErr("Доступ к домену API не выдан — разрешите запрос браузера.");
    return;
  }
  const r = flow.r;
  if (!r.ok) {
    showErr(r.error + (r.body ? `\n${r.body}` : ""));
    return;
  }
  await refreshPanels();
});

btnLogout.addEventListener("click", async () => {
  clearErr();
  const r = await withButtonLoad(btnLogout, () => bgLogout());
  if (!r.ok) {
    showErr(r.error);
    return;
  }
  await refreshPanels();
  hideCodeStep();
});

resetAllButtonLoaders();
hideCodeStep();
document.body.classList.add("ready");
