import { cloneStrokes, type DrawingOverlayHost, type StoredStroke } from "../2.1-overlay-types";
import {
  createDefaultJourneyName,
  generateJourneyId,
  loadJourneys,
  loadVisibleJourneyIds,
  saveVisibleJourneyIds,
  upsertJourney,
  type SavedJourney,
} from "../inc/journey-storage";

let suppressActiveSelectChange = false;

export async function initJourneyStorage(host: DrawingOverlayHost): Promise<void> {
  host.savedJourneys = await loadJourneys();
  host.selectedJourneyIds = new Set(await loadVisibleJourneyIds());
}

export function initActiveJourney(host: DrawingOverlayHost): void {
  host.activeJourney = {
    id: generateJourneyId(),
    name: createDefaultJourneyName(),
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

export function syncJourneyDirtyIndicator(host: DrawingOverlayHost): void {
  const dirty = isJourneyDirty(host);
  host.journeyDirtyMark.hidden = !dirty;
  host.journeyWrap.classList.toggle("journey-is-dirty", dirty);
  updateUnsavedSelectLabel(host, dirty);
}

function updateUnsavedSelectLabel(host: DrawingOverlayHost, dirty: boolean): void {
  const activeId = host.activeJourney?.id;
  if (!activeId) {
    return;
  }
  const saved = host.savedJourneys.some((j) => j.id === activeId);
  if (saved) {
    return;
  }
  const opt = host.journeyActiveSelect.querySelector<HTMLOptionElement>(`option[value="${activeId}"]`);
  if (opt) {
    opt.textContent = dirty ? "— новое (не сохранено) *" : "— новое (не сохранено) —";
  }
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

function applySavedJourney(host: DrawingOverlayHost, journey: SavedJourney): void {
  host.activeJourney = {
    id: journey.id,
    name: journey.name,
    createdAt: journey.createdAt,
  };
  host.strokes.splice(0, host.strokes.length, ...cloneStrokes(journey.strokes));
  resetJourneyHistory(host);
  setJourneyBaseline(host);
  host.journeyNameEl.value = journey.name;
  refreshActiveJourneySelect(host);
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
  refreshActiveJourneySelect(host);
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

async function attemptSwitchToJourney(host: DrawingOverlayHost, targetId: string): Promise<void> {
  const prevId = host.activeJourney?.id;
  if (!targetId || targetId === prevId) {
    return;
  }

  if (!confirmDiscardIfDirty(host)) {
    suppressActiveSelectChange = true;
    if (prevId) {
      host.journeyActiveSelect.value = prevId;
    }
    suppressActiveSelectChange = false;
    return;
  }

  const saved = host.savedJourneys.find((j) => j.id === targetId);
  if (saved) {
    applySavedJourney(host, saved);
    return;
  }

  suppressActiveSelectChange = true;
  if (prevId) {
    host.journeyActiveSelect.value = prevId;
  }
  suppressActiveSelectChange = false;
}

export function syncJourneyPanel(host: DrawingOverlayHost): void {
  host.journeyWrap.hidden = false;
  if (host.activeJourney) {
    host.journeyNameEl.value = host.activeJourney.name;
  }
  refreshActiveJourneySelect(host);
  refreshJourneyList(host);
  syncJourneyDirtyIndicator(host);
}

function refreshActiveJourneySelect(host: DrawingOverlayHost): void {
  const sel = host.journeyActiveSelect;
  suppressActiveSelectChange = true;
  sel.replaceChildren();

  const activeId = host.activeJourney?.id;
  const savedIds = new Set(host.savedJourneys.map((j) => j.id));

  if (activeId && !savedIds.has(activeId)) {
    const opt = document.createElement("option");
    opt.value = activeId;
    opt.textContent = isJourneyDirty(host)
      ? "— новое (не сохранено) *"
      : "— новое (не сохранено) —";
    sel.appendChild(opt);
  }

  for (const j of host.savedJourneys) {
    const opt = document.createElement("option");
    opt.value = j.id;
    opt.textContent = j.name;
    opt.title = j.name;
    sel.appendChild(opt);
  }

  if (activeId && sel.querySelector(`option[value="${activeId}"]`)) {
    sel.value = activeId;
  } else if (sel.options.length > 0) {
    sel.selectedIndex = 0;
  }

  suppressActiveSelectChange = false;
}

function refreshJourneyList(host: DrawingOverlayHost): void {
  const list = host.journeyListEl;
  list.replaceChildren();
  const activeId = host.activeJourney?.id;
  const journeys = host.savedJourneys.filter((j) => j.id !== activeId);

  const summary = host.journeyWrap.querySelector<HTMLElement>("#vgf-journey-saved-summary");
  if (summary) {
    const visibleCount = journeys.filter((j) => host.selectedJourneyIds.has(j.id)).length;
    summary.textContent =
      journeys.length > 0
        ? `Сохранённые на карте (${visibleCount}/${journeys.length})`
        : "Сохранённые на карте";
  }

  if (journeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "journey-empty";
    empty.textContent =
      host.savedJourneys.length > 0
        ? "Активное путешествие всегда на карте. Сохраните ещё — появятся здесь."
        : "Сохраните прогулку — она появится здесь";
    list.appendChild(empty);
    return;
  }

  for (const j of journeys) {
    const label = document.createElement("label");
    label.className = "journey-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = host.selectedJourneyIds.has(j.id);
    cb.dataset.journeyId = j.id;
    const span = document.createElement("span");
    span.textContent = j.name;
    span.title = j.name;
    label.append(cb, span);
    list.appendChild(label);
  }
}

async function persistSelection(host: DrawingOverlayHost): Promise<void> {
  await saveVisibleJourneyIds([...host.selectedJourneyIds]);
  refreshJourneyList(host);
  host.syncStrokesToBridge();
  host.scheduleRedraw();
}

export async function onJourneySave(host: DrawingOverlayHost): Promise<void> {
  if (!host.activeJourney) {
    return;
  }
  const now = Date.now();
  const journey: SavedJourney = {
    id: host.activeJourney.id,
    name: host.activeJourney.name.trim() || createDefaultJourneyName(),
    strokes: cloneStrokes(host.strokes),
    createdAt: host.activeJourney.createdAt,
    updatedAt: now,
  };
  host.activeJourney.name = journey.name;
  host.journeyNameEl.value = journey.name;
  await upsertJourney(journey);
  host.savedJourneys = await loadJourneys();
  setJourneyBaseline(host);
  refreshActiveJourneySelect(host);
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

export function bindJourneyPanelEvents(host: DrawingOverlayHost): void {
  host.journeyActiveSelect.addEventListener("change", () => {
    if (suppressActiveSelectChange) {
      return;
    }
    void attemptSwitchToJourney(host, host.journeyActiveSelect.value);
  });
  host.journeyActiveSelect.addEventListener("click", (e) => e.stopPropagation());
  host.journeyActiveSelect.addEventListener("pointerdown", (e) => e.stopPropagation());

  host.journeyNewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
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
  });
  host.journeyNameEl.addEventListener("click", (e) => e.stopPropagation());
  host.journeyNameEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  host.journeySaveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void onJourneySave(host);
  });

  host.journeyListEl.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") {
      return;
    }
    const id = t.dataset.journeyId;
    if (!id) {
      return;
    }
    if (t.checked) {
      host.selectedJourneyIds.add(id);
    } else {
      host.selectedJourneyIds.delete(id);
    }
    void persistSelection(host);
  });

  host.journeyListEl.addEventListener("click", (e) => e.stopPropagation());

  const savedPick = host.journeyWrap.querySelector<HTMLDetailsElement>("#vgf-journey-saved-pick");
  savedPick?.addEventListener("click", (e) => e.stopPropagation());
  savedPick?.addEventListener("pointerdown", (e) => e.stopPropagation());
}
