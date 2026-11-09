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
