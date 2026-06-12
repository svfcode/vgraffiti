/** Настройки Street View (localStorage в контексте страницы карты). */

export const SV_WALK_LINKS_KEY = "vgf:svWalkLinksAlways";

export function readSvWalkLinksAlways(): boolean {
  try {
    return localStorage.getItem(SV_WALK_LINKS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSvWalkLinksAlways(enabled: boolean): void {
  try {
    localStorage.setItem(SV_WALK_LINKS_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore private mode */
  }
}
