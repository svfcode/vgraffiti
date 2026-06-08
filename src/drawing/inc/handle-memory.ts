import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { syncJourneyDirtyIndicator } from "../handlers/2.6.5-handle-journeys";
import { readStreetViewContext, type StreetViewContext } from "../../lib/streetview-context";
import { getStreetViewContext } from "./map-binding";
import {
  generateLocationId,
  classifyPovMatch,
  findLocationAtPanorama,
  isAtSamePanorama,
  normFromCanvas,
  panoramaKey,
  getMemoryViewportFrame,
} from "./view-memory";
import {
  cloneLocations,
  filledCanvases,
  locationHasFilledCanvas,
  type WalkLocation,
  type WallCanvas,
} from "./memory-types";
import { isPointInWallRect, normalizeWallRect } from "./wall-canvas";
import { navigateToStreetViewPov } from "./streetview-nav";

const NOTE_DEBOUNCE_MS = 400;
let noteDebounceTimer = 0;

function placesWithArt(locations: WalkLocation[]): WalkLocation[] {
  return locations.filter(locationHasFilledCanvas);
}

function openLocation(host: DrawingOverlayHost): WalkLocation | null {
  const id = host.openLocationId;
  return id ? host.memories.find((m) => m.id === id) ?? null : null;
}

function flushSpotNoteToLocation(host: DrawingOverlayHost, loc: WalkLocation | null): void {
  if (!loc || document.activeElement === host.spotNoteEl) {
    return;
  }
  const text = host.spotNoteEl.value.trim();
  if (loc.text !== text) {
    loc.text = text;
    syncJourneyDirtyIndicator(host);
  }
}

function flushSpotNoteToCurrent(host: DrawingOverlayHost): void {
  flushSpotNoteToLocation(host, openLocation(host));
}

function scheduleNoteFlush(host: DrawingOverlayHost): void {
  window.clearTimeout(noteDebounceTimer);
  noteDebounceTimer = window.setTimeout(() => {
    const loc = openLocation(host);
    if (!loc) {
      return;
    }
    const text = host.spotNoteEl.value.trim();
    if (loc.text !== text) {
      loc.text = text;
      syncJourneyDirtyIndicator(host);
      refreshPlacesList(host);
    }
  }, NOTE_DEBOUNCE_MS);
}

/** При смене панорамы: новое место или подгрузка существующего. */
export function onStreetViewPovChanged(host: DrawingOverlayHost): void {
  if (host.viewportMode !== "streetview") {
    return;
  }
  if (
    host.uiMode === "wallCanvas" ||
    host.uiMode === "wallCanvasPlace" ||
    host.uiMode === "wallCanvasUnfold"
  ) {
    return;
  }

  const sv = getStreetViewContext(host);
  if (!sv) {
    return;
  }

  const key = panoramaKey(sv);
  const current = openLocation(host);
  if (current && isAtSamePanorama(current.anchor, sv)) {
    host.lastPanoramaKey = key;
    syncMemoryUi(host);
    return;
  }

  if (key === host.lastPanoramaKey && current) {
    syncMemoryUi(host);
    return;
  }

  flushSpotNoteToCurrent(host);
  host.lastPanoramaKey = key;

  const existing = findLocationAtPanorama(host.memories, sv);
  if (existing) {
    host.openLocationId = existing.id;
    if (document.activeElement !== host.spotNoteEl) {
      host.spotNoteEl.value = existing.text;
    }
  } else {
    const loc: WalkLocation = {
      id: generateLocationId(),
      anchor: { ...sv },
      text: "",
      createdAt: Date.now(),
      canvases: [],
    };
    host.memories.push(loc);
    host.openLocationId = loc.id;
    if (document.activeElement !== host.spotNoteEl) {
      host.spotNoteEl.value = "";
    }
    syncJourneyDirtyIndicator(host);
  }

  syncMemoryUi(host);
}

function ensureLocationAtCurrentPov(host: DrawingOverlayHost): WalkLocation | null {
  const sv = getStreetViewContext(host);
  if (!sv) {
    return null;
  }
  const existing = findLocationAtPanorama(host.memories, sv);
  if (existing) {
    host.openLocationId = existing.id;
    host.lastPanoramaKey = panoramaKey(sv);
    return existing;
  }
  const loc: WalkLocation = {
    id: generateLocationId(),
    anchor: { ...sv },
    text: host.spotNoteEl.value.trim(),
    createdAt: Date.now(),
    canvases: [],
  };
  host.memories.push(loc);
  host.openLocationId = loc.id;
  host.lastPanoramaKey = panoramaKey(sv);
  syncJourneyDirtyIndicator(host);
  return loc;
}

function syncSpotEditor(host: DrawingOverlayHost): void {
  const isSv = host.viewportMode === "streetview";
  host.spotNoteEl.disabled = !isSv;
  const inCanvas =
    host.uiMode === "wallCanvas" ||
    host.uiMode === "wallCanvasPlace" ||
    host.uiMode === "wallCanvasUnfold";
  host.envelopeWallBtn.hidden = !isSv || inCanvas;

  if (!isSv) {
    host.spotNoteEl.value = "";
    host.envelopeDetailWrap.hidden = true;
    host.envelopeUnfoldBtn.hidden = true;
    host.envelopeFoldBtn.hidden = true;
    host.currentCanvasesEl.hidden = true;
    return;
  }

  const loc = openLocation(host);
  if (loc && document.activeElement !== host.spotNoteEl) {
    host.spotNoteEl.value = loc.text;
  }

  const canvases = loc ? filledCanvases(loc) : [];
  host.envelopeUnfoldBtn.hidden = canvases.length === 0 || inCanvas;
  host.envelopeFoldBtn.hidden = host.uiMode !== "wallCanvasUnfold";
  refreshCurrentCanvases(host, loc, canvases);
}

function refreshCurrentCanvases(
  host: DrawingOverlayHost,
  loc: WalkLocation | null,
  canvases: WallCanvas[],
): void {
  const box = host.currentCanvasesEl;
  box.replaceChildren();
  if (!loc || canvases.length === 0 || host.viewportMode !== "streetview") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const label = document.createElement("div");
  label.className = "current-canvases-label";
  label.textContent =
    canvases.length === 1 ? "Холст на этом месте" : `Холсты на этом месте (${canvases.length})`;
  box.appendChild(label);

  canvases.forEach((_, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "current-canvas-btn";
    btn.textContent = `Развернуть холст ${index + 1}`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void unfoldWallCanvas(host, index);
    });
    box.appendChild(btn);
  });
}

function syncCanvasActions(host: DrawingOverlayHost): void {
  const inCanvas = host.uiMode === "wallCanvas" || host.uiMode === "wallCanvasPlace";
  const show = host.viewportMode === "streetview" && inCanvas;
  host.envelopeDetailWrap.hidden = !show;
  host.envelopePutInBtn.hidden = host.uiMode !== "wallCanvas";
}

export function syncMemoryUi(host: DrawingOverlayHost): void {
  const isSv = host.viewportMode === "streetview";
  const artPlaces = placesWithArt(host.memories);

  const toolsOn =
    isSv &&
    (host.uiMode === "wallCanvas" ||
      host.uiMode === "wallCanvasPlace" ||
      host.uiMode === "wallCanvasUnfold");
  host.bar.querySelector(".tools-section")?.classList.toggle("memory-sketch-tools", toolsOn);

  if (!isSv) {
    host.placesHeadEl.hidden = true;
    host.memoryListEl.hidden = true;
    host.envelopeDetailWrap.hidden = true;
    host.currentCanvasesEl.hidden = true;
    syncSpotEditor(host);
    return;
  }

  syncSpotEditor(host);
  syncCanvasActions(host);
  refreshPlacesList(host);

  host.placesHeadEl.hidden = artPlaces.length === 0;
  host.memoryListEl.hidden = artPlaces.length === 0;
}

export function refreshPlacesList(host: DrawingOverlayHost): void {
  const list = host.memoryListEl;
  list.replaceChildren();
  const artPlaces = placesWithArt(host.memories);
  if (artPlaces.length === 0 || host.viewportMode !== "streetview") {
    list.hidden = true;
    return;
  }
  list.hidden = false;
  const sv = getStreetViewContext(host);

  artPlaces.forEach((loc, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "memory-item place-item";
    if (sv && isAtSamePanorama(loc.anchor, sv)) {
      row.classList.add("is-here");
    }
    if (loc.id === host.openLocationId) {
      row.classList.add("is-open");
    }

    const title = document.createElement("div");
    title.className = "memory-item-title";
    title.textContent = loc.title?.trim() || loc.text.trim().slice(0, 40) || `Место ${index + 1}`;

    const text = document.createElement("div");
    text.className = "memory-item-text";
    const note = loc.text.trim();
    const n = filledCanvases(loc).length;
    text.textContent = note
      ? `${note.slice(0, 72)}${n > 1 ? ` · ${n} холста` : ""}`
      : n > 1
        ? `${n} холста`
        : "Рисунок на стене";

    row.appendChild(title);
    row.appendChild(text);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      void goToLocation(host, loc.id);
    });
    list.appendChild(row);
  });
}

async function ensureLocationPov(
  host: DrawingOverlayHost,
  anchor: StreetViewContext,
): Promise<boolean> {
  const sv = getStreetViewContext(host);
  if (sv && classifyPovMatch(anchor, sv) === "exact") {
    return true;
  }
  const ok = await navigateToStreetViewPov(anchor);
  if (ok) {
    const next = readStreetViewContext();
    if (next) {
      host.streetViewContext = next;
      host.lastPanoramaKey = panoramaKey(next);
    }
    host.scheduleRedraw();
  }
  return ok;
}

export async function goToLocation(host: DrawingOverlayHost, id: string): Promise<void> {
  const loc = host.memories.find((m) => m.id === id);
  if (!loc) {
    return;
  }
  flushSpotNoteToCurrent(host);
  const ok = await ensureLocationPov(host, loc.anchor);
  if (!ok) {
    window.alert("Не удалось перейти к этому месту. Подойдите ближе вручную.");
    return;
  }
  host.openLocationId = id;
  host.lastPanoramaKey = panoramaKey(loc.anchor);
  host.spotNoteEl.value = loc.text;
  host.uiMode = "nav";
  host.syncModeButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

function resetWallModes(host: DrawingOverlayHost): void {
  host.wallCanvasDraftRect = null;
  host.activeWallCanvas = null;
  host.unfoldLocationId = null;
  host.unfoldCanvasIndex = 0;
  host.wallCanvasDrag = null;
  host.strokes.length = 0;
  host.past.length = 0;
  host.future.length = 0;
}

export async function startWallCanvasPlace(host: DrawingOverlayHost): Promise<void> {
  const sv = getStreetViewContext(host);
  if (!sv) {
    return;
  }
  scheduleNoteFlush(host);
  const loc = ensureLocationAtCurrentPov(host);
  if (!loc) {
    return;
  }
  loc.text = host.spotNoteEl.value.trim();
  host.cancelActiveStroke();
  host.wallCanvasDraftRect = null;
  host.activeWallCanvas = null;
  host.strokes.length = 0;
  host.uiMode = "wallCanvasPlace";
  host.syncModeButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function onWallCanvasPlaceDown(host: DrawingOverlayHost, x: number, y: number): void {
  if (host.uiMode !== "wallCanvasPlace") {
    return;
  }
  const [u, v] = normFromCanvas(x, y, host.canvas);
  host.wallCanvasDraftRect = { u0: u, v0: v, u1: u, v1: v };
  host.scheduleRedraw();
}

export function onWallCanvasPlaceMove(host: DrawingOverlayHost, x: number, y: number): void {
  const draft = host.wallCanvasDraftRect;
  if (!draft || host.uiMode !== "wallCanvasPlace") {
    return;
  }
  const [u, v] = normFromCanvas(x, y, host.canvas);
  draft.u1 = u;
  draft.v1 = v;
  host.scheduleRedraw();
}

export function confirmWallCanvasPlace(host: DrawingOverlayHost): void {
  const draft = host.wallCanvasDraftRect;
  const sv = getStreetViewContext(host);
  if (!draft || !sv) {
    return;
  }
  const { u, v, w, h } = normalizeWallRect(draft);
  host.activeWallCanvas = {
    anchor: { ...sv },
    u,
    v,
    w,
    h,
    strokes: [],
  };
  host.wallCanvasDraftRect = null;
  host.strokes.length = 0;
  host.past.length = 0;
  host.future.length = 0;
  host.uiMode = "wallCanvas";
  host.syncModeButtons();
  host.syncUndoRedoButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function cancelWallCanvas(host: DrawingOverlayHost): void {
  resetWallModes(host);
  host.uiMode = "nav";
  host.syncModeButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function saveCanvasToLocation(host: DrawingOverlayHost): void {
  const id = host.openLocationId;
  const wc = host.activeWallCanvas;
  const loc = id ? host.memories.find((m) => m.id === id) : null;
  if (!loc || !wc) {
    return;
  }
  const saved: typeof wc = {
    ...structuredClone(wc),
    strokes: host.strokes.length > 0 ? structuredClone(host.strokes) : wc.strokes,
  };
  loc.canvases.push(saved);
  resetWallModes(host);
  host.uiMode = "nav";
  host.syncModeButtons();
  syncMemoryUi(host);
  syncJourneyDirtyIndicator(host);
  host.scheduleRedraw();
}

function canvasForUnfold(loc: WalkLocation, index: number): WallCanvas | null {
  const filled = filledCanvases(loc);
  return filled[index] ?? null;
}

export function unfoldWallCanvas(host: DrawingOverlayHost, canvasIndex = 0): void {
  const sv = getStreetViewContext(host);
  if (!sv) {
    return;
  }
  let id = host.openLocationId;
  if (!id) {
    id = findLocationAtPanorama(host.memories, sv)?.id ?? null;
  }
  const loc = id ? host.memories.find((m) => m.id === id) : null;
  const canvas = loc ? canvasForUnfold(loc, canvasIndex) : null;
  if (!loc || !canvas) {
    return;
  }
  host.openLocationId = id;
  host.unfoldLocationId = id;
  host.unfoldCanvasIndex = canvasIndex;
  host.uiMode = "wallCanvasUnfold";
  host.syncModeButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function foldWallCanvas(host: DrawingOverlayHost): void {
  host.unfoldLocationId = null;
  host.unfoldCanvasIndex = 0;
  host.wallCanvasDrag = null;
  host.uiMode = "nav";
  host.syncModeButtons();
  syncJourneyDirtyIndicator(host);
  syncMemoryUi(host);
  host.scheduleRedraw();
}

function unfoldLocation(host: DrawingOverlayHost): WalkLocation | null {
  const id = host.unfoldLocationId;
  return id ? host.memories.find((m) => m.id === id) ?? null : null;
}

function activeUnfoldCanvas(host: DrawingOverlayHost): WallCanvas | null {
  const loc = unfoldLocation(host);
  if (!loc) {
    return null;
  }
  return canvasForUnfold(loc, host.unfoldCanvasIndex);
}

export function onWallCanvasUnfoldDown(
  host: DrawingOverlayHost,
  x: number,
  y: number,
  pointerId: number,
): boolean {
  if (host.uiMode !== "wallCanvasUnfold" || !host.unfoldLocationId) {
    return false;
  }
  const canvas = activeUnfoldCanvas(host);
  if (!canvas) {
    return false;
  }
  const frame = getMemoryViewportFrame();
  if (!isPointInWallRect(x, y, canvas, host.canvas, frame)) {
    return false;
  }
  host.wallCanvasDrag = {
    pointerId,
    startX: x,
    startY: y,
    baseOffsetU: canvas.offsetU ?? 0,
    baseOffsetV: canvas.offsetV ?? 0,
  };
  return true;
}

export function onWallCanvasUnfoldMove(host: DrawingOverlayHost, x: number, y: number): void {
  const drag = host.wallCanvasDrag;
  const canvas = activeUnfoldCanvas(host);
  if (!drag || !canvas) {
    return;
  }
  const frame = getMemoryViewportFrame();
  const du = (x - drag.startX) / frame.w;
  const dv = (y - drag.startY) / frame.h;
  canvas.offsetU = drag.baseOffsetU + du;
  canvas.offsetV = drag.baseOffsetV + dv;
  host.scheduleRedraw();
}

export function onWallCanvasUnfoldUp(host: DrawingOverlayHost): void {
  host.wallCanvasDrag = null;
  syncJourneyDirtyIndicator(host);
}

export function cloneHostMemories(host: DrawingOverlayHost): WalkLocation[] {
  return cloneLocations(host.memories);
}

export function bindMemoryPanelEvents(host: DrawingOverlayHost): void {
  host.spotNoteEl.addEventListener("input", () => {
    scheduleNoteFlush(host);
  });
  host.spotNoteEl.addEventListener("blur", () => {
    window.clearTimeout(noteDebounceTimer);
    const loc = openLocation(host);
    if (loc) {
      loc.text = host.spotNoteEl.value.trim();
      syncJourneyDirtyIndicator(host);
      refreshPlacesList(host);
    }
  });
  host.envelopeWallBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void startWallCanvasPlace(host);
  });
  host.envelopePutInBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    saveCanvasToLocation(host);
  });
  host.envelopeUnfoldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    unfoldWallCanvas(host, 0);
  });
  host.envelopeFoldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    foldWallCanvas(host);
  });
  host.spotNoteEl.addEventListener("click", (e) => e.stopPropagation());
  host.spotNoteEl.addEventListener("pointerdown", (e) => e.stopPropagation());
}
