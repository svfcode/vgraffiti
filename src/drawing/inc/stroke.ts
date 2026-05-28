import getStroke from "perfect-freehand";

export type StrokePoint = [number, number, number];

function pressureFromPointer(ev: PointerEvent): number {
  if (ev.pointerType === "pen" || ev.pointerType === "touch") {
    const p = ev.pressure;
    if (typeof p === "number" && p > 0) {
      return Math.min(1, Math.max(0.05, p));
    }
    return 0.5;
  }
  return 0.5;
}

/** Точки в координатах CSS относительно canvas (уже с учётом getBoundingClientRect). */
export function pointFromEvent(
  ev: PointerEvent,
  canvas: HTMLCanvasElement,
): StrokePoint {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  return [x, y, pressureFromPointer(ev)];
}

export function coalescedOrSelf(ev: PointerEvent): PointerEvent[] {
  const list = ev.getCoalescedEvents?.();
  if (list && list.length > 0) {
    return list;
  }
  return [ev];
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  options: { color: string; size: number },
): void {
  if (points.length < 2) {
    return;
  }
  const outline = getStroke(points, {
    size: options.size,
    thinning: 0.65,
    smoothing: 0.55,
    streamline: 0.55,
    simulatePressure: false,
    easing: (t) => t,
  });
  if (outline.length < 2) {
    return;
  }
  ctx.fillStyle = options.color;
  ctx.beginPath();
  const [fx, fy] = outline[0]!;
  ctx.moveTo(fx, fy);
  for (let i = 1; i < outline.length; i++) {
    const [x, y] = outline[i]!;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Ластик: вычитание альфы по контуру штриха (как кисть). */
export function renderEraserStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  size: number,
): void {
  if (points.length < 2) {
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  renderStroke(ctx, points, { color: "#ffffff", size });
  ctx.restore();
}
