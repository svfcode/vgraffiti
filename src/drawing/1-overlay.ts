import { DrawingOverlay } from "./2-drawing-overlay";

export function mountDrawingOverlay(onInvalidate?: (teardown: () => void) => void): void {
  DrawingOverlay.mount(onInvalidate);
}
