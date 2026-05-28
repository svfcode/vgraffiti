import { cloneStrokes, type DrawingOverlayHost } from "../2.1-overlay-types";

export function pushHistoryBeforeMutation(host: DrawingOverlayHost): void {
  host.past.push(cloneStrokes(host.strokes));
  host.future.length = 0;
}

export function syncUndoRedoButtons(host: DrawingOverlayHost): void {
  host.undoBtn.disabled = host.past.length === 0;
  host.redoBtn.disabled = host.future.length === 0;
}

export function cancelActiveStroke(host: DrawingOverlayHost): void {
  if (host.isDrawing && host.activePointerId != null) {
    const pid = host.activePointerId;
    window.removeEventListener("pointerup", host.onGlobalPointerUp, true);
    try {
      host.canvas.releasePointerCapture(pid);
    } catch {
      /* ignore */
    }
  }
  host.isDrawing = false;
  host.activePointerId = null;
  host.current = null;
}

export function performUndo(host: DrawingOverlayHost): void {
  if (host.isDrawing) {
    cancelActiveStroke(host);
    host.scheduleRedraw();
    syncUndoRedoButtons(host);
    return;
  }
  if (host.past.length === 0) {
    return;
  }
  host.future.push(cloneStrokes(host.strokes));
  const snap = host.past.pop()!;
  host.strokes.splice(0, host.strokes.length, ...snap);
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
}

export function performRedo(host: DrawingOverlayHost): void {
  if (host.isDrawing) {
    cancelActiveStroke(host);
    host.scheduleRedraw();
    syncUndoRedoButtons(host);
    return;
  }
  if (host.future.length === 0) {
    return;
  }
  host.past.push(cloneStrokes(host.strokes));
  const snap = host.future.pop()!;
  host.strokes.splice(0, host.strokes.length, ...snap);
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
}

export function finishStroke(host: DrawingOverlayHost, ev: PointerEvent): void {
  if (!host.isDrawing || ev.pointerId !== host.activePointerId || !host.current) {
    return;
  }
  window.removeEventListener("pointerup", host.onGlobalPointerUp, true);
  host.isDrawing = false;
  host.activePointerId = null;

  const cur = host.current;
  if (cur.tool === "brush" && cur.points.length >= 2) {
    pushHistoryBeforeMutation(host);
    host.strokes.push({
      kind: "brush",
      points: cur.points,
      color: host.fgColor,
      size: host.getBrushSize(),
    });
  } else if (cur.tool === "eraser" && cur.points.length >= 2) {
    pushHistoryBeforeMutation(host);
    host.strokes.push({
      kind: "eraser",
      points: cur.points,
      size: host.getEraserSize(),
    });
  } else if (cur.tool === "arrow") {
    const { x0, y0, x1, y1 } = cur;
    if (Math.hypot(x1 - x0, y1 - y0) >= 4) {
      pushHistoryBeforeMutation(host);
      host.strokes.push({
        kind: "arrow",
        x0,
        y0,
        x1,
        y1,
        color: host.fgColor,
        lw: host.getBrushSize(),
      });
    }
  } else if (cur.tool === "square") {
    const { x0, y0, x1, y1 } = cur;
    if (Math.abs(x1 - x0) >= 3 || Math.abs(y1 - y0) >= 3) {
      pushHistoryBeforeMutation(host);
      host.strokes.push({
        kind: "square",
        x0,
        y0,
        x1,
        y1,
        color: host.fgColor,
        lw: host.getBrushSize(),
      });
    }
  }

  host.current = null;
  try {
    host.canvas.releasePointerCapture(ev.pointerId);
  } catch {
    /* ignore */
  }
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
  if (host.wantsSizeCursor() && host.canvas.matches(":hover")) {
    host.showSizeCursorAt(ev.clientX, ev.clientY);
  } else {
    host.hideSizeCursor();
  }
}

export function onClearClick(host: DrawingOverlayHost, e: MouseEvent): void {
  e.stopPropagation();
  if (host.isDrawing) {
    cancelActiveStroke(host);
  }
  if (host.strokes.length > 0) {
    pushHistoryBeforeMutation(host);
    host.strokes.length = 0;
  }
  host.moreDetails.open = false;
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
}

export function bindHistoryPanelEvents(host: DrawingOverlayHost): void {
  host.undoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    performUndo(host);
  });
  host.redoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    performRedo(host);
  });
  host.clearBtn.addEventListener("click", (e) => onClearClick(host, e));
}
