import type { ViewportMode } from "../../lib/viewport-mode";
import { installViewportModeWatcher } from "../../lib/viewport-mode";
import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { syncJourneyPanel, closeJourneyNudge } from "../handlers/2.6.5-handle-journeys";
import { syncDiaryPanel, syncSpotFromPage } from "./handle-pano";
import { broadcastSvWalkLinks, syncSvWalkLinksSetting } from "./sv-walk-links";
import { readSvWalkLinksAlways } from "../../lib/sv-prefs";

export function applyPanelViewportMode(host: DrawingOverlayHost, mode: ViewportMode): void {
  host.viewportMode = mode;
  host.bar.dataset.viewportMode = mode;

  host.journeyNewBtn.textContent =
    mode === "streetview" ? "Новая прогулка" : "Новое путешествие";

  const nameLabel = host.journeyWrap.querySelector<HTMLLabelElement>(".journey-label");
  if (nameLabel) {
    nameLabel.textContent = mode === "streetview" ? "Название прогулки" : "Название";
  }

  const savedPick = host.journeyWrap.querySelector<HTMLDetailsElement>("#vgf-journey-saved-pick");
  if (savedPick) {
    savedPick.classList.toggle("is-streetview", mode === "streetview");
  }

  if (mode === "streetview" && host.journeyNudgeOpen) {
    closeJourneyNudge(host);
  }

  const walkWrap = host.bar.querySelector<HTMLLabelElement>("#vgf-sv-walk-wrap");
  if (walkWrap) {
    walkWrap.hidden = mode !== "streetview";
  }

  if (mode === "streetview") {
    host.zoomVisual = null;
    host.panVisual = null;
    host.mapZooming = false;
    syncSpotFromPage(host, { force: true });
    syncSvWalkLinksSetting(host);
    broadcastSvWalkLinks(readSvWalkLinksAlways());
    host.scheduleRedraw();
  } else {
    broadcastSvWalkLinks(false);
    host.streetViewContext = null;
    host.activeSpotKey = null;
    if (host.uiMode === "draw") {
      host.uiMode = "nav";
      host.syncModeButtons();
    }
  }

  syncJourneyPanel(host);
  syncDiaryPanel(host);
}

export function initPanelViewportMode(host: DrawingOverlayHost): () => void {
  applyPanelViewportMode(host, host.viewportMode);
  return installViewportModeWatcher((mode) => applyPanelViewportMode(host, mode));
}
