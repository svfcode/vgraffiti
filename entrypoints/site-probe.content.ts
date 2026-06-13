import { signalExtensionOnSite } from "../src/lib/site-probe";

/** Сигнал сайту: расширение vgraffiti установлено (см. vgraffiti-tool extension-probe). */
export default defineContentScript({
  matches: [
    "*://vgraffiti.ru/*",
    "*://*.vgraffiti.ru/*",
    "*://vgraffiti.loc/*",
    "*://*.vgraffiti.loc/*",
  ],
  runAt: "document_idle",
  main() {
    signalExtensionOnSite(chrome.runtime.getManifest().version);
  },
});
