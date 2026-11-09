import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlacedWidget, WidgetDef } from '../schema';
import { tokens, controls } from '../ui/styles';
import { icon, iconForType } from '../ui/icons';
import { layerName } from '../lib/layers';

type View = 'design' | 'bindings' | 'raw';
const FONT_SIZES = [12, 16, 24, 32];
const ALIGNS = ['left', 'center', 'right'];

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

@customElement('ohb-property-panel')
export class PropertyPanel extends LitElement {
  static styles = [
    tokens,
    controls,
    css`
      :host {
        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 0;
        height: 100%;
        font-family: var(--ohb-font);
        color: var(--ohb-text);
        font-size: 13px;
      }
      .head {
        padding: 12px;
        display: grid;
        gap: 12px;
        border-bottom: 1px solid var(--ohb-border);
      }
      .title {
        display: grid;
        grid-template-columns: 32px 1fr;
        gap: 12px;
        align-items: center;
      }
      .title .ico {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: var(--ohb-accent-soft);
        color: var(--ohb-accent);
      }
      .title b {
        display: block;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .title small {
        color: var(--ohb-muted);
        font: 400 11px var(--ohb-mono);
      }
      .body {
        overflow: auto;
        min-height: 0;
      }
      details.sec {
        border-bottom: 1px solid var(--ohb-border);
      }
      details.sec > summary {
        list-style: none;
        cursor: pointer;
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        padding: 10px 12px;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ohb-muted);
      }
      details.sec > summary::-webkit-details-marker {
        display: none;
      }
      details.sec > summary svg {
        transition: transform 120ms;
      }
      details.sec[open] > summary svg {
        transform: rotate(180deg);
      }
      .sec-body {
        display: grid;
        gap: 12px;
        padding: 0 12px 16px;
      }
      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .field {
        display: grid;
        gap: 4px;
      }
      .field > span {
        color: var(--ohb-muted);
        font-size: 11.5px;
      }
      .field > span em {
        color: var(--ohb-warn);
        font-style: normal;
      }
      .color {
        display: grid;
        grid-template-columns: 32px 1fr;
        gap: 8px;
      }
      .color input[type='color'] {
        width: 32px;
        height: 32px;
        padding: 0;
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-sm);
        background: none;
        cursor: pointer;
      }
      .nudge {
        display: grid;
        grid-template-columns: repeat(3, 32px);
        grid-template-rows: repeat(2, 28px);
        gap: 3px;
        justify-content: start;
      }
      .nudge .btn {
        min-height: 28px;
        width: 32px;
        padding: 0;
        justify-content: center;
      }
      .nudge .up {
        grid-column: 2;
      }
      .nudge .l {
        grid-row: 2;
        grid-column: 1;
      }
      .nudge .d {
        grid-row: 2;
        grid-column: 2;
      }
      .nudge .r {
        grid-row: 2;
        grid-column: 3;
      }
      .bind {
        padding: 12px;
        background: var(--ohb-panel-2);
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-md);
        display: grid;
        gap: 6px;
      }
      .bind code {
        font: 400 11.5px/1.5 var(--ohb-mono);
        color: var(--ohb-muted);
        word-break: break-all;
        background: none;
        padding: 0;
      }
      .bind .live {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px;
        align-items: center;
        color: var(--ohb-ok);
        font: 500 12px var(--ohb-mono);
      }
      .bind .live.pending {
        color: var(--ohb-faint);
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        min-height: 90px;
        font: 400 11.5px/1.5 var(--ohb-mono);
        padding: 8px;
        background: var(--ohb-panel-2);
        border: 1px solid var(--ohb-border);
        color: inherit;
        border-radius: var(--ohb-r-sm);
        resize: vertical;
      }
      .error {
        color: var(--ohb-danger);
        font-size: 11.5px;
      }
      pre.json {
        margin: 0;
        padding: 12px;
        font: 400 11.5px/1.6 var(--ohb-mono);
        color: var(--ohb-muted);
        white-space: pre-wrap;
        word-break: break-all;
      }
      .empty {
        padding: 24px 16px;
        display: grid;
        gap: 12px;
        justify-items: start;
        color: var(--ohb-muted);
      }
      .empty h3 {
        margin: 0;
        color: var(--ohb-text);
        font-size: 14px;
      }
      .empty ul {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 6px;
      }
    `,
  ];

  @property({ attribute: false }) widget: PlacedWidget | null = null;
  @property({ attribute: false }) widgetDef: WidgetDef | null = null;
  @property({ attribute: false }) evaluated: Record<string, string> | undefined = undefined;
  @property({ type: Number }) selectionCount = 0;
  @state() private view: View = 'design';
  @state() private propertiesText = '';
  @state() private eventText = '';
  @state() private propertiesError = '';
  @state() private eventError = '';

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('widget') && this.widget) {
      const params = this.widget.params as any;
      this.propertiesText = JSON.stringify(params.properties ?? {}, null, 2);
      this.eventText = JSON.stringify(params.event ?? {}, null, 2);
      this.propertiesError = '';
      this.eventError = '';
    }
  }

  private fire(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private emitParamChange(key: string, value: unknown) {
    this.fire('param-change', { objId: this.widget!.obj_id_start, key, value });
  }

  private emitGeometryChange(field: 'x' | 'y' | 'w' | 'h', value: number) {
    if (!Number.isFinite(value)) return;
    this.fire('geometry-change', { objId: this.widget!.obj_id_start, field, value });
  }

  // Raw (imported) widgets keep their device props in params.static_props.
  private setStatic(key: string, value: unknown) {
    const params = this.widget!.params as any;
    this.emitParamChange('static_props', { ...(params.static_props ?? {}), [key]: value });
  }

  private commitBinding(key: 'properties' | 'event', text: string) {
    try {
      const value = JSON.parse(text || '{}');
      if (key === 'properties') this.propertiesError = '';
      else this.eventError = '';
      this.emitParamChange(key, value);
    } catch (err) {
      const message = `Invalid JSON: ${(err as Error).message}`;
      if (key === 'properties') this.propertiesError = message;
      else this.eventError = message;
    }
  }

  private num(field: 'x' | 'y' | 'w' | 'h', label: string, value: number) {
    return html`<div class="num">
      <label for="f-${field}">${label}</label>
      <input
        id="f-${field}"
        type="number"
        .value=${String(value)}
        @change=${(e: Event) => this.emitGeometryChange(field, Number((e.target as HTMLInputElement).value))}
      />
    </div>`;
  }

  private renderEmpty() {
    return html`<div class="empty">
      <h3>Select something to edit it</h3>
      <span>Click a layer on the canvas or in the Layers list.</span>
      <ul>
        <li><b>Shift-click</b> adds to the selection</li>
        <li><b>Arrow keys</b> nudge by 1 px, <kbd>Shift</kbd> by 5 px</li>
        <li><b>Alt + arrow keys</b> resize (or drag a handle)</li>
        <li><b>Double-click</b> opens the raw editor</li>
      </ul>
    </div>`;
  }

  private renderDesign(w: PlacedWidget) {
    const params = w.params as any;
    const isRaw = w.widget_def_id === 'raw';
    const type = String(params.obj_type ?? w.widget_def_id);
    const sp: Record<string, unknown> = params.static_props ?? {};
    const bound: Record<string, unknown> = params.properties ?? {};
    const isLabel = isRaw && (type === 'label' || type === 'btn');
    const fill = isRaw && type !== 'label' && type !== 'msgbox';
    const textVal = String(this.evaluated?.text ?? sp.text ?? '');
    const size = typeof sp.text_font === 'number' ? sp.text_font : undefined;
    const align = typeof sp.align === 'string' ? sp.align : 'left';
    const color = (v: unknown, fallback: string) => (isHex(v) ? v : fallback);

    return html`
      <details class="sec" open>
        <summary>Position &amp; size ${icon('chev-down')}</summary>
        <div class="sec-body">
          <div class="grid2">
            ${this.num('x', 'X', w.x)} ${this.num('y', 'Y', w.y)} ${this.num('w', 'W', w.w)} ${this.num('h', 'H', w.h)}
          </div>
          <div class="field">
            <span>Nudge (or use the arrow keys)</span>
            <div class="nudge">
              <button class="btn up" aria-label="Move up 1 px" @click=${() => this.fire('nudge', { dx: 0, dy: -1 })}>${icon('arrow-up')}</button>
              <button class="btn l" aria-label="Move left 1 px" @click=${() => this.fire('nudge', { dx: -1, dy: 0 })}>${icon('arrow-left')}</button>
              <button class="btn d" aria-label="Move down 1 px" @click=${() => this.fire('nudge', { dx: 0, dy: 1 })}>${icon('arrow-down')}</button>
              <button class="btn r" aria-label="Move right 1 px" @click=${() => this.fire('nudge', { dx: 1, dy: 0 })}>${icon('arrow-right')}</button>
            </div>
          </div>
        </div>
      </details>

      ${isRaw && (fill || isLabel)
        ? html`<details class="sec" open>
            <summary>Appearance ${icon('chev-down')}</summary>
            <div class="sec-body">
              ${fill
                ? html`
                    <div class="field">
                      <span>Background${'bg_color' in bound ? html` <em>(bound to a template)</em>` : nothing}</span>
                      <div class="color">
                        <input
                          type="color"
                          aria-label="Background colour"
                          .value=${color(this.evaluated?.bg_color ?? sp.bg_color, '#000000')}
                          @change=${(e: Event) => this.setStatic('bg_color', (e.target as HTMLInputElement).value)}
                        />
                        <input
                          class="txt"
                          aria-label="Background colour (hex)"
                          .value=${String(sp.bg_color ?? '')}
                          @change=${(e: Event) => this.setStatic('bg_color', (e.target as HTMLInputElement).value)}
                        />
                      </div>
                    </div>
                    <div class="field">
                      <span>Corner radius</span>
                      <div class="num">
                        <label for="f-radius">r</label>
                        <input
                          id="f-radius"
                          type="number"
                          min="0"
                          .value=${String(sp.radius ?? 0)}
                          @change=${(e: Event) => this.setStatic('radius', Number((e.target as HTMLInputElement).value))}
                        />
                      </div>
                    </div>
                  `
                : nothing}
              ${isLabel
                ? html`
                    <div class="field">
                      <span>Text colour${'text_color' in bound ? html` <em>(bound to a template)</em>` : nothing}</span>
                      <div class="color">
                        <input
                          type="color"
                          aria-label="Text colour"
                          .value=${color(this.evaluated?.text_color ?? sp.text_color, '#ffffff')}
                          @change=${(e: Event) => this.setStatic('text_color', (e.target as HTMLInputElement).value)}
                        />
                        <input
                          class="txt"
                          aria-label="Text colour (hex)"
                          .value=${String(sp.text_color ?? '')}
                          placeholder="#ffffff"
                          @change=${(e: Event) => this.setStatic('text_color', (e.target as HTMLInputElement).value)}
                        />
                      </div>
                    </div>
                  `
                : nothing}
            </div>
          </details>`
        : nothing}

      ${isLabel
        ? html`<details class="sec" open>
            <summary>Text ${icon('chev-down')}</summary>
            <div class="sec-body">
              <div class="field">
                <span>Content${'text' in bound ? html` <em>(bound to a template)</em>` : nothing}</span>
                <input
                  class="txt"
                  aria-label="Text"
                  .value=${textVal}
                  ?disabled=${'text' in bound}
                  @change=${(e: Event) => this.setStatic('text', (e.target as HTMLInputElement).value)}
                />
              </div>
              <div class="field">
                <span>Font size (px)${size === undefined ? ' — device default' : ''}</span>
                <div class="seg" role="group" aria-label="Font size">
                  ${FONT_SIZES.map(
                    (s) => html`<button aria-pressed=${size === s} @click=${() => this.setStatic('text_font', s)}>${s}</button>`
                  )}
                </div>
              </div>
              <div class="field">
                <span>Align</span>
                <div class="seg" role="group" aria-label="Alignment">
                  ${ALIGNS.map(
                    (a) => html`<button aria-pressed=${align === a} @click=${() => this.setStatic('align', a)}>${a}</button>`
                  )}
                </div>
              </div>
            </div>
          </details>`
        : nothing}

      ${this.widgetDef && this.widgetDef.param_schema.length > 0
        ? html`<details class="sec" open>
            <summary>${this.widgetDef.type} settings ${icon('chev-down')}</summary>
            <div class="sec-body">
              ${this.widgetDef.param_schema.map(
                (name) => html`<div class="field">
                  <span>${name}</span>
                  <input
                    class="txt"
                    .value=${String(w.params[name] ?? '')}
                    @change=${(e: Event) => this.emitParamChange(name, (e.target as HTMLInputElement).value)}
                  />
                </div>`
              )}
            </div>
          </details>`
        : nothing}
    `;
  }

  private renderBindings(w: PlacedWidget) {
    const params = w.params as any;
    const props: Record<string, unknown> = params.properties ?? {};
    const entries = Object.entries(props);
    return html`
      <div class="sec-body" style="padding-top:12px">
        ${entries.length === 0
          ? html`<span style="color:var(--ohb-muted)">No property bindings on this layer: it shows static content.</span>`
          : entries.map(([key, tpl]) => {
              const live = this.evaluated?.[key];
              return html`<div class="bind">
                <b>${key}</b>
                <code>${typeof tpl === 'string' ? tpl : JSON.stringify(tpl)}</code>
                <div class="live ${live === undefined ? 'pending' : ''}">
                  <span>live →</span><span>${live ?? 'not evaluated'}</span>
                </div>
              </div>`;
            })}
        <div class="field">
          <span>properties (JSON, HA state bindings)</span>
          <textarea
            aria-label="properties JSON"
            .value=${this.propertiesText}
            @change=${(e: Event) => this.commitBinding('properties', (e.target as HTMLTextAreaElement).value)}
          ></textarea>
          ${this.propertiesError ? html`<div class="error">${this.propertiesError}</div>` : nothing}
        </div>
        <div class="field">
          <span>event (JSON, HA service calls)</span>
          <textarea
            aria-label="event JSON"
            .value=${this.eventText}
            @change=${(e: Event) => this.commitBinding('event', (e.target as HTMLTextAreaElement).value)}
          ></textarea>
          ${this.eventError ? html`<div class="error">${this.eventError}</div>` : nothing}
        </div>
      </div>
    `;
  }

  private renderRaw(w: PlacedWidget) {
    return html`
      <div class="sec-body" style="padding-top:12px">
        <button class="btn" @click=${() => this.fire('widget-edit-raw', { objId: w.obj_id_start })}>
          ${icon('code')} Open raw editor
        </button>
      </div>
      <pre class="json">${JSON.stringify(w.params, null, 2)}</pre>
    `;
  }

  render() {
    const w = this.widget;
    const type = w ? String((w.params as any)?.obj_type ?? w.widget_def_id) : '';
    const views: [View, string][] = [
      ['design', 'Design'],
      ['bindings', 'Bindings'],
      ['raw', 'Raw'],
    ];
    return html`
      <div class="head">
        <div class="title">
          <span class="ico">${icon(w ? iconForType(type) : 'layers')}</span>
          <div>
            <b>${w ? layerName(w, this.evaluated) : 'Nothing selected'}</b>
            <small
              >${w
                ? `${type} · id ${w.obj_id_start}${this.selectionCount > 1 ? ` · +${this.selectionCount - 1} more` : ''}`
                : 'Select a layer'}</small
            >
          </div>
        </div>
        <div class="seg" role="tablist" aria-label="Inspector view">
          ${views.map(
            ([id, label]) => html`<button
              role="tab"
              aria-selected=${this.view === id}
              ?disabled=${!w}
              @click=${() => (this.view = id)}
            >
              ${label}
            </button>`
          )}
        </div>
      </div>
      <div class="body">
        ${!w
          ? this.renderEmpty()
          : this.view === 'design'
            ? this.renderDesign(w)
            : this.view === 'bindings'
              ? this.renderBindings(w)
              : this.renderRaw(w)}
      </div>
    `;
  }
}
