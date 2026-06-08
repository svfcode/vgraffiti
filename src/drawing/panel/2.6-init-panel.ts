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
import { bindMemoryPanelEvents, syncMemoryUi } from "../inc/handle-memory";

export function queryPanelElements(bar: HTMLDivElement): PanelElements {
  return {
    journeyWrap: bar.querySelector<HTMLDivElement>("#vgf-journey-wrap")!,
    journeyActiveTitleEl: bar.querySelector<HTMLDivElement>("#vgf-journey-active-title")!,
    journeyNudgeWrap: bar.querySelector<HTMLDivElement>("#vgf-journey-nudge")!,
    journeyNewBtn: bar.querySelector<HTMLButtonElement>("#vgf-journey-new")!,
    journeyNameEl: bar.querySelector<HTMLInputElement>("#vgf-journey-name")!,
    journeySaveBtn: bar.querySelector<HTMLButtonElement>("#vgf-journey-save")!,
    journeyListEl: bar.querySelector<HTMLDivElement>("#vgf-journey-list")!,
    spotNoteEl: bar.querySelector<HTMLTextAreaElement>("#vgf-spot-note")!,
    currentCanvasesEl: bar.querySelector<HTMLDivElement>("#vgf-current-canvases")!,
    placesHeadEl: bar.querySelector<HTMLDivElement>("#vgf-places-head")!,
    memoryListEl: bar.querySelector<HTMLDivElement>("#vgf-memory-list")!,
    envelopeDetailWrap: bar.querySelector<HTMLDivElement>("#vgf-envelope-detail")!,
    envelopeWallBtn: bar.querySelector<HTMLButtonElement>("#vgf-envelope-wall")!,
    envelopePutInBtn: bar.querySelector<HTMLButtonElement>("#vgf-envelope-put-in")!,
    envelopeUnfoldBtn: bar.querySelector<HTMLButtonElement>("#vgf-envelope-unfold")!,
    envelopeFoldBtn: bar.querySelector<HTMLButtonElement>("#vgf-envelope-fold")!,
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
  bindMemoryPanelEvents(host);
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

  syncMemoryUi(host);
  await applyJourneyDeepLink(host);

  return () => {
    stopCloudSync();
    stopDeepLink();
    stopViewportMode();
  };
}
