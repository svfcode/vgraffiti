import type { StrokePoint } from "./inc/stroke";

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
export type UiMode = "nav" | "draw";

export const TOOL_CYCLE_ORDER: readonly ToolId[] = ["brush", "eraser", "arrow", "square"];

export type StoredStroke =
  | { kind: "brush"; points: StrokePoint[]; color: string; size: number }
  | { kind: "eraser"; points: StrokePoint[]; size: number }
  | { kind: "arrow"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | { kind: "square"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number };

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

export type PanelElements = {
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
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
};

export interface DrawingOverlayHost extends PanelElements {
  readonly root: HTMLDivElement;
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
