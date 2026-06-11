import { bgLogout, bgRequestSiteSync } from "./client";
import { getSession } from "./session";
import { SITE_LOGIN_URL } from "../lib/constants";
import { getApiBaseUrl } from "../lib/storage";
import { wpAdminProfileUrlFromApiBase } from "../lib/url";

export type AuthPopupDeps = {
  showErr: (text: string) => void;
  clearErr: () => void;
  withButtonLoad: <T>(btn: HTMLButtonElement, fn: () => Promise<T>) => Promise<T>;
};

export async function refreshAuthPanels(): Promise<void> {
  const base = await getApiBaseUrl();
  const s = await getSession();
  const panelAuthed = document.getElementById("panelAuthed")!;
  const panelGuest = document.getElementById("panelGuest")!;
  const authedSummary = document.getElementById("authedSummary")!;
  const loginLink = document.getElementById("loginLink") as HTMLAnchorElement;

  loginLink.href = SITE_LOGIN_URL;

  if (s.accessToken) {
    panelAuthed.hidden = false;
    panelGuest.hidden = true;
    authedSummary.textContent = `Вошли как ${s.email ?? "?"}`;
    const profileLink = document.getElementById("profileSiteLink") as HTMLAnchorElement;
    const profileRow = profileLink.closest(".authed-profile-row") as HTMLElement;
    const profileUrl =
      s.profileDrawingsUrl ?? wpAdminProfileUrlFromApiBase(base);
    profileRow.hidden = false;
    profileLink.href = profileUrl;
    return;
  }

  panelAuthed.hidden = true;
  panelGuest.hidden = false;
}

export function initAuthPopup(deps: AuthPopupDeps): void {
  const btnSync = document.getElementById("btnSyncLogin") as HTMLButtonElement;
  const btnLogout = document.getElementById("btnLogout") as HTMLButtonElement;

  btnSync.addEventListener("click", async () => {
    deps.clearErr();
    const r = await deps.withButtonLoad(btnSync, () => bgRequestSiteSync());
    if (!r.ok) {
      deps.showErr(r.error);
      return;
    }
    const data = r.data as { guest?: boolean; email?: string } | undefined;
    if (data?.guest) {
      deps.showErr("Вы не вошли на сайте. Откройте ссылку выше и войдите в аккаунт.");
      await refreshAuthPanels();
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
  });
}
