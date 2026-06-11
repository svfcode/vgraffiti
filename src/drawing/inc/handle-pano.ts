import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { syncJourneyDirtyIndicator } from "../handlers/2.6.5-handle-journeys";
import { getStreetViewContext } from "./map-binding";
import {
  readStreetViewContext,
  spotSignatureFromHref,
  type StreetViewContext,
} from "../../lib/streetview-context";
import {
  clonePanoDrawings,
  filterAnchoredStrokes,
  findPanoDrawing,
  isSameSpot,
  spotKeyFromSv,
  upsertPanoDrawingForSpotKey,
  type PanoDrawing,
} from "./pano-types";

function currentSpotKey(sv: StreetViewContext): string {
  return spotSignatureFromHref(location.href) ?? spotKeyFromSv(sv);
}

function ensureActiveSpotKey(host: DrawingOverlayHost): string | null {
  if (host.activeSpotKey) {
    return host.activeSpotKey;
  }
  const sv = getStreetViewContext(host);
  if (!sv) {
    return null;
  }
  host.activeSpotKey = currentSpotKey(sv);
  return host.activeSpotKey;
}

/** Сохранить штрихи в panoDrawings для текущей точки. */
export function flushPanoStrokes(host: DrawingOverlayHost): void {
  if (host.viewportMode !== "streetview" || host.strokes.length === 0) {
    return;
  }
  const spotKey = ensureActiveSpotKey(host);
  if (!spotKey) {
    return;
  }
  upsertPanoDrawingForSpotKey(
    host.panoDrawings,
    spotKey,
    host.strokes,
    getStreetViewContext(host),
  );
}

function loadStrokesForSpot(host: DrawingOverlayHost, spotKey: string, sv: StreetViewContext): void {
  host.activeSpotKey = spotKey;
  const entry = findPanoDrawing(host.panoDrawings, sv);
  if (entry && isSameSpot(entry, sv)) {
    host.strokes.splice(
      0,
      host.strokes.length,
      ...structuredClone(filterAnchoredStrokes(entry.strokes)),
    );
  } else {
    host.strokes.length = 0;
  }
  host.past.length = 0;
  host.future.length = 0;
  host.syncUndoRedoButtons();
}

/** Переключить точку: сохранить штрихи в старую, загрузить для новой (или очистить). */
function applySpotChange(host: DrawingOverlayHost, newKey: string, sv: StreetViewContext): void {
  const prevKey = host.activeSpotKey;
  if (prevKey && prevKey !== newKey && host.strokes.length > 0) {
    upsertPanoDrawingForSpotKey(host.panoDrawings, prevKey, host.strokes, host.streetViewContext);
  }
  host.streetViewContext = sv;
  loadStrokesForSpot(host, newKey, sv);
  syncJourneyDirtyIndicator(host);
}

/** Опрос страницы: вернуть true, если точка сменилась и штрихи обновлены. */
export function syncSpotFromPage(host: DrawingOverlayHost, options?: { force?: boolean }): boolean {
  if (host.viewportMode !== "streetview") {
    return false;
  }
  const sv = readStreetViewContext();
  if (!sv) {
    return false;
  }
  const newKey = currentSpotKey(sv);
  if (!options?.force && newKey === host.activeSpotKey) {
    host.streetViewContext = sv;
    return false;
  }
  applySpotChange(host, newKey, sv);
  return true;
}

/** @deprecated alias */
export function onLocationChanged(
  host: DrawingOverlayHost,
  options?: { force?: boolean },
): void {
  if (syncSpotFromPage(host, options)) {
    host.scheduleRedraw();
  } else if (options?.force) {
    host.scheduleRedraw();
  }
}

export const onPanoChanged = onLocationChanged;

export function reloadCurrentPanoStrokes(host: DrawingOverlayHost): void {
  syncSpotFromPage(host, { force: true });
  host.scheduleRedraw();
}

/** Сообщение от map-bridge: сменился panoId (URL часто не меняется). */
export function onBridgePanoId(host: DrawingOverlayHost, panoId: string): void {
  if (host.viewportMode !== "streetview" || !panoId) {
    return;
  }
  const newKey = `id:${panoId}`;
  if (newKey === host.activeSpotKey) {
    return;
  }
  const base = host.streetViewContext ?? readStreetViewContext();
  if (!base) {
    return;
  }
  const sv: StreetViewContext = { ...base, panoId };
  applySpotChange(host, newKey, sv);
  host.scheduleRedraw();
}

export function bindDiaryPanelEvents(host: DrawingOverlayHost): void {
  host.journeyDiaryEl.addEventListener("input", () => {
    if (host.activeJourney) {
      host.activeJourney.diary = host.journeyDiaryEl.value;
    }
    syncJourneyDirtyIndicator(host);
  });
  host.journeyDiaryEl.addEventListener("click", (e) => e.stopPropagation());
  host.journeyDiaryEl.addEventListener("pointerdown", (e) => e.stopPropagation());
}

export function syncDiaryPanel(host: DrawingOverlayHost): void {
  const isSv = host.viewportMode === "streetview";
  host.journeyDiaryEl.hidden = !isSv;
  const label = host.journeyWrap.querySelector<HTMLLabelElement>(".journey-diary-label");
  if (label) {
    label.hidden = !isSv;
  }
  if (host.activeJourney && document.activeElement !== host.journeyDiaryEl) {
    host.journeyDiaryEl.value = host.activeJourney.diary;
  }
}

export function cloneHostPanoDrawings(host: DrawingOverlayHost): PanoDrawing[] {
  return clonePanoDrawings(host.panoDrawings);
}

export const onStreetViewPovChanged = onLocationChanged;
