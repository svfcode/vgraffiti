import type { StoredStroke } from "../2.1-overlay-types";
import type { WalkLocation } from "./memory-types";
import { normalizePanoDrawings, type PanoDrawing } from "./pano-types";

function normalizeJourney(j: SavedJourney): SavedJourney {
  let out: SavedJourney = {
    ...j,
    panoDrawings: normalizePanoDrawings(j.panoDrawings),
    memories: undefined,
  };
  const diary = (out as SavedJourney & { description?: string }).description?.trim();
  if (diary && !out.diary) {
    out = { ...out, diary };
  }
  return out;
}

export type JourneySessionMode = "map" | "streetview";

export type SavedJourney = {
  id: string;
  name: string;
  /** Дневник прогулки (Street View). */
  diary?: string;
  strokes: StoredStroke[];
  panoDrawings?: PanoDrawing[];
  /** @deprecated мигрируется в panoDrawings */
  memories?: WalkLocation[];
  createdAt: number;
  updatedAt: number;
  sessionMode?: JourneySessionMode;
};

const JOURNEYS_KEY = "journeys";
const VISIBLE_KEY = "journeyVisible";
const SYNC_META_KEY = "journeySyncMeta";
const DELETED_QUEUE_KEY = "journeyDeletedQueue";
/** Резервная копия на домене карты (если chrome.storage недоступен). */
const LEGACY_JOURNEYS_KEY = "vgraffiti:journeys";
const LEGACY_VISIBLE_KEY = "vgraffiti:journey-visible";

async function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return {};
    }
    return (await chrome.storage.local.get(keys)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function storageSet(values: Record<string, unknown>): Promise<boolean> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return false;
    }
    await chrome.storage.local.set(values);
    return true;
  } catch {
    return false;
  }
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

function mirrorJourneysToPage(list: SavedJourney[]): void {
  try {
    localStorage.setItem(LEGACY_JOURNEYS_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}

function mirrorVisibleToPage(ids: string[]): void {
  try {
    localStorage.setItem(LEGACY_VISIBLE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
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

export function inferSessionMode(
  j: Pick<SavedJourney, "name" | "sessionMode" | "memories" | "panoDrawings" | "diary">,
): JourneySessionMode {
  if (j.sessionMode === "streetview" || j.sessionMode === "map") {
    return j.sessionMode;
  }
  if ((j.panoDrawings && j.panoDrawings.length > 0) || (j.memories && j.memories.length > 0) || j.diary) {
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
    (o.memories === undefined || Array.isArray(o.memories)) &&
    (o.panoDrawings === undefined || Array.isArray(o.panoDrawings)) &&
    (o.diary === undefined || typeof o.diary === "string")
  );
}

export function parseStoredJourneys(raw: unknown): SavedJourney[] {
  return parseJourneyList(raw);
}

function parseJourneyList(raw: unknown): SavedJourney[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isSavedJourney).map((j) => withSessionMode(normalizeJourney(j)));
}

function loadJourneysFromPage(): SavedJourney[] {
  return parseJourneyList(readLegacyJson<unknown>(LEGACY_JOURNEYS_KEY));
}

function loadVisibleFromPage(): string[] {
  const raw = readLegacyJson<unknown>(LEGACY_VISIBLE_KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((id): id is string => typeof id === "string");
}

/** Перенос из page localStorage (если уже сохраняли до chrome.storage). */
async function migrateLegacyStorage(): Promise<void> {
  const existing = await storageGet([JOURNEYS_KEY, VISIBLE_KEY]);
  if (parseJourneyList(existing[JOURNEYS_KEY]).length > 0) {
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
    await storageSet(patch);
  }
}

async function persistJourneyList(list: SavedJourney[]): Promise<boolean> {
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  mirrorJourneysToPage(sorted);
  return storageSet({ [JOURNEYS_KEY]: sorted });
}

export async function loadJourneys(): Promise<SavedJourney[]> {
  await migrateLegacyStorage();
  const data = await storageGet(JOURNEYS_KEY);
  const fromChrome = parseJourneyList(data[JOURNEYS_KEY]);
  if (fromChrome.length > 0) {
    return fromChrome;
  }
  return loadJourneysFromPage();
}

export async function upsertJourney(journey: SavedJourney): Promise<boolean> {
  const list = await loadJourneys();
  const idx = list.findIndex((j) => j.id === journey.id);
  if (idx >= 0) {
    list[idx] = journey;
  } else {
    list.push(journey);
  }
  return persistJourneyList(list);
}

export async function loadVisibleJourneyIds(): Promise<string[]> {
  await migrateLegacyStorage();
  const data = await storageGet(VISIBLE_KEY);
  const raw = data[VISIBLE_KEY];
  if (Array.isArray(raw)) {
    const ids = raw.filter((id): id is string => typeof id === "string");
    if (ids.length > 0) {
      return ids;
    }
  }
  return loadVisibleFromPage();
}

export async function saveVisibleJourneyIds(ids: string[]): Promise<boolean> {
  mirrorVisibleToPage(ids);
  return storageSet({ [VISIBLE_KEY]: ids });
}

export type JourneySyncMeta = {
  pending: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
};

export async function loadJourneySyncMeta(): Promise<JourneySyncMeta> {
  const data = await storageGet(SYNC_META_KEY);
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
  await storageSet({ [SYNC_META_KEY]: meta });
}

export async function markJourneySyncPending(): Promise<void> {
  const prev = await loadJourneySyncMeta();
  await saveJourneySyncMeta({ ...prev, pending: true, lastError: null });
}

export async function saveJourneys(journeys: SavedJourney[]): Promise<boolean> {
  return persistJourneyList(journeys);
}

export async function removeJourneyById(id: string): Promise<boolean> {
  const list = await loadJourneys();
  return persistJourneyList(list.filter((j) => j.id !== id));
}

export async function loadDeletedJourneyIds(): Promise<string[]> {
  const data = await storageGet(DELETED_QUEUE_KEY);
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
    await storageSet({ [DELETED_QUEUE_KEY]: ids });
  }
}

export async function clearDeletedJourneyIds(remove: string[]): Promise<void> {
  if (remove.length === 0) {
    return;
  }
  const removeSet = new Set(remove);
  const ids = (await loadDeletedJourneyIds()).filter((id) => !removeSet.has(id));
  await storageSet({ [DELETED_QUEUE_KEY]: ids });
}

/** Объединить локальные и серверные прогулки (побеждает более свежий updatedAt). */
export function mergeJourneyLists(local: SavedJourney[], remote: SavedJourney[]): SavedJourney[] {
  const byId = new Map<string, SavedJourney>();
  for (const j of local) {
    byId.set(j.id, j);
  }
  for (const j of remote) {
    const prev = byId.get(j.id);
    if (!prev || j.updatedAt >= prev.updatedAt) {
      const merged = normalizeJourney(j);
      if (prev && (!merged.panoDrawings?.length) && prev.panoDrawings?.length) {
        merged.panoDrawings = prev.panoDrawings;
      }
      byId.set(j.id, withSessionMode(merged));
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
