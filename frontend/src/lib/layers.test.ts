import { describe, expect, it } from 'vitest';
import type { PlacedWidget } from '../schema';
import { layerName, layerSize } from './layers';

const raw = (obj_type: string, static_props: Record<string, unknown>, w = 10, h = 10): PlacedWidget =>
  ({ widget_def_id: 'raw', x: 0, y: 0, w, h, page: 1, params: { obj_type, static_props }, obj_id_start: 1, obj_id_end: 1, disabled: false }) as PlacedWidget;

describe('layerName', () => {
  it('names a label by its text, preferring the live value', () => {
    expect(layerName(raw('label', { text: 'Humidity' }))).toBe('Humidity');
    expect(layerName(raw('label', { text: '-%' }), { text: '61%' })).toBe('61%');
  });
  it('shortens long text with an ellipsis', () => {
    const name = layerName(raw('label', { text: 'x'.repeat(40) }));
    expect(name).toHaveLength(26);
    expect(name.endsWith('…')).toBe(true);
  });
  it('calls a lone private-use character an icon (it would be invisible text)', () => {
    expect(layerName(raw('label', { text: '' }))).toBe('icon');
  });
  it('names plain objects by what they are', () => {
    expect(layerName(raw('obj', { bg_color: '#1c1c1c' }, 160, 75))).toBe('card');
    expect(layerName(raw('obj', { bg_color: '#2c2c2c' }, 65, 65))).toBe('disc');
    expect(layerName(raw('obj', { bg_color: '#2c2c2c' }, 201, 8))).toBe('bar track');
    expect(layerName(raw('obj', { bg_color: '#4caf50', w: 1 }, 1, 8), { w: '120', bg_color: '#4caf50' })).toBe('bar fill');
    expect(layerName(raw('obj', { bg_opa: 0 }, 160, 75))).toBe('touch area');
    expect(layerName(raw('obj', {}, 160, 75))).toBe('touch area');
    expect(layerName(raw('obj', { bg_color: '#111' }, 30, 30 + 5))).toBe('box');
  });
  it('falls back to the widget type for non-raw widgets', () => {
    expect(layerName({ widget_def_id: 'gauge', params: {} } as PlacedWidget)).toBe('gauge');
  });
});

describe('layerSize', () => {
  it('uses the live width/height of a bound layer, else the stored size', () => {
    expect(layerSize(raw('obj', {}, 1, 8), { w: '120' })).toEqual({ w: 120, h: 8 });
    expect(layerSize(raw('obj', {}, 50, 40))).toEqual({ w: 50, h: 40 });
    expect(layerSize(raw('obj', {}, 50, 40), { w: 'oops' })).toEqual({ w: 50, h: 40 });
  });
});
