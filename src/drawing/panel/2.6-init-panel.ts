import { SWATCHES, type DrawingOverlayHost, type PanelElements } from "../2.1-overlay-types";
import {
  bindJourneyPanelEvents,
  initActiveJourney,
  initJourneyStorage,
  syncJourneyPanel,
} from "../handlers/2.6.5-handle-journeys";
import { bindCanvasEvents, resizeCanvas } from "../canvas/2.5-create-canvas";
import { bindHistoryPanelEvents } from "../handlers/2.6.1-handle-history";
import { bindPanelMoveEvents } from "../handlers/2.6.3-handle-panel-move";
import { bindShortcutEvents } from "../handlers/2.6.4-handle-shortcut";
import {
  bindToolPanelEvents,
  syncDualColor,
  syncModeButtons,
  syncPickUi,
  syncSizeRows,
  syncSwatches,
  syncToolButtons,
} from "../handlers/2.6.2-handle-tools";
import { syncUndoRedoButtons } from "../handlers/2.6.1-handle-history";
import { applyBarPosition, applyPanelOpacity } from "../handlers/2.6.3-handle-panel-move";
import { initJourneyCloudSync } from "../inc/journey-cloud-sync";
import { applyJourneyDeepLink, initJourneyDeepLink } from "../inc/journey-deep-link";
import { initPanelViewportMode } from "../inc/panel-viewport-mode";
import { bindDiaryPanelEvents, syncDiaryPanel } from "../inc/handle-pano";
import { bindSvWalkLinksSetting } from "../inc/sv-walk-links";

export function queryPanelElements(bar: HTMLDivElement): PanelElements {
  return {
    journeyWrap: bar.querySelector<HTMLDivElement>("#vgf-journey-wrap")!,
    journeyActiveTitleEl: bar.querySelector<HTMLDivElement>("#vgf-journey-active-title")!,
    journeyNudgeWrap: bar.querySelector<HTMLDivElement>("#vgf-journey-nudge")!,
    journeyNewBtn: bar.querySelector<HTMLButtonElement>("#vgf-journey-new")!,
    journeyNameEl: bar.querySelector<HTMLInputElement>("#vgf-journey-name")!,
    journeyDiaryEl: bar.querySelector<HTMLTextAreaElement>("#vgf-journey-diary")!,
    journeySaveBtn: bar.querySelector<HTMLButtonElement>("#vgf-journey-save")!,
    journeyListEl: bar.querySelector<HTMLDivElement>("#vgf-journey-list")!,
    swatchHost: bar.querySelector<HTMLDivElement>("#vgf-swatches")!,
    swatchesWrap: bar.querySelector<HTMLDivElement>("#vgf-swatches-wrap")!,
    pickHintEl: bar.querySelector<HTMLParagraphElement>("#vgf-pick-hint")!,
    dcFg: bar.querySelector<HTMLButtonElement>("#vgf-dc-fg")!,
    dcBg: bar.querySelector<HTMLButtonElement>("#vgf-dc-bg")!,
    swapColorsBtn: bar.querySelector<HTMLButtonElement>("#vgf-swap-colors")!,
    brushSizeEl: bar.querySelector<HTMLInputElement>("#vgf-brush-size")!,
    eraserSizeEl: bar.querySelector<HTMLInputElement>("#vgf-eraser-size")!,
    brushWrap: bar.querySelector<HTMLDivElement>("#vgf-brush-size-wrap")!,
    eraserWrap: bar.querySelector<HTMLDivElement>("#vgf-eraser-size-wrap")!,
    clearBtn: bar.querySelector<HTMLButtonElement>("#vgf-clear")!,
    panelOpacityEl: bar.querySelector<HTMLInputElement>("#vgf-panel-opacity")!,
    moreDetails: bar.querySelector<HTMLDetailsElement>("#vgf-more")!,
    dragHandle: bar.querySelector<HTMLSpanElement>("#vgf-drag")!,
    cloudSyncBtn: bar.querySelector<HTMLButtonElement>("#vgf-cloud-sync")!,
    undoBtn: bar.querySelector<HTMLButtonElement>("#vgf-undo")!,
    redoBtn: bar.querySelector<HTMLButtonElement>("#vgf-redo")!,
    svWalkLinksEl: bar.querySelector<HTMLInputElement>("#vgf-sv-walk-links")!,
  };
}

export function initSwatches(host: DrawingOverlayHost): void {
  for (const hex of SWATCHES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.dataset.c = hex;
    b.style.backgroundColor = hex;
    b.title = `Цвет ${hex}`;
    host.swatchHost.appendChild(b);
  }
}

export async function initPanel(host: DrawingOverlayHost): Promise<() => void> {
  initSwatches(host);
  bindHistoryPanelEvents(host);
  bindToolPanelEvents(host);
  bindPanelMoveEvents(host);
  bindShortcutEvents(host);
  bindCanvasEvents(host);

  bindJourneyPanelEvents(host);
  bindDiaryPanelEvents(host);
  bindSvWalkLinksSetting(host);
  initActiveJourney(host);
  await initJourneyStorage(host);
  syncJourneyPanel(host);

  syncToolButtons(host);
  syncModeButtons(host);
  syncSizeRows(host);
  syncDualColor(host);
  syncPickUi(host);
  syncSwatches(host);
  applyPanelOpacity(host);
  applyBarPosition(host);
  syncUndoRedoButtons(host);
  resizeCanvas(host);
  host.syncMapFollow();

  const stopCloudSync = initJourneyCloudSync(host);
  const stopDeepLink = initJourneyDeepLink(host);
  const stopViewportMode = initPanelViewportMode(host);

  syncDiaryPanel(host);
  await applyJourneyDeepLink(host);

  return () => {
    stopCloudSync();
    stopDeepLink();
    stopViewportMode();
  };
}
