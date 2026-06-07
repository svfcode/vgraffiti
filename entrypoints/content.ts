import { mountDrawingOverlay } from "../src/drawing/1-overlay";

export default defineContentScript({
  matches: [
    "*://www.google.com/maps/*",
    "*://www.google.ru/maps/*",
    "*://maps.google.com/*",
    "*://yandex.ru/maps/*",
    "*://yandex.com/maps/*",
    "*://yandex.by/maps/*",
    "*://yandex.kz/maps/*",
    "*://maps.yandex.ru/*",
  ],
  runAt: "document_idle",
  main(ctx) {
    mountDrawingOverlay((teardown) => {
      ctx.onInvalidated(teardown);
    });
  },
});
