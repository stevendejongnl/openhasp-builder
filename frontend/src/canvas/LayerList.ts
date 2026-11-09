import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Page, PlacedWidget } from '../schema';
import { tokens, controls } from '../ui/styles';
import { icon, iconForType } from '../ui/icons';

function objType(w: PlacedWidget): string {
  return String((w.params as any)?.obj_type ?? w.widget_def_id);
}

// A layer's name is what you recognise on the canvas: a label's text, else its
// type. Live (template-evaluated) text wins over the literal in the jsonl.
export function layerName(w: PlacedWidget, evaluated?: Record<string, string>): string {
  const type = objType(w);
  const staticText = (w.params as any)?.static_props?.text;
  const text = evaluated?.text ?? (typeof staticText === 'string' ? staticText : '');
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if ((type === 'label' || type === 'btn') && trimmed) {
    return trimmed.length > 26 ? `${trimmed.slice(0, 25)}…` : trimmed;
  }
  if (type === 'obj') return describeObj(w, evaluated);
  return type;
}

// Plain `obj` rows are cards, bars, icon discs and invisible touch areas; name
// them by what they look like instead of a wall of identical "obj".
function describeObj(w: PlacedWidget, evaluated?: Record<string, string>): string {
  const sp = ((w.params as any)?.static_props ?? {}) as Record<string, unknown>;
  const geo = layerSize(w, evaluated);
  if (sp.bg_opa === 0 || (sp.bg_color === undefined && evaluated?.bg_color === undefined)) return 'touch area';
  if (geo.h <= 12) return evaluated?.w !== undefined ? 'bar fill' : 'bar track';
  if (geo.w === geo.h) return 'disc';
  if (geo.w >= 100 && geo.h >= 40) return 'card';
  return 'box';
}

// Size shown for a layer: live (template-evaluated) w/h win over the jsonl literal.
export function layerSize(w: PlacedWidget, evaluated?: Record<string, string>): { w: number; h: number } {
  const num = (key: string, fallback: number) => {
    const n = Number(evaluated?.[key]);
    return evaluated?.[key] !== undefined && Number.isFinite(n) ? n : fallback;
  };
  return { w: num('w', w.w), h: num('h', w.h) };
}

@customElement('ohb-layer-list')
export class LayerList extends LitElement {
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
      .search {
        margin: 12px;
        position: relative;
        display: grid;
      }
      .search input {
        height: var(--ohb-ctl);
        padding: 0 12px 0 32px;
        background: var(--ohb-panel-2);
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-sm);
        color: inherit;
        font: inherit;
      }
      .search input::placeholder {
        color: var(--ohb-faint);
      }
      .search svg {
        position: absolute;
        left: 10px;
        top: 8px;
        color: var(--ohb-faint);
      }
      .list {
        display: grid;
        padding: 0 8px 16px;
      }
      .row {
        display: grid;
        grid-template-columns: 18px 1fr auto;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        padding: 0 8px;
        border-radius: var(--ohb-r-sm);
        cursor: pointer;
        user-select: none;
      }
      .row:hover {
        background: var(--ohb-panel-2);
      }
      .row[aria-selected='true'] {
        background: var(--ohb-accent-soft);
        box-shadow: inset 2px 0 0 var(--ohb-accent);
      }
      .row.disabled {
        opacity: 0.5;
      }
      .row .kind {
        color: var(--ohb-faint);
      }
      .row .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row .meta {
        color: var(--ohb-faint);
        font: 400 11px var(--ohb-mono);
      }
      .empty {
        color: var(--ohb-muted);
        padding: 12px 16px;
      }
    `,
  ];

  @property({ attribute: false }) page: Page | null = null;
  @property({ attribute: false }) selectedIds: Set<number> = new Set();
  @property({ attribute: false }) evaluatedValues: Record<number, Record<string, string>> = {};
  @state() private filter = '';

  private select(e: Event, objId: number) {
    const mod = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
    const next = mod ? new Set(this.selectedIds) : new Set<number>();
    if (mod && next.has(objId)) next.delete(objId);
    else next.add(objId);
    this.dispatchEvent(
      new CustomEvent('layer-select', { detail: { objIds: [...next] }, bubbles: true, composed: true })
    );
  }

  render() {
    if (!this.page || this.page.widgets.length === 0) {
      return html`<div class="empty">No widgets on this page.</div>`;
    }
    const q = this.filter.trim().toLowerCase();
    const rows = [...this.page.widgets]
      .reverse()
      .map((w) => ({
        w,
        name: layerName(w, this.evaluatedValues[w.obj_id_start]),
        type: objType(w),
        size: layerSize(w, this.evaluatedValues[w.obj_id_start]),
      }))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q));

    return html`
      <label class="search">
        <span class="sr">Filter layers</span>
        ${icon('search')}
        <input
          placeholder="Filter layers…"
          autocomplete="off"
          .value=${this.filter}
          @input=${(e: Event) => (this.filter = (e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="list" role="listbox" aria-label="Layers" aria-multiselectable="true">
        ${rows.length === 0
          ? html`<div class="empty">No layer matches “${this.filter}”.</div>`
          : rows.map(
              ({ w, name, type, size }) => html`
                <div
                  class="row ${w.disabled ? 'disabled' : ''}"
                  role="option"
                  tabindex="0"
                  aria-selected=${this.selectedIds.has(w.obj_id_start)}
                  @pointerdown=${(e: PointerEvent) => {
                    e.stopPropagation();
                    this.select(e, w.obj_id_start);
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      this.select(e, w.obj_id_start);
                    }
                  }}
                >
                  <span class="kind">${icon(iconForType(type))}</span>
                  <span class="name" title=${`${type} · id ${w.obj_id_start}`}>${name}</span>
                  <span class="meta">${size.w}×${size.h}</span>
                </div>
              `
            )}
      </div>
    `;
  }
}
