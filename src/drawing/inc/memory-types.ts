import type { StreetViewContext } from "../../lib/streetview-context";
import type { StoredStroke } from "../2.1-overlay-types";

/** Нормализованная точка на панораме 0…1 (legacy, для холста на стене). */
export type NormPoint = [u: number, v: number];

/** Рисунок на «стене» — привязан к ракурсу места. */
export type WallCanvas = {
  anchor: StreetViewContext;
  u: number;
  v: number;
  w: number;
  h: number;
  strokes: StoredStroke[];
  offsetU?: number;
  offsetV?: number;
};

/** Место в прогулке: ракурс панорамы + описание + холсты. */
export type WalkLocation = {
  id: string;
  anchor: StreetViewContext;
  text: string;
  title?: string;
  createdAt: number;
  canvases: WallCanvas[];
  /** @deprecated legacy envelope UV */
  u?: number;
  v?: number;
  /** @deprecated один холст в старом конверте */
  wallCanvas?: WallCanvas;
  sketch?: StoredStroke[];
};

/** @deprecated используйте WalkLocation */
export type MemoryStop = WalkLocation;

export function cloneLocations(src: WalkLocation[]): WalkLocation[] {
  return structuredClone(src) as WalkLocation[];
}

/** @deprecated */
export const cloneMemories = cloneLocations;

export function isWallCanvas(v: unknown): v is WallCanvas {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  const a = o.anchor as Record<string, unknown> | undefined;
  return (
    typeof o.u === "number" &&
    typeof o.v === "number" &&
    typeof o.w === "number" &&
    typeof o.h === "number" &&
    Array.isArray(o.strokes) &&
    !!a &&
    typeof a.lat === "number" &&
    typeof a.lng === "number" &&
    typeof a.heading === "number" &&
    typeof a.pitch === "number" &&
    typeof a.fov === "number"
  );
}

function collectCanvases(o: Record<string, unknown>): WallCanvas[] {
  const out: WallCanvas[] = [];
  if (Array.isArray(o.canvases)) {
    for (const c of o.canvases) {
      if (isWallCanvas(c)) {
        out.push(c);
      }
    }
  }
  if (o.wallCanvas && isWallCanvas(o.wallCanvas)) {
    const legacy = o.wallCanvas;
    if (!out.some((c) => c === legacy)) {
      out.push(legacy);
    }
  }
  return out;
}

export function locationHasFilledCanvas(loc: WalkLocation): boolean {
  return loc.canvases.some((c) => c.strokes.length > 0);
}

export function filledCanvases(loc: WalkLocation): WallCanvas[] {
  return loc.canvases.filter((c) => c.strokes.length > 0);
}

export function firstFilledCanvas(loc: WalkLocation): WallCanvas | null {
  return filledCanvases(loc)[0] ?? null;
}

/** Приводит место к актуальной схеме (legacy конверты). */
export function normalizeWalkLocation(v: unknown): WalkLocation | null {
  if (!v || typeof v !== "object") {
    return null;
  }
  const o = v as Record<string, unknown>;
  const a = o.anchor;
  if (!a || typeof a !== "object") {
    return null;
  }
  const ar = a as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.text !== "string" ||
    typeof ar.lat !== "number" ||
    typeof ar.lng !== "number"
  ) {
    return null;
  }
  const loc: WalkLocation = {
    id: o.id,
    text: o.text,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    anchor: {
      provider: "google",
      lat: ar.lat,
      lng: ar.lng,
      heading: typeof ar.heading === "number" ? ar.heading : 0,
      pitch: typeof ar.pitch === "number" ? ar.pitch : 90,
      fov: typeof ar.fov === "number" && ar.fov > 0 ? ar.fov : 90,
    },
    canvases: collectCanvases(o),
  };
  if (typeof o.title === "string" && o.title.trim()) {
    loc.title = o.title.trim();
  }
  if (typeof o.u === "number") {
    loc.u = o.u;
  }
  if (typeof o.v === "number") {
    loc.v = o.v;
  }
  if (Array.isArray(o.sketch)) {
    loc.sketch = o.sketch as WalkLocation["sketch"];
  }
  return loc;
}

/** @deprecated */
export const normalizeMemoryStop = normalizeWalkLocation;

export function isWalkLocation(v: unknown): v is WalkLocation {
  return normalizeWalkLocation(v) != null;
}

/** @deprecated */
export const isMemoryStop = isWalkLocation;
