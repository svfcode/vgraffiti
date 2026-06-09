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
/** Bridge → overlay: визуальный зум (deltaZ + pivot) пока URL z не догнал. */
export const ZOOM_VISUAL_MSG = "vgf:mapZoomVisual";
/** Overlay → bridge: перенести центр карты к lat/lng. */
export const SET_CENTER_MSG = "vgf:mapSetCenter";
/** Overlay → bridge: перейти к ракурсу Street View (Google Maps). */
export const SET_STREET_VIEW_POV_MSG = "vgf:streetViewSetPov";
/** Bridge → overlay: pano id из URL или сетевых ответов Google. */
export const PANO_CONTEXT_MSG = "vgf:panoContext";

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

export type ZoomVisualMessage = {
  type: typeof ZOOM_VISUAL_MSG;
  deltaZ: number;
  pivotX: number;
  pivotY: number;
  anchor: { provider: "yandex" | "google"; lat: number; lng: number; zoom: number | null };
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

export type SetCenterMessage = {
  type: typeof SET_CENTER_MSG;
  lat: number;
  lng: number;
  zoom?: number;
};

export type SetStreetViewPovMessage = {
  type: typeof SET_STREET_VIEW_POV_MSG;
  lat: number;
  lng: number;
  fov: number;
  heading: number;
  pitch: number;
};
