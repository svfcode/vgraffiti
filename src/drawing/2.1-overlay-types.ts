import type { StrokePoint } from "./inc/stroke";
import type { MapContext } from "../lib/map-context";
import type { StreetViewContext } from "../lib/streetview-context";
import type { ViewportMode } from "../lib/viewport-mode";
import type { SavedJourney } from "./inc/journey-storage";
import type { MemoryStop, WallCanvas } from "./inc/memory-types";

export const Z_OVERLAY = 2147483000;

export const SWATCHES = [
  "#000000",
  "#ffffff",
  "#808080",
  "#c0c0c0",
  "#ff0000",
  "#ff6d00",
  "#ffcc00",
  "#00c853",
  "#00b8d4",
  "#2962ff",
  "#6200ea",
  "#d500f9",
  "#ff4081",
  "#795548",
  "#37474f",
  "#263238",
  "#8d6e63",
  "#ffab40",
  "#eeff41",
  "#64ffda",
  "#82b1ff",
  "#b388ff",
  "#ff8a80",
  "#bcaaa4",
];

export type ToolId = "brush" | "eraser" | "arrow" | "square";
export type UiMode =
  | "nav"
  | "draw"
  | "addEnvelope"
  | "wallCanvasPlace"
  | "wallCanvas"
  | "wallCanvasUnfold";

export const TOOL_CYCLE_ORDER: readonly ToolId[] = ["brush", "eraser", "arrow", "square"];

/** Точка штриха в географических координатах: [lat, lng, pressure]. */
export type GeoPoint = [lat: number, lng: number, pressure: number];

/** Точка штриха в Street View: [heading, pitch, pressure]. */
export type ViewPoint = [heading: number, pitch: number, pressure: number];

type GeoBrushStroke = {
  kind: "brush";
  coordSpace?: "geo";
  points: GeoPoint[];
  color: string;
  size: number;
  zoom: number;
};
type SvBrushStroke = {
  kind: "brush";
  coordSpace: "streetview";
  points: ViewPoint[];
  color: string;
  size: number;
  fov: number;
};
type GeoEraserStroke = {
  kind: "eraser";
  coordSpace?: "geo";
  points: GeoPoint[];
  size: number;
  zoom: number;
};
type SvEraserStroke = {
  kind: "eraser";
  coordSpace: "streetview";
  points: ViewPoint[];
  size: number;
  fov: number;
};
type GeoArrowStroke = {
  kind: "arrow";
  coordSpace?: "geo";
  lat0: number;
  lng0: number;
  lat1: number;
  lng1: number;
  color: string;
  lw: number;
  zoom: number;
};
type SvArrowStroke = {
  kind: "arrow";
  coordSpace: "streetview";
  h0: number;
  p0: number;
  h1: number;
  p1: number;
  color: string;
  lw: number;
  fov: number;
};
type GeoSquareStroke = {
  kind: "square";
  coordSpace?: "geo";
  lat0: number;
  lng0: number;
  lat1: number;
  lng1: number;
  color: string;
  lw: number;
  zoom: number;
};
type SvSquareStroke = {
  kind: "square";
  coordSpace: "streetview";
  h0: number;
  p0: number;
  h1: number;
  p1: number;
  color: string;
  lw: number;
  fov: number;
};

/** Точка эскиза памяти: [u, v, pressure] в anchor-пространстве панорамы. */
export type MemoryUvPoint = [u: number, v: number, pressure: number];

type VmBrushStroke = {
  kind: "brush";
  coordSpace: "viewmemory";
  points: MemoryUvPoint[];
  color: string;
  size: number;
};
type VmEraserStroke = {
  kind: "eraser";
  coordSpace: "viewmemory";
  points: MemoryUvPoint[];
  size: number;
};
type VmArrowStroke = {
  kind: "arrow";
  coordSpace: "viewmemory";
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  color: string;
  lw: number;
};
type VmSquareStroke = {
  kind: "square";
  coordSpace: "viewmemory";
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  color: string;
  lw: number;
};

export type StoredStroke =
  | GeoBrushStroke
  | SvBrushStroke
  | GeoEraserStroke
  | SvEraserStroke
  | GeoArrowStroke
  | SvArrowStroke
  | GeoSquareStroke
  | SvSquareStroke
  | VmBrushStroke
  | VmEraserStroke
  | VmArrowStroke
  | VmSquareStroke;

export type CurrentGesture =
  | { tool: "brush"; points: StrokePoint[] }
  | { tool: "eraser"; points: StrokePoint[] }
  | { tool: "arrow"; x0: number; y0: number; x1: number; y1: number }
  | { tool: "square"; x0: number; y0: number; x1: number; y1: number };

export function xyCanvas(ev: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

export function cloneStrokes(src: StoredStroke[]): StoredStroke[] {
  return structuredClone(src) as StoredStroke[];
}

export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest("[contenteditable=true]") != null;
}

export type JourneyBaseline = {
  name: string;
  strokes: StoredStroke[];
  memories: MemoryStop[];
};

export type PanelElements = {
  journeyWrap: HTMLDivElement;
  journeyActiveTitleEl: HTMLDivElement;
  journeyNudgeWrap: HTMLDivElement;
  journeyNewBtn: HTMLButtonElement;
  journeyNameEl: HTMLInputElement;
  journeySaveBtn: HTMLButtonElement;
  memoryAddBtn: HTMLButtonElement;
  memoryStatusEl: HTMLDivElement;
  memoryListEl: HTMLDivElement;
  memoryDraftWrap: HTMLDivElement;
  envelopeDetailWrap: HTMLDivElement;
  envelopeNoteEl: HTMLTextAreaElement;
  envelopeNoteSaveBtn: HTMLButtonElement;
  envelopeCloseBtn: HTMLButtonElement;
  envelopeWallBtn: HTMLButtonElement;
  envelopeUnfoldBtn: HTMLButtonElement;
  envelopeFoldBtn: HTMLButtonElement;
  envelopePutInBtn: HTMLButtonElement;
  journeyListEl: HTMLDivElement;
  swatchHost: HTMLDivElement;
  swatchesWrap: HTMLDivElement;
  pickHintEl: HTMLParagraphElement;
  dcFg: HTMLButtonElement;
  dcBg: HTMLButtonElement;
  swapColorsBtn: HTMLButtonElement;
  brushSizeEl: HTMLInputElement;
  eraserSizeEl: HTMLInputElement;
  brushWrap: HTMLDivElement;
  eraserWrap: HTMLDivElement;
  clearBtn: HTMLButtonElement;
  panelOpacityEl: HTMLInputElement;
  moreDetails: HTMLDetailsElement;
  dragHandle: HTMLSpanElement;
  cloudSyncBtn: HTMLButtonElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
};

export type PanVisual = { dx: number; dy: number; dragging: boolean };

export type ZoomVisual = {
  anchor: MapContext;
  deltaZ: number;
  pivotX: number;
  pivotY: number;
};

export type ActiveJourney = {
  id: string;
  name: string;
  createdAt: number;
};

export interface DrawingOverlayHost extends PanelElements {
  readonly root: HTMLDivElement;

  activeJourney: ActiveJourney | null;
  journeyBaseline: JourneyBaseline | null;
  savedJourneys: SavedJourney[];
  selectedJourneyIds: Set<string>;
  journeyNudgeOpen: boolean;
  memories: MemoryStop[];
  /** id открытого конверта (редактирование записки). */
  openEnvelopeId: string | null;
  /** Черновик прямоугольника холста при размещении. */
  wallCanvasDraftRect: { u0: number; v0: number; u1: number; v1: number } | null;
  /** Активный холст на стене до помещения в конверт. */
  activeWallCanvas: WallCanvas | null;
  /** id конверта, чей холст развёрнут на панораме. */
  unfoldEnvelopeId: string | null;
  /** Перетаскивание развёрнутого холста. */
  wallCanvasDrag: { pointerId: number; startX: number; startY: number; baseOffsetU: number; baseOffsetV: number } | null;
  viewportMode: ViewportMode;
  streetViewContext: StreetViewContext | null;
  readonly canvas: HTMLCanvasElement;
  readonly sizeCursorEl: HTMLDivElement;
  readonly bar: HTMLDivElement;
  readonly ctx: CanvasRenderingContext2D;

  activeTool: ToolId;
  uiMode: UiMode;
  fgColor: string;
  bgColor: string;
  pickTarget: "fg" | "bg";
  strokes: StoredStroke[];
  past: StoredStroke[][];
  future: StoredStroke[][];
  current: CurrentGesture | null;
  isDrawing: boolean;
  raf: number;
  activePointerId: number | null;
  barLeftPx: number | null;
  barTopPx: number | null;
  dragBar: { dx: number; dy: number } | null;
  lastHoverClient: { x: number; y: number };

  mapContext: MapContext | null;
  panVisual: PanVisual | null;
  zoomVisual: ZoomVisual | null;
  mapNativeRender: boolean;
  mapZooming: boolean;

  getViewportMap(): MapContext | null;
  syncMapFollow(): void;
  syncStrokesToBridge(): void;

  scheduleRedraw(): void;
  syncUndoRedoButtons(): void;
  pushHistoryBeforeMutation(): void;
  performUndo(): void;
  performRedo(): void;
  cancelActiveStroke(): void;
  finishStroke(ev: PointerEvent): void;
  getBrushSize(): number;
  getEraserSize(): number;
  wantsSizeCursor(): boolean;
  hideSizeCursor(): void;
  showSizeCursorAt(clientX: number, clientY: number): void;
  syncToolButtons(): void;
  syncSizeRows(): void;
  syncModeButtons(): void;
  syncDualColor(): void;
  syncPickUi(): void;
  syncSwatches(): void;
  swapFgBgColors(): void;
  applyPanelOpacity(): void;
  applyBarPosition(): void;
  cycleToolForward(): void;
  onClearClick(e: MouseEvent): void;
  onGlobalPointerUp(ev: PointerEvent): void;
}
