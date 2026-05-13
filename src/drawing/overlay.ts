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

function ensureHost(): void {
  if (document.querySelector("[data-vgraffiti-overlay]")) {
    return;
  }
  const host = document.createElement("div");
  host.setAttribute("data-vgraffiti-overlay", "1");
  host.style.setProperty("all", "initial");
  host.style.setProperty("position", "fixed");
  host.style.setProperty("inset", "0");
  host.style.setProperty("z-index", String(Z_OVERLAY));
  host.style.setProperty("pointer-events", "none");
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      font-family: system-ui, Segoe UI, sans-serif;
    }
    canvas.layer {
      position: absolute;
      inset: 0;
      pointer-events: auto;
      touch-action: none;
      cursor: crosshair;
    }
    canvas.layer.mode-nav {
      pointer-events: none !important;
      cursor: default;
    }
    canvas.layer.vgf-hide-cursor {
      cursor: none;
    }
    .size-cursor {
      position: absolute;
      pointer-events: none;
      z-index: 1;
      border-radius: 50%;
      box-sizing: border-box;
      border: 2px solid rgba(255, 255, 255, 0.9);
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.45),
        inset 0 0 0 1px rgba(0, 0, 0, 0.25);
      transform: translate(-50%, -50%);
      background: rgba(255, 255, 255, 0.06);
    }
    .size-cursor.eraser {
      border-style: dashed;
      background: rgba(255, 255, 255, 0.03);
    }
    .bar {
      position: absolute;
      top: 10px;
      right: 10px;
      left: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 10px 10px;
      background: rgba(32, 33, 36, 0.68);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      color: #e8eaed;
      border-radius: 10px;
      font-size: 12px;
      pointer-events: auto;
      box-shadow: 0 2px 14px rgba(0,0,0,.28);
      max-width: 220px;
      user-select: none;
    }
    .bar-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: -2px 0 2px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,.12);
    }
    .drag-handle {
      cursor: grab;
      color: #9aa0a6;
      font-size: 14px;
      line-height: 1;
      padding: 4px 2px;
      letter-spacing: -2px;
    }
    .drag-handle:active { cursor: grabbing; }
    .mode-row {
      display: flex;
      gap: 4px;
      flex: 1;
      justify-content: center;
    }
    .mode-btn {
      flex: 1;
      padding: 5px 6px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.2);
      cursor: pointer;
      background: rgba(0,0,0,.2);
      color: #e8eaed;
      font-size: 11px;
      font-weight: 600;
    }
    .mode-btn.on {
      background: #8ab4f8;
      color: #202124;
      border-color: transparent;
    }
    details.more {
      position: relative;
    }
    details.more > summary {
      list-style: none;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 2px 6px;
      color: #9aa0a6;
      border-radius: 6px;
    }
    details.more > summary::-webkit-details-marker { display: none; }
    details.more > summary:hover { background: rgba(255,255,255,.08); color: #e8eaed; }
    .more-panel {
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 4px;
      padding: 6px;
      background: rgba(48, 49, 52, 0.95);
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,.35);
      z-index: 2;
      min-width: 120px;
    }
    .more-panel button {
      width: 100%;
      padding: 8px 10px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      background: rgba(255,255,255,.1);
      color: #f28b82;
      font-weight: 600;
      font-size: 12px;
    }
    .more-panel button:hover { background: rgba(255,255,255,.16); }
    .more-opacity {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,.12);
      font-size: 11px;
      color: #bdc1c6;
    }
    .more-opacity input[type="range"] {
      width: 100%;
      cursor: pointer;
    }
    .tools {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .tool {
      flex: 1;
      min-width: 40px;
      min-height: 34px;
      padding: 4px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.18);
      cursor: pointer;
      background: rgba(0,0,0,.18);
      color: #e8eaed;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tool svg {
      display: block;
      pointer-events: none;
      flex-shrink: 0;
    }
    .tool.on {
      background: rgba(138, 180, 248, 0.35);
      border-color: #8ab4f8;
      color: #fff;
    }
    .history-row {
      display: flex;
      gap: 4px;
    }
    .hist-btn {
      flex: 1;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.18);
      cursor: pointer;
      background: rgba(0,0,0,.18);
      color: #e8eaed;
      font-size: 15px;
      line-height: 1;
    }
    .hist-btn:hover:not(:disabled) {
      background: rgba(255,255,255,.1);
    }
    .hist-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .row-size label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      color: #bdc1c6;
    }
    .row-size input[type="range"] { width: 100%; }
    .dual-color {
      position: relative;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }
    .dual-color button {
      position: absolute;
      border: 2px solid rgba(0,0,0,.45);
      border-radius: 3px;
      padding: 0;
      cursor: pointer;
      box-sizing: border-box;
    }
    .dc-bg {
      left: 0;
      bottom: 0;
      width: 26px;
      height: 26px;
      z-index: 1;
    }
    .dc-fg {
      right: 0;
      top: 0;
      width: 26px;
      height: 26px;
      z-index: 2;
      box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    .dual-color .dc-fg[data-c="#ffffff"],
    .dual-color .dc-bg[data-c="#ffffff"] {
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.2), 0 1px 4px rgba(0,0,0,.25);
    }
    .color-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .swap-colors-btn {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      padding: 0;
      margin: 0;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(0, 0, 0, 0.22);
      color: #bdc1c6;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .swap-colors-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #e8eaed;
      border-color: rgba(255, 255, 255, 0.35);
    }
    .pick-hint {
      margin: 0 0 6px;
      font-size: 10px;
      color: #9aa0a6;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .swatches-wrap {
      margin-top: 4px;
    }
    .swatches-wrap[hidden] {
      display: none !important;
    }
    .swatches {
      display: grid;
      grid-template-columns: repeat(6, 22px);
      gap: 5px;
      justify-content: start;
    }
    .swatch {
      width: 22px;
      height: 22px;
      border-radius: 3px;
      border: 2px solid rgba(255,255,255,.25);
      cursor: pointer;
      padding: 0;
      box-sizing: border-box;
    }
    .swatch:hover { transform: scale(1.06); }
    .swatch.is-fg {
      box-shadow: 0 0 0 2px #8ab4f8, inset 0 0 0 1px rgba(0,0,0,.12);
    }
    .swatch.is-bg {
      box-shadow: 0 0 0 2px #fbbc04, inset 0 0 0 1px rgba(0,0,0,.12);
    }
    .swatch[data-c="#ffffff"] { box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
  `;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "root";

  const canvas = document.createElement("canvas");
  canvas.className = "layer";

  const sizeCursorEl = document.createElement("div");
  sizeCursorEl.className = "size-cursor";
  sizeCursorEl.hidden = true;

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.id = "vgf-bar";
  bar.innerHTML = `
    <div class="bar-head">
      <span class="drag-handle" id="vgf-drag" title="Переместить панель">⡇</span>
      <div class="mode-row">
        <button type="button" class="mode-btn on" data-mode="draw" title="Рисовать на слое (Ctrl+Z — отмена штриха)">Рис</button>
        <button type="button" class="mode-btn" data-mode="nav" title="Крутить и двигать карту, как обычно">Нав</button>
      </div>
      <details class="more" id="vgf-more">
        <summary class="more-btn" title="Дополнительно" aria-label="Меню">⋯</summary>
        <div class="more-panel">
          <label class="more-opacity" title="Непрозрачность всей панели инструментов">
            Прозрачность панели
            <input type="range" id="vgf-panel-opacity" min="25" max="100" value="100" step="5" />
          </label>
          <button type="button" id="vgf-clear" title="Стереть весь слой (без отмены истории отдельных штрихов)">Очистить</button>
        </div>
      </details>
    </div>
    <div class="history-row">
      <button type="button" class="hist-btn" id="vgf-undo" title="Отменить (Ctrl+Z)">↶</button>
      <button type="button" class="hist-btn" id="vgf-redo" title="Повторить (Ctrl+Shift+Z или Ctrl+Y)">↷</button>
    </div>
    <div class="tools">
      <button type="button" class="tool on" data-tool="brush" title="Кисть — размер ниже"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a1 1 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 0 0 0-1.41z"/></svg></button>
      <button type="button" class="tool" data-tool="eraser" title="Ластик — размер ниже"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.24 3.56l4.2 4.2c.78.78.78 2.05 0 2.83L12 19.07l-6.3-6.3c-.78-.78-.78-2.05 0-2.83l7.07-7.07c.39-.39 1.02-.39 1.41 0l2.12 2.12z"/><path d="M2.81 16.09L7.91 21.19 4.93 19.07 2.81 16.09z"/></svg></button>
      <button type="button" class="tool" data-tool="arrow" title="Стрелка (толщина как у кисти)">↗</button>
      <button type="button" class="tool" data-tool="square" title="Квадрат / рамка (обводка как у кисти)">▢</button>
    </div>
    <div id="vgf-brush-size-wrap" class="row-size">
      <label title="Толщина кисти, стрелки и квадрата">Размер кисти <input type="range" id="vgf-brush-size" min="2" max="72" value="16" title="Размер кисти" /></label>
    </div>
    <div id="vgf-eraser-size-wrap" class="row-size" hidden>
      <label title="Толщина ластика">Размер ластика <input type="range" id="vgf-eraser-size" min="2" max="96" value="24" title="Размер ластика" /></label>
    </div>
    <div class="color-row">
      <div class="dual-color">
        <button type="button" class="dc-bg" id="vgf-dc-bg" aria-label="Задний цвет"></button>
        <button type="button" class="dc-fg" id="vgf-dc-fg" aria-label="Передний цвет кисти"></button>
      </div>
      <button type="button" class="swap-colors-btn" id="vgf-swap-colors" title="Поменять передний и задний цвет (Ctrl+X или Cmd+X)" aria-label="Поменять местами передний и задний цвет">⇄</button>
    </div>
    <div id="vgf-swatches-wrap" class="swatches-wrap" hidden data-pick="fg">
      <p class="pick-hint" id="vgf-pick-hint">Передний цвет</p>
      <div class="swatches" id="vgf-swatches"></div>
    </div>
  `;

  root.appendChild(canvas);
  root.appendChild(sizeCursorEl);
  root.appendChild(bar);
  shadow.appendChild(root);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const c = ctx;

  const swatchHost = bar.querySelector<HTMLDivElement>("#vgf-swatches")!;
  const swatchesWrap = bar.querySelector<HTMLDivElement>("#vgf-swatches-wrap")!;
  const pickHintEl = bar.querySelector<HTMLParagraphElement>("#vgf-pick-hint")!;
  const dcFg = bar.querySelector<HTMLButtonElement>("#vgf-dc-fg")!;
  const dcBg = bar.querySelector<HTMLButtonElement>("#vgf-dc-bg")!;
  const swapColorsBtn = bar.querySelector<HTMLButtonElement>("#vgf-swap-colors")!;
  for (const hex of SWATCHES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.dataset.c = hex;
    b.style.backgroundColor = hex;
    b.title = `Цвет ${hex}`;
    swatchHost.appendChild(b);
  }

  const brushSizeEl = bar.querySelector<HTMLInputElement>("#vgf-brush-size")!;
  const eraserSizeEl = bar.querySelector<HTMLInputElement>("#vgf-eraser-size")!;
  const brushWrap = bar.querySelector<HTMLDivElement>("#vgf-brush-size-wrap")!;
  const eraserWrap = bar.querySelector<HTMLDivElement>("#vgf-eraser-size-wrap")!;
  const clearBtn = bar.querySelector<HTMLButtonElement>("#vgf-clear")!;
  const panelOpacityEl = bar.querySelector<HTMLInputElement>("#vgf-panel-opacity")!;
  const moreDetails = bar.querySelector<HTMLDetailsElement>("#vgf-more")!;
  const dragHandle = bar.querySelector<HTMLSpanElement>("#vgf-drag")!;
  const undoBtn = bar.querySelector<HTMLButtonElement>("#vgf-undo")!;
  const redoBtn = bar.querySelector<HTMLButtonElement>("#vgf-redo")!;

  let activeTool: ToolId = "brush";
  let uiMode: UiMode = "draw";
  let fgColor = "#000000";
  let bgColor = "#ffffff";
  let pickTarget: "fg" | "bg" = "fg";
  const strokes: StoredStroke[] = [];
  const past: StoredStroke[][] = [];
  const future: StoredStroke[][] = [];
  let current: CurrentGesture | null = null;
  let isDrawing = false;
  let raf = 0;
  let activePointerId: number | null = null;

  let barLeftPx: number | null = null;
  let barTopPx: number | null = null;
  let dragBar: { dx: number; dy: number } | null = null;

  const lastHoverClient = { x: 0, y: 0 };

  function wantsSizeCursor(): boolean {
    return uiMode === "draw" && (activeTool === "brush" || activeTool === "eraser");
  }

  function syncCanvasPointerCursor(): void {
    canvas.classList.toggle("vgf-hide-cursor", wantsSizeCursor());
  }

  function hideSizeCursor(): void {
    sizeCursorEl.hidden = true;
  }

  function showSizeCursorAt(clientX: number, clientY: number): void {
    if (!wantsSizeCursor()) {
      hideSizeCursor();
      return;
    }
    const rr = root.getBoundingClientRect();
    const dia = activeTool === "eraser" ? getEraserSize() : getBrushSize();
    sizeCursorEl.classList.toggle("eraser", activeTool === "eraser");
    sizeCursorEl.style.width = `${dia}px`;
    sizeCursorEl.style.height = `${dia}px`;
    sizeCursorEl.style.left = `${clientX - rr.left}px`;
    sizeCursorEl.style.top = `${clientY - rr.top}px`;
    sizeCursorEl.hidden = false;
  }

  function getBrushSize(): number {
    return Number(brushSizeEl.value) || 16;
  }
  function getEraserSize(): number {
    return Number(eraserSizeEl.value) || 24;
  }

  function applyPanelOpacity(): void {
    const pct = Math.min(100, Math.max(25, Number(panelOpacityEl.value) || 100));
    bar.style.opacity = String(pct / 100);
  }

  function syncSizeRows(): void {
    const brushTools = activeTool === "brush" || activeTool === "arrow" || activeTool === "square";
    brushWrap.hidden = !brushTools;
    eraserWrap.hidden = activeTool !== "eraser";
  }

  function syncToolButtons(): void {
    bar.querySelectorAll<HTMLButtonElement>(".tool").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.tool === activeTool);
    });
    syncCanvasPointerCursor();
    if (!wantsSizeCursor()) {
      hideSizeCursor();
    } else if (canvas.matches(":hover")) {
      showSizeCursorAt(lastHoverClient.x, lastHoverClient.y);
    }
  }

  function syncModeButtons(): void {
    bar.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.mode === uiMode);
    });
    canvas.classList.toggle("mode-nav", uiMode === "nav");
    syncCanvasPointerCursor();
    if (uiMode === "nav") {
      hideSizeCursor();
    } else if (wantsSizeCursor() && canvas.matches(":hover")) {
      showSizeCursorAt(lastHoverClient.x, lastHoverClient.y);
    }
  }

  function syncDualColor(): void {
    dcFg.style.backgroundColor = fgColor;
    dcBg.style.backgroundColor = bgColor;
    dcFg.dataset.c = fgColor;
    dcBg.dataset.c = bgColor;
    dcFg.title = `Передний цвет кисти (${fgColor}) — клик, палитра`;
    dcBg.title = `Задний цвет (${bgColor}) — клик, палитра`;
  }

  function syncPickUi(): void {
    swatchesWrap.dataset.pick = pickTarget;
    pickHintEl.textContent = pickTarget === "fg" ? "Передний цвет" : "Задний цвет";
  }

  function syncSwatches(): void {
    const fgLower = fgColor.toLowerCase();
    const bgLower = bgColor.toLowerCase();
    swatchHost.querySelectorAll<HTMLButtonElement>(".swatch").forEach((btn) => {
      const lower = (btn.dataset.c ?? "").toLowerCase();
      btn.classList.toggle("is-fg", lower === fgLower);
      btn.classList.toggle("is-bg", lower === bgLower);
    });
  }

  function swapFgBgColors(): void {
    const t = fgColor;
    fgColor = bgColor;
    bgColor = t;
    syncDualColor();
    syncSwatches();
    scheduleRedraw();
  }

  function applyBarPosition(): void {
    if (barLeftPx != null && barTopPx != null) {
      bar.style.left = `${barLeftPx}px`;
      bar.style.top = `${barTopPx}px`;
      bar.style.right = "auto";
    } else {
      bar.style.left = "auto";
      bar.style.top = "10px";
      bar.style.right = "10px";
    }
  }

  function redraw(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.clearRect(0, 0, w, h);
    for (const s of strokes) {
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
    if (!current) {
      return;
    }
    if (current.tool === "brush") {
      renderStroke(c, current.points, { color: fgColor, size: getBrushSize() });
    } else if (current.tool === "eraser") {
      renderEraserStroke(c, current.points, getEraserSize());
    } else if (current.tool === "arrow") {
      c.save();
      c.globalAlpha = 0.45;
      c.setLineDash([5, 5]);
      drawArrow(c, current.x0, current.y0, current.x1, current.y1, fgColor, getBrushSize());
      c.restore();
    } else {
      c.save();
      c.globalAlpha = 0.45;
      c.setLineDash([5, 5]);
      drawSquareStroke(c, current.x0, current.y0, current.x1, current.y1, fgColor, getBrushSize());
      c.restore();
    }
  }

  function scheduleRedraw(): void {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      redraw();
    });
  }

  function pushHistoryBeforeMutation(): void {
    past.push(cloneStrokes(strokes));
    future.length = 0;
  }

  function syncUndoRedoButtons(): void {
    undoBtn.disabled = past.length === 0;
    redoBtn.disabled = future.length === 0;
  }

  function finishStroke(ev: PointerEvent): void {
    if (!isDrawing || ev.pointerId !== activePointerId || !current) {
      return;
    }
    window.removeEventListener("pointerup", onGlobalPointerUp, true);
    isDrawing = false;
    activePointerId = null;

    if (current.tool === "brush" && current.points.length >= 2) {
      pushHistoryBeforeMutation();
      strokes.push({
        kind: "brush",
        points: current.points,
        color: fgColor,
        size: getBrushSize(),
      });
    } else if (current.tool === "eraser" && current.points.length >= 2) {
      pushHistoryBeforeMutation();
      strokes.push({
        kind: "eraser",
        points: current.points,
        size: getEraserSize(),
      });
    } else if (current.tool === "arrow") {
      const { x0, y0, x1, y1 } = current;
      if (Math.hypot(x1 - x0, y1 - y0) >= 4) {
        pushHistoryBeforeMutation();
        strokes.push({
          kind: "arrow",
          x0,
          y0,
          x1,
          y1,
          color: fgColor,
          lw: getBrushSize(),
        });
      }
    } else if (current.tool === "square") {
      const { x0, y0, x1, y1 } = current;
      if (Math.abs(x1 - x0) >= 3 || Math.abs(y1 - y0) >= 3) {
        pushHistoryBeforeMutation();
        strokes.push({
          kind: "square",
          x0,
          y0,
          x1,
          y1,
          color: fgColor,
          lw: getBrushSize(),
        });
      }
    }

    current = null;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    scheduleRedraw();
    syncUndoRedoButtons();
    if (wantsSizeCursor() && canvas.matches(":hover")) {
      showSizeCursorAt(ev.clientX, ev.clientY);
    } else {
      hideSizeCursor();
    }
  }

  function onGlobalPointerUp(ev: PointerEvent): void {
    finishStroke(ev);
  }

  function cancelDrawingFromClear(): void {
    if (isDrawing && activePointerId != null) {
      const pid = activePointerId;
      window.removeEventListener("pointerup", onGlobalPointerUp, true);
      try {
        canvas.releasePointerCapture(pid);
      } catch {
        /* ignore */
      }
    }
    isDrawing = false;
    activePointerId = null;
    current = null;
    queueMicrotask(() => {
      if (wantsSizeCursor() && canvas.matches(":hover")) {
        showSizeCursorAt(lastHoverClient.x, lastHoverClient.y);
      } else {
        hideSizeCursor();
      }
    });
  }

  function performUndo(): void {
    if (isDrawing) {
      cancelDrawingFromClear();
      scheduleRedraw();
      syncUndoRedoButtons();
      return;
    }
    if (past.length === 0) {
      return;
    }
    future.push(cloneStrokes(strokes));
    const snap = past.pop()!;
    strokes.splice(0, strokes.length, ...snap);
    scheduleRedraw();
    syncUndoRedoButtons();
  }

  function performRedo(): void {
    if (isDrawing) {
      cancelDrawingFromClear();
      scheduleRedraw();
      syncUndoRedoButtons();
      return;
    }
    if (future.length === 0) {
      return;
    }
    past.push(cloneStrokes(strokes));
    const snap = future.pop()!;
    strokes.splice(0, strokes.length, ...snap);
    scheduleRedraw();
    syncUndoRedoButtons();
  }

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelDrawingFromClear();
    if (strokes.length > 0) {
      pushHistoryBeforeMutation();
      strokes.length = 0;
    }
    moreDetails.open = false;
    scheduleRedraw();
    syncUndoRedoButtons();
  });

  undoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    performUndo();
  });
  redoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    performRedo();
  });

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) {
        return;
      }
      if (isEditableKeyTarget(e.target)) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "z" && e.shiftKey) {
        performRedo();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (k === "z" && !e.shiftKey) {
        performUndo();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (k === "y" && !e.shiftKey) {
        performRedo();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (k === "x" && !e.shiftKey) {
        swapFgBgColors();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    },
    true,
  );

  bar.querySelectorAll<HTMLButtonElement>(".tool").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = btn.dataset.tool as ToolId | undefined;
      if (!t) {
        return;
      }
      activeTool = t;
      syncToolButtons();
      syncSizeRows();
    });
  });

  bar.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = btn.dataset.mode as UiMode | undefined;
      if (!m) {
        return;
      }
      uiMode = m;
      syncModeButtons();
    });
  });

  dcFg.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!swatchesWrap.hidden && pickTarget === "fg") {
      swatchesWrap.hidden = true;
      return;
    }
    pickTarget = "fg";
    swatchesWrap.hidden = false;
    syncPickUi();
    syncSwatches();
  });
  dcBg.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!swatchesWrap.hidden && pickTarget === "bg") {
      swatchesWrap.hidden = true;
      return;
    }
    pickTarget = "bg";
    swatchesWrap.hidden = false;
    syncPickUi();
    syncSwatches();
  });

  swapColorsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    swapFgBgColors();
  });

  swatchHost.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>(".swatch");
    if (!t?.dataset.c) {
      return;
    }
    const chosen = t.dataset.c;
    if (pickTarget === "fg") {
      fgColor = chosen;
    } else {
      bgColor = chosen;
    }
    syncDualColor();
    syncSwatches();
    scheduleRedraw();
  });

  brushSizeEl.addEventListener("input", () => {
    scheduleRedraw();
    if (wantsSizeCursor() && canvas.matches(":hover")) {
      showSizeCursorAt(lastHoverClient.x, lastHoverClient.y);
    }
  });
  eraserSizeEl.addEventListener("input", () => {
    scheduleRedraw();
    if (wantsSizeCursor() && canvas.matches(":hover")) {
      showSizeCursorAt(lastHoverClient.x, lastHoverClient.y);
    }
  });
  panelOpacityEl.addEventListener("input", () => applyPanelOpacity());

  dragHandle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const br = bar.getBoundingClientRect();
    if (barLeftPx == null || barTopPx == null) {
      barLeftPx = br.left;
      barTopPx = br.top;
      applyBarPosition();
    }
    dragBar = { dx: e.clientX - (barLeftPx ?? br.left), dy: e.clientY - (barTopPx ?? br.top) };
    dragHandle.setPointerCapture(e.pointerId);
  });
  dragHandle.addEventListener("pointermove", (e) => {
    if (!dragBar) {
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = bar.getBoundingClientRect();
    let nx = e.clientX - dragBar.dx;
    let ny = e.clientY - dragBar.dy;
    nx = Math.max(4, Math.min(nx, vw - br.width - 4));
    ny = Math.max(4, Math.min(ny, vh - br.height - 4));
    barLeftPx = nx;
    barTopPx = ny;
    bar.style.left = `${nx}px`;
    bar.style.top = `${ny}px`;
    bar.style.right = "auto";
  });
  dragHandle.addEventListener("pointerup", () => {
    dragBar = null;
  });
  dragHandle.addEventListener("pointercancel", () => {
    dragBar = null;
  });

  canvas.addEventListener("pointerdown", (ev) => {
    if (uiMode === "nav" || ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    isDrawing = true;
    activePointerId = ev.pointerId;
    canvas.setPointerCapture(ev.pointerId);
    window.addEventListener("pointerup", onGlobalPointerUp, true);

    if (activeTool === "brush") {
      current = { tool: "brush", points: [pointFromEvent(ev, canvas)] };
    } else if (activeTool === "eraser") {
      current = { tool: "eraser", points: [pointFromEvent(ev, canvas)] };
    } else {
      const { x, y } = xyCanvas(ev, canvas);
      if (activeTool === "arrow") {
        current = { tool: "arrow", x0: x, y0: y, x1: x, y1: y };
      } else {
        current = { tool: "square", x0: x, y0: y, x1: x, y1: y };
      }
    }
    scheduleRedraw();
    lastHoverClient.x = ev.clientX;
    lastHoverClient.y = ev.clientY;
    if (wantsSizeCursor()) {
      showSizeCursorAt(ev.clientX, ev.clientY);
    }
  });

  canvas.addEventListener("pointermove", (ev) => {
    lastHoverClient.x = ev.clientX;
    lastHoverClient.y = ev.clientY;

    if (uiMode !== "nav" && wantsSizeCursor()) {
      showSizeCursorAt(ev.clientX, ev.clientY);
    } else {
      hideSizeCursor();
    }

    if (uiMode === "nav" || !isDrawing || !(ev.buttons & 1) || !current) {
      return;
    }
    if (ev.pointerId !== activePointerId) {
      return;
    }
    ev.preventDefault();
    if (current.tool === "brush" || current.tool === "eraser") {
      for (const pe of coalescedOrSelf(ev)) {
        current.points.push(pointFromEvent(pe, canvas));
      }
    } else {
      const { x, y } = xyCanvas(ev, canvas);
      current.x1 = x;
      current.y1 = y;
    }
    scheduleRedraw();
  });

  canvas.addEventListener("pointerleave", () => {
    if (!isDrawing) {
      hideSizeCursor();
    }
  });

  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
    if (wantsSizeCursor() && canvas.matches(":hover")) {
      showSizeCursorAt(lastHoverClient.x, lastHoverClient.y);
    }
  }

  window.addEventListener("resize", resize);
  syncToolButtons();
  syncModeButtons();
  syncSizeRows();
  syncDualColor();
  syncPickUi();
  syncSwatches();
  applyPanelOpacity();
  applyBarPosition();
  syncUndoRedoButtons();
  resize();
}

export function mountDrawingOverlay(): void {
  ensureHost();
}
