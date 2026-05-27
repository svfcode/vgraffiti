import { ensureMapBridgeInstalled } from "../src/lib/map-live-probe";

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
  world: "MAIN",
  runAt: "document_start",
  main() {
    ensureMapBridgeInstalled();
  },
});
