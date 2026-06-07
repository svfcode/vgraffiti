import type { DrawingOverlayHost } from "../2.1-overlay-types";
import { ignoreIfContextInvalidated } from "../../lib/extension-context";
import { locateJourneyById, switchToJourneyId } from "../handlers/2.6.5-handle-journeys";
import { loadJourneys } from "./journey-storage";
import { runJourneyCloudSync } from "./journey-cloud-sync";

/** Параметр URL из профиля / плагина (vgf_journey=client_id). */
export const JOURNEY_URL_PARAM = "vgf_journey";

let lastHandledId: string | null = null;

export function readJourneyIdFromUrl(href = location.href): string | null {
  try {
    const url = new URL(href);
    const id = url.searchParams.get(JOURNEY_URL_PARAM);
    if (id && /^j_[a-zA-Z0-9_-]{2,64}$/.test(id)) {
      return id;
    }
  } catch {
    /* ignore */
  }
  const m = href.match(/[?&#]vgf_journey=(j_[a-zA-Z0-9_-]+)/);
  return m ? m[1]! : null;
}

function stripJourneyParamFromUrl(): void {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has(JOURNEY_URL_PARAM)) {
      return;
    }
    url.searchParams.delete(JOURNEY_URL_PARAM);
    const next = url.pathname + url.search + url.hash;
    history.replaceState(null, "", next || location.pathname);
  } catch {
    /* ignore */
  }
}

/**
 * Открытие карты по ссылке из профиля: сделать прогулку активной и показать на карте.
 */
export async function applyJourneyDeepLink(host: DrawingOverlayHost): Promise<void> {
  const id = readJourneyIdFromUrl();
  if (!id) {
    return;
  }
  if (id === lastHandledId && host.activeJourney?.id === id) {
    return;
  }

  const tryActivate = async (): Promise<boolean> => {
    if (host.activeJourney?.id === id) {
      locateJourneyById(host, id);
      return true;
    }
    const ok = await switchToJourneyId(host, id, {
      skipDirtyConfirm: true,
      locate: true,
    });
    return ok;
  };

  let ok = await tryActivate();
  if (!ok) {
    try {
      await runJourneyCloudSync(host, true);
      host.savedJourneys = await loadJourneys();
      ok = await tryActivate();
    } catch (e) {
      if (!ignoreIfContextInvalidated(e)) {
        throw e;
      }
    }
  }

  if (ok) {
    lastHandledId = id;
    stripJourneyParamFromUrl();
  }
}

export function initJourneyDeepLink(host: DrawingOverlayHost): () => void {
  const onUrl = (): void => {
    void applyJourneyDeepLink(host).catch((e) => {
      if (!ignoreIfContextInvalidated(e)) {
        console.error("[vgraffiti] journey deep link failed", e);
      }
    });
  };
  window.addEventListener("popstate", onUrl);
  window.addEventListener("hashchange", onUrl);
  return () => {
    window.removeEventListener("popstate", onUrl);
    window.removeEventListener("hashchange", onUrl);
  };
}
