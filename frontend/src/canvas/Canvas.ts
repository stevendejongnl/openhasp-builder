import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import type { Page, PlacedWidget, DeviceProfile, WidgetDef, Theme } from '../schema';

const GRID = 5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function staticProps(w: PlacedWidget): Record<string, unknown> {
  return (w.params?.static_props as Record<string, unknown>) ?? {};
}

// jsonl `img` sources are absolute URLs baked in against whatever host/IP the
// plate was authored on (e.g. http://homeassistant.example.invalid:8123/local/...). The
// builder itself may be viewed from a different host (a different LAN IP, a
// public HTTPS domain, etc), where that absolute URL is unreachable or
// blocked as mixed content -- HA serves the same /local/ path from every
// host, so stripping the scheme+host and keeping only the path makes it
// resolve against whatever origin the builder is actually running on.
function relativizeSrc(src: string): string {
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
function unshiftMdiCodepoint(ch: string): string | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  if (cp >= 0xe000 && cp <= 0xefff) return String.fromCodePoint(0xf0000 + (cp - 0xe000));
  if (cp >= 0xf000 && cp <= 0xf8ff) return String.fromCodePoint(0xf1000 + (cp - 0xf000));
  return null;
}

function renderGridText(text: string, fontPx: number) {
  return [...deviceText(text)].map((ch) => {
    const units = advanceUnits(ch);
    if (units === null) return ch;
    return html`<span class="adv" style="width:${Math.round((units * fontPx) / ADVANCE_UPM)}px">${ch}</span>`;
  });
}

function renderGlyphOrText(text: string, fontPx: number = DEFAULT_FONT_PX) {
  if ([...text].length === 1) {
    const mdiChar = unshiftMdiCodepoint(text);
    if (mdiChar !== null) return html`<span class="mdi-glyph">${mdiChar}</span>`;
  }
  return renderGridText(text, fontPx);
}

// Evaluated live values win over static_props (a jsonl literal is only the
// value at export time; the /template_eval result is current). Falls back
// to static_props for plates where the template hasn't resolved yet (still
// loading, or eval failed) so the canvas never regresses to blank.
function liveValue(
  evaluated: Record<string, string> | undefined,
  props: Record<string, unknown>,
  key: string
): string | undefined {
  if (evaluated && key in evaluated) return evaluated[key];
  const v = props[key];
  return v === undefined ? undefined : String(v);
}

// openHASP fonts: `text_font: N` is Roboto Condensed Regular at N px
// (verified against a device screenshot: advance widths match to <1px), and a
// label with no text_font uses the device default of 32px.
const DEFAULT_FONT_PX = 32;
const DEVICE_FONT = "'roboto-condensed-hasp', 'Roboto Condensed', sans-serif";

// Glyphs missing from the device's compiled font are skipped by LVGL: drawn as
// nothing and zero-width (e.g. U+00B7 in "5h · 12m" shows as a plain gap).
const GLYPHS_MISSING_ON_DEVICE = /\u00b7/g;

// LVGL positions a label's first line lower than the browser's
// `line-height: normal` box for this font (its line box is built from the
// font's win/typo metrics, Chrome's from hhea): measured on a device screenshot
// the glyphs sit 3px lower at 16px and 24px, 4px lower at 32px.
function labelTopOffset(fontPx: number): number {
  return Math.max(0, Math.floor(3 + (fontPx - 16) / 16));
}

function isMdiGlyph(text: string): boolean {
  return [...text].length === 1 && unshiftMdiCodepoint(text) !== null;
}

// Advance widths (font units, 2048/em) of Roboto Condensed Regular for
// U+0020..U+00FF plus the euro sign. LVGL rounds every glyph advance to whole
// pixels, the browser keeps fractional ones, so long strings drift by a pixel
// or two unless each glyph is placed on the integer grid like the device does.
const ADVANCE_UPM = 2048;
const ADVANCE_LATIN1 = [470,504,656,1122,1011,1296,1114,358,643,653,882,1018,403,508,540,760,1011,1011,1011,1011,1011,1011,1011,1011,1011,1011,478,415,913,981,943,865,1575,1181,1118,1161,1169,1018,985,1210,1270,512,990,1117,974,1547,1269,1231,1135,1231,1087,1062,1066,1150,1148,1560,1129,1075,1071,513,757,513,760,829,633,981,1010,946,1016,960,648,1010,989,470,459,923,470,1542,992,1028,1010,1025,624,934,606,990,876,1331,899,853,899,628,500,628,1207,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,470,475,983,1047,1461,950,492,1101,857,1609,812,856,998,508,1610,849,765,963,675,675,642,1021,890,499,470,675,826,856,1306,1388,1379,864,1181,1181,1181,1181,1181,1181,1664,1161,1018,1018,1018,1018,512,512,512,512,1199,1269,1231,1231,1231,1231,1231,964,1231,1150,1150,1150,1150,1075,1055,1069,981,981,981,981,981,981,1492,946,960,960,960,960,482,482,482,482,1052,992,1028,1028,1028,1028,1028,1024,1021,990,990,990,990,853,1041,853];
const ADVANCE_EURO = 1011;

function advanceUnits(ch: string): number | null {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x20 && cp <= 0xff) return ADVANCE_LATIN1[cp - 0x20] || null;
  if (cp === 0x20ac) return ADVANCE_EURO;
  return null;
}

// The device display is RGB565: every colour is quantised to 5/6/5 bits and
// expanded back, which is why a plain grey looks faintly green on screen.
function deviceColor(color: string): string {
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

function deviceText(text: string): string {
  return text.replace(GLYPHS_MISSING_ON_DEVICE, '');
}

// Value of a raw widget prop: the live /template_eval result wins over the
// jsonl literal (templated props such as bg_color, text_color and w only
// exist as templates in the yaml bindings).
function rawProp(
  w: PlacedWidget,
  evaluated: Record<string, string> | undefined,
  key: string
): unknown {
  if (evaluated && key in evaluated) {
    const v = evaluated[key];
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
  }
  return staticProps(w)[key];
}

// LVGL bg_opa is 0..255 and applies to the background only.
function withOpacity(color: string, opa: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m || opa >= 255) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, opa) / 255})`;
}

function rawGeometry(w: PlacedWidget, evaluated: Record<string, string> | undefined) {
  const num = (key: string, fallback: number) => {
    const v = rawProp(w, evaluated, key);
    return typeof v === 'number' ? v : fallback;
  };
  return { x: num('x', w.x), y: num('y', w.y), w: num('w', w.w), h: num('h', w.h) };
}

// The real device never draws a border/bg unless bg_color/bg_opa says so --
// our base `.widget` class always shows a faint hint border so *empty*
// widgets stay visible/selectable in the editor. Raw imported widgets with
// real device props override that hint entirely to match the actual look:
// labels and transparent click-catchers (bg_opa:0) get no chrome at all,
// everything else shows its real bg_color or nothing. Borders and padding are
// zeroed so content sits exactly at x/y like LVGL (box-sizing would otherwise
// inset it by the hint border + padding).
function rawStyle(w: PlacedWidget, evaluated: Record<string, string> | undefined): string {
  if (w.widget_def_id !== 'raw') return '';
  const objType = String(w.params?.obj_type ?? 'raw');
  const geo = rawGeometry(w, evaluated);
  const parts: string[] = [
    `left:${geo.x}px`,
    `top:${geo.y}px`,
    `width:${geo.w}px`,
    `height:${geo.h}px`,
    'border:0',
    'padding:0',
    `font-family:${DEVICE_FONT}`,
    'line-height:normal',
    'font-variant-ligatures:none',
    'font-kerning:none',
  ];

  const bgColor = rawProp(w, evaluated, 'bg_color');
  const bgOpa = rawProp(w, evaluated, 'bg_opa');
  const isLabel = objType === 'label';
  if (isLabel || bgOpa === 0 || typeof bgColor !== 'string') {
    parts.push('background:transparent');
  } else {
    parts.push(`background:${withOpacity(deviceColor(bgColor), typeof bgOpa === 'number' ? bgOpa : 255)}`);
  }

  const textColor = rawProp(w, evaluated, 'text_color');
  parts.push(`color:${deviceColor(typeof textColor === 'string' ? textColor : '#ffffff')}`);

  // A raw widget has square corners unless it says otherwise (the editor's
  // theme radius must not leak in); an LVGL slider defaults to fully round.
  const radius = rawProp(w, evaluated, 'radius');
  parts.push(`border-radius:${typeof radius === 'number' ? radius : objType === 'slider' ? 9999 : 0}px`);
  if (objType === 'img' || objType === 'slider') parts.push('overflow:visible'); // knob / scaled image extend past the box

  const font = rawProp(w, evaluated, 'text_font');
  parts.push(`font-size:${typeof font === 'number' ? font : DEFAULT_FONT_PX}px`);

  // LVGL's `align` on a label is horizontal-only -- text sits at the top of
  // the label's box by default, it is NOT vertically centered. The real
  // device's temp-button row visibly shows this (text sits high in the
  // circle, not centered) -- reproducing that quirk faithfully, not "fixing"
  // it, is the goal here.
  const align = rawProp(w, evaluated, 'align');
  if (typeof align === 'string') parts.push(`text-align:${align}`);

  if (isLabel) {
    // Label text is not clipped to its box on the device, and does not wrap.
    parts.push('overflow:visible', 'white-space:pre');
    const text = String(rawProp(w, evaluated, 'text') ?? '');
    // MDI glyphs sit 1px lower on the device than the browser draws them.
    parts.push(
      `padding-top:${isMdiGlyph(text) ? 1 : labelTopOffset(typeof font === 'number' ? font : DEFAULT_FONT_PX)}px`
    );
  }
  return parts.join(';');
}

if (!document.getElementById('ohb-canvas-fonts')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'ohb-canvas-fonts';
  styleEl.textContent = `
    @font-face {
      font-family: 'mdi-hasp';
      src: url('/api/openhasp_builder/static/assets/mdi.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'roboto-condensed-hasp';
      src: url('/api/openhasp_builder/static/assets/roboto-condensed-regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'montserrat';
      src: url('/api/openhasp_builder/static/assets/montserrat-regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'montserrat';
      src: url('/api/openhasp_builder/static/assets/montserrat-semibold.woff2') format('woff2');
      font-weight: 600;
      font-style: normal;
    }
  `;
  document.head.appendChild(styleEl);
}

const sliderCss = css`
  .mdi-glyph {
    font-family: 'mdi-hasp';
  }
  .adv {
    display: inline-block;
  }
  .slider-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: inherit;
  }
  .slider-knob {
    position: absolute;
    top: 50%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .raw-gauge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }
  .raw-gauge .value {
    font-size: 14px;
    font-weight: 600;
  }
  .raw-img {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100%;
    opacity: 0.7;
  }
  .raw-img-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .raw-img-tag {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  /* auto_size: LVGL draws the image at its native size and zooms it about its own centre */
  .raw-img-tag.native {
    position: absolute;
    left: 0;
    top: 0;
    width: auto;
    height: auto;
    max-width: none;
    transform-origin: center;
  }
  /* what LVGL shows when an image cannot be loaded */
  .raw-img-wrap .no-data {
    display: none;
    position: absolute;
    inset: 0;
    background: #fff;
    color: #000;
    font-size: 32px;
    line-height: 41px;
    padding-top: 4px;
    white-space: pre;
    overflow: hidden;
  }
  .raw-img-wrap.failed .no-data {
    display: block;
  }
  .raw-img-wrap.failed .raw-img-tag {
    display: none;
  }
  .raw-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
  }
`;

function clampPct(val: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
}

function rawFontPx(w: PlacedWidget, evaluated: Record<string, string> | undefined): number {
  const font = rawProp(w, evaluated, 'text_font');
  return typeof font === 'number' ? font : DEFAULT_FONT_PX;
}

function rawBody(w: PlacedWidget, evaluated: Record<string, string> | undefined) {
  const props = staticProps(w);
  const objType = String(w.params?.obj_type ?? 'raw');

  if (objType === 'slider') {
    const min = Number(props.min ?? 0);
    const max = Number(props.max ?? 100);
    const val = Number(liveValue(evaluated, props, 'val') ?? min);
    const pct = clampPct(val, min, max);
    // LVGL slider: the object box is the track (bg_color), the indicator is the
    // filled part (bg_color10) and the knob (bg_color20) is a circle larger than
    // the track by 5px each side, centred on the value and free to overflow.
    const color = (key: string, fallback: string) => {
      const v = rawProp(w, evaluated, key);
      return deviceColor(typeof v === 'string' ? v : fallback);
    };
    const knob = rawGeometry(w, evaluated).h + 10;
    return html`<div
        class="slider-fill"
        style="width:${pct}%;background:${color('bg_color10', '#08ae94')}"
      ></div
      ><div
        class="slider-knob"
        style="left:${pct}%;width:${knob}px;height:${knob}px;background:${color('bg_color20', '#ffffff')}"
      ></div>`;
  }

  if (objType === 'gauge') {
    const min = Number(props.min ?? 0);
    const max = Number(props.max ?? 100);
    const rawVal = liveValue(evaluated, props, 'val');
    const val = Number(rawVal ?? min);
    const pct = clampPct(val, min, max);
    const color = liveValue(evaluated, props, 'line_color10') ?? 'var(--primary-color, #03a9f4)';
    return html`
      <div
        class="raw-gauge"
        style="background:conic-gradient(${color} ${pct}%, rgba(255,255,255,0.15) ${pct}%)"
      >
        <span class="value">${rawVal ?? '—'}</span>
      </div>
    `;
  }

  if (objType === 'img') {
    const src = relativizeSrc(String(props.src ?? ''));
    if (!src) return html`<div class="raw-img">🖼 image</div>`;
    const zoom = typeof props.zoom === 'number' ? props.zoom / 256 : 1;
    const native = props.auto_size !== 0 && props.auto_size !== false;
    return html`<div class="raw-img-wrap"
      ><img
        class="raw-img-tag ${native ? 'native' : ''}"
        src=${src}
        style=${native ? `transform:scale(${zoom})` : ''}
        @error=${(e: Event) => (e.target as HTMLElement).parentElement?.classList.add('failed')}
      /><div class="no-data" aria-hidden="true">No\ndata</div></div>`;
  }

  if (objType === 'btn') {
    const text = liveValue(evaluated, props, 'text') ?? '';
    return html`<div class="raw-btn">${renderGlyphOrText(text, rawFontPx(w, evaluated))}</div>`;
  }

  if (objType === 'msgbox') {
    // Real device renders this as a 0x0 overlay dialog, not a laid-out box.
    return nothing;
  }

  if (objType === 'label') {
    return html`${renderGlyphOrText(liveValue(evaluated, props, 'text') ?? '', rawFontPx(w, evaluated))}`;
  }

  // Plain `obj` containers are background/decoration only -- no text.
  return nothing;
}

@customElement('ohb-canvas')
export class Canvas extends LitElement {
  static styles = [
    sliderCss,
    css`
    :host {
      display: block;
      position: relative;
    }
    .zoomer {
      position: relative;
    }
    .surface {
      position: relative;
      background: #111;
      border: 1px solid var(--divider-color, #333);
      overflow: hidden;
      transform-origin: top left;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
      border-radius: 2px;
    }
    .widget {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.05);
      color: #ddd;
      font-size: 11px;
      padding: 2px 4px;
      cursor: move;
      overflow: hidden;
    }
    .device-overlay {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      image-rendering: pixelated;
    }
    .widget.selected {
      border-color: var(--primary-color, #03a9f4);
      box-shadow: 0 0 0 1px var(--primary-color, #03a9f4);
    }
    .widget.disabled {
      opacity: 0.35;
    }
    .widget.invalid {
      border-color: #e53935;
      box-shadow: 0 0 0 1px #e53935;
    }
  `,
  ];

  @property({ attribute: false }) page!: Page;
  @property({ attribute: false }) deviceProfile!: DeviceProfile;
  @property({ attribute: false }) widgetDefs: Record<string, WidgetDef> = {};
  @property({ attribute: false }) invalidObjIds: Set<number> = new Set();
  @property({ attribute: false }) theme: Theme | null = null;
  @property({ attribute: false }) evaluatedValues: Record<number, Record<string, string>> = {};
  @property({ attribute: false }) selectedIds: Set<number> = new Set();
  // Editor zoom (1 = device pixels). The surface is scaled with a CSS transform,
  // so every pointer delta/offset below is divided by it.
  @property({ type: Number }) zoom = 1;
  // "Compare with device": the panel's own screenshot drawn over the surface.
  @property() overlaySrc = '';
  @property({ type: Number }) overlayOpacity = 0.5;
  @property({ type: Boolean }) overlayDifference = false;

  private onSurfaceDragOver(e: DragEvent) {
    e.preventDefault();
  }

  private onSurfaceDrop(e: DragEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = snap((e.clientX - rect.left) / this.zoom);
    const y = snap((e.clientY - rect.top) / this.zoom);

    const compositeId = e.dataTransfer?.getData('application/x-ohb-composite-id');
    if (compositeId) {
      this.dispatchEvent(
        new CustomEvent('composite-place', {
          detail: { compositeId, x, y },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }

    const widgetType = e.dataTransfer?.getData('application/x-ohb-widget-type');
    if (!widgetType) return;
    const widgetDef = this.widgetDefs[widgetType];
    if (!widgetDef) return;

    this.dispatchEvent(
      new CustomEvent('widget-place', {
        detail: {
          widgetDefId: widgetType,
          x,
          y,
          w: widgetDef.default_w,
          h: widgetDef.default_h,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private onWidgetPointerDown(e: PointerEvent, widget: PlacedWidget) {
    e.stopPropagation();
    let nextSelection: Set<number>;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      nextSelection = new Set(this.selectedIds);
      if (nextSelection.has(widget.obj_id_start)) nextSelection.delete(widget.obj_id_start);
      else nextSelection.add(widget.obj_id_start);
    } else if (this.selectedIds.has(widget.obj_id_start)) {
      nextSelection = this.selectedIds;
    } else {
      nextSelection = new Set([widget.obj_id_start]);
    }
    this.dispatchEvent(
      new CustomEvent('widget-select', {
        detail: { objIds: [...nextSelection] },
        bubbles: true,
        composed: true,
      })
    );

    const surfaceW = this.deviceProfile.width;
    const surfaceH = this.deviceProfile.height;
    const startX = e.clientX;
    const startY = e.clientY;

    // Dragging any widget that's part of a multi-selection moves the whole
    // group by the same delta, not just the one under the pointer.
    const groupIds = nextSelection.has(widget.obj_id_start) ? nextSelection : new Set([widget.obj_id_start]);
    const origins = new Map(
      this.page.widgets.filter((w) => groupIds.has(w.obj_id_start)).map((w) => [w.obj_id_start, { x: w.x, y: w.y, w: w.w, h: w.h }])
    );

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / this.zoom;
      const dy = (moveEvent.clientY - startY) / this.zoom;
      const moves = [...origins.entries()].map(([objId, origin]) => {
        let newX = snap(origin.x + dx);
        let newY = snap(origin.y + dy);
        newX = Math.max(0, Math.min(newX, surfaceW - origin.w));
        newY = Math.max(0, Math.min(newY, surfaceH - origin.h));
        return { objId, x: newX, y: newY };
      });
      this.dispatchEvent(
        new CustomEvent('widget-move', {
          detail: { moves },
          bubbles: true,
          composed: true,
        })
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private onWidgetDoubleClick(e: MouseEvent, widget: PlacedWidget) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('widget-edit-raw', {
        detail: { objId: widget.obj_id_start },
        bubbles: true,
        composed: true,
      })
    );
  }

  private onSurfacePointerMove(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.dispatchEvent(
      new CustomEvent('canvas-cursor', {
        detail: {
          x: Math.max(0, Math.round((e.clientX - rect.left) / this.zoom)),
          y: Math.max(0, Math.round((e.clientY - rect.top) / this.zoom)),
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.page || !this.deviceProfile) return html``;
    const w = this.deviceProfile.width;
    const h = this.deviceProfile.height;
    return html`
      <div class="zoomer" style="width:${w * this.zoom + 2}px;height:${h * this.zoom + 2}px">
      <div
        class="surface"
        style="width:${w}px;height:${h}px;background:${deviceColor(this.page.background)};transform:scale(${this.zoom})"
        @dragover=${this.onSurfaceDragOver}
        @drop=${this.onSurfaceDrop}
        @pointermove=${this.onSurfacePointerMove}
        @pointerdown=${() =>
          this.dispatchEvent(
            new CustomEvent('widget-select', { detail: { objIds: [] }, bubbles: true, composed: true })
          )}
      >
        ${repeat(this.page.widgets, (w) => w.obj_id_start, (w) => {
          const classes = [
            'widget',
            this.selectedIds.has(w.obj_id_start) ? 'selected' : '',
            w.disabled ? 'disabled' : '',
            this.invalidObjIds.has(w.obj_id_start) ? 'invalid' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const t = this.theme;
          const themeStyle = t
            ? `background:${t.colors.card_bg};color:${t.colors.text};border-radius:${t.spacing.corner_radius}px;font-family:${t.fonts.family}`
            : '';
          const fullStyle = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;${themeStyle};${rawStyle(w, this.evaluatedValues[w.obj_id_start])}`;
          return html`
            <div
              class=${classes}
              style=${fullStyle}
              @pointerdown=${(e: PointerEvent) => this.onWidgetPointerDown(e, w)}
              @dblclick=${(e: MouseEvent) => this.onWidgetDoubleClick(e, w)}
            >${w.widget_def_id === 'raw' ? rawBody(w, this.evaluatedValues[w.obj_id_start]) : w.widget_def_id}</div>
          `;
        })}
        ${this.overlaySrc
          ? html`<img
              class="device-overlay"
              alt=""
              src=${this.overlaySrc}
              style="opacity:${this.overlayOpacity};mix-blend-mode:${this.overlayDifference ? 'difference' : 'normal'}"
            />`
          : nothing}
      </div>
      </div>
    `;
  }
}
