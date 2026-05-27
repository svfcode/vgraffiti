import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "vgraffiti",
    description: "Рисование поверх карт (Google Maps, Яндекс.Карты) с синхронизацией по REST",
    permissions: ["storage", "alarms"],
    host_permissions: [
      "https://www.google.com/*",
      "https://www.google.ru/*",
      "https://maps.google.com/*",
      "https://yandex.ru/*",
      "https://yandex.com/*",
      "https://yandex.by/*",
      "https://yandex.kz/*",
      "https://maps.yandex.ru/*",
      "http://drawonit.loc/*",
      "http://*.drawonit.loc/*",
      "https://drawonit.loc/*",
      "https://*.drawonit.loc/*",
    ],
    minimum_chrome_version: "120",
    optional_host_permissions: ["https://*/*", "http://*/*"],
  },
});
