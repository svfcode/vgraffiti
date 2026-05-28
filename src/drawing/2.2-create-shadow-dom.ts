import panelCss from "./panel/2.2.2-panel.css?raw";
import panelMarkup from "./panel/2.2.1-panel.html?raw";
import { Z_OVERLAY } from "./2.1-overlay-types";

export type ShadowDomElements = {
  host: HTMLDivElement;
  root: HTMLDivElement;
  bar: HTMLDivElement;
};

export function createShadowDom(): ShadowDomElements {
  const host = document.createElement("div");
  host.setAttribute("data-vgraffiti-overlay", "1");
  host.style.setProperty("all", "initial");
  host.style.setProperty("position", "fixed");
  host.style.setProperty("inset", "0");
  host.style.setProperty("z-index", String(Z_OVERLAY));
  host.style.setProperty("pointer-events", "none");

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = panelCss;
  shadow.appendChild(styleEl);

  const root = document.createElement("div");
  root.className = "root";

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.id = "vgf-bar";
  bar.innerHTML = panelMarkup;

  shadow.appendChild(root);

  return { host, root, bar };
}
