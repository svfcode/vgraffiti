/** Режим страницы: карта (geo) или Street View (панорама). */

export type ViewportMode = "map" | "streetview";

/**
 * Эвристика: Google Maps в режиме панорамы (Street View).
 * При смене режима вызывается watchViewportMode.
 */
export function detectViewportMode(): ViewportMode {
  const href = location.href;
  if (!/google\./i.test(href) || !/\/maps/i.test(href)) {
    return "map";
  }

  if (/@[^/]+,3a,/i.test(href)) {
    return "streetview";
  }
  if (/!3m[^!]*!1e1!/i.test(href) || /!1e1!3m[^!]*!2e/i.test(href)) {
    return "streetview";
  }

  if (
    document.querySelector(
      ".widget-scene, .scene-core-webgl, .widget-scene-canvas, [data-streetview]",
    )
  ) {
    return "streetview";
  }

  const scene = document.querySelector(".widget-scene");
  if (scene && scene.querySelector("canvas")) {
    return "streetview";
  }

  return "map";
}

export function installViewportModeWatcher(onChange: (mode: ViewportMode) => void): () => void {
  let last = detectViewportMode();

  const tick = (): void => {
    const mode = detectViewportMode();
    if (mode === last) {
      return;
    }
    last = mode;
    onChange(mode);
  };

  const obs = new MutationObserver(() => tick());
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  const interval = window.setInterval(tick, 900);
  window.addEventListener("popstate", tick);
  window.addEventListener("hashchange", tick);

  return () => {
    obs.disconnect();
    window.clearInterval(interval);
    window.removeEventListener("popstate", tick);
    window.removeEventListener("hashchange", tick);
  };
}
