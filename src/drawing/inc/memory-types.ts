import type { StreetViewContext } from "../../lib/streetview-context";
import type { StoredStroke } from "../2.1-overlay-types";

/** Нормализованная точка на панораме 0…1. */
export type NormPoint = [u: number, v: number];

/** Рисунок на «стене» — хранится внутри конверта в свёрнутом виде. */
export type WallCanvas = {
  anchor: StreetViewContext;
  /** Верхний левый угол холста в UV панорамы. */
  u: number;
  v: number;
  w: number;
  h: number;
  /** Штрихи в streetview (heading/pitch) — привязка к ракурсу. */
  strokes: StoredStroke[];
  /** Ручная подстройка после разворота (UV). */
  offsetU?: number;
  offsetV?: number;
};

/** Конверт с запиской и опциональным холстом внутри. */
export type MemoryStop = {
  id: string;
  anchor: StreetViewContext;
  u: number;
  v: number;
  text: string;
  title?: string;
  createdAt: number;
  wallCanvas?: WallCanvas;
  /** @deprecated legacy fullscreen sketch */
  sketch?: StoredStroke[];
};

export function cloneMemories(src: MemoryStop[]): MemoryStop[] {
  return structuredClone(src) as MemoryStop[];
}

function isWallCanvas(v: unknown): v is WallCanvas {
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

export function isMemoryStop(v: unknown): v is MemoryStop {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  const a = o.anchor as Record<string, unknown> | undefined;
  return (
    typeof o.id === "string" &&
    typeof o.u === "number" &&
    typeof o.v === "number" &&
    typeof o.text === "string" &&
    typeof o.createdAt === "number" &&
    !!a &&
    typeof a.lat === "number" &&
    typeof a.lng === "number" &&
    typeof a.heading === "number" &&
    typeof a.pitch === "number" &&
    typeof a.fov === "number" &&
    (o.wallCanvas === undefined || isWallCanvas(o.wallCanvas))
  );
}
