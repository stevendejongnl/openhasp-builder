import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { WidgetDef, CompositeTemplate } from '../schema';

@customElement('ohb-widget-palette')
export class WidgetPalette extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 200px;
      border-right: 1px solid var(--divider-color, #333);
      padding: 8px;
      overflow-y: auto;
    }
    h4 {
      font-size: 11px;
      text-transform: uppercase;
      color: var(--secondary-text-color, #888);
      margin: 12px 0 4px 0;
    }
    h4:first-child {
      margin-top: 0;
    }
    .item {
      padding: 8px;
      margin-bottom: 4px;
      border: 1px solid var(--divider-color, #333);
      border-radius: 4px;
      cursor: grab;
      font-size: 13px;
      user-select: none;
    }
    .item:hover {
      background: var(--secondary-background-color, #2c2c2c);
    }
  `;

  @property({ attribute: false }) widgets: Record<string, WidgetDef> = {};
  @property({ attribute: false }) composites: CompositeTemplate[] = [];

  private onDragStart(e: DragEvent, widgetType: string) {
    e.dataTransfer?.setData('application/x-ohb-widget-type', widgetType);
  }

  private onCompositeDragStart(e: DragEvent, compositeId: string) {
    e.dataTransfer?.setData('application/x-ohb-composite-id', compositeId);
  }

  render() {
    return html`
      <h4>Built-in</h4>
      ${Object.values(this.widgets).map(
        (w) => html`
          <div
            class="item"
            draggable="true"
            @dragstart=${(e: DragEvent) => this.onDragStart(e, w.type)}
          >
            ${w.type}
          </div>
        `
      )}
      ${this.composites.length > 0
        ? html`
            <h4>My Groups</h4>
            ${this.composites.map(
              (c) => html`
                <div
                  class="item"
                  draggable="true"
                  @dragstart=${(e: DragEvent) => this.onCompositeDragStart(e, c.id)}
                >
                  ${c.name}
                </div>
              `
            )}
          `
        : html``}
    `;
  }
}
