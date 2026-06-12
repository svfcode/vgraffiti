import {
  readSvDrawingRangeM,
  readSvMinimapEnabled,
  writeSvDrawingRangeM,
  writeSvMinimapEnabled,
} from "../../lib/sv-prefs";
import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { redraw } from "../2.11-rerender";
import { markSvMinimapDirty, syncSvMinimapVisibility, tickSvMinimap } from "./sv-minimap";

function syncSvSettingsVisibility(host: DrawingOverlayHost): void {
  const sv = host.viewportMode === "streetview";
  host.svRangeWrap.hidden = !sv;
  host.svMinimapSettingWrap.hidden = !sv;
}

function applyDrawingRange(host: DrawingOverlayHost, meters: number): void {
  writeSvDrawingRangeM(meters);
  const clamped = readSvDrawingRangeM();
  host.svDrawingRangeM = clamped;
  host.svDrawingRangeEl.value = String(clamped);
  host.svDrawingRangeValEl.textContent = String(clamped);
  markSvMinimapDirty();
  tickSvMinimap(host, true);
  cancelAnimationFrame(host.raf);
  host.raf = 0;
  redraw(host);
}

export function syncSvPanelSettings(host: DrawingOverlayHost): void {
  syncSvSettingsVisibility(host);
  const range = readSvDrawingRangeM();
  host.svDrawingRangeM = range;
  host.svDrawingRangeEl.value = String(range);
  host.svDrawingRangeValEl.textContent = String(range);
  host.svMinimapEl.checked = readSvMinimapEnabled();
  syncSvMinimapVisibility(host);
}

export function bindSvPanelSettings(host: DrawingOverlayHost): void {
  syncSvPanelSettings(host);

  const onRangeInput = () => {
    const meters = Number.parseInt(host.svDrawingRangeEl.value, 10);
    if (!Number.isFinite(meters)) {
      return;
    }
    applyDrawingRange(host, meters);
  };

  host.svDrawingRangeEl.addEventListener("input", onRangeInput);
  host.svDrawingRangeEl.addEventListener("change", onRangeInput);

  host.svMinimapEl.addEventListener("change", () => {
    writeSvMinimapEnabled(host.svMinimapEl.checked);
    markSvMinimapDirty();
    syncSvMinimapVisibility(host);
    if (host.svMinimapEl.checked) {
      tickSvMinimap(host, true);
    }
    cancelAnimationFrame(host.raf);
    host.raf = 0;
    redraw(host);
  });
}
