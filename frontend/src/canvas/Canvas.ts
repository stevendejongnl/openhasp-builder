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

function renderGlyphOrText(text: string) {
  if ([...text].length === 1) {
    const mdiChar = unshiftMdiCodepoint(text);
    if (mdiChar !== null) return html`<span class="mdi-glyph">${mdiChar}</span>`;
  }
  return text;
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

// The real device never draws a border/bg unless bg_color/bg_opa says so --
// our base `.widget` class always shows a faint hint border so *empty*
// widgets stay visible/selectable in the editor. Raw imported widgets with
// real device props override that hint entirely to match the actual look:
// labels and transparent click-catchers (bg_opa:0) get no chrome at all,
// everything else shows its real bg_color or nothing.
function rawStyle(w: PlacedWidget): string {
  if (w.widget_def_id !== 'raw') return '';
  const props = staticProps(w);
  const objType = String(w.params?.obj_type ?? 'raw');
  const parts: string[] = ['border-color:transparent'];

  const isTransparent = props.bg_opa === 0;
  const isLabel = objType === 'label';

  if (isTransparent || isLabel) {
    parts.push('background:transparent');
  } else if (typeof props.bg_color === 'string') {
    parts.push(`background:${props.bg_color}`);
  } else {
    parts.push('background:transparent');
  }

  if (typeof props.text_color === 'string') parts.push(`color:${props.text_color}`);
  if (typeof props.radius === 'number') parts.push(`border-radius:${props.radius}px`);
  if (typeof props.text_font === 'number') parts.push(`font-size:${Math.max(9, props.text_font)}px`);
  // LVGL's `align` on a label is horizontal-only -- text sits at the top of
  // the label's box by default, it is NOT vertically centered. The real
  // device's temp-button row visibly shows this (text sits high in the
  // circle, not centered) -- reproducing that quirk faithfully, not "fixing"
  // it, is the goal here.
  if (typeof props.align === 'string') {
    parts.push(`text-align:${props.align}`);
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
  .raw-slider {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 4px;
  }
  .raw-slider .track {
    position: relative;
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
  .raw-slider .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--primary-color, #03a9f4);
    border-radius: 2px;
  }
  .raw-slider .knob {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
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
  .raw-img-tag {
    width: 100%;
    height: 100%;
    object-fit: contain;
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

function rawBody(w: PlacedWidget, evaluated: Record<string, string> | undefined) {
  const props = staticProps(w);
  const objType = String(w.params?.obj_type ?? 'raw');

  if (objType === 'slider') {
    const min = Number(props.min ?? 0);
    const max = Number(props.max ?? 100);
    const val = Number(liveValue(evaluated, props, 'val') ?? min);
    const pct = clampPct(val, min, max);
    return html`
      <div class="raw-slider">
        <div class="track">
          <div class="fill" style="width:${pct}%"></div>
          <div class="knob" style="left:${pct}%"></div>
        </div>
      </div>
    `;
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
    return html`<img class="raw-img-tag" src=${src} />`;
  }

  if (objType === 'btn') {
    const text = liveValue(evaluated, props, 'text') ?? '';
    return html`<div class="raw-btn">${renderGlyphOrText(text)}</div>`;
  }

  if (objType === 'msgbox') {
    // Real device renders this as a 0x0 overlay dialog, not a laid-out box.
    return nothing;
  }

  if (objType === 'label') {
    return html`${renderGlyphOrText(liveValue(evaluated, props, 'text') ?? '')}`;
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
    .surface {
      position: relative;
      background: #111;
      border: 1px solid var(--divider-color, #333);
      overflow: hidden;
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

  private onSurfaceDragOver(e: DragEvent) {
    e.preventDefault();
  }

  private onSurfaceDrop(e: DragEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = snap(e.clientX - rect.left);
    const y = snap(e.clientY - rect.top);

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

    const surface = this.renderRoot.querySelector('.surface') as HTMLElement;
    const surfaceRect = surface.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    // Dragging any widget that's part of a multi-selection moves the whole
    // group by the same delta, not just the one under the pointer.
    const groupIds = nextSelection.has(widget.obj_id_start) ? nextSelection : new Set([widget.obj_id_start]);
    const origins = new Map(
      this.page.widgets.filter((w) => groupIds.has(w.obj_id_start)).map((w) => [w.obj_id_start, { x: w.x, y: w.y, w: w.w, h: w.h }])
    );

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const moves = [...origins.entries()].map(([objId, origin]) => {
        let newX = snap(origin.x + dx);
        let newY = snap(origin.y + dy);
        newX = Math.max(0, Math.min(newX, surfaceRect.width - origin.w));
        newY = Math.max(0, Math.min(newY, surfaceRect.height - origin.h));
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

  render() {
    if (!this.page || !this.deviceProfile) return html``;
    return html`
      <div
        class="surface"
        style="width:${this.deviceProfile.width}px;height:${this.deviceProfile.height}px;background:${this.page.background}"
        @dragover=${this.onSurfaceDragOver}
        @drop=${this.onSurfaceDrop}
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
          const fullStyle = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;${themeStyle};${rawStyle(w)}`;
          return html`
            <div
              class=${classes}
              style=${fullStyle}
              @pointerdown=${(e: PointerEvent) => this.onWidgetPointerDown(e, w)}
              @dblclick=${(e: MouseEvent) => this.onWidgetDoubleClick(e, w)}
            >
              ${w.widget_def_id === 'raw' ? rawBody(w, this.evaluatedValues[w.obj_id_start]) : w.widget_def_id}
            </div>
          `;
        })}
      </div>
    `;
  }
}
