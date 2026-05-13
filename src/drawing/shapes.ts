/** Линия со стрелкой на конце (x1,y1). Толщина — от размера кисти. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  lineWidth: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    return;
  }
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  const headLen = Math.max(lineWidth * 2.8, 10);
  const angle = Math.atan2(dy, dx);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(
    x1 - headLen * Math.cos(angle - spread),
    y1 - headLen * Math.sin(angle - spread),
  );
  ctx.lineTo(
    x1 - headLen * Math.cos(angle + spread),
    y1 - headLen * Math.sin(angle + spread),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Ось-ориентированный прямоугольник по двум углам; обводка — толщина от кисти. */
export function drawSquareStroke(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  lineWidth: number,
): void {
  const xa = Math.min(x0, x1);
  const ya = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (w < 1 && h < 1) {
    return;
  }
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.rect(xa, ya, w, h);
  ctx.stroke();
  ctx.restore();
}
