import { parseVerifyResponse } from "./parse-verify-response";
import { clearSession, getSession, setSession } from "./session";
import type { AuthBgMessage } from "./constants";
import type { ApiResult } from "../lib/api-request";
import { apiRequest } from "../lib/api-request";

type Result<T> = ApiResult<T>;

const NEED_API_HOST_HINT =
  "Нет доступа к drawonit.loc. Проверьте разрешения расширения в браузере.";

type PermissionCheck = () => Promise<Result<boolean>>;

function httpError(status: number, text: string): Result<never> {
  return {
    ok: false,
    status,
    body: text,
    error: `HTTP ${status}`,
  };
}

async function withApiPermission(
  hasApiOriginPermission: PermissionCheck,
  fn: () => Promise<Result<unknown>>,
): Promise<Result<unknown>> {
  const perm = await hasApiOriginPermission();
  if (!perm.ok) {
    return perm;
  }
  if (!perm.data) {
    return { ok: false, error: NEED_API_HOST_HINT };
  }
  return fn();
}

async function handleAuthEmail(email: string): Promise<Result<unknown>> {
  const r = await apiRequest({
    path: "/auth/email",
    method: "POST",
    auth: "none",
    body: { email },
    idempotencyKey: crypto.randomUUID(),
  });
  if (!r.ok) {
    return r;
  }
  const { status, text } = r.data;
  if (status >= 400) {
    return httpError(status, text);
  }
  return { ok: true, data: { sent: true } };
}

async function handleAuthVerify(email: string, code: string): Promise<Result<unknown>> {
  const r = await apiRequest({
    path: "/auth/verify",
    method: "POST",
    auth: "none",
    body: { email, code: code.trim() },
    idempotencyKey: crypto.randomUUID(),
  });
  if (!r.ok) {
    return r;
  }
  const { status, json, text } = r.data;
  if (status >= 400) {
    return httpError(status, text);
  }
  const parsed = parseVerifyResponse(json);
  if (!parsed) {
    return { ok: false, error: "Неверный ответ сервера: нет access_token" };
  }
  await setSession({
    accessToken: parsed.accessToken,
    expiresAt: parsed.expiresAt,
    email: parsed.email ?? email,
    profileDrawingsUrl: parsed.profileDrawingsUrl,
  });
  return { ok: true, data: { ok: true } };
}

async function handleLogout(): Promise<Result<unknown>> {
  const { accessToken } = await getSession();
  if (accessToken) {
    await apiRequest({
      path: "/auth/logout",
      method: "POST",
      auth: "bearer",
    });
  }
  await clearSession();
  return { ok: true, data: { ok: true } };
}

export function isAuthBgMessage(msg: { type: string }): msg is AuthBgMessage {
  return (
    msg.type === "api.authEmail" ||
    msg.type === "api.authVerify" ||
    msg.type === "api.logout"
  );
}

export async function handleAuthBackgroundMessage(
  msg: AuthBgMessage,
  hasApiOriginPermission: PermissionCheck,
): Promise<Result<unknown>> {
  switch (msg.type) {
    case "api.authEmail":
      return withApiPermission(hasApiOriginPermission, () => handleAuthEmail(msg.email));
    case "api.authVerify":
      return withApiPermission(hasApiOriginPermission, () =>
        handleAuthVerify(msg.email, msg.code),
      );
    case "api.logout":
      return handleLogout();
    default:
      return { ok: false, error: "Неизвестный тип сообщения auth" };
  }
}
