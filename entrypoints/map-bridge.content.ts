import { runMapBridge } from "../src/lib/map-bridge-main";

/**
 * Мост к карте в MAIN world: читает живые center/zoom из `ymaps` и шлёт их
 * overlay'ю через postMessage. Отдельный контент-скрипт (а не inline-`<script>`),
 * чтобы не блокироваться CSP Яндекс/Google Карт. `document_start` — чтобы успеть
 * пропатчить `ymaps.Map` до создания карты.
 */
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
  runAt: "document_start",
  world: "MAIN",
  main() {
    runMapBridge();
  },
});
