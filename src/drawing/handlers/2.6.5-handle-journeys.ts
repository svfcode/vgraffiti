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

export function syncJourneyPanel(host: DrawingOverlayHost): void {
  host.journeyWrap.hidden = false;
  if (host.activeJourney) {
    host.journeyNameEl.value = host.activeJourney.name;
  }
  refreshJourneyList(host);
}

function refreshJourneyList(host: DrawingOverlayHost): void {
  const list = host.journeyListEl;
  list.replaceChildren();
  const journeys = host.savedJourneys;
  if (journeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "journey-empty";
    empty.textContent = "Сохраните прогулку — она появится здесь";
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
  refreshJourneyList(host);

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
  host.journeyNameEl.addEventListener("input", () => {
    if (host.activeJourney) {
      host.activeJourney.name = host.journeyNameEl.value;
    }
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
}
