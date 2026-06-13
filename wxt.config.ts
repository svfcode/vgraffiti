import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "vgraffiti",
    description: "Запомнят все, запомнят всё! Рисуйте на Street View и картах — метки остаются на маршруте.",
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
      "https://vgraffiti.ru/*",
      "https://*.vgraffiti.ru/*",
      "http://vgraffiti.loc/*",
      "http://*.vgraffiti.loc/*",
      "https://vgraffiti.loc/*",
      "https://*.vgraffiti.loc/*",
    ],
    minimum_chrome_version: "120",
    optional_host_permissions: ["https://*/*", "http://*/*"],
  },
});
