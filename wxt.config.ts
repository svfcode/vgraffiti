import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "vgraffiti",
    description: "Рисование поверх уличных панорам (Google Maps) с синхронизацией по REST",
    permissions: ["storage", "alarms"],
    host_permissions: [
      "https://www.google.com/*",
      "https://www.google.ru/*",
      "https://maps.google.com/*",
    ],
    minimum_chrome_version: "120",
    optional_host_permissions: ["https://*/*", "http://*/*"],
  },
});
