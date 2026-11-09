import { describe, expect, it } from 'vitest';
import { clampPct, fitZoom, nudgePosition, snap } from './geometry';

describe('snap (5px grid)', () => {
  it('rounds to the nearest multiple of 5', () => {
    expect(snap(7)).toBe(5);
    expect(snap(8)).toBe(10);
    expect(snap(2)).toBe(0);
    expect(snap(0)).toBe(0);
  });
});

describe('clampPct', () => {
  it('maps a value in [min,max] to 0..100', () => {
    expect(clampPct(25, 0, 100)).toBe(25);
    expect(clampPct(5, 0, 10)).toBe(50);
  });
  it('clamps out-of-range values', () => {
    expect(clampPct(-5, 0, 100)).toBe(0);
    expect(clampPct(500, 0, 100)).toBe(100);
  });
  it('returns 0 for an empty or inverted range instead of dividing by zero', () => {
    expect(clampPct(5, 10, 10)).toBe(0);
    expect(clampPct(5, 10, 0)).toBe(0);
  });
});

describe('fitZoom', () => {
  it('picks the largest 25% step that fits the tighter side', () => {
    // (1000-66)/480 = 1.95, (800-66)/480 = 1.53 -> 1.5
    expect(fitZoom(1000, 800, 480, 480)).toBe(1.5);
  });
  it('never goes below 50% or above 300%', () => {
    expect(fitZoom(100, 100, 480, 480)).toBe(0.5);
    expect(fitZoom(9000, 9000, 480, 480)).toBe(3);
  });
});

describe('nudgePosition', () => {
  it('moves by the delta', () => {
    expect(nudgePosition(10, 20, 5, -5)).toEqual({ x: 15, y: 15 });
  });
  it('never moves a layer past the top-left edge', () => {
    expect(nudgePosition(2, 3, -5, -5)).toEqual({ x: 0, y: 0 });
  });
});

import { resizeBy, resizeRect, type Rect } from './geometry';

describe('resizeRect (dragging a selection handle)', () => {
  const screen = { w: 480, h: 480 };
  const card: Rect = { x: 100, y: 100, w: 160, h: 75 };

  it('the east handle moves only the right edge, snapped to the grid', () => {
    expect(resizeRect(card, 'e', 22, 99, screen)).toEqual({ x: 100, y: 100, w: 180, h: 75 }); // 260+22=282 -> 280
  });
  it('the west handle moves the left edge and keeps the right edge fixed', () => {
    expect(resizeRect(card, 'w', -20, 0, screen)).toEqual({ x: 80, y: 100, w: 180, h: 75 });
  });
  it('a corner handle moves two edges', () => {
    expect(resizeRect(card, 'se', 10, 10, screen)).toEqual({ x: 100, y: 100, w: 170, h: 85 });
    expect(resizeRect(card, 'nw', -10, -10, screen)).toEqual({ x: 90, y: 90, w: 170, h: 85 });
  });
  it('stops at the minimum size instead of flipping over', () => {
    expect(resizeRect(card, 'e', -500, 0, screen)).toEqual({ x: 100, y: 100, w: 5, h: 75 });
    expect(resizeRect(card, 'w', 500, 0, screen)).toEqual({ x: 255, y: 100, w: 5, h: 75 });
    expect(resizeRect(card, 's', 0, -500, screen)).toEqual({ x: 100, y: 100, w: 160, h: 5 });
    expect(resizeRect(card, 'n', 0, 500, screen)).toEqual({ x: 100, y: 170, w: 160, h: 5 });
  });
  it('never leaves the screen', () => {
    expect(resizeRect(card, 'e', 9999, 0, screen)).toEqual({ x: 100, y: 100, w: 380, h: 75 });
    expect(resizeRect(card, 'nw', -9999, -9999, screen)).toEqual({ x: 0, y: 0, w: 260, h: 175 });
  });
  it('leaves the rectangle alone when the handle does not move', () => {
    expect(resizeRect(card, 'se', 0, 0, screen)).toEqual(card);
  });
});

describe('resizeBy (keyboard resize)', () => {
  const screen = { w: 480, h: 480 };
  it('grows or shrinks from the top-left corner', () => {
    expect(resizeBy({ x: 10, y: 10, w: 50, h: 40 }, 5, -1, screen)).toEqual({ x: 10, y: 10, w: 55, h: 39 });
  });
  it('never goes below 1px or past the screen edge', () => {
    expect(resizeBy({ x: 10, y: 10, w: 3, h: 3 }, -10, -10, screen)).toEqual({ x: 10, y: 10, w: 1, h: 1 });
    expect(resizeBy({ x: 400, y: 400, w: 50, h: 50 }, 100, 100, screen)).toEqual({ x: 400, y: 400, w: 80, h: 80 });
  });
});
