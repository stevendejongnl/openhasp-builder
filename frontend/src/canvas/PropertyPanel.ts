import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlacedWidget, WidgetDef } from '../schema';

@customElement('ohb-property-panel')
export class PropertyPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 240px;
      border-left: 1px solid var(--divider-color, #333);
      padding: 12px;
      overflow-y: auto;
    }
    .empty {
      color: var(--secondary-text-color, #888);
      font-size: 13px;
    }
    label {
      display: block;
      font-size: 12px;
      margin-top: 10px;
      margin-bottom: 2px;
      color: var(--secondary-text-color, #888);
    }
    input[type='text'],
    input[type='number'] {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      border-radius: 3px;
    }
    .row {
      display: flex;
      gap: 6px;
    }
    .row > div {
      flex: 1;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 80px;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 6px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      border-radius: 3px;
    }
    .error {
      color: #ff6b6b;
      font-size: 11px;
      margin-top: 2px;
    }
  `;

  @property({ attribute: false }) widget: PlacedWidget | null = null;
  @property({ attribute: false }) widgetDef: WidgetDef | null = null;
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

  private emitParamChange(key: string, value: string) {
    this.dispatchEvent(
      new CustomEvent('param-change', {
        detail: { objId: this.widget!.obj_id_start, key, value },
        bubbles: true,
        composed: true,
      })
    );
  }

  private emitGeometryChange(field: 'x' | 'y' | 'w' | 'h', value: number) {
    this.dispatchEvent(
      new CustomEvent('geometry-change', {
        detail: { objId: this.widget!.obj_id_start, field, value },
        bubbles: true,
        composed: true,
      })
    );
  }

  private commitBinding(key: 'properties' | 'event', text: string) {
    try {
      const value = JSON.parse(text || '{}');
      if (key === 'properties') this.propertiesError = '';
      else this.eventError = '';
      this.dispatchEvent(
        new CustomEvent('param-change', {
          detail: { objId: this.widget!.obj_id_start, key, value },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      const message = `Invalid JSON: ${(err as Error).message}`;
      if (key === 'properties') this.propertiesError = message;
      else this.eventError = message;
    }
  }

  render() {
    if (!this.widget) {
      return html`<div class="empty">Select a widget to edit its properties.</div>`;
    }
    const w = this.widget;
    return html`
      <div><strong>${w.widget_def_id}</strong> (id ${w.obj_id_start})</div>

      <label>Position / Size</label>
      <div class="row">
        <div>
          <input
            type="number"
            .value=${String(w.x)}
            @change=${(e: Event) => this.emitGeometryChange('x', Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div>
          <input
            type="number"
            .value=${String(w.y)}
            @change=${(e: Event) => this.emitGeometryChange('y', Number((e.target as HTMLInputElement).value))}
          />
        </div>
      </div>
      <div class="row">
        <div>
          <input
            type="number"
            .value=${String(w.w)}
            @change=${(e: Event) => this.emitGeometryChange('w', Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div>
          <input
            type="number"
            .value=${String(w.h)}
            @change=${(e: Event) => this.emitGeometryChange('h', Number((e.target as HTMLInputElement).value))}
          />
        </div>
      </div>

      ${this.widgetDef
        ? this.widgetDef.param_schema.map(
            (paramName) => html`
              <label>${paramName}</label>
              <input
                type="text"
                .value=${String(w.params[paramName] ?? '')}
                @change=${(e: Event) =>
                  this.emitParamChange(paramName, (e.target as HTMLInputElement).value)}
              />
            `
          )
        : html``}

      <label>properties (JSON, HA state bindings)</label>
      <textarea
        .value=${this.propertiesText}
        @change=${(e: Event) => this.commitBinding('properties', (e.target as HTMLTextAreaElement).value)}
      ></textarea>
      ${this.propertiesError ? html`<div class="error">${this.propertiesError}</div>` : html``}

      <label>event (JSON, HA service calls)</label>
      <textarea
        .value=${this.eventText}
        @change=${(e: Event) => this.commitBinding('event', (e.target as HTMLTextAreaElement).value)}
      ></textarea>
      ${this.eventError ? html`<div class="error">${this.eventError}</div>` : html``}
    `;
  }
}
