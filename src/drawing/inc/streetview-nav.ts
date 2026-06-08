import { SET_STREET_VIEW_POV_MSG } from "../../lib/map-bridge-protocol";
import {
  readStreetViewContext,
  type StreetViewContext,
} from "../../lib/streetview-context";
import { classifyPovMatch } from "./view-memory";

const NAV_TIMEOUT_MS = 4000;
const NAV_POLL_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Запрос MAIN-world мосту сменить ракурс Street View через URL. */
export function broadcastStreetViewPov(anchor: StreetViewContext): void {
  const detail = {
    lat: anchor.lat,
    lng: anchor.lng,
    fov: anchor.fov,
    heading: anchor.heading,
    pitch: anchor.pitch,
  };
  document.dispatchEvent(new CustomEvent(SET_STREET_VIEW_POV_MSG, { detail }));
  window.postMessage(
    {
      type: SET_STREET_VIEW_POV_MSG,
      ...detail,
    },
    "*",
  );
}

export async function waitForStreetViewPov(
  anchor: StreetViewContext,
  timeoutMs = NAV_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = readStreetViewContext();
    if (current && classifyPovMatch(anchor, current) === "exact") {
      return true;
    }
    await sleep(NAV_POLL_MS);
  }
  return false;
}

/** Переходит к сохранённому ракурсу; возвращает false, если URL не обновился вовремя. */
export async function navigateToStreetViewPov(anchor: StreetViewContext): Promise<boolean> {
  const current = readStreetViewContext();
  if (current && classifyPovMatch(anchor, current) === "exact") {
    return true;
  }
  broadcastStreetViewPov(anchor);
  return waitForStreetViewPov(anchor);
}
