import type { SavedJourney } from "../drawing/inc/journey-storage";
import { sendToBackground, type BgResult } from "./extension-api";

export type JourneySyncPayload = {
  journeys: SavedJourney[];
  visible_client_ids: string[];
  deleted_client_ids?: string[];
};

export type JourneySyncResponse = {
  journeys: SavedJourney[];
  visible_client_ids: string[];
  synced_at?: string;
};

export async function bgSyncJourneys(payload: JourneySyncPayload): Promise<BgResult<JourneySyncResponse>> {
  return sendToBackground({
    type: "api.syncJourneys",
    journeys: payload.journeys,
    visibleClientIds: payload.visible_client_ids,
    deletedClientIds: payload.deleted_client_ids ?? [],
  }) as Promise<BgResult<JourneySyncResponse>>;
}
