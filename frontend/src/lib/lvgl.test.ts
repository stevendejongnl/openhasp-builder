import { describe, expect, it } from 'vitest';
import {
  ADVANCE_LATIN1,
  advanceUnits,
  advanceWidth,
  deviceColor,
  deviceText,
  isMdiGlyph,
  labelTopOffset,
  relativizeSrc,
  unshiftMdiCodepoint,
  withOpacity,
} from './lvgl';

// The expected numbers below were measured on screenshots of a real 480x480
// openHASP panel, not derived from the code under test.

describe('deviceColor (RGB565 as the panel shows it)', () => {
  it('quantises a grey the way the panel does: #1c1c1c is (25,28,25), faintly green', () => {
    expect(deviceColor('#1c1c1c')).toBe('#191c19');
  });
  it('matches the green and red measured on the usage bars', () => {
    expect(deviceColor('#4caf50')).toBe('#4aae52'); // (74,174,82)
    expect(deviceColor('#f44336')).toBe('#f74131'); // (247,65,49)
  });
  it('keeps pure black and white', () => {
    expect(deviceColor('#000000')).toBe('#000000');
    expect(deviceColor('#ffffff')).toBe('#ffffff');
  });
  it('expands short hex', () => {
    expect(deviceColor('#fff')).toBe('#ffffff');
  });
  it('passes through anything that is not a hex colour', () => {
    expect(deviceColor('red')).toBe('red');
    expect(deviceColor('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
    expect(deviceColor('')).toBe('');
  });
});

describe('labelTopOffset (LVGL puts the first line lower than the browser)', () => {
  it('is 3px at 16 and 24px and 4px at 32px, as measured', () => {
    expect(labelTopOffset(16)).toBe(3);
    expect(labelTopOffset(24)).toBe(3);
    expect(labelTopOffset(32)).toBe(4);
  });
  it('never goes negative', () => {
    expect(labelTopOffset(1)).toBeGreaterThanOrEqual(0);
  });
});

describe('glyph advances', () => {
  it('rounds to whole pixels like LVGL', () => {
    expect(advanceWidth(1011, 16)).toBe(8); // a digit at 16px: 7.9 -> 8
    expect(advanceWidth(1011, 24)).toBe(12); // 11.85 -> 12
    expect(advanceWidth(1011, 32)).toBe(16);
    expect(advanceWidth(470, 16)).toBe(4); // a space: 3.67 -> 4
  });
  it('has a table entry for every Latin-1 character and the euro sign', () => {
    expect(ADVANCE_LATIN1).toHaveLength(0x100 - 0x20);
    expect(advanceUnits('€')).toBe(1011);
    expect(advanceUnits('A')).toBeGreaterThan(0);
    expect(advanceUnits('é')).toBeGreaterThan(0);
  });
  it('has no advance for characters outside the table', () => {
    expect(advanceUnits('漢')).toBeNull();
    expect(advanceUnits('\n')).toBeNull();
  });
});

describe('deviceText', () => {
  it('drops the middle dot the panel font lacks, leaving the two spaces it shows as a gap', () => {
    expect(deviceText('5h · 12m')).toBe('5h  12m');
    expect(deviceText('Week · 3d 9h')).toBe('Week  3d 9h');
  });
  it('leaves other text alone', () => {
    expect(deviceText('€35.06 / €35')).toBe('€35.06 / €35');
  });
});

describe('MDI glyphs (shifted into the private-use area by openHASP)', () => {
  it('un-shifts the two ranges to the real MDI code points', () => {
    expect(unshiftMdiCodepoint('')!.codePointAt(0)).toBe(0xf0335); // light bulb
    expect(unshiftMdiCodepoint('')!.codePointAt(0)).toBe(0xf1000);
  });
  it('does not touch ordinary characters or an empty string', () => {
    expect(unshiftMdiCodepoint('a')).toBeNull();
    expect(unshiftMdiCodepoint('')).toBeNull();
  });
  it('isMdiGlyph is true only for a lone private-use character', () => {
    expect(isMdiGlyph('')).toBe(true);
    expect(isMdiGlyph('ab')).toBe(false);
    expect(isMdiGlyph('a')).toBe(false);
    expect(isMdiGlyph('a')).toBe(false);
  });
});

describe('withOpacity (LVGL bg_opa is 0..255)', () => {
  it('turns a hex colour into rgba with the right alpha', () => {
    expect(withOpacity('#ff0000', 0)).toBe('rgba(255,0,0,0)');
    expect(withOpacity('#0a141e', 51)).toBe('rgba(10,20,30,0.2)');
  });
  it('leaves a fully opaque colour and non-hex values untouched', () => {
    expect(withOpacity('#ff0000', 255)).toBe('#ff0000');
    expect(withOpacity('red', 10)).toBe('red');
  });
});

describe('relativizeSrc (image URLs baked in against another host)', () => {
  it('keeps only the path so it resolves against the origin the builder runs on', () => {
    expect(relativizeSrc('http://homeassistant.example.invalid:8123/local/radio/slam.png')).toBe('/local/radio/slam.png');
  });
  it('leaves an already relative path, or anything unparseable, as it is', () => {
    expect(relativizeSrc('/local/a.png')).toBe('/local/a.png');
    expect(relativizeSrc('not a url')).toBe('not a url');
  });
});
