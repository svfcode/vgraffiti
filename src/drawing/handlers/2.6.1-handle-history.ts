import { cloneStrokes, type DrawingOverlayHost } from "../2.1-overlay-types";
import { syncJourneyDirtyIndicator } from "./2.6.5-handle-journeys";
import { screenPointsToGeo } from "../inc/geo-stroke";
import { screenPointsToView } from "../inc/sv-stroke";
import { captureFov, captureZoom, getStreetViewContext, getViewportMap } from "../inc/map-binding";
import { getMapViewportFrame, screenToMapGeo } from "../../lib/map-projection";
import { screenToViewDirection } from "../../lib/streetview-projection";

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
  host.syncStrokesToBridge();
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
  syncJourneyDirtyIndicator(host);
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
  host.syncStrokesToBridge();
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
  syncJourneyDirtyIndicator(host);
}

export function finishStroke(host: DrawingOverlayHost, ev: PointerEvent): void {
  if (!host.isDrawing || ev.pointerId !== host.activePointerId || !host.current) {
    return;
  }
  window.removeEventListener("pointerup", host.onGlobalPointerUp, true);
  host.isDrawing = false;
  host.activePointerId = null;

  const cur = host.current;
  const frame = getMapViewportFrame();
  const isSv = host.viewportMode === "streetview";
  const sv = isSv ? getStreetViewContext(host) : null;
  const map = isSv ? null : getViewportMap(host);
  const zoom = captureZoom(host);
  const fov = captureFov(host);

  if (isSv && !sv) {
    host.current = null;
    try {
      host.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    host.scheduleRedraw();
    syncUndoRedoButtons(host);
    return;
  }

  if (!isSv && !map) {
    host.current = null;
    try {
      host.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    host.scheduleRedraw();
    syncUndoRedoButtons(host);
    return;
  }

  if (cur.tool === "brush" && cur.points.length >= 2) {
    pushHistoryBeforeMutation(host);
    if (isSv && sv) {
      host.strokes.push({
        kind: "brush",
        coordSpace: "streetview",
        points: screenPointsToView(cur.points, sv, frame),
        color: host.fgColor,
        size: host.getBrushSize(),
        fov,
      });
    } else if (map) {
      host.strokes.push({
        kind: "brush",
        points: screenPointsToGeo(cur.points, map, frame),
        color: host.fgColor,
        size: host.getBrushSize(),
        zoom,
      });
    }
  } else if (cur.tool === "eraser" && cur.points.length >= 2) {
    pushHistoryBeforeMutation(host);
    if (isSv && sv) {
      host.strokes.push({
        kind: "eraser",
        coordSpace: "streetview",
        points: screenPointsToView(cur.points, sv, frame),
        size: host.getEraserSize(),
        fov,
      });
    } else if (map) {
      host.strokes.push({
        kind: "eraser",
        points: screenPointsToGeo(cur.points, map, frame),
        size: host.getEraserSize(),
        zoom,
      });
    }
  } else if (cur.tool === "arrow") {
    const { x0, y0, x1, y1 } = cur;
    if (Math.hypot(x1 - x0, y1 - y0) >= 4) {
      pushHistoryBeforeMutation(host);
      if (isSv && sv) {
        const a = screenToViewDirection(x0, y0, sv, frame);
        const b = screenToViewDirection(x1, y1, sv, frame);
        host.strokes.push({
          kind: "arrow",
          coordSpace: "streetview",
          h0: a.heading,
          p0: a.pitch,
          h1: b.heading,
          p1: b.pitch,
          color: host.fgColor,
          lw: host.getBrushSize(),
          fov,
        });
      } else if (map) {
        const p0 = screenToMapGeo(x0, y0, map, frame);
        const p1 = screenToMapGeo(x1, y1, map, frame);
        host.strokes.push({
          kind: "arrow",
          lat0: p0.lat,
          lng0: p0.lng,
          lat1: p1.lat,
          lng1: p1.lng,
          color: host.fgColor,
          lw: host.getBrushSize(),
          zoom,
        });
      }
    }
  } else if (cur.tool === "square") {
    const { x0, y0, x1, y1 } = cur;
    if (Math.abs(x1 - x0) >= 3 || Math.abs(y1 - y0) >= 3) {
      pushHistoryBeforeMutation(host);
      if (isSv && sv) {
        const a = screenToViewDirection(x0, y0, sv, frame);
        const b = screenToViewDirection(x1, y1, sv, frame);
        host.strokes.push({
          kind: "square",
          coordSpace: "streetview",
          h0: a.heading,
          p0: a.pitch,
          h1: b.heading,
          p1: b.pitch,
          color: host.fgColor,
          lw: host.getBrushSize(),
          fov,
        });
      } else if (map) {
        const p0 = screenToMapGeo(x0, y0, map, frame);
        const p1 = screenToMapGeo(x1, y1, map, frame);
        host.strokes.push({
          kind: "square",
          lat0: p0.lat,
          lng0: p0.lng,
          lat1: p1.lat,
          lng1: p1.lng,
          color: host.fgColor,
          lw: host.getBrushSize(),
          zoom,
        });
      }
    }
  }

  host.current = null;
  try {
    host.canvas.releasePointerCapture(ev.pointerId);
  } catch {
    /* ignore */
  }
  host.syncStrokesToBridge();
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
  syncJourneyDirtyIndicator(host);
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
  host.syncStrokesToBridge();
  host.scheduleRedraw();
  syncUndoRedoButtons(host);
  syncJourneyDirtyIndicator(host);
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
