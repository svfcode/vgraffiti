import type { ViewportMode } from "../../lib/viewport-mode";
import { installViewportModeWatcher } from "../../lib/viewport-mode";
import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { syncJourneyPanel, closeJourneyNudge } from "../handlers/2.6.5-handle-journeys";
import { syncStreetViewContext } from "./map-binding";

export function applyPanelViewportMode(host: DrawingOverlayHost, mode: ViewportMode): void {
  host.viewportMode = mode;
  host.bar.dataset.viewportMode = mode;

  host.journeyNewBtn.textContent =
    mode === "streetview" ? "Новая прогулка" : "Новое путешествие";

  const nameLabel = host.journeyWrap.querySelector<HTMLLabelElement>(".journey-label");
  if (nameLabel) {
    nameLabel.textContent = mode === "streetview" ? "Название прогулки" : "Название";
  }

  host.journeySaveBtn.textContent = "Сохранить";
  host.journeySaveBtn.title =
    mode === "streetview"
      ? "Сохранить прогулку в расширении"
      : "Сохранить путешествие в расширении";

  const savedPick = host.journeyWrap.querySelector<HTMLDetailsElement>("#vgf-journey-saved-pick");
  if (savedPick) {
    savedPick.classList.toggle("is-streetview", mode === "streetview");
  }

  if (mode === "streetview" && host.journeyNudgeOpen) {
    closeJourneyNudge(host);
  }

  if (mode === "streetview") {
    host.zoomVisual = null;
    host.panVisual = null;
    host.mapZooming = false;
    syncStreetViewContext(host);
  } else {
    host.streetViewContext = null;
  }

  syncJourneyPanel(host);
}

export function initPanelViewportMode(host: DrawingOverlayHost): () => void {
  applyPanelViewportMode(host, host.viewportMode);
  return installViewportModeWatcher((mode) => applyPanelViewportMode(host, mode));
}
