/** Маркер на странице сайта: расширение установлено и content script активен. */
export const SITE_EXTENSION_MARKER = "vgraffitiExtension";

export const SITE_EXTENSION_READY_EVENT = "vgraffiti:ready";

export function signalExtensionOnSite(version: string): void {
  document.documentElement.dataset[SITE_EXTENSION_MARKER] = "1";
  document.dispatchEvent(
    new CustomEvent(SITE_EXTENSION_READY_EVENT, {
      detail: { version },
    }),
  );
}
