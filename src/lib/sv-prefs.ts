/** Настройки Street View (localStorage в контексте страницы карты). */

export const SV_DRAWING_RANGE_KEY = "vgf:svDrawingRangeM";
export const SV_MINIMAP_KEY = "vgf:svMinimap";

export const SV_DRAWING_RANGE_MIN_M = 5;
export const SV_DRAWING_RANGE_MAX_M = 500;
export const SV_DRAWING_RANGE_DEFAULT_M = 100;

export function readSvDrawingRangeM(): number {
  try {
    const raw = localStorage.getItem(SV_DRAWING_RANGE_KEY);
    if (raw == null) {
      return SV_DRAWING_RANGE_DEFAULT_M;
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      return SV_DRAWING_RANGE_DEFAULT_M;
    }
    return Math.max(SV_DRAWING_RANGE_MIN_M, Math.min(SV_DRAWING_RANGE_MAX_M, n));
  } catch {
    return SV_DRAWING_RANGE_DEFAULT_M;
  }
}

export function writeSvDrawingRangeM(meters: number): void {
  try {
    const clamped = Math.max(
      SV_DRAWING_RANGE_MIN_M,
      Math.min(SV_DRAWING_RANGE_MAX_M, Math.round(meters)),
    );
    localStorage.setItem(SV_DRAWING_RANGE_KEY, String(clamped));
  } catch {
    /* ignore private mode */
  }
}

export function readSvMinimapEnabled(): boolean {
  try {
    return localStorage.getItem(SV_MINIMAP_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSvMinimapEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SV_MINIMAP_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore private mode */
  }
}
