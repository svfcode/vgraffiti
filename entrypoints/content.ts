import { mountDrawingOverlay } from "../src/drawing/overlay";

export default defineContentScript({
  matches: [
    "*://www.google.com/maps/*",
    "*://www.google.ru/maps/*",
    "*://maps.google.com/*",
  ],
  runAt: "document_idle",
  main() {
    mountDrawingOverlay();
  },
});
