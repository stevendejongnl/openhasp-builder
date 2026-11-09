import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { WidgetDef, CompositeTemplate } from '../schema';
import { tokens, controls } from '../ui/styles';
import { icon, iconForType } from '../ui/icons';

const HINTS: Record<string, string> = {
  label: 'Text, 12–32 px',
  gauge: 'Arc / meter',
  toggle_card: 'Icon, title, state',
  button: 'Tap + action',
  slider: 'Set a value',
  image: 'From /local',
  msgbox: 'Overlay dialog',
};

@customElement('ohb-widget-palette')
export class WidgetPalette extends LitElement {
  static styles = [
    tokens,
    controls,
    css`
      :host {
        display: block;
        font-family: var(--ohb-font);
        color: var(--ohb-text);
        font-size: 13px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        padding: 12px;
      }
      .tile {
        display: grid;
        justify-items: start;
        gap: 6px;
        padding: 12px;
        background: var(--ohb-panel-2);
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-md);
        text-align: left;
        cursor: grab;
        transition: border-color 120ms;
      }
      .tile:hover {
        border-color: var(--ohb-accent);
      }
      .tile .ico {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: var(--ohb-accent-soft);
        color: var(--ohb-accent);
      }
      .tile b {
        font-weight: 600;
      }
      .tile small {
        color: var(--ohb-muted);
        font-size: 11.5px;
      }
      .note {
        margin: 0 12px 16px;
        color: var(--ohb-faint);
        font-size: 12px;
      }
      .empty {
        padding: 24px 16px;
        display: grid;
        gap: 8px;
        color: var(--ohb-muted);
      }
      .empty h3 {
        margin: 0;
        color: var(--ohb-text);
        font-size: 14px;
      }
    `,
  ];

  @property({ attribute: false }) widgets: Record<string, WidgetDef> = {};
  @property({ attribute: false }) composites: CompositeTemplate[] = [];
  /** 'add' lists the built-in widgets; 'components' lists the user's saved groups. */
  @property() mode: 'add' | 'components' = 'add';

  private onDragStart(e: DragEvent, widgetType: string) {
    e.dataTransfer?.setData('application/x-ohb-widget-type', widgetType);
  }

  private onCompositeDragStart(e: DragEvent, compositeId: string) {
    e.dataTransfer?.setData('application/x-ohb-composite-id', compositeId);
  }

  private emit(name: string, detail: Record<string, string>) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    if (this.mode === 'components') {
      if (this.composites.length === 0) {
        return html`<div class="empty">
          <h3>No components yet</h3>
          <span>Select some layers, then use <b>Save selection as component</b> in the Publish menu to reuse them.</span>
        </div>`;
      }
      return html`<div class="grid">
        ${this.composites.map(
          (c) => html`
            <button
              class="tile"
              draggable="true"
              @dragstart=${(e: DragEvent) => this.onCompositeDragStart(e, c.id)}
              @click=${() => this.emit('composite-add', { compositeId: c.id })}
            >
              <span class="ico">${icon('box')}</span>
              <b>${c.name}</b>
              <small>${c.members.length} layers</small>
            </button>
          `
        )}
      </div>`;
    }
    return html`
      <div class="grid">
        ${Object.values(this.widgets).map(
          (w) => html`
            <button
              class="tile"
              draggable="true"
              @dragstart=${(e: DragEvent) => this.onDragStart(e, w.type)}
              @click=${() => this.emit('widget-add', { widgetDefId: w.type })}
            >
              <span class="ico">${icon(iconForType(w.type))}</span>
              <b>${w.type}</b>
              <small>${HINTS[w.type] ?? 'Widget'}</small>
            </button>
          `
        )}
      </div>
      <p class="note">
        Click to place in the top-left corner, or drag onto the canvas. Placed items can always be moved with the
        arrow keys or the Position fields.
      </p>
    `;
  }
}
