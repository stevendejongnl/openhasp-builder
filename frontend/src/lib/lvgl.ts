// How the openHASP device (LVGL) draws text, colours and glyphs, as pure functions.
// Every rule here was measured against a screenshot of a real panel.

// jsonl `img` sources are absolute URLs baked in against whatever host/IP the
// plate was authored on (e.g. http://homeassistant.example.invalid:8123/local/...). The
// builder itself may be viewed from a different host (a different LAN IP, a
// public HTTPS domain, etc), where that absolute URL is unreachable or
// blocked as mixed content -- HA serves the same /local/ path from every
// host, so stripping the scheme+host and keeping only the path makes it
// resolve against whatever origin the builder is actually running on.
export function relativizeSrc(src: string): string {
  try {
    return new URL(src).pathname;
  } catch {
    return src;
  }
}

// HASP/LVGL ships MDI glyphs shifted into the BMP private-use area (0xE000 or
// 0xF000 + the icon's low 16 bits) instead of MDI's real 0xF0000+ codepoints,
// so a byte-for-byte MDI webfont can't render them directly. Un-shift back to
// the real codepoint and render with the actual @mdi/font (see
// hasp_mdi_font_shifted.sh in HASwitchPlate/openHASP for the shift table).
export function unshiftMdiCodepoint(ch: string): string | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  if (cp >= 0xe000 && cp <= 0xefff) return String.fromCodePoint(0xf0000 + (cp - 0xe000));
  if (cp >= 0xf000 && cp <= 0xf8ff) return String.fromCodePoint(0xf1000 + (cp - 0xf000));
  return null;
}


// openHASP fonts: `text_font: N` is Roboto Condensed Regular at N px
// (verified against a device screenshot: advance widths match to <1px), and a
// label with no text_font uses the device default of 32px.
export const DEFAULT_FONT_PX = 32;
export const DEVICE_FONT = "'roboto-condensed-hasp', 'Roboto Condensed', sans-serif";

// Glyphs missing from the device's compiled font are skipped by LVGL: drawn as
// nothing and zero-width (e.g. U+00B7 in "5h · 12m" shows as a plain gap).
export const GLYPHS_MISSING_ON_DEVICE = /\u00b7/g;

// LVGL positions a label's first line lower than the browser's
// `line-height: normal` box for this font (its line box is built from the
// font's win/typo metrics, Chrome's from hhea): measured on a device screenshot
// the glyphs sit 3px lower at 16px and 24px, 4px lower at 32px.
export function labelTopOffset(fontPx: number): number {
  return Math.max(0, Math.floor(3 + (fontPx - 16) / 16));
}

export function isMdiGlyph(text: string): boolean {
  return [...text].length === 1 && unshiftMdiCodepoint(text) !== null;
}

// Advance widths (font units, 2048/em) of Roboto Condensed Regular for
// U+0020..U+00FF plus the euro sign. LVGL rounds every glyph advance to whole
// pixels, the browser keeps fractional ones, so long strings drift by a pixel
// or two unless each glyph is placed on the integer grid like the device does.
export const ADVANCE_UPM = 2048;
export const ADVANCE_LATIN1 = [470,504,656,1122,1011,1296,1114,358,643,653,882,1018,403,508,540,760,1011,1011,1011,1011,1011,1011,1011,1011,1011,1011,478,415,913,981,943,865,1575,1181,1118,1161,1169,1018,985,1210,1270,512,990,1117,974,1547,1269,1231,1135,1231,1087,1062,1066,1150,1148,1560,1129,1075,1071,513,757,513,760,829,633,981,1010,946,1016,960,648,1010,989,470,459,923,470,1542,992,1028,1010,1025,624,934,606,990,876,1331,899,853,899,628,500,628,1207,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,470,475,983,1047,1461,950,492,1101,857,1609,812,856,998,508,1610,849,765,963,675,675,642,1021,890,499,470,675,826,856,1306,1388,1379,864,1181,1181,1181,1181,1181,1181,1664,1161,1018,1018,1018,1018,512,512,512,512,1199,1269,1231,1231,1231,1231,1231,964,1231,1150,1150,1150,1150,1075,1055,1069,981,981,981,981,981,981,1492,946,960,960,960,960,482,482,482,482,1052,992,1028,1028,1028,1028,1028,1024,1021,990,990,990,990,853,1041,853];
export const ADVANCE_EURO = 1011;

export function advanceUnits(ch: string): number | null {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x20 && cp <= 0xff) return ADVANCE_LATIN1[cp - 0x20] || null;
  if (cp === 0x20ac) return ADVANCE_EURO;
  return null;
}

// The device display is RGB565: every colour is quantised to 5/6/5 bits and
// expanded back, which is why a plain grey looks faintly green on screen.
export function deviceColor(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(hex, 16);
  const r5 = ((n >> 16) & 255) >> 3;
  const g6 = ((n >> 8) & 255) >> 2;
  const b5 = (n & 255) >> 3;
  // LVGL expands with rounding (v * 255 / max), not bit replication.
  const to = (v: number, max: number) => Math.round((v * 255) / max).toString(16).padStart(2, '0');
  return `#${to(r5, 31)}${to(g6, 63)}${to(b5, 31)}`;
}

export function deviceText(text: string): string {
  return text.replace(GLYPHS_MISSING_ON_DEVICE, '');
}


/** The whole-pixel width LVGL gives a glyph: its advance, rounded (the browser keeps fractions). */
export function advanceWidth(units: number, fontPx: number): number {
  return Math.round((units * fontPx) / ADVANCE_UPM);
}

// LVGL bg_opa is 0..255 and applies to the background only.
export function withOpacity(color: string, opa: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m || opa >= 255) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, opa) / 255})`;
}

