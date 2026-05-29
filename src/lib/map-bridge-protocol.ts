/** Протокол обмена между MAIN-world мостом и изолированным контент-скриптом. */

export const LIVE_MSG = "vgf:mapLiveUpdate";
export const FOLLOW_MSG = "vgf:setMapFollow";
export const PAN_VISUAL_MSG = "vgf:mapPanVisual";
export const INSTALL_FLAG = "__vgfMapLiveInstalled";

/** Overlay → bridge: завершённые штрихи в гео-координатах для нативного слоя ymaps. */
export const STROKES_MSG = "vgf:mapStrokes";
/** Bridge → overlay: режим рендеринга (native = ymaps рисует объекты сам). */
export const RENDER_MODE_MSG = "vgf:mapRenderMode";
/** Bridge → overlay: идёт анимация зума (нет реального масштаба по кадрам). */
export const ZOOM_STATE_MSG = "vgf:mapZoomState";

/** Гео-штрих для нативного рендера (подмножество StoredStroke без pressure). */
export type GeoStrokePayload =
  | { kind: "brush"; coords: [number, number][]; color: string; width: number }
  | { kind: "arrow"; coords: [number, number][]; color: string; width: number }
  | {
      kind: "square";
      lat0: number;
      lng0: number;
      lat1: number;
      lng1: number;
      color: string;
      width: number;
    };

export type StrokesMessage = {
  type: typeof STROKES_MSG;
  strokes: GeoStrokePayload[];
};

export type RenderModeMessage = {
  type: typeof RENDER_MODE_MSG;
  native: boolean;
};

export type ZoomStateMessage = {
  type: typeof ZOOM_STATE_MSG;
  zooming: boolean;
};

export type LiveMapMessage = {
  type: typeof LIVE_MSG;
  map: { provider: "yandex" | "google"; lat: number; lng: number; zoom: number | null };
};

export type PanVisualMessage = {
  type: typeof PAN_VISUAL_MSG;
  dx: number;
  dy: number;
  dragging: boolean;
};

export type FollowMessage = {
  type: typeof FOLLOW_MSG;
  active: boolean;
  map: { provider: string; lat: number; lng: number; zoom?: number } | null;
};
