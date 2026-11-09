import { describe, expect, it } from 'vitest';
import type { PlacedWidget } from '../schema';
import { liveValue, rawProp, staticProps } from './props';

const widget = (static_props: Record<string, unknown>): PlacedWidget =>
  ({ widget_def_id: 'raw', x: 0, y: 0, w: 10, h: 10, page: 1, params: { static_props }, obj_id_start: 1, obj_id_end: 1, disabled: false }) as PlacedWidget;

describe('staticProps', () => {
  it('returns the widget device props, or {} when there are none', () => {
    expect(staticProps(widget({ bg_color: '#111111' }))).toEqual({ bg_color: '#111111' });
    expect(staticProps({ params: {} } as PlacedWidget)).toEqual({});
  });
});

describe('rawProp (live template result wins over the jsonl literal)', () => {
  const w = widget({ bg_color: '#111111', w: 1, text: 'static' });
  it('falls back to the jsonl value when nothing is evaluated', () => {
    expect(rawProp(w, undefined, 'bg_color')).toBe('#111111');
    expect(rawProp(w, {}, 'text')).toBe('static');
  });
  it('prefers an evaluated value, converting numbers', () => {
    expect(rawProp(w, { w: '201' }, 'w')).toBe(201);
    expect(rawProp(w, { bg_color: '#4caf50' }, 'bg_color')).toBe('#4caf50');
  });
  it('keeps an empty or non-numeric result as text, never as 0', () => {
    expect(rawProp(w, { text: '' }, 'text')).toBe('');
    expect(rawProp(w, { text: '-%' }, 'text')).toBe('-%');
  });
});

describe('liveValue', () => {
  it('prefers the evaluated string, then the static value as a string', () => {
    expect(liveValue({ val: '40' }, { val: 10 }, 'val')).toBe('40');
    expect(liveValue(undefined, { val: 10 }, 'val')).toBe('10');
    expect(liveValue(undefined, {}, 'val')).toBeUndefined();
  });
});
