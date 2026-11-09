// Pure canvas geometry helpers (no DOM), so they can be unit tested.

export const GRID = 5;

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}


export function clampPct(val: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
}

/** Largest 25%-step zoom at which the whole device screen fits the area (with its padding). */
export function fitZoom(areaW: number, areaH: number, deviceW: number, deviceH: number, pad = 66): number {
  const fit = Math.min((areaW - pad) / deviceW, (areaH - pad) / deviceH);
  return Math.max(0.5, Math.min(3, Math.floor(fit * 4) / 4));
}

/** A position moved by (dx, dy), never past the top-left edge of the screen. */
export function nudgePosition(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  return { x: Math.max(0, x + dx), y: Math.max(0, y + dy) };
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The rectangle after dragging `handle` by (dx, dy), in screen pixels.
 * Only the edges that handle owns move. They snap to the 5px grid, never
 * shrink the layer below `min`, and never leave the screen.
 */
export function resizeRect(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: { w: number; h: number },
  min = 5
): Rect {
  let x0 = rect.x;
  let y0 = rect.y;
  let x1 = rect.x + rect.w;
  let y1 = rect.y + rect.h;
  if (handle.includes('w')) x0 = snap(x0 + dx);
  if (handle.includes('e')) x1 = snap(x1 + dx);
  if (handle.includes('n')) y0 = snap(y0 + dy);
  if (handle.includes('s')) y1 = snap(y1 + dy);
  // keep inside the screen
  x0 = Math.max(0, Math.min(x0, bounds.w));
  x1 = Math.max(0, Math.min(x1, bounds.w));
  y0 = Math.max(0, Math.min(y0, bounds.h));
  y1 = Math.max(0, Math.min(y1, bounds.h));
  // the moved edge stops `min` away from the fixed one (it cannot cross it)
  if (x1 - x0 < min) {
    if (handle.includes('w')) x0 = x1 - min;
    else x1 = x0 + min;
  }
  if (y1 - y0 < min) {
    if (handle.includes('n')) y0 = y1 - min;
    else y1 = y0 + min;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A rectangle grown by (dw, dh) from its top-left corner, at least 1px, inside the screen. */
export function resizeBy(rect: Rect, dw: number, dh: number, bounds: { w: number; h: number }): Rect {
  const w = Math.max(1, Math.min(rect.w + dw, bounds.w - rect.x));
  const h = Math.max(1, Math.min(rect.h + dh, bounds.h - rect.y));
  return { ...rect, w, h };
}
