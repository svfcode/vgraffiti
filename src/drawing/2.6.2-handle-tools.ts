import {
  TOOL_CYCLE_ORDER,
  type DrawingOverlayHost,
  type ToolId,
  type UiMode,
} from "./2.1-overlay-types";

export function getBrushSize(host: DrawingOverlayHost): number {
  return Number(host.brushSizeEl.value) || 5;
}

export function getEraserSize(host: DrawingOverlayHost): number {
  return Number(host.eraserSizeEl.value) || 24;
}

export function wantsSizeCursor(host: DrawingOverlayHost): boolean {
  return host.activeTool === "brush" || host.activeTool === "eraser";
}

export function getActiveToolSize(host: DrawingOverlayHost): number {
  return host.activeTool === "eraser" ? getEraserSize(host) : getBrushSize(host);
}

export function syncCanvasPointerCursor(host: DrawingOverlayHost): void {
  host.canvas.classList.toggle("vgf-hide-cursor", wantsSizeCursor(host));
}

export function hideSizeCursor(host: DrawingOverlayHost): void {
  host.sizeCursorEl.hidden = true;
  host.sizeCursorEl.classList.remove("eraser");
}

export function showSizeCursorAt(host: DrawingOverlayHost, clientX: number, clientY: number): void {
  if (!wantsSizeCursor(host)) {
    hideSizeCursor(host);
    return;
  }
  const rr = host.root.getBoundingClientRect();
  const isEraser = host.activeTool === "eraser";
  const dia = getActiveToolSize(host);
  host.sizeCursorEl.classList.toggle("eraser", isEraser);
  host.sizeCursorEl.style.width = `${dia}px`;
  host.sizeCursorEl.style.height = `${dia}px`;
  host.sizeCursorEl.style.left = `${clientX - rr.left}px`;
  host.sizeCursorEl.style.top = `${clientY - rr.top}px`;
  host.sizeCursorEl.hidden = false;
}

export function syncSizeRows(host: DrawingOverlayHost): void {
  const brushTools =
    host.activeTool === "brush" || host.activeTool === "arrow" || host.activeTool === "square";
  host.brushWrap.hidden = !brushTools;
  host.eraserWrap.hidden = host.activeTool !== "eraser";
  syncBrushSizeLabel(host);
  syncEraserSizeLabel(host);
}

function syncBrushSizeLabel(host: DrawingOverlayHost): void {
  const el = host.bar.querySelector<HTMLSpanElement>("#vgf-brush-size-val");
  if (el) {
    el.textContent = String(getBrushSize(host));
  }
}

function syncEraserSizeLabel(host: DrawingOverlayHost): void {
  const el = host.bar.querySelector<HTMLSpanElement>("#vgf-eraser-size-val");
  if (el) {
    el.textContent = String(getEraserSize(host));
  }
}

export function cycleToolForward(host: DrawingOverlayHost): void {
  const i = TOOL_CYCLE_ORDER.indexOf(host.activeTool);
  const next = TOOL_CYCLE_ORDER[(i === -1 ? 0 : i + 1) % TOOL_CYCLE_ORDER.length];
  host.activeTool = next;
  syncToolButtons(host);
  syncSizeRows(host);
}

export function syncToolButtons(host: DrawingOverlayHost): void {
  host.bar.querySelectorAll<HTMLButtonElement>(".tool").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.tool === host.activeTool);
  });
  syncCanvasPointerCursor(host);
  if (!wantsSizeCursor(host)) {
    hideSizeCursor(host);
  } else if (host.canvas.matches(":hover")) {
    showSizeCursorAt(host, host.lastHoverClient.x, host.lastHoverClient.y);
  }
}

export function syncModeButtons(host: DrawingOverlayHost): void {
  host.bar.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.mode === host.uiMode);
  });
  host.canvas.classList.toggle("mode-nav", host.uiMode === "nav");
  syncCanvasPointerCursor(host);
  if (wantsSizeCursor(host) && host.canvas.matches(":hover")) {
    showSizeCursorAt(host, host.lastHoverClient.x, host.lastHoverClient.y);
  } else if (!wantsSizeCursor(host)) {
    hideSizeCursor(host);
  }
}

export function syncDualColor(host: DrawingOverlayHost): void {
  host.dcFg.style.backgroundColor = host.fgColor;
  host.dcBg.style.backgroundColor = host.bgColor;
  host.dcFg.dataset.c = host.fgColor;
  host.dcBg.dataset.c = host.bgColor;
}

export function syncPickUi(host: DrawingOverlayHost): void {
  host.swatchesWrap.dataset.pick = host.pickTarget;
  host.pickHintEl.textContent = host.pickTarget === "fg" ? "Передний цвет" : "Задний цвет";
}

export function syncSwatches(host: DrawingOverlayHost): void {
  const fgLower = host.fgColor.toLowerCase();
  const bgLower = host.bgColor.toLowerCase();
  host.swatchHost.querySelectorAll<HTMLButtonElement>(".swatch").forEach((btn) => {
    const lower = (btn.dataset.c ?? "").toLowerCase();
    btn.classList.toggle("is-fg", lower === fgLower);
    btn.classList.toggle("is-bg", lower === bgLower);
  });
}

export function swapFgBgColors(host: DrawingOverlayHost): void {
  const t = host.fgColor;
  host.fgColor = host.bgColor;
  host.bgColor = t;
  syncDualColor(host);
  syncSwatches(host);
  host.scheduleRedraw();
}

export function bindToolPanelEvents(host: DrawingOverlayHost): void {
  host.bar.querySelectorAll<HTMLButtonElement>(".tool").forEach((btn) => {
    btn.addEventListener("click", (e) => onToolClick(host, e));
  });
  host.bar.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => onModeClick(host, e));
  });

  host.dcFg.addEventListener("click", (e) => onDcFgClick(host, e));
  host.dcBg.addEventListener("click", (e) => onDcBgClick(host, e));
  host.swapColorsBtn.addEventListener("click", (e) => onSwapColorsClick(host, e));
  host.swatchHost.addEventListener("click", (e) => onSwatchHostClick(host, e));

  host.brushSizeEl.addEventListener("input", () => onBrushSizeInput(host));
  host.eraserSizeEl.addEventListener("input", () => onEraserSizeInput(host));
}

function onToolClick(host: DrawingOverlayHost, e: MouseEvent): void {
  const btn = e.currentTarget;
  if (!(btn instanceof HTMLButtonElement)) {
    return;
  }
  e.stopPropagation();
  const t = btn.dataset.tool as ToolId | undefined;
  if (!t) {
    return;
  }
  host.activeTool = t;
  syncToolButtons(host);
  syncSizeRows(host);
}

function onModeClick(host: DrawingOverlayHost, e: MouseEvent): void {
  const btn = e.currentTarget;
  if (!(btn instanceof HTMLButtonElement)) {
    return;
  }
  e.stopPropagation();
  const m = btn.dataset.mode as UiMode | undefined;
  if (!m) {
    return;
  }
  host.uiMode = m;
  syncModeButtons(host);
}

function onDcFgClick(host: DrawingOverlayHost, e: MouseEvent): void {
  e.stopPropagation();
  if (!host.swatchesWrap.hidden && host.pickTarget === "fg") {
    host.swatchesWrap.hidden = true;
    return;
  }
  host.pickTarget = "fg";
  host.swatchesWrap.hidden = false;
  syncPickUi(host);
  syncSwatches(host);
}

function onDcBgClick(host: DrawingOverlayHost, e: MouseEvent): void {
  e.stopPropagation();
  if (!host.swatchesWrap.hidden && host.pickTarget === "bg") {
    host.swatchesWrap.hidden = true;
    return;
  }
  host.pickTarget = "bg";
  host.swatchesWrap.hidden = false;
  syncPickUi(host);
  syncSwatches(host);
}

function onSwapColorsClick(host: DrawingOverlayHost, e: MouseEvent): void {
  e.stopPropagation();
  swapFgBgColors(host);
}

function onSwatchHostClick(host: DrawingOverlayHost, e: MouseEvent): void {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>(".swatch");
  if (!t?.dataset.c) {
    return;
  }
  const chosen = t.dataset.c;
  if (host.pickTarget === "fg") {
    host.fgColor = chosen;
  } else {
    host.bgColor = chosen;
  }
  syncDualColor(host);
  syncSwatches(host);
  host.scheduleRedraw();
}

function onBrushSizeInput(host: DrawingOverlayHost): void {
  syncBrushSizeLabel(host);
  host.scheduleRedraw();
  if (wantsSizeCursor(host) && host.canvas.matches(":hover")) {
    showSizeCursorAt(host, host.lastHoverClient.x, host.lastHoverClient.y);
  }
}

function onEraserSizeInput(host: DrawingOverlayHost): void {
  syncEraserSizeLabel(host);
  host.scheduleRedraw();
  if (wantsSizeCursor(host) && host.canvas.matches(":hover")) {
    showSizeCursorAt(host, host.lastHoverClient.x, host.lastHoverClient.y);
  }
}
