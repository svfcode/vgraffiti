import { STORAGE_ACCESS_TOKEN } from "../../auth/constants";
import { getSession } from "../../auth/session";
import { STORAGE_API_BASE } from "../../lib/constants";
import { formatBgError } from "../../lib/extension-api";
import { bgSyncJourneys, type JourneySyncResponse } from "../../lib/journey-cloud-api";
import { cloneStrokes, type DrawingOverlayHost } from "../2.1-overlay-types";
import {
  isJourneyDirty,
  setJourneyBaseline,
  syncJourneyDirtyIndicator,
  syncJourneyPanel,
} from "../handlers/2.6.5-handle-journeys";
import {
  loadJourneySyncMeta,
  loadJourneys,
  loadVisibleJourneyIds,
  markJourneySyncPending,
  saveJourneySyncMeta,
  saveJourneys,
  saveVisibleJourneyIds,
  type SavedJourney,
} from "./journey-storage";

export type CloudSyncUiState = "guest" | "no-api" | "idle" | "pending" | "syncing" | "error";

const SYNC_DEBOUNCE_MS = 1500;
const SYNC_INTERVAL_MS = 60_000;

let debounceTimer = 0;
let intervalTimer = 0;
let syncInFlight = false;
let applyingRemote = false;
let boundHost: DrawingOverlayHost | null = null;

function parseJourneyList(raw: unknown): SavedJourney[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (j): j is SavedJourney =>
      !!j &&
      typeof j === "object" &&
      typeof (j as SavedJourney).id === "string" &&
      typeof (j as SavedJourney).name === "string" &&
      Array.isArray((j as SavedJourney).strokes) &&
      typeof (j as SavedJourney).createdAt === "number" &&
      typeof (j as SavedJourney).updatedAt === "number",
  );
}

function cloudTitle(state: CloudSyncUiState, error: string | null, email: string | null): string {
  switch (state) {
    case "guest":
      return "Облако: войдите в расширении vgraffiti";
    case "no-api":
      return "Облако: укажите URL API в окне расширения";
    case "syncing":
      return "Синхронизация с облаком…";
    case "pending":
      return "Есть изменения — скоро отправим в облако";
    case "error":
      return error ? `Ошибка синхронизации: ${error}` : "Ошибка синхронизации — нажмите для повтора";
    case "idle":
      return email ? `Синхронизировано (${email})` : "Синхронизировано с облаком";
  }
}

export function updateCloudSyncUi(
  host: DrawingOverlayHost,
  state: CloudSyncUiState,
  opts?: { lastError?: string | null; email?: string | null },
): void {
  const btn = host.cloudSyncBtn;
  const error = opts?.lastError ?? null;
  btn.dataset.state = state;
  btn.title = cloudTitle(state, error, opts?.email ?? null);
  btn.setAttribute("aria-label", btn.title);
  btn.disabled = state === "syncing";
}

async function resolveCloudUiState(): Promise<{
  state: CloudSyncUiState;
  email: string | null;
  meta: Awaited<ReturnType<typeof loadJourneySyncMeta>>;
}> {
  const [session, apiData, meta] = await Promise.all([
    getSession(),
    chrome.storage.local.get(STORAGE_API_BASE),
    loadJourneySyncMeta(),
  ]);
  const apiBase =
    typeof apiData[STORAGE_API_BASE] === "string" ? apiData[STORAGE_API_BASE] : null;
  if (!apiBase) {
    return { state: "no-api", email: session.email, meta };
  }
  if (!session.accessToken) {
    return { state: "guest", email: null, meta };
  }
  if (syncInFlight) {
    return { state: "syncing", email: session.email, meta };
  }
  if (meta.pending) {
    return { state: "pending", email: session.email, meta };
  }
  if (meta.lastError) {
    return { state: "error", email: session.email, meta };
  }
  return { state: "idle", email: session.email, meta };
}

export async function refreshCloudSyncUi(host: DrawingOverlayHost): Promise<void> {
  const { state, email, meta } = await resolveCloudUiState();
  updateCloudSyncUi(host, state, { lastError: meta.lastError, email });
}

async function applySyncResponse(host: DrawingOverlayHost, data: JourneySyncResponse): Promise<void> {
  const journeys = parseJourneyList(data.journeys);
  const visibleIds = Array.isArray(data.visible_client_ids)
    ? data.visible_client_ids.filter((id): id is string => typeof id === "string")
    : [];

  applyingRemote = true;
  try {
    await saveJourneys(journeys);
    await saveVisibleJourneyIds(visibleIds);
  } finally {
    applyingRemote = false;
  }

  host.savedJourneys = await loadJourneys();
  host.selectedJourneyIds = new Set(await loadVisibleJourneyIds());

  const activeId = host.activeJourney?.id;
  if (activeId && !isJourneyDirty(host)) {
    const remote = host.savedJourneys.find((j) => j.id === activeId);
    if (remote && host.activeJourney) {
      host.activeJourney.name = remote.name;
      host.strokes.splice(0, host.strokes.length, ...cloneStrokes(remote.strokes));
      host.journeyNameEl.value = remote.name;
      setJourneyBaseline(host);
    }
  }

  syncJourneyPanel(host);
  syncJourneyDirtyIndicator(host);
  host.syncStrokesToBridge();
  host.scheduleRedraw();
}

export async function runJourneyCloudSync(host: DrawingOverlayHost, force = false): Promise<void> {
  if (syncInFlight) {
    return;
  }

  const session = await getSession();
  const apiBase = await chrome.storage.local.get(STORAGE_API_BASE);
  const hasApi =
    typeof apiBase[STORAGE_API_BASE] === "string" && apiBase[STORAGE_API_BASE].length > 0;
  if (!hasApi || !session.accessToken) {
    await refreshCloudSyncUi(host);
    return;
  }

  const meta = await loadJourneySyncMeta();
  if (!force && !meta.pending && meta.lastSyncAt && Date.now() - meta.lastSyncAt < 5000) {
    return;
  }

  syncInFlight = true;
  updateCloudSyncUi(host, "syncing", { email: session.email });

  try {
    const [journeys, visibleIds] = await Promise.all([loadJourneys(), loadVisibleJourneyIds()]);
    const result = await bgSyncJourneys({
      journeys,
      visible_client_ids: visibleIds,
    });

    if (!result.ok) {
      const err = formatBgError(result);
      await saveJourneySyncMeta({
        pending: true,
        lastSyncAt: meta.lastSyncAt,
        lastError: err,
      });
      updateCloudSyncUi(host, "error", { lastError: err, email: session.email });
      return;
    }

    if (result.data) {
      await applySyncResponse(host, result.data);
    }

    await saveJourneySyncMeta({
      pending: false,
      lastSyncAt: Date.now(),
      lastError: null,
    });
    updateCloudSyncUi(host, "idle", { email: session.email });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await saveJourneySyncMeta({
      pending: true,
      lastSyncAt: meta.lastSyncAt,
      lastError: err,
    });
    updateCloudSyncUi(host, "error", { lastError: err, email: session.email });
  } finally {
    syncInFlight = false;
  }
}

export function scheduleJourneyCloudSync(host: DrawingOverlayHost, force = false): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    void runJourneyCloudSync(host, force);
  }, force ? 0 : SYNC_DEBOUNCE_MS);
}

export async function notifyJourneyCloudChanged(host: DrawingOverlayHost): Promise<void> {
  if (applyingRemote || syncInFlight) {
    return;
  }
  await markJourneySyncPending();
  await refreshCloudSyncUi(host);
  scheduleJourneyCloudSync(host);
}

export function initJourneyCloudSync(host: DrawingOverlayHost): () => void {
  boundHost = host;

  host.cloudSyncBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void runJourneyCloudSync(host, true);
  });
  host.cloudSyncBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

  void refreshCloudSyncUi(host);
  scheduleJourneyCloudSync(host, true);

  intervalTimer = window.setInterval(() => {
    void runJourneyCloudSync(host);
  }, SYNC_INTERVAL_MS);

  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== "local" || !boundHost) {
      return;
    }
    if (changes[STORAGE_ACCESS_TOKEN] || changes[STORAGE_API_BASE]) {
      void refreshCloudSyncUi(boundHost);
      scheduleJourneyCloudSync(boundHost);
      return;
    }
    if (!applyingRemote && !syncInFlight && (changes.journeys || changes.journeyVisible)) {
      void markJourneySyncPending().then(() => refreshCloudSyncUi(boundHost!));
      scheduleJourneyCloudSync(boundHost);
    }
  };
  chrome.storage.onChanged.addListener(onStorage);

  return () => {
    boundHost = null;
    window.clearTimeout(debounceTimer);
    window.clearInterval(intervalTimer);
    chrome.storage.onChanged.removeListener(onStorage);
  };
}
