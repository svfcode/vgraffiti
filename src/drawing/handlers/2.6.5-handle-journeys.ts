import { broadcastMapCenter } from "../../lib/map-live-probe";
import { cloneStrokes, type DrawingOverlayHost, type StoredStroke } from "../2.1-overlay-types";
import {
  getStrokesGeoCenter,
  nudgeDirectionToPixels,
  shiftStoredStrokes,
} from "../inc/journey-geo";
import {
  createDefaultSessionName,
  generateJourneyId,
  inferSessionMode,
  loadJourneys,
  loadVisibleJourneyIds,
  markJourneySyncPending,
  queueDeletedJourneyId,
  removeJourneyById,
  saveVisibleJourneyIds,
  upsertJourney,
  type SavedJourney,
} from "../inc/journey-storage";
import { scheduleJourneyCloudSync } from "../inc/journey-cloud-sync";

export async function initJourneyStorage(host: DrawingOverlayHost): Promise<void> {
  host.savedJourneys = await loadJourneys();
  host.selectedJourneyIds = new Set(await loadVisibleJourneyIds());
}

export function initActiveJourney(host: DrawingOverlayHost): void {
  host.activeJourney = {
    id: generateJourneyId(),
    name: createDefaultSessionName(host.viewportMode),
    createdAt: Date.now(),
  };
  setJourneyBaseline(host);
}

function strokesEqual(a: StoredStroke[], b: StoredStroke[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function setJourneyBaseline(host: DrawingOverlayHost): void {
  if (!host.activeJourney) {
    host.journeyBaseline = null;
    return;
  }
  host.journeyBaseline = {
    name: host.activeJourney.name.trim(),
    strokes: cloneStrokes(host.strokes),
  };
}

export function isJourneyDirty(host: DrawingOverlayHost): boolean {
  if (!host.activeJourney || !host.journeyBaseline) {
    return false;
  }
  const name = host.activeJourney.name.trim();
  if (name !== host.journeyBaseline.name) {
    return true;
  }
  return !strokesEqual(host.strokes, host.journeyBaseline.strokes);
}

function unsavedActiveLabel(host: DrawingOverlayHost): string {
  const base = host.viewportMode === "streetview" ? "Новая прогулка" : "Новое путешествие";
  return isJourneyDirty(host) ? `${base} *` : base;
}

function activeDisplayName(host: DrawingOverlayHost): string {
  if (!host.activeJourney) {
    return "—";
  }
  const saved = host.savedJourneys.some((j) => j.id === host.activeJourney!.id);
  if (saved) {
    const name =
      host.activeJourney.name.trim() || createDefaultSessionName(host.viewportMode);
    return isJourneyDirty(host) ? `${name} *` : name;
  }
  return unsavedActiveLabel(host);
}

export function syncJourneyDirtyIndicator(host: DrawingOverlayHost): void {
  host.journeyWrap.classList.toggle("journey-is-dirty", isJourneyDirty(host));
  syncActiveJourneyTitle(host);
}

function syncActiveJourneyTitle(host: DrawingOverlayHost): void {
  const label = activeDisplayName(host);
  host.journeyActiveTitleEl.textContent = label;
  const fullName = host.activeJourney?.name.trim() || label;
  host.journeyActiveTitleEl.title = fullName;
}

/** Штрихи для отображения: выбранные сохранённые прогулки + текущая сессия. */
export function getDisplayStrokes(host: DrawingOverlayHost): StoredStroke[] {
  const out: StoredStroke[] = [];
  const activeId = host.activeJourney?.id;
  for (const id of host.selectedJourneyIds) {
    if (id === activeId) {
      continue;
    }
    const j = host.savedJourneys.find((x) => x.id === id);
    if (j && j.strokes.length > 0) {
      out.push(...j.strokes);
    }
  }
  if (host.strokes.length > 0) {
    out.push(...host.strokes);
  }
  return out;
}

function resetJourneyHistory(host: DrawingOverlayHost): void {
  host.cancelActiveStroke();
  host.past.length = 0;
  host.future.length = 0;
  host.syncUndoRedoButtons();
}

export function closeJourneyNudge(host: DrawingOverlayHost): void {
  host.journeyNudgeOpen = false;
  host.journeyNudgeWrap.hidden = true;
  refreshJourneyList(host);
}

export function openJourneyNudge(host: DrawingOverlayHost): void {
  host.journeyNudgeOpen = true;
  host.journeyNudgeWrap.hidden = false;
  refreshJourneyList(host);
}

function applySavedJourney(host: DrawingOverlayHost, journey: SavedJourney): void {
  closeJourneyNudge(host);
  host.activeJourney = {
    id: journey.id,
    name: journey.name,
    createdAt: journey.createdAt,
  };
  host.strokes.splice(0, host.strokes.length, ...cloneStrokes(journey.strokes));
  resetJourneyHistory(host);
  setJourneyBaseline(host);
  host.journeyNameEl.value = journey.name;
  refreshJourneyList(host);
  syncJourneyDirtyIndicator(host);
  host.syncStrokesToBridge();
  host.scheduleRedraw();
}

export function startNewActiveJourney(host: DrawingOverlayHost): void {
  initActiveJourney(host);
  host.strokes.length = 0;
  resetJourneyHistory(host);
  host.journeyNameEl.value = host.activeJourney!.name;
  closeJourneyNudge(host);
  refreshJourneyList(host);
  syncJourneyDirtyIndicator(host);
  host.syncStrokesToBridge();
  host.scheduleRedraw();
}

function confirmDiscardIfDirty(host: DrawingOverlayHost): boolean {
  if (!isJourneyDirty(host)) {
    return true;
  }
  return window.confirm(
    "Есть несохранённые изменения. Переключить без сохранения?",
  );
}

export async function switchToJourneyId(
  host: DrawingOverlayHost,
  targetId: string,
  options?: { skipDirtyConfirm?: boolean; locate?: boolean },
): Promise<boolean> {
  const prevId = host.activeJourney?.id;
  if (!targetId || targetId === prevId) {
    if (options?.locate && targetId) {
      locateJourneyById(host, targetId);
    }
    return true;
  }
  if (!options?.skipDirtyConfirm && !confirmDiscardIfDirty(host)) {
    return false;
  }
  const saved = host.savedJourneys.find((j) => j.id === targetId);
  if (saved) {
    applySavedJourney(host, saved);
    if (options?.locate) {
      locateJourneyById(host, targetId);
    }
    return true;
  }
  return false;
}

function strokesForJourneyId(host: DrawingOverlayHost, journeyId: string): StoredStroke[] | null {
  if (host.activeJourney?.id === journeyId) {
    return host.strokes;
  }
  const j = host.savedJourneys.find((x) => x.id === journeyId);
  return j ? j.strokes : null;
}

export function locateJourneyById(host: DrawingOverlayHost, journeyId: string): void {
  const strokes = strokesForJourneyId(host, journeyId);
  if (!strokes || strokes.length === 0) {
    return;
  }
  const center = getStrokesGeoCenter(strokes);
  if (!center) {
    return;
  }
  if (host.uiMode !== "nav") {
    host.uiMode = "nav";
    host.syncModeButtons();
  }
  host.syncMapFollow();
  const map = host.getViewportMap();
  const zoom = map?.zoom ?? 16;
  broadcastMapCenter(center.lat, center.lng, zoom);
}

function bindNudgeHoldRepeat(
  btn: HTMLButtonElement,
  host: DrawingOverlayHost,
  dir: "up" | "down" | "left" | "right",
): void {
  let holdTimer = 0;
  let repeatTimer = 0;
  let sessionStarted = false;
  const initialMs = 350;
  const repeatMs = 70;

  const stop = (): void => {
    window.clearTimeout(holdTimer);
    window.clearInterval(repeatTimer);
    holdTimer = 0;
    repeatTimer = 0;
    sessionStarted = false;
    btn.classList.remove("is-held");
  };

  const tick = (): void => {
    onNudgeClick(host, dir, !sessionStarted);
    sessionStarted = true;
  };

  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) {
      return;
    }
    btn.classList.add("is-held");
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    tick();
    holdTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(tick, repeatMs);
    }, initialMs);
  });

  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("lostpointercapture", stop);
}

function onNudgeClick(
  host: DrawingOverlayHost,
  dir: "up" | "down" | "left" | "right",
  recordHistory = true,
): void {
  const map = host.getViewportMap();
  if (!map || host.strokes.length === 0) {
    return;
  }
  const { dx, dy } = nudgeDirectionToPixels(dir);
  if (recordHistory) {
    host.pushHistoryBeforeMutation();
  }
  shiftStoredStrokes(host.strokes, dx, dy, map);
  syncJourneyDirtyIndicator(host);
  host.syncStrokesToBridge();
  host.scheduleRedraw();
}

export function syncJourneyPanel(host: DrawingOverlayHost): void {
  host.journeyWrap.hidden = false;
  if (host.activeJourney) {
    host.journeyNameEl.value = host.activeJourney.name;
  }
  refreshJourneyList(host);
  syncJourneyDirtyIndicator(host);
}

const NUDGE_PAD_ICON =
  '<svg class="journey-nudge-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="1.75" fill="currentColor"/><path d="M8 2.5V5.5M8 10.5V13.5M2.5 8H5.5M10.5 8H13.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M8 2.5L6.2 4.8M8 2.5L9.8 4.8M13.5 8L11.2 9.8M13.5 8L11.2 6.2M8 13.5L6.2 11.2M8 13.5L9.8 11.2M2.5 8L4.8 9.8M2.5 8L4.8 6.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

function createJourneyIconBtn(
  className: string,
  title: string,
  glyph: string,
  journeyId: string,
  action: "edit" | "nudge" | "locate" | "visible" | "delete",
  html?: string,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.dataset.journeyId = journeyId;
  btn.dataset.action = action;
  if (html) {
    btn.innerHTML = html;
  } else {
    btn.textContent = glyph;
  }
  return btn;
}

function journeysForList(host: DrawingOverlayHost): SavedJourney[] {
  const mode = host.viewportMode === "streetview" ? "streetview" : "map";
  return host.savedJourneys.filter((j) => inferSessionMode(j) === mode);
}

function refreshJourneyList(host: DrawingOverlayHost): void {
  const list = host.journeyListEl;
  list.replaceChildren();
  const activeId = host.activeJourney?.id;
  const isSv = host.viewportMode === "streetview";
  const journeys = journeysForList(host);

  const summary = host.journeyWrap.querySelector<HTMLElement>("#vgf-journey-saved-summary");
  if (summary) {
    if (isSv) {
      summary.textContent =
        journeys.length > 0
          ? `Сохранённые прогулки (${journeys.length})`
          : "Сохранённые прогулки";
    } else {
      const totalMap = host.savedJourneys.filter((j) => inferSessionMode(j) === "map").length;
      const visibleCount = journeys.filter(
        (j) => j.id === activeId || host.selectedJourneyIds.has(j.id),
      ).length;
      summary.textContent =
        journeys.length > 0
          ? `Сохранённые на карте (${visibleCount}/${totalMap})`
          : "Сохранённые на карте";
    }
  }

  if (journeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "journey-empty";
    empty.textContent = isSv
      ? "Нет сохранённых прогулок. Сохраните текущую — она появится в списке."
      : "Сохраните путешествие — оно появится здесь";
    list.appendChild(empty);
    return;
  }

  for (const j of journeys) {
    const isActive = j.id === activeId;
    const isVisible = isActive || host.selectedJourneyIds.has(j.id);
    const nudgeOpen = isActive && host.journeyNudgeOpen && !isSv;

    const row = document.createElement("div");
    row.className = "journey-item";
    if (isActive) {
      row.classList.add("is-active");
    }

    const check = document.createElement("span");
    check.className = "journey-item-check";
    check.textContent = isActive ? "✓" : "";
    check.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "journey-item-name";
    name.textContent = j.name;
    name.title = j.name;

    const actions = document.createElement("div");
    actions.className = "journey-item-actions";

    const edit = createJourneyIconBtn(
      "journey-item-icon journey-item-edit",
      isSv ? "Открыть эту прогулку" : "Редактировать это путешествие",
      "✎",
      j.id,
      "edit",
    );

    actions.append(edit);

    if (!isSv) {
      const nudge = createJourneyIconBtn(
        "journey-item-icon journey-item-nudge",
        "Сдвиг рисунка",
        "",
        j.id,
        "nudge",
        NUDGE_PAD_ICON,
      );
      if (nudgeOpen) {
        nudge.classList.add("on");
      }
      const locate = createJourneyIconBtn(
        "journey-item-icon journey-item-locate",
        "Показать на карте",
        "◎",
        j.id,
        "locate",
      );
      const visible = createJourneyIconBtn(
        "journey-item-icon journey-item-visible",
        isActive ? "Активное путешествие всегда на карте" : "Показать на карте",
        "👁",
        j.id,
        "visible",
      );
      if (isVisible) {
        visible.classList.add("on");
      }
      if (isActive) {
        visible.disabled = true;
      }
      actions.append(nudge, locate, visible);
    }

    const del = createJourneyIconBtn(
      "journey-item-icon journey-item-delete",
      isSv ? "Удалить прогулку" : "Удалить путешествие",
      "🗑",
      j.id,
      "delete",
    );
    actions.append(del);

    row.append(check, name, actions);
    list.appendChild(row);
  }
}

async function persistSelection(host: DrawingOverlayHost): Promise<void> {
  await saveVisibleJourneyIds([...host.selectedJourneyIds]);
  refreshJourneyList(host);
  host.syncStrokesToBridge();
  host.scheduleRedraw();
}

function toggleJourneyVisible(host: DrawingOverlayHost, journeyId: string): void {
  if (host.activeJourney?.id === journeyId) {
    return;
  }
  if (host.selectedJourneyIds.has(journeyId)) {
    host.selectedJourneyIds.delete(journeyId);
  } else {
    host.selectedJourneyIds.add(journeyId);
  }
  void persistSelection(host);
}

export async function onJourneySave(host: DrawingOverlayHost): Promise<void> {
  if (!host.activeJourney) {
    return;
  }
  const now = Date.now();
  const prior = host.savedJourneys.find((j) => j.id === host.activeJourney!.id);
  const sessionMode =
    host.viewportMode === "streetview"
      ? "streetview"
      : (prior?.sessionMode ?? "map");
  const journey: SavedJourney = {
    id: host.activeJourney.id,
    name: host.activeJourney.name.trim() || createDefaultSessionName(host.viewportMode),
    strokes: cloneStrokes(host.strokes),
    createdAt: host.activeJourney.createdAt,
    updatedAt: now,
    sessionMode,
  };
  host.activeJourney.name = journey.name;
  host.journeyNameEl.value = journey.name;
  await upsertJourney(journey);
  host.savedJourneys = await loadJourneys();
  setJourneyBaseline(host);
  refreshJourneyList(host);
  syncJourneyDirtyIndicator(host);

  const btn = host.journeySaveBtn;
  const prev = btn.textContent;
  btn.textContent = "Сохранено";
  btn.disabled = true;
  window.setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 1200);
}

async function deleteSavedJourney(host: DrawingOverlayHost, journeyId: string): Promise<void> {
  const journey = host.savedJourneys.find((j) => j.id === journeyId);
  if (!journey) {
    return;
  }
  const label = host.viewportMode === "streetview" ? "прогулку" : "путешествие";
  const msg = `Удалить ${label} «${journey.name}»?\n\nНа сайте она попадёт в корзину на 30 дней — там можно восстановить.`;
  if (!window.confirm(msg)) {
    return;
  }

  const wasActive = host.activeJourney?.id === journeyId;
  if (wasActive && isJourneyDirty(host)) {
    if (!window.confirm("Есть несохранённые изменения. Всё равно удалить?")) {
      return;
    }
  }

  closeJourneyNudge(host);
  await removeJourneyById(journeyId);
  host.savedJourneys = await loadJourneys();
  host.selectedJourneyIds.delete(journeyId);
  await saveVisibleJourneyIds([...host.selectedJourneyIds]);
  await queueDeletedJourneyId(journeyId);

  if (wasActive) {
    startNewActiveJourney(host);
  } else {
    refreshJourneyList(host);
    host.syncStrokesToBridge();
    host.scheduleRedraw();
  }

  await markJourneySyncPending();
  scheduleJourneyCloudSync(host, true);
}

async function handleJourneyListAction(
  host: DrawingOverlayHost,
  journeyId: string,
  action: string,
): Promise<void> {
  if (action === "edit") {
    await switchToJourneyId(host, journeyId);
    return;
  }
  if (action === "locate") {
    locateJourneyById(host, journeyId);
    return;
  }
  if (action === "visible") {
    toggleJourneyVisible(host, journeyId);
    return;
  }
  if (action === "nudge") {
    if (host.viewportMode === "streetview") {
      return;
    }
    const wasActive = host.activeJourney?.id === journeyId;
    if (!wasActive) {
      const ok = await switchToJourneyId(host, journeyId);
      if (!ok) {
        return;
      }
    }
    const savedPick = host.journeyWrap.querySelector<HTMLDetailsElement>("#vgf-journey-saved-pick");
    if (savedPick) {
      savedPick.open = true;
    }
    if (wasActive && host.journeyNudgeOpen) {
      closeJourneyNudge(host);
    } else {
      openJourneyNudge(host);
    }
    return;
  }
  if (action === "delete") {
    await deleteSavedJourney(host, journeyId);
  }
}

export function bindJourneyPanelEvents(host: DrawingOverlayHost): void {
  host.journeyNudgeWrap.querySelectorAll<HTMLButtonElement>(".journey-nudge-btn").forEach((btn) => {
    const dir = btn.dataset.nudge as "up" | "down" | "left" | "right" | undefined;
    if (dir) {
      bindNudgeHoldRepeat(btn, host, dir);
    }
  });

  host.journeyNewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.moreDetails.open = false;
    if (!confirmDiscardIfDirty(host)) {
      return;
    }
    startNewActiveJourney(host);
  });

  host.journeyNameEl.addEventListener("input", () => {
    if (host.activeJourney) {
      host.activeJourney.name = host.journeyNameEl.value;
    }
    syncJourneyDirtyIndicator(host);
    refreshJourneyList(host);
  });
  host.journeyNameEl.addEventListener("click", (e) => e.stopPropagation());
  host.journeyNameEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  host.journeySaveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void onJourneySave(host);
  });

  host.journeyListEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const t = e.target;
    if (!(t instanceof HTMLElement)) {
      return;
    }
    const btn = t.closest<HTMLButtonElement>(".journey-item-icon");
    if (!btn || btn.disabled) {
      return;
    }
    const id = btn.dataset.journeyId;
    const action = btn.dataset.action;
    if (!id || !action) {
      return;
    }
    void handleJourneyListAction(host, id, action);
  });

  const savedPick = host.journeyWrap.querySelector<HTMLDetailsElement>("#vgf-journey-saved-pick");
  savedPick?.addEventListener("click", (e) => e.stopPropagation());
  savedPick?.addEventListener("pointerdown", (e) => e.stopPropagation());
}
