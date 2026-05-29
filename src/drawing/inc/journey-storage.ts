import type { StoredStroke } from "../2.1-overlay-types";

export type SavedJourney = {
  id: string;
  name: string;
  strokes: StoredStroke[];
  createdAt: number;
  updatedAt: number;
};

const JOURNEYS_KEY = "journeys";
const VISIBLE_KEY = "journeyVisible";
/** Старый ключ в localStorage страницы (разный на каждом домене карт). */
const LEGACY_JOURNEYS_KEY = "vgraffiti:journeys";
const LEGACY_VISIBLE_KEY = "vgraffiti:journey-visible";

function storageArea(): chrome.storage.LocalStorageArea {
  return chrome.storage.local;
}

export function createDefaultJourneyName(): string {
  return new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateJourneyId(): string {
  return `j_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isSavedJourney(v: unknown): v is SavedJourney {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    Array.isArray(o.strokes) &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number"
  );
}

function parseJourneyList(raw: unknown): SavedJourney[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isSavedJourney);
}

function readLegacyJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Перенос из page localStorage (если уже сохраняли до chrome.storage). */
async function migrateLegacyStorage(): Promise<void> {
  const area = storageArea();
  const existing = await area.get([JOURNEYS_KEY, VISIBLE_KEY]);
  if (existing[JOURNEYS_KEY]) {
    return;
  }
  const legacyJourneys = readLegacyJson<unknown>(LEGACY_JOURNEYS_KEY);
  const legacyVisible = readLegacyJson<unknown>(LEGACY_VISIBLE_KEY);
  const patch: Record<string, unknown> = {};
  if (legacyJourneys) {
    patch[JOURNEYS_KEY] = parseJourneyList(legacyJourneys);
  }
  if (Array.isArray(legacyVisible)) {
    patch[VISIBLE_KEY] = legacyVisible.filter((id): id is string => typeof id === "string");
  }
  if (Object.keys(patch).length > 0) {
    await area.set(patch);
  }
}

export async function loadJourneys(): Promise<SavedJourney[]> {
  await migrateLegacyStorage();
  const data = await storageArea().get(JOURNEYS_KEY);
  return parseJourneyList(data[JOURNEYS_KEY]);
}

export async function upsertJourney(journey: SavedJourney): Promise<void> {
  const list = await loadJourneys();
  const idx = list.findIndex((j) => j.id === journey.id);
  if (idx >= 0) {
    list[idx] = journey;
  } else {
    list.push(journey);
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  await storageArea().set({ [JOURNEYS_KEY]: list });
}

export async function loadVisibleJourneyIds(): Promise<string[]> {
  await migrateLegacyStorage();
  const data = await storageArea().get(VISIBLE_KEY);
  const raw = data[VISIBLE_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((id): id is string => typeof id === "string");
}

export async function saveVisibleJourneyIds(ids: string[]): Promise<void> {
  await storageArea().set({ [VISIBLE_KEY]: ids });
}
