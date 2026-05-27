import { SWATCHES, type DrawingOverlayHost, type PanelElements } from "./2.1-overlay-types";
import { bindCanvasEvents, resizeCanvas } from "./2.5-create-canvas";
import { bindHistoryPanelEvents } from "./2.6.1-handle-history";
import { bindPanelMoveEvents } from "./2.6.3-handle-panel-move";
import { bindShortcutEvents } from "./2.6.4-handle-shortcut";
import {
  bindToolPanelEvents,
  syncDualColor,
  syncPickUi,
  syncSizeRows,
  syncSwatches,
  syncToolButtons,
} from "./2.6.2-handle-tools";
import { syncUndoRedoButtons } from "./2.6.1-handle-history";
import { applyBarPosition, applyPanelOpacity } from "./2.6.3-handle-panel-move";

export function queryPanelElements(bar: HTMLDivElement): PanelElements {
  return {
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

export function initPanel(host: DrawingOverlayHost): void {
  initSwatches(host);
  bindHistoryPanelEvents(host);
  bindToolPanelEvents(host);
  bindPanelMoveEvents(host);
  bindShortcutEvents(host);
  bindCanvasEvents(host);

  syncToolButtons(host);
  syncSizeRows(host);
  syncDualColor(host);
  syncPickUi(host);
  syncSwatches(host);
  applyPanelOpacity(host);
  applyBarPosition(host);
  syncUndoRedoButtons(host);
  resizeCanvas(host);
}
