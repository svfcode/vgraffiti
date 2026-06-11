import { DrawingOverlay } from "./2-drawing-overlay";
import {
  isAuthedForOverlay,
  mountGuestPrompt,
  watchSessionForOverlay,
} from "./guest-prompt";

export function mountDrawingOverlay(onInvalidate?: (teardown: () => void) => void): void {
  void mountDrawingOverlayAsync(onInvalidate);
}

let overlayMountStarted = false;

async function mountDrawingOverlayAsync(
  onInvalidate?: (teardown: () => void) => void,
): Promise<void> {
  if (document.querySelector("[data-vgraffiti-overlay]") || overlayMountStarted) {
    return;
  }

  if (!(await isAuthedForOverlay())) {
    mountGuestPrompt(onInvalidate);
    watchSessionForOverlay(() => {
      if (document.querySelector("[data-vgraffiti-overlay]") || overlayMountStarted) {
        return;
      }
      overlayMountStarted = true;
      document.querySelector("[data-vgraffiti-guest]")?.remove();
      DrawingOverlay.mount(onInvalidate);
    }, onInvalidate);
    return;
  }

  overlayMountStarted = true;
  DrawingOverlay.mount(onInvalidate);
}
