import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Page } from '../schema';

@customElement('ohb-layer-list')
export class LayerList extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 240px;
      border-left: 1px solid var(--divider-color, #333);
      max-height: 40%;
      overflow-y: auto;
    }
    .empty {
      color: var(--secondary-text-color, #888);
      font-size: 13px;
      padding: 12px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .row:hover {
      background: var(--secondary-background-color, #2c2c2c);
    }
    .row.selected {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }
    .row.disabled {
      opacity: 0.5;
    }
    .id {
      margin-left: auto;
      opacity: 0.6;
      font-size: 11px;
    }
  `;

  @property({ attribute: false }) page: Page | null = null;
  @property({ attribute: false }) selectedIds: Set<number> = new Set();

  private onRowPointerDown(e: PointerEvent, objId: number) {
    e.stopPropagation();
    const next = e.shiftKey || e.ctrlKey || e.metaKey ? new Set(this.selectedIds) : new Set<number>();
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && next.has(objId)) {
      next.delete(objId);
    } else {
      next.add(objId);
    }
    this.dispatchEvent(
      new CustomEvent('layer-select', {
        detail: { objIds: [...next] },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.page || this.page.widgets.length === 0) {
      return html`<div class="empty">No widgets on this page.</div>`;
    }
    return html`
      ${[...this.page.widgets]
        .slice()
        .reverse()
        .map((w) => {
          const label = (w.params as any)?.obj_type ?? w.widget_def_id;
          const classes = [
            'row',
            this.selectedIds.has(w.obj_id_start) ? 'selected' : '',
            w.disabled ? 'disabled' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return html`
            <div class=${classes} @pointerdown=${(e: PointerEvent) => this.onRowPointerDown(e, w.obj_id_start)}>
              <span>${label}</span>
              <span class="id">${w.obj_id_start}</span>
            </div>
          `;
        })}
    `;
  }
}
