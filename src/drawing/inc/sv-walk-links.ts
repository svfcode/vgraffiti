import { SV_WALK_LINKS_MSG } from "../../lib/map-bridge-protocol";
import { readSvWalkLinksAlways, writeSvWalkLinksAlways } from "../../lib/sv-prefs";
import type { DrawingOverlayHost } from "../2.1-overlay-types";

export function broadcastSvWalkLinks(enabled: boolean): void {
  window.postMessage({ type: SV_WALK_LINKS_MSG, enabled }, "*");
}

export function syncSvWalkLinksSetting(host: DrawingOverlayHost): void {
  const enabled = readSvWalkLinksAlways();
  if (host.svWalkLinksEl) {
    host.svWalkLinksEl.checked = enabled;
  }
  if (host.viewportMode === "streetview") {
    broadcastSvWalkLinks(enabled);
  }
}

export function bindSvWalkLinksSetting(host: DrawingOverlayHost): void {
  const input = host.svWalkLinksEl;
  if (!input) {
    return;
  }
  syncSvWalkLinksSetting(host);
  input.addEventListener("change", () => {
    const enabled = input.checked;
    writeSvWalkLinksAlways(enabled);
    if (host.viewportMode === "streetview") {
      broadcastSvWalkLinks(enabled);
    }
  });
}
