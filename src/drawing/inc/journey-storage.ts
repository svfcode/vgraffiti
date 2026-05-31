import type { StoredStroke } from "../2.1-overlay-types";
import type { MemoryStop } from "./memory-types";
import { isMemoryStop } from "./memory-types";

export type JourneySessionMode = "map" | "streetview";

export type SavedJourney = {
  id: string;
  name: string;
  strokes: StoredStroke[];
  memories?: MemoryStop[];
  createdAt: number;
  updatedAt: number;
  sessionMode?: JourneySessionMode;
};

const JOURNEYS_KEY = "journeys";
const VISIBLE_KEY = "journeyVisible";
const SYNC_META_KEY = "journeySyncMeta";
const DELETED_QUEUE_KEY = "journeyDeletedQueue";
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

/** Имя новой сессии в зависимости от режима (карта / Street View). */
export function createDefaultSessionName(mode: "map" | "streetview" = "map"): string {
  const dt = createDefaultJourneyName();
  return mode === "streetview" ? `Прогулка ${dt}` : dt;
}

export function inferSessionMode(j: Pick<SavedJourney, "name" | "sessionMode" | "memories">): JourneySessionMode {
  if (j.sessionMode === "streetview" || j.sessionMode === "map") {
    return j.sessionMode;
  }
  if (j.memories && j.memories.length > 0) {
    return "streetview";
  }
  if (j.name.trim().startsWith("Прогулка ")) {
    return "streetview";
  }
  return "map";
}

export function withSessionMode(j: SavedJourney): SavedJourney {
  return { ...j, sessionMode: inferSessionMode(j) };
}

export function generateJourneyId(): string {
  return `j_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isSavedJourney(v: unknown): v is SavedJourney {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  const modeOk =
    o.sessionMode === undefined ||
    o.sessionMode === "map" ||
    o.sessionMode === "streetview";
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    Array.isArray(o.strokes) &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number" &&
    modeOk &&
    (o.memories === undefined || (Array.isArray(o.memories) && o.memories.every(isMemoryStop)))
  );
}

function parseJourneyList(raw: unknown): SavedJourney[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isSavedJourney).map(withSessionMode);
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

export type JourneySyncMeta = {
  pending: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
};

export async function loadJourneySyncMeta(): Promise<JourneySyncMeta> {
  const data = await storageArea().get(SYNC_META_KEY);
  const raw = data[SYNC_META_KEY];
  if (!raw || typeof raw !== "object") {
    return { pending: false, lastSyncAt: null, lastError: null };
  }
  const o = raw as Record<string, unknown>;
  return {
    pending: !!o.pending,
    lastSyncAt: typeof o.lastSyncAt === "number" ? o.lastSyncAt : null,
    lastError: typeof o.lastError === "string" ? o.lastError : null,
  };
}

export async function saveJourneySyncMeta(meta: JourneySyncMeta): Promise<void> {
  await storageArea().set({ [SYNC_META_KEY]: meta });
}

export async function markJourneySyncPending(): Promise<void> {
  const prev = await loadJourneySyncMeta();
  await saveJourneySyncMeta({ ...prev, pending: true, lastError: null });
}

export async function saveJourneys(journeys: SavedJourney[]): Promise<void> {
  const list = [...journeys].sort((a, b) => b.updatedAt - a.updatedAt);
  await storageArea().set({ [JOURNEYS_KEY]: list });
}

export async function removeJourneyById(id: string): Promise<void> {
  const list = await loadJourneys();
  await storageArea().set({ [JOURNEYS_KEY]: list.filter((j) => j.id !== id) });
}

export async function loadDeletedJourneyIds(): Promise<string[]> {
  const data = await storageArea().get(DELETED_QUEUE_KEY);
  const raw = data[DELETED_QUEUE_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((id): id is string => typeof id === "string");
}

export async function queueDeletedJourneyId(id: string): Promise<void> {
  const ids = await loadDeletedJourneyIds();
  if (!ids.includes(id)) {
    ids.push(id);
    await storageArea().set({ [DELETED_QUEUE_KEY]: ids });
  }
}

export async function clearDeletedJourneyIds(remove: string[]): Promise<void> {
  if (remove.length === 0) {
    return;
  }
  const removeSet = new Set(remove);
  const ids = (await loadDeletedJourneyIds()).filter((id) => !removeSet.has(id));
  await storageArea().set({ [DELETED_QUEUE_KEY]: ids });
}
