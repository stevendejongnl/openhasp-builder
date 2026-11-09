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
