import { readMapContext, type MapContext } from "../lib/map-context";
import { readStreetViewContext, type StreetViewContext } from "../lib/streetview-context";
import { detectViewportMode, type ViewportMode } from "../lib/viewport-mode";
import { createShadowDom } from "./2.2-create-shadow-dom";
import { createCanvas } from "./canvas/2.5-create-canvas";
import { initPanel, queryPanelElements } from "./panel/2.6-init-panel";
import {
  getViewportMap,
  installMapBinding,
  syncMapFollow,
  syncStrokesToBridge,
} from "./inc/map-binding";
import {
  cancelActiveStroke,
  finishStroke,
  onClearClick,
  performRedo,
  performUndo,
  pushHistoryBeforeMutation,
  syncUndoRedoButtons,
} from "./handlers/2.6.1-handle-history";
import {
  applyBarPosition,
  applyPanelOpacity,
} from "./handlers/2.6.3-handle-panel-move";
import { scheduleRedraw } from "./2.11-rerender";
import { readSvDrawingRangeM } from "../lib/sv-prefs";
import {
  cycleToolForward,
  getBrushSize,
  getEraserSize,
  hideSizeCursor,
  showSizeCursorAt,
  swapFgBgColors,
  syncDualColor,
  syncModeButtons,
  syncPickUi,
  syncSizeRows,
  syncSwatches,
  syncToolButtons,
  toggleNavDrawMode,
  wantsSizeCursor,
} from "./handlers/2.6.2-handle-tools";
import type { PanoDrawing } from "./inc/pano-types";
import type { SavedJourney } from "./inc/journey-storage";
import type {
  ActiveJourney,
  CurrentGesture,
  JourneyBaseline,
  DrawingOverlayHost,
  PanVisual,
  ZoomVisual,
  StoredStroke,
  ToolId,
  UiMode,
} from "./2.1-overlay-types";
import { ignoreIfContextInvalidated } from "../lib/extension-context";

export class DrawingOverlay implements DrawingOverlayHost {
  static mount(onInvalidate?: (teardown: () => void) => void): void {
    if (document.querySelector("[data-vgraffiti-overlay]")) {
      return;
    }
    try {
      const app = new DrawingOverlay();
      void app.init().catch((e) => {
        if (!ignoreIfContextInvalidated(e)) {
          console.error("[vgraffiti] overlay init failed", e);
        }
      });
      onInvalidate?.(() => app.destroy());
    } catch {
      /* canvas 2d недоступен */
    }
  }

  private readonly hostEl: HTMLDivElement;
  private teardownPanel: (() => void) | null = null;
  private teardownMapBinding: (() => void) | null = null;
  private destroyed = false;

  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly sizeCursorEl: HTMLDivElement;
  readonly bar: HTMLDivElement;
  readonly ctx: CanvasRenderingContext2D;

  readonly swatchHost: HTMLDivElement;
  readonly swatchesWrap: HTMLDivElement;
  readonly pickHintEl: HTMLParagraphElement;
  readonly dcFg: HTMLButtonElement;
  readonly dcBg: HTMLButtonElement;
  readonly swapColorsBtn: HTMLButtonElement;
  readonly brushSizeEl: HTMLInputElement;
  readonly eraserSizeEl: HTMLInputElement;
  readonly brushWrap: HTMLDivElement;
  readonly eraserWrap: HTMLDivElement;
  readonly clearBtn: HTMLButtonElement;
  readonly panelOpacityEl: HTMLInputElement;
  readonly moreDetails: HTMLDetailsElement;
  readonly dragHandle: HTMLSpanElement;
  readonly cloudSyncBtn: HTMLButtonElement;
  readonly undoBtn: HTMLButtonElement;
  readonly redoBtn: HTMLButtonElement;
  readonly journeyWrap: HTMLDivElement;
  readonly journeyActiveTitleEl: HTMLDivElement;
  readonly journeyNudgeWrap: HTMLDivElement;
  readonly journeyNewBtn: HTMLButtonElement;
  readonly journeyNameEl: HTMLInputElement;
  readonly journeyDiaryEl: HTMLTextAreaElement;
  readonly journeySaveBtn: HTMLButtonElement;
  readonly journeyListEl: HTMLDivElement;
  readonly svRangeWrap: HTMLLabelElement;
  readonly svDrawingRangeEl: HTMLInputElement;
  readonly svDrawingRangeValEl: HTMLSpanElement;
  readonly svMinimapSettingWrap: HTMLLabelElement;
  readonly svMinimapEl: HTMLInputElement;
  readonly svMinimapWrap: HTMLDivElement;
  readonly svMinimapCanvas: HTMLCanvasElement;
  readonly svMinimapCtx: CanvasRenderingContext2D;

  activeJourney: ActiveJourney | null = null;
  journeyBaseline: JourneyBaseline | null = null;
  savedJourneys: SavedJourney[] = [];
  selectedJourneyIds = new Set<string>();
  journeyNudgeOpen = false;
  panoDrawings: PanoDrawing[] = [];
  activeSpotKey: string | null = null;
  svDrawingRangeM = readSvDrawingRangeM();
  viewportMode: ViewportMode = detectViewportMode();
  streetViewContext: StreetViewContext | null = readStreetViewContext();
  activeTool: ToolId = "brush";
  uiMode: UiMode = readMapContext() ? "nav" : "draw";
  fgColor = "#000000";
  bgColor = "#ffffff";
  pickTarget: "fg" | "bg" = "fg";
  strokes: StoredStroke[] = [];
  past: StoredStroke[][] = [];
  future: StoredStroke[][] = [];
  current: CurrentGesture | null = null;
  isDrawing = false;
  raf = 0;
  activePointerId: number | null = null;
  barLeftPx: number | null = null;
  barTopPx: number | null = null;
  dragBar: { dx: number; dy: number } | null = null;
  readonly lastHoverClient = { x: 0, y: 0 };

  mapContext: MapContext | null = readMapContext();
  panVisual: PanVisual | null = null;
  zoomVisual: ZoomVisual | null = null;
  mapNativeRender = false;
  mapZooming = false;

  readonly onGlobalPointerUp = (ev: PointerEvent): void => {
    this.finishStroke(ev);
  };

  private constructor() {
    const { host, root, bar } = createShadowDom();
    const { canvas, sizeCursorEl, svMinimapWrap, svMinimapCanvas, ctx, svMinimapCtx } =
      createCanvas(root, bar);
    const panel = queryPanelElements(bar);

    this.hostEl = host;
    this.root = root;
    this.canvas = canvas;
    this.sizeCursorEl = sizeCursorEl;
    this.svMinimapWrap = svMinimapWrap;
    this.svMinimapCanvas = svMinimapCanvas;
    this.bar = bar;
    this.ctx = ctx;
    this.svMinimapCtx = svMinimapCtx;
    this.swatchHost = panel.swatchHost;
    this.swatchesWrap = panel.swatchesWrap;
    this.pickHintEl = panel.pickHintEl;
    this.dcFg = panel.dcFg;
    this.dcBg = panel.dcBg;
    this.swapColorsBtn = panel.swapColorsBtn;
    this.brushSizeEl = panel.brushSizeEl;
    this.eraserSizeEl = panel.eraserSizeEl;
    this.brushWrap = panel.brushWrap;
    this.eraserWrap = panel.eraserWrap;
    this.clearBtn = panel.clearBtn;
    this.panelOpacityEl = panel.panelOpacityEl;
    this.moreDetails = panel.moreDetails;
    this.dragHandle = panel.dragHandle;
    this.cloudSyncBtn = panel.cloudSyncBtn;
    this.undoBtn = panel.undoBtn;
    this.redoBtn = panel.redoBtn;
    this.journeyWrap = panel.journeyWrap;
    this.journeyActiveTitleEl = panel.journeyActiveTitleEl;
    this.journeyNudgeWrap = panel.journeyNudgeWrap;
    this.journeyNewBtn = panel.journeyNewBtn;
    this.journeyNameEl = panel.journeyNameEl;
    this.journeyDiaryEl = panel.journeyDiaryEl;
    this.journeySaveBtn = panel.journeySaveBtn;
    this.journeyListEl = panel.journeyListEl;
    this.svRangeWrap = panel.svRangeWrap;
    this.svDrawingRangeEl = panel.svDrawingRangeEl;
    this.svDrawingRangeValEl = panel.svDrawingRangeValEl;
    this.svMinimapSettingWrap = panel.svMinimapSettingWrap;
    this.svMinimapEl = panel.svMinimapEl;

    document.documentElement.appendChild(host);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.teardownPanel?.();
    this.teardownMapBinding?.();
    this.hostEl.remove();
  }

  private async init(): Promise<void> {
    this.teardownPanel = await initPanel(this);
    this.teardownMapBinding = installMapBinding(this);
  }

  getViewportMap(): MapContext | null {
    return getViewportMap(this);
  }

  syncMapFollow(): void {
    syncMapFollow(this);
  }

  syncStrokesToBridge(): void {
    syncStrokesToBridge(this);
  }

  scheduleRedraw(): void {
    scheduleRedraw(this);
  }

  syncUndoRedoButtons(): void {
    syncUndoRedoButtons(this);
  }

  pushHistoryBeforeMutation(): void {
    pushHistoryBeforeMutation(this);
  }

  performUndo(): void {
    performUndo(this);
  }

  performRedo(): void {
    performRedo(this);
  }

  cancelActiveStroke(): void {
    cancelActiveStroke(this);
  }

  finishStroke(ev: PointerEvent): void {
    finishStroke(this, ev);
  }

  getBrushSize(): number {
    return getBrushSize(this);
  }

  getEraserSize(): number {
    return getEraserSize(this);
  }

  wantsSizeCursor(): boolean {
    return wantsSizeCursor(this);
  }

  hideSizeCursor(): void {
    hideSizeCursor(this);
  }

  showSizeCursorAt(clientX: number, clientY: number): void {
    showSizeCursorAt(this, clientX, clientY);
  }

  syncToolButtons(): void {
    syncToolButtons(this);
  }

  syncSizeRows(): void {
    syncSizeRows(this);
  }

  syncModeButtons(): void {
    syncModeButtons(this);
  }

  syncDualColor(): void {
    syncDualColor(this);
  }

  syncPickUi(): void {
    syncPickUi(this);
  }

  syncSwatches(): void {
    syncSwatches(this);
  }

  swapFgBgColors(): void {
    swapFgBgColors(this);
  }

  applyPanelOpacity(): void {
    applyPanelOpacity(this);
  }

  applyBarPosition(): void {
    applyBarPosition(this);
  }

  cycleToolForward(): void {
    cycleToolForward(this);
  }

  toggleNavDrawMode(): void {
    toggleNavDrawMode(this);
  }

  onClearClick(e: MouseEvent): void {
    onClearClick(this, e);
  }
}
