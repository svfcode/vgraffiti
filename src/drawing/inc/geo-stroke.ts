import type { MapContext } from "../../lib/map-context";
import {
  getMapViewportFrame,
  mapGeoToScreen,
  mapZoom,
  screenToMapGeo,
  strokeSizeAtZoom,
  type ViewportFrame,
} from "../../lib/map-projection";
import type { StrokePoint } from "./stroke";
import type { GeoPoint, StoredStroke } from "../2.1-overlay-types";

export function screenPointToGeo(
  x: number,
  y: number,
  pressure: number,
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
): GeoPoint {
  const { lat, lng } = screenToMapGeo(x, y, map, frame);
  return [lat, lng, pressure];
}

export function geoPointToScreen(
  point: GeoPoint,
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
): StrokePoint {
  const { x, y } = mapGeoToScreen(point[0], point[1], map, frame);
  return [x, y, point[2]];
}

export function screenPointsToGeo(
  points: StrokePoint[],
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
): GeoPoint[] {
  return points.map(([x, y, p]) => screenPointToGeo(x, y, p, map, frame));
}

export function geoPointsToScreen(
  points: GeoPoint[],
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
): StrokePoint[] {
  return points.map((pt) => geoPointToScreen(pt, map, frame));
}

export function scaledStrokeSize(stroke: StoredStroke, map: MapContext): number {
  const z = mapZoom(map);
  if (stroke.kind === "brush") {
    return strokeSizeAtZoom(stroke.size, stroke.zoom, z);
  }
  if (stroke.kind === "eraser") {
    return strokeSizeAtZoom(stroke.size, stroke.zoom, z);
  }
  return strokeSizeAtZoom(stroke.lw, stroke.zoom, z);
}

export function projectStoredStroke(
  stroke: StoredStroke,
  map: MapContext,
  frame: ViewportFrame = getMapViewportFrame(),
):
  | { kind: "brush"; points: StrokePoint[]; color: string; size: number }
  | { kind: "eraser"; points: StrokePoint[]; size: number }
  | { kind: "arrow"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number }
  | { kind: "square"; x0: number; y0: number; x1: number; y1: number; color: string; lw: number } {
  const size = scaledStrokeSize(stroke, map);
  if (stroke.kind === "brush") {
    return {
      kind: "brush",
      points: geoPointsToScreen(stroke.points, map, frame),
      color: stroke.color,
      size,
    };
  }
  if (stroke.kind === "eraser") {
    return {
      kind: "eraser",
      points: geoPointsToScreen(stroke.points, map, frame),
      size,
    };
  }
  const p0 = mapGeoToScreen(stroke.lat0, stroke.lng0, map, frame);
  const p1 = mapGeoToScreen(stroke.lat1, stroke.lng1, map, frame);
  if (stroke.kind === "arrow") {
    return {
      kind: "arrow",
      x0: p0.x,
      y0: p0.y,
      x1: p1.x,
      y1: p1.y,
      color: stroke.color,
      lw: size,
    };
  }
  return {
    kind: "square",
    x0: p0.x,
    y0: p0.y,
    x1: p1.x,
    y1: p1.y,
    color: stroke.color,
    lw: size,
  };
}
