import overlayCss from "./overlay-panel.css?raw";
import barMarkup from "./overlay-panel.html?raw";
import { readMapContext } from "../lib/map-context";
import { drawArrow, drawSquareStroke } from "./shapes";
import {
  coalescedOrSelf,
  pointFromEvent,
  renderEraserStroke,
  renderStroke,
  type StrokePoint,
} from "./stroke";

const Z_OVERLAY = 2147483000;

const SWATCHES = [
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

type ToolId = "brush" | "eraser" | "arrow" | "square";
type UiMode = "nav" | "draw";

const TOOL_CYCLE_ORDER: readonly ToolId[] = ["brush", "eraser", "arrow", "square"];

type StoredStroke =
  | { kind: "brush"; points: StrokePoint[]; color: string; size: number }
  | { kind: "eraser"; points: StrokePoint[]; size: number }
  | { kind: "arrow"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | { kind: "square"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number };

type CurrentGesture =
  | { tool: "brush"; points: StrokePoint[] }
  | { tool: "eraser"; points: StrokePoint[] }
  | { tool: "arrow"; x0: number; y0: number; x1: number; y1: number }
  | { tool: "square"; x0: number; y0: number; x1: number; y1: number };

function xyCanvas(ev: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function cloneStrokes(src: StoredStroke[]): StoredStroke[] {
  return structuredClone(src) as StoredStroke[];
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
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

export class DrawingOverlay {
  static mount(): void {
    if (document.querySelector("[data-vgraffiti-overlay]")) {
      return;
    }
    try {
      const app = new DrawingOverlay();
      app.init();
    } catch {
      /* canvas 2d недоступен */
    }
  }

  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly sizeCursorEl: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D;

  private readonly swatchHost: HTMLDivElement;
  private readonly swatchesWrap: HTMLDivElement;
  private readonly pickHintEl: HTMLParagraphElement;
  private readonly dcFg: HTMLButtonElement;
  private readonly dcBg: HTMLButtonElement;
  private readonly swapColorsBtn: HTMLButtonElement;
  private readonly brushSizeEl: HTMLInputElement;
  private readonly eraserSizeEl: HTMLInputElement;
  private readonly brushWrap: HTMLDivElement;
  private readonly eraserWrap: HTMLDivElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly panelOpacityEl: HTMLInputElement;
  private readonly moreDetails: HTMLDetailsElement;
  private readonly dragHandle: HTMLSpanElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;

  private activeTool: ToolId = "brush";
  private uiMode: UiMode = readMapContext() ? "nav" : "draw";
  private fgColor = "#000000";
  private bgColor = "#ffffff";
  private pickTarget: "fg" | "bg" = "fg";
  private readonly strokes: StoredStroke[] = [];
  private readonly past: StoredStroke[][] = [];
  private readonly future: StoredStroke[][] = [];
  private current: CurrentGesture | null = null;
  private isDrawing = false;
  private raf = 0;
  private activePointerId: number | null = null;

  private barLeftPx: number | null = null;
  private barTopPx: number | null = null;
  private dragBar: { dx: number; dy: number } | null = null;

  private readonly lastHoverClient = { x: 0, y: 0 };

  private constructor() {
    const host = document.createElement("div");
    host.setAttribute("data-vgraffiti-overlay", "1");
    host.style.setProperty("all", "initial");
    host.style.setProperty("position", "fixed");
    host.style.setProperty("inset", "0");
    host.style.setProperty("z-index", String(Z_OVERLAY));
    host.style.setProperty("pointer-events", "none");

    const shadow = host.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = overlayCss;
    shadow.appendChild(styleEl);

    this.root = document.createElement("div");
    this.root.className = "root";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "layer";

    this.sizeCursorEl = document.createElement("div");
    this.sizeCursorEl.className = "size-cursor";
    this.sizeCursorEl.hidden = true;

    this.bar = document.createElement("div");
    this.bar.className = "bar";
    this.bar.id = "vgf-bar";
    this.bar.innerHTML = barMarkup;

    this.root.appendChild(this.canvas);
    this.root.appendChild(this.sizeCursorEl);
    this.root.appendChild(this.bar);
    shadow.appendChild(this.root);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("DrawingOverlay: 2d context unavailable");
    }
    this.ctx = ctx;

    document.documentElement.appendChild(host);

    this.swatchHost = this.bar.querySelector<HTMLDivElement>("#vgf-swatches")!;
    this.swatchesWrap = this.bar.querySelector<HTMLDivElement>("#vgf-swatches-wrap")!;
    this.pickHintEl = this.bar.querySelector<HTMLParagraphElement>("#vgf-pick-hint")!;
    this.dcFg = this.bar.querySelector<HTMLButtonElement>("#vgf-dc-fg")!;
    this.dcBg = this.bar.querySelector<HTMLButtonElement>("#vgf-dc-bg")!;
    this.swapColorsBtn = this.bar.querySelector<HTMLButtonElement>("#vgf-swap-colors")!;
    this.brushSizeEl = this.bar.querySelector<HTMLInputElement>("#vgf-brush-size")!;
    this.eraserSizeEl = this.bar.querySelector<HTMLInputElement>("#vgf-eraser-size")!;
    this.brushWrap = this.bar.querySelector<HTMLDivElement>("#vgf-brush-size-wrap")!;
    this.eraserWrap = this.bar.querySelector<HTMLDivElement>("#vgf-eraser-size-wrap")!;
    this.clearBtn = this.bar.querySelector<HTMLButtonElement>("#vgf-clear")!;
    this.panelOpacityEl = this.bar.querySelector<HTMLInputElement>("#vgf-panel-opacity")!;
    this.moreDetails = this.bar.querySelector<HTMLDetailsElement>("#vgf-more")!;
    this.dragHandle = this.bar.querySelector<HTMLSpanElement>("#vgf-drag")!;
    this.undoBtn = this.bar.querySelector<HTMLButtonElement>("#vgf-undo")!;
    this.redoBtn = this.bar.querySelector<HTMLButtonElement>("#vgf-redo")!;
  }

  private init(): void {
    for (const hex of SWATCHES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.dataset.c = hex;
      b.style.backgroundColor = hex;
      b.title = `Цвет ${hex}`;
      this.swatchHost.appendChild(b);
    }

    this.undoBtn.addEventListener("click", this.onUndoClick);
    this.redoBtn.addEventListener("click", this.onRedoClick);
    this.clearBtn.addEventListener("click", this.onClearClick);
    window.addEventListener("keydown", this.onWindowKeyDown, true);

    this.bar.querySelectorAll<HTMLButtonElement>(".tool").forEach((btn) => {
      btn.addEventListener("click", this.onToolClick);
    });
    this.bar.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", this.onModeClick);
    });

    this.dcFg.addEventListener("click", this.onDcFgClick);
    this.dcBg.addEventListener("click", this.onDcBgClick);
    this.swapColorsBtn.addEventListener("click", this.onSwapColorsClick);
    this.swatchHost.addEventListener("click", this.onSwatchHostClick);

    this.brushSizeEl.addEventListener("input", this.onBrushSizeInput);
    this.eraserSizeEl.addEventListener("input", this.onEraserSizeInput);
    this.panelOpacityEl.addEventListener("input", this.onPanelOpacityInput);

    this.dragHandle.addEventListener("pointerdown", this.onDragPointerDown);
    this.dragHandle.addEventListener("pointermove", this.onDragPointerMove);
    this.dragHandle.addEventListener("pointerup", this.onDragPointerEnd);
    this.dragHandle.addEventListener("pointercancel", this.onDragPointerEnd);

    this.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    this.canvas.addEventListener("pointermove", this.onCanvasPointerMove);
    this.canvas.addEventListener("pointerleave", this.onCanvasPointerLeave);
    this.canvas.addEventListener("pointerup", this.finishStroke);
    this.canvas.addEventListener("pointercancel", this.finishStroke);

    window.addEventListener("resize", this.onWindowResize);

    this.syncToolButtons();
    this.syncSizeRows();
    this.syncDualColor();
    this.syncPickUi();
    this.syncSwatches();
    this.applyPanelOpacity();
    this.applyBarPosition();
    this.syncUndoRedoButtons();
    this.resize();
  }

  private wantsSizeCursor(): boolean {
    return this.uiMode === "draw" && (this.activeTool === "brush" || this.activeTool === "eraser");
  }

  private syncCanvasPointerCursor(): void {
    this.canvas.classList.toggle("vgf-hide-cursor", this.wantsSizeCursor());
  }

  private hideSizeCursor(): void {
    this.sizeCursorEl.hidden = true;
  }

  private showSizeCursorAt(clientX: number, clientY: number): void {
    if (!this.wantsSizeCursor()) {
      this.hideSizeCursor();
      return;
    }
    const rr = this.root.getBoundingClientRect();
    const dia = this.activeTool === "eraser" ? this.getEraserSize() : this.getBrushSize();
    this.sizeCursorEl.classList.toggle("eraser", this.activeTool === "eraser");
    this.sizeCursorEl.style.width = `${dia}px`;
    this.sizeCursorEl.style.height = `${dia}px`;
    this.sizeCursorEl.style.left = `${clientX - rr.left}px`;
    this.sizeCursorEl.style.top = `${clientY - rr.top}px`;
    this.sizeCursorEl.hidden = false;
  }

  private getBrushSize(): number {
    return Number(this.brushSizeEl.value) || 16;
  }

  private getEraserSize(): number {
    return Number(this.eraserSizeEl.value) || 24;
  }

  private syncSizeRows(): void {
    const brushTools =
      this.activeTool === "brush" || this.activeTool === "arrow" || this.activeTool === "square";
    this.brushWrap.hidden = !brushTools;
    this.eraserWrap.hidden = this.activeTool !== "eraser";
  }

  private cycleToolForward(): void {
    const i = TOOL_CYCLE_ORDER.indexOf(this.activeTool);
    const next = TOOL_CYCLE_ORDER[(i === -1 ? 0 : i + 1) % TOOL_CYCLE_ORDER.length];
    this.activeTool = next;
    this.syncToolButtons();
    this.syncSizeRows();
  }

  private syncToolButtons(): void {
    this.bar.querySelectorAll<HTMLButtonElement>(".tool").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.tool === this.activeTool);
    });
    this.syncCanvasPointerCursor();
    if (!this.wantsSizeCursor()) {
      this.hideSizeCursor();
    } else if (this.canvas.matches(":hover")) {
      this.showSizeCursorAt(this.lastHoverClient.x, this.lastHoverClient.y);
    }
  }

  private syncModeButtons(): void {
    this.bar.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.mode === this.uiMode);
    });
    this.canvas.classList.toggle("mode-nav", this.uiMode === "nav");
    this.syncCanvasPointerCursor();
    if (this.uiMode === "nav") {
      this.hideSizeCursor();
    } else if (this.wantsSizeCursor() && this.canvas.matches(":hover")) {
      this.showSizeCursorAt(this.lastHoverClient.x, this.lastHoverClient.y);
    }
  }

  private readonly onModeClick = (e: MouseEvent): void => {
    const btn = e.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) {
      return;
    }
    e.stopPropagation();
    const m = btn.dataset.mode as UiMode | undefined;
    if (!m) {
      return;
    }
    this.uiMode = m;
    this.syncModeButtons();
  };

  private syncDualColor(): void {
    this.dcFg.style.backgroundColor = this.fgColor;
    this.dcBg.style.backgroundColor = this.bgColor;
    this.dcFg.dataset.c = this.fgColor;
    this.dcBg.dataset.c = this.bgColor;
  }

  private syncPickUi(): void {
    this.swatchesWrap.dataset.pick = this.pickTarget;
    this.pickHintEl.textContent = this.pickTarget === "fg" ? "Передний цвет" : "Задний цвет";
  }

  private syncSwatches(): void {
    const fgLower = this.fgColor.toLowerCase();
    const bgLower = this.bgColor.toLowerCase();
    this.swatchHost.querySelectorAll<HTMLButtonElement>(".swatch").forEach((btn) => {
      const lower = (btn.dataset.c ?? "").toLowerCase();
      btn.classList.toggle("is-fg", lower === fgLower);
      btn.classList.toggle("is-bg", lower === bgLower);
    });
  }

  private swapFgBgColors(): void {
    const t = this.fgColor;
    this.fgColor = this.bgColor;
    this.bgColor = t;
    this.syncDualColor();
    this.syncSwatches();
    this.scheduleRedraw();
  }

  private applyPanelOpacity(): void {
    const pct = Math.min(100, Math.max(25, Number(this.panelOpacityEl.value) || 100));
    this.bar.style.opacity = String(pct / 100);
  }

  private applyBarPosition(): void {
    if (this.barLeftPx != null && this.barTopPx != null) {
      this.bar.style.left = `${this.barLeftPx}px`;
      this.bar.style.top = `${this.barTopPx}px`;
      this.bar.style.right = "auto";
    } else {
      this.bar.style.left = "auto";
      this.bar.style.top = "10px";
      this.bar.style.right = "10px";
    }
  }

  private redraw(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    for (const s of this.strokes) {
      if (s.kind === "brush") {
        renderStroke(c, s.points, { color: s.color, size: s.size });
      } else if (s.kind === "eraser") {
        renderEraserStroke(c, s.points, s.size);
      } else if (s.kind === "arrow") {
        drawArrow(c, s.x0, s.y0, s.x1, s.y1, s.color, s.lw);
      } else {
        drawSquareStroke(c, s.x0, s.y0, s.x1, s.y1, s.color, s.lw);
      }
    }
    if (!this.current) {
      return;
    }
    const cur = this.current;
    if (cur.tool === "brush") {
      renderStroke(c, cur.points, { color: this.fgColor, size: this.getBrushSize() });
    } else if (cur.tool === "eraser") {
      renderEraserStroke(c, cur.points, this.getEraserSize());
    } else if (cur.tool === "arrow") {
      c.save();
      c.globalAlpha = 0.45;
      c.setLineDash([5, 5]);
      drawArrow(c, cur.x0, cur.y0, cur.x1, cur.y1, this.fgColor, this.getBrushSize());
      c.restore();
    } else {
      c.save();
      c.globalAlpha = 0.45;
      c.setLineDash([5, 5]);
      drawSquareStroke(c, cur.x0, cur.y0, cur.x1, cur.y1, this.fgColor, this.getBrushSize());
      c.restore();
    }
  }

  private scheduleRedraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.redraw();
    });
  }

  private pushHistoryBeforeMutation(): void {
    this.past.push(cloneStrokes(this.strokes));
    this.future.length = 0;
  }

  private syncUndoRedoButtons(): void {
    this.undoBtn.disabled = this.past.length === 0;
    this.redoBtn.disabled = this.future.length === 0;
  }

  private cancelActiveStroke(): void {
    if (this.isDrawing && this.activePointerId != null) {
      const pid = this.activePointerId;
      window.removeEventListener("pointerup", this.onGlobalPointerUp, true);
      try {
        this.canvas.releasePointerCapture(pid);
      } catch {
        /* ignore */
      }
    }
    this.isDrawing = false;
    this.activePointerId = null;
    this.current = null;
  }

  private performUndo(): void {
    if (this.isDrawing) {
      this.cancelActiveStroke();
      this.scheduleRedraw();
      this.syncUndoRedoButtons();
      return;
    }
    if (this.past.length === 0) {
      return;
    }
    this.future.push(cloneStrokes(this.strokes));
    const snap = this.past.pop()!;
    this.strokes.splice(0, this.strokes.length, ...snap);
    this.scheduleRedraw();
    this.syncUndoRedoButtons();
  }

  private performRedo(): void {
    if (this.isDrawing) {
      this.cancelActiveStroke();
      this.scheduleRedraw();
      this.syncUndoRedoButtons();
      return;
    }
    if (this.future.length === 0) {
      return;
    }
    this.past.push(cloneStrokes(this.strokes));
    const snap = this.future.pop()!;
    this.strokes.splice(0, this.strokes.length, ...snap);
    this.scheduleRedraw();
    this.syncUndoRedoButtons();
  }

  private finishStroke = (ev: PointerEvent): void => {
    if (!this.isDrawing || ev.pointerId !== this.activePointerId || !this.current) {
      return;
    }
    window.removeEventListener("pointerup", this.onGlobalPointerUp, true);
    this.isDrawing = false;
    this.activePointerId = null;

    const cur = this.current;
    if (cur.tool === "brush" && cur.points.length >= 2) {
      this.pushHistoryBeforeMutation();
      this.strokes.push({
        kind: "brush",
        points: cur.points,
        color: this.fgColor,
        size: this.getBrushSize(),
      });
    } else if (cur.tool === "eraser" && cur.points.length >= 2) {
      this.pushHistoryBeforeMutation();
      this.strokes.push({
        kind: "eraser",
        points: cur.points,
        size: this.getEraserSize(),
      });
    } else if (cur.tool === "arrow") {
      const { x0, y0, x1, y1 } = cur;
      if (Math.hypot(x1 - x0, y1 - y0) >= 4) {
        this.pushHistoryBeforeMutation();
        this.strokes.push({
          kind: "arrow",
          x0,
          y0,
          x1,
          y1,
          color: this.fgColor,
          lw: this.getBrushSize(),
        });
      }
    } else if (cur.tool === "square") {
      const { x0, y0, x1, y1 } = cur;
      if (Math.abs(x1 - x0) >= 3 || Math.abs(y1 - y0) >= 3) {
        this.pushHistoryBeforeMutation();
        this.strokes.push({
          kind: "square",
          x0,
          y0,
          x1,
          y1,
          color: this.fgColor,
          lw: this.getBrushSize(),
        });
      }
    }

    this.current = null;
    try {
      this.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    this.scheduleRedraw();
    this.syncUndoRedoButtons();
    if (this.wantsSizeCursor() && this.canvas.matches(":hover")) {
      this.showSizeCursorAt(ev.clientX, ev.clientY);
    } else {
      this.hideSizeCursor();
    }
  };

  private readonly onGlobalPointerUp = (ev: PointerEvent): void => {
    this.finishStroke(ev);
  };

  private readonly onUndoClick = (e: MouseEvent): void => {
    e.stopPropagation();
    this.performUndo();
  };

  private readonly onRedoClick = (e: MouseEvent): void => {
    e.stopPropagation();
    this.performRedo();
  };

  private readonly onClearClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (this.isDrawing) {
      this.cancelActiveStroke();
    }
    if (this.strokes.length > 0) {
      this.pushHistoryBeforeMutation();
      this.strokes.length = 0;
    }
    this.moreDetails.open = false;
    this.scheduleRedraw();
    this.syncUndoRedoButtons();
  };

  private readonly onWindowKeyDown = (e: KeyboardEvent): void => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      return;
    }
    if (isEditableKeyTarget(e.target)) {
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "z" && e.shiftKey) {
      this.performRedo();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (k === "z" && !e.shiftKey) {
      this.performUndo();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (k === "x" && !e.shiftKey) {
      this.swapFgBgColors();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (k === "q" && !e.shiftKey) {
      this.cycleToolForward();
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly onToolClick = (e: MouseEvent): void => {
    const btn = e.currentTarget;
    if (!(btn instanceof HTMLButtonElement)) {
      return;
    }
    e.stopPropagation();
    const t = btn.dataset.tool as ToolId | undefined;
    if (!t) {
      return;
    }
    this.activeTool = t;
    this.syncToolButtons();
    this.syncSizeRows();
  };

  private readonly onDcFgClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (!this.swatchesWrap.hidden && this.pickTarget === "fg") {
      this.swatchesWrap.hidden = true;
      return;
    }
    this.pickTarget = "fg";
    this.swatchesWrap.hidden = false;
    this.syncPickUi();
    this.syncSwatches();
  };

  private readonly onDcBgClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (!this.swatchesWrap.hidden && this.pickTarget === "bg") {
      this.swatchesWrap.hidden = true;
      return;
    }
    this.pickTarget = "bg";
    this.swatchesWrap.hidden = false;
    this.syncPickUi();
    this.syncSwatches();
  };

  private readonly onSwapColorsClick = (e: MouseEvent): void => {
    e.stopPropagation();
    this.swapFgBgColors();
  };

  private readonly onSwatchHostClick = (e: MouseEvent): void => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>(".swatch");
    if (!t?.dataset.c) {
      return;
    }
    const chosen = t.dataset.c;
    if (this.pickTarget === "fg") {
      this.fgColor = chosen;
    } else {
      this.bgColor = chosen;
    }
    this.syncDualColor();
    this.syncSwatches();
    this.scheduleRedraw();
  };

  private readonly onBrushSizeInput = (): void => {
    this.scheduleRedraw();
    if (this.wantsSizeCursor() && this.canvas.matches(":hover")) {
      this.showSizeCursorAt(this.lastHoverClient.x, this.lastHoverClient.y);
    }
  };

  private readonly onEraserSizeInput = (): void => {
    this.scheduleRedraw();
    if (this.wantsSizeCursor() && this.canvas.matches(":hover")) {
      this.showSizeCursorAt(this.lastHoverClient.x, this.lastHoverClient.y);
    }
  };

  private readonly onPanelOpacityInput = (): void => {
    this.applyPanelOpacity();
  };

  private readonly onDragPointerDown = (e: PointerEvent): void => {
    e.stopPropagation();
    const br = this.bar.getBoundingClientRect();
    if (this.barLeftPx == null || this.barTopPx == null) {
      this.barLeftPx = br.left;
      this.barTopPx = br.top;
      this.applyBarPosition();
    }
    this.dragBar = {
      dx: e.clientX - (this.barLeftPx ?? br.left),
      dy: e.clientY - (this.barTopPx ?? br.top),
    };
    this.dragHandle.setPointerCapture(e.pointerId);
  };

  private readonly onDragPointerMove = (e: PointerEvent): void => {
    if (!this.dragBar) {
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = this.bar.getBoundingClientRect();
    let nx = e.clientX - this.dragBar.dx;
    let ny = e.clientY - this.dragBar.dy;
    nx = Math.max(4, Math.min(nx, vw - br.width - 4));
    ny = Math.max(4, Math.min(ny, vh - br.height - 4));
    this.barLeftPx = nx;
    this.barTopPx = ny;
    this.bar.style.left = `${nx}px`;
    this.bar.style.top = `${ny}px`;
    this.bar.style.right = "auto";
  };

  private readonly onDragPointerEnd = (): void => {
    this.dragBar = null;
  };

  private readonly onCanvasPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    this.isDrawing = true;
    this.activePointerId = ev.pointerId;
    this.canvas.setPointerCapture(ev.pointerId);
    window.addEventListener("pointerup", this.onGlobalPointerUp, true);

    if (this.activeTool === "brush") {
      this.current = { tool: "brush", points: [pointFromEvent(ev, this.canvas)] };
    } else if (this.activeTool === "eraser") {
      this.current = { tool: "eraser", points: [pointFromEvent(ev, this.canvas)] };
    } else {
      const { x, y } = xyCanvas(ev, this.canvas);
      if (this.activeTool === "arrow") {
        this.current = { tool: "arrow", x0: x, y0: y, x1: x, y1: y };
      } else {
        this.current = { tool: "square", x0: x, y0: y, x1: x, y1: y };
      }
    }
    this.scheduleRedraw();
    this.lastHoverClient.x = ev.clientX;
    this.lastHoverClient.y = ev.clientY;
    if (this.wantsSizeCursor()) {
      this.showSizeCursorAt(ev.clientX, ev.clientY);
    }
  };

  private readonly onCanvasPointerMove = (ev: PointerEvent): void => {
    this.lastHoverClient.x = ev.clientX;
    this.lastHoverClient.y = ev.clientY;

    if (this.wantsSizeCursor()) {
      this.showSizeCursorAt(ev.clientX, ev.clientY);
    } else {
      this.hideSizeCursor();
    }

    if (!this.isDrawing || !(ev.buttons & 1) || !this.current) {
      return;
    }
    if (ev.pointerId !== this.activePointerId) {
      return;
    }
    ev.preventDefault();
    const cur = this.current;
    if (cur.tool === "brush" || cur.tool === "eraser") {
      for (const pe of coalescedOrSelf(ev)) {
        cur.points.push(pointFromEvent(pe, this.canvas));
      }
    } else {
      const { x, y } = xyCanvas(ev, this.canvas);
      cur.x1 = x;
      cur.y1 = y;
    }
    this.scheduleRedraw();
  };

  private readonly onCanvasPointerLeave = (): void => {
    if (!this.isDrawing) {
      this.hideSizeCursor();
    }
  };

  private readonly onWindowResize = (): void => {
    this.resize();
  };

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const canvas = this.canvas;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scheduleRedraw();
  }
}
