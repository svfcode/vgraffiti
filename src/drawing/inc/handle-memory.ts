import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { syncJourneyDirtyIndicator } from "../handlers/2.6.5-handle-journeys";
import { getStreetViewContext } from "./map-binding";
import {
  generateMemoryId,
  normFromCanvas,
  classifyPovMatch,
  findBestNearbyMemory,
  findEnvelopeAtCanvasPoint,
  isEnvelopeVisible,
  getMemoryViewportFrame,
} from "./view-memory";
import type { MemoryStop } from "./memory-types";
import { cloneMemories } from "./memory-types";
import { isPointInWallRect, normalizeWallRect } from "./wall-canvas";

export function syncMemoryStatus(host: DrawingOverlayHost): void {
  const isSv = host.viewportMode === "streetview";
  if (!isSv) {
    host.memoryStatusEl.hidden = true;
    return;
  }

  const sv = getStreetViewContext(host);
  if (!sv) {
    host.memoryStatusEl.hidden = false;
    host.memoryStatusEl.textContent = "Street View: нет POV";
    host.memoryStatusEl.dataset.state = "none";
    return;
  }

  const visible = host.memories.filter((m) => isEnvelopeVisible(m.anchor, sv)).length;
  const nearby = findBestNearbyMemory(host.memories, sv);

  host.memoryStatusEl.hidden = false;
  if (visible > 0) {
    host.memoryStatusEl.textContent = `Конверты: ${visible}`;
    host.memoryStatusEl.dataset.state = "exact";
  } else if (nearby) {
    const deg = Math.round(Math.abs(nearby.deltaHeading));
    const dir = nearby.deltaHeading > 0 ? "вправо" : "влево";
    host.memoryStatusEl.textContent = `Есть конверт · поверните ~${deg}° ${dir}`;
    host.memoryStatusEl.dataset.state = "nearby";
  } else if (host.memories.length > 0) {
    host.memoryStatusEl.textContent = "Другая панорама · конверты скрыты";
    host.memoryStatusEl.dataset.state = "hidden";
  } else {
    host.memoryStatusEl.textContent = "Нет конвертов в прогулке";
    host.memoryStatusEl.dataset.state = "empty";
  }
}

function syncEnvelopeDetail(host: DrawingOverlayHost): void {
  const id = host.openEnvelopeId;
  const mem = id ? host.memories.find((m) => m.id === id) : null;
  const show = !!mem && host.viewportMode === "streetview";
  host.envelopeDetailWrap.hidden = !show;
  if (!mem) {
    return;
  }
  host.envelopeNoteEl.value = mem.text;
  const hasWall = !!mem.wallCanvas?.strokes.length;
  host.envelopeWallBtn.hidden = host.uiMode === "wallCanvas" || host.uiMode === "wallCanvasPlace";
  host.envelopePutInBtn.hidden = host.uiMode !== "wallCanvas";
  host.envelopeUnfoldBtn.hidden = !hasWall || host.uiMode === "wallCanvasUnfold";
  host.envelopeFoldBtn.hidden = host.uiMode !== "wallCanvasUnfold";
}

export function syncMemoryUi(host: DrawingOverlayHost): void {
  const isSv = host.viewportMode === "streetview";
  host.memoryAddBtn.hidden = !isSv;
  host.memoryListEl.hidden = !isSv || host.memories.length === 0;
  host.memoryDraftWrap.hidden = true;

  const toolsOn =
    isSv &&
    (host.uiMode === "wallCanvas" ||
      host.uiMode === "wallCanvasPlace" ||
      host.uiMode === "wallCanvasUnfold");
  host.bar.querySelector(".tools-section")?.classList.toggle("memory-sketch-tools", toolsOn);

  if (!isSv) {
    host.memoryStatusEl.hidden = true;
    host.envelopeDetailWrap.hidden = true;
    return;
  }

  syncMemoryStatus(host);
  host.memoryAddBtn.classList.toggle("on", host.uiMode === "addEnvelope");
  syncEnvelopeDetail(host);
  refreshMemoryList(host);
}

export function refreshMemoryList(host: DrawingOverlayHost): void {
  const list = host.memoryListEl;
  list.replaceChildren();
  if (host.memories.length === 0) {
    list.hidden = true;
    return;
  }
  list.hidden = host.viewportMode !== "streetview";
  const sv = getStreetViewContext(host);

  host.memories.forEach((mem, index) => {
    const row = document.createElement("div");
    row.className = "memory-item";
    if (sv && isEnvelopeVisible(mem.anchor, sv)) {
      row.classList.add("is-active");
    }
    if (mem.id === host.openEnvelopeId) {
      row.classList.add("is-open");
    }

    const title = document.createElement("div");
    title.className = "memory-item-title";
    title.textContent = mem.title?.trim() || `Конверт ${index + 1}`;

    const text = document.createElement("div");
    text.className = "memory-item-text";
    const note = mem.text.trim();
    const wall = mem.wallCanvas?.strokes.length ? " · холст" : "";
    text.textContent = note ? `${note.slice(0, 60)}${wall}` : `(пусто)${wall}`;

    const actions = document.createElement("div");
    actions.className = "memory-item-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "memory-sketch-btn";
    openBtn.textContent = "Открыть";
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEnvelope(host, mem.id);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "memory-del-btn";
    delBtn.textContent = "×";
    delBtn.title = "Удалить конверт";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeMemory(host, mem.id);
    });

    actions.appendChild(openBtn);
    actions.appendChild(delBtn);
    row.addEventListener("click", () => openEnvelope(host, mem.id));
    row.appendChild(title);
    row.appendChild(text);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function resetWallModes(host: DrawingOverlayHost): void {
  host.wallCanvasDraftRect = null;
  host.activeWallCanvas = null;
  host.unfoldEnvelopeId = null;
  host.wallCanvasDrag = null;
  host.strokes.length = 0;
  host.past.length = 0;
  host.future.length = 0;
}

export function enterAddEnvelopeMode(host: DrawingOverlayHost): void {
  if (host.viewportMode !== "streetview") {
    return;
  }
  closeEnvelope(host);
  host.cancelActiveStroke();
  resetWallModes(host);
  host.uiMode = "addEnvelope";
  host.syncModeButtons();
  syncMemoryUi(host);
}

export function onEnvelopePlacementClick(host: DrawingOverlayHost, x: number, y: number): void {
  if (host.uiMode !== "addEnvelope") {
    return;
  }
  const sv = getStreetViewContext(host);
  if (!sv) {
    return;
  }
  const [u, v] = normFromCanvas(x, y, host.canvas);
  const mem: MemoryStop = {
    id: generateMemoryId(),
    anchor: { ...sv },
    u,
    v,
    text: "",
    createdAt: Date.now(),
  };
  host.memories.push(mem);
  host.uiMode = "nav";
  host.syncModeButtons();
  openEnvelope(host, mem.id);
  syncJourneyDirtyIndicator(host);
  host.scheduleRedraw();
}

export function onEnvelopeCanvasClick(host: DrawingOverlayHost, x: number, y: number): void {
  if (host.uiMode !== "nav") {
    return;
  }
  const sv = getStreetViewContext(host);
  const hit = findEnvelopeAtCanvasPoint(x, y, host.memories, sv, host.canvas);
  if (hit) {
    openEnvelope(host, hit.id);
  }
}

export function openEnvelope(host: DrawingOverlayHost, id: string): void {
  const mem = host.memories.find((m) => m.id === id);
  if (!mem) {
    return;
  }
  host.openEnvelopeId = id;
  host.uiMode = "nav";
  host.syncModeButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function closeEnvelope(host: DrawingOverlayHost): void {
  if (host.uiMode === "wallCanvasUnfold") {
    foldWallCanvas(host);
  }
  if (host.uiMode === "wallCanvas" || host.uiMode === "wallCanvasPlace") {
    cancelWallCanvas(host);
  }
  host.openEnvelopeId = null;
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function saveEnvelopeNote(host: DrawingOverlayHost): void {
  const id = host.openEnvelopeId;
  if (!id) {
    return;
  }
  const mem = host.memories.find((m) => m.id === id);
  if (mem) {
    mem.text = host.envelopeNoteEl.value.trim();
  }
  syncJourneyDirtyIndicator(host);
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function removeMemory(host: DrawingOverlayHost, id: string): void {
  host.memories = host.memories.filter((m) => m.id !== id);
  if (host.openEnvelopeId === id) {
    host.openEnvelopeId = null;
  }
  if (host.unfoldEnvelopeId === id) {
    host.unfoldEnvelopeId = null;
    host.wallCanvasDrag = null;
  }
  if (host.uiMode !== "nav" && host.uiMode !== "addEnvelope") {
    host.uiMode = "nav";
    host.syncModeButtons();
  }
  syncMemoryUi(host);
  syncJourneyDirtyIndicator(host);
  host.scheduleRedraw();
}

export function startWallCanvasPlace(host: DrawingOverlayHost): void {
  const id = host.openEnvelopeId;
  const sv = getStreetViewContext(host);
  const mem = id ? host.memories.find((m) => m.id === id) : null;
  if (!mem || !sv || classifyPovMatch(mem.anchor, sv) !== "exact") {
    window.alert("Вернитесь к ракурсу конверта, чтобы разместить холст.");
    return;
  }
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

export function putWallCanvasInEnvelope(host: DrawingOverlayHost): void {
  const id = host.openEnvelopeId;
  const wc = host.activeWallCanvas;
  const mem = id ? host.memories.find((m) => m.id === id) : null;
  if (!mem || !wc) {
    return;
  }
  mem.wallCanvas = {
    ...structuredClone(wc),
    strokes: host.strokes.length > 0 ? structuredClone(host.strokes) : wc.strokes,
  };
  resetWallModes(host);
  host.uiMode = "nav";
  host.syncModeButtons();
  syncMemoryUi(host);
  syncJourneyDirtyIndicator(host);
  host.scheduleRedraw();
}

export function unfoldWallCanvas(host: DrawingOverlayHost): void {
  const id = host.openEnvelopeId;
  const mem = id ? host.memories.find((m) => m.id === id) : null;
  const sv = getStreetViewContext(host);
  if (!mem?.wallCanvas || !sv || classifyPovMatch(mem.anchor, sv) !== "exact") {
    window.alert("Вернитесь к ракурсу конверта, чтобы развернуть холст.");
    return;
  }
  host.unfoldEnvelopeId = id;
  host.uiMode = "wallCanvasUnfold";
  host.syncModeButtons();
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function foldWallCanvas(host: DrawingOverlayHost): void {
  host.unfoldEnvelopeId = null;
  host.wallCanvasDrag = null;
  host.uiMode = "nav";
  host.syncModeButtons();
  syncJourneyDirtyIndicator(host);
  syncMemoryUi(host);
  host.scheduleRedraw();
}

export function onWallCanvasUnfoldDown(
  host: DrawingOverlayHost,
  x: number,
  y: number,
  pointerId: number,
): boolean {
  if (host.uiMode !== "wallCanvasUnfold" || !host.unfoldEnvelopeId) {
    return false;
  }
  const mem = host.memories.find((m) => m.id === host.unfoldEnvelopeId);
  if (!mem?.wallCanvas) {
    return false;
  }
  const frame = getMemoryViewportFrame();
  if (!isPointInWallRect(x, y, mem.wallCanvas, host.canvas, frame)) {
    return false;
  }
  host.wallCanvasDrag = {
    pointerId,
    startX: x,
    startY: y,
    baseOffsetU: mem.wallCanvas.offsetU ?? 0,
    baseOffsetV: mem.wallCanvas.offsetV ?? 0,
  };
  return true;
}

export function onWallCanvasUnfoldMove(host: DrawingOverlayHost, x: number, y: number): void {
  const drag = host.wallCanvasDrag;
  const id = host.unfoldEnvelopeId;
  if (!drag || !id) {
    return;
  }
  const mem = host.memories.find((m) => m.id === id);
  if (!mem?.wallCanvas) {
    return;
  }
  const frame = getMemoryViewportFrame();
  const du = (x - drag.startX) / frame.w;
  const dv = (y - drag.startY) / frame.h;
  mem.wallCanvas.offsetU = drag.baseOffsetU + du;
  mem.wallCanvas.offsetV = drag.baseOffsetV + dv;
  host.scheduleRedraw();
}

export function onWallCanvasUnfoldUp(host: DrawingOverlayHost): void {
  host.wallCanvasDrag = null;
  syncJourneyDirtyIndicator(host);
}

export function cloneHostMemories(host: DrawingOverlayHost): MemoryStop[] {
  return cloneMemories(host.memories);
}

export function bindMemoryPanelEvents(host: DrawingOverlayHost): void {
  host.memoryAddBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (host.uiMode === "addEnvelope") {
      host.uiMode = "nav";
      host.syncModeButtons();
      syncMemoryUi(host);
    } else {
      enterAddEnvelopeMode(host);
    }
  });
  host.envelopeNoteSaveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    saveEnvelopeNote(host);
  });
  host.envelopeCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeEnvelope(host);
  });
  host.envelopeWallBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startWallCanvasPlace(host);
  });
  host.envelopePutInBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    putWallCanvasInEnvelope(host);
  });
  host.envelopeUnfoldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    unfoldWallCanvas(host);
  });
  host.envelopeFoldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    foldWallCanvas(host);
  });
}
