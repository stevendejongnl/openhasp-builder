import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Page, PlacedWidget } from '../schema';
import { tokens, controls } from '../ui/styles';
import { icon, iconForType } from '../ui/icons';
import { layerName, layerSize, objType } from '../lib/layers';

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
      .row.group {
        grid-template-columns: 18px 18px 1fr auto;
        font-weight: 600;
      }
      .row.child {
        padding-left: 32px;
      }
      .chev {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ohb-faint);
        display: grid;
        place-items: center;
        border-radius: 4px;
      }
      .chev:hover {
        color: var(--ohb-text);
        background: var(--ohb-panel-2);
      }
      .chev svg {
        transition: transform 120ms;
      }
      .chev[aria-expanded='true'] svg {
        transform: rotate(90deg);
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
  // Groups start collapsed; one holding a selected layer is always shown open.
  @state() private expanded: Set<string> = new Set();

  private emitSelect(objIds: number[]) {
    this.dispatchEvent(new CustomEvent('layer-select', { detail: { objIds }, bubbles: true, composed: true }));
  }

  private select(e: Event, objId: number) {
    const mod = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
    const next = mod ? new Set(this.selectedIds) : new Set<number>();
    if (mod && next.has(objId)) next.delete(objId);
    else next.add(objId);
    this.emitSelect([...next]);
  }

  // Clicking a group selects every layer in it (shift/ctrl adds or removes the group).
  private selectGroup(e: Event, ids: number[]) {
    const mod = (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
    const all = ids.every((id) => this.selectedIds.has(id));
    const next = mod ? new Set(this.selectedIds) : new Set<number>();
    for (const id of ids) {
      if (mod && all) next.delete(id);
      else next.add(id);
    }
    this.emitSelect([...next]);
  }

  private toggle(name: string, open: boolean) {
    const next = new Set(this.expanded);
    if (open) next.delete(name);
    else next.add(name);
    this.expanded = next;
  }

  private onRowKey(e: KeyboardEvent, fn: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  }

  private renderLayer(r: LayerRow, child: boolean) {
    const { w, name, type, size } = r;
    return html`
      <div
        class="row ${child ? 'child' : ''} ${w.disabled ? 'disabled' : ''}"
        role="option"
        tabindex="0"
        aria-selected=${this.selectedIds.has(w.obj_id_start)}
        @pointerdown=${(e: PointerEvent) => {
          e.stopPropagation();
          this.select(e, w.obj_id_start);
        }}
        @keydown=${(e: KeyboardEvent) => this.onRowKey(e, () => this.select(e, w.obj_id_start))}
      >
        <span class="kind">${icon(iconForType(type))}</span>
        <span class="name" title=${`${type} · id ${w.obj_id_start}`}>${name}</span>
        <span class="meta">${size.w}×${size.h}</span>
      </div>
    `;
  }

  render() {
    if (!this.page || this.page.widgets.length === 0) {
      return html`<div class="empty">No widgets on this page.</div>`;
    }
    const q = this.filter.trim().toLowerCase();
    const rows: LayerRow[] = [...this.page.widgets].reverse().map((w) => ({
      w,
      name: layerName(w, this.evaluatedValues[w.obj_id_start]),
      type: objType(w),
      size: layerSize(w, this.evaluatedValues[w.obj_id_start]),
    }));

    // Group by name, in order of first appearance (top-most layer first). A
    // plate without any comment lines has no groups and stays a flat list.
    const named = rows.some((r) => r.w.group);
    const groups = new Map<string, LayerRow[]>();
    for (const r of rows) {
      const key = named ? r.w.group || 'Ungrouped' : '';
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const matches = (r: LayerRow) => !q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);

    const body = [...groups.entries()].flatMap(([group, members]) => {
      const shown = q ? members.filter(matches) : members;
      const groupMatches = q && group.toLowerCase().includes(q);
      const visible = groupMatches ? members : shown;
      if (visible.length === 0) return [];
      if (!named) return visible.map((r) => this.renderLayer(r, false));

      const ids = members.map((m) => m.w.obj_id_start);
      const hasSelection = ids.some((id) => this.selectedIds.has(id));
      const open = this.expanded.has(group) || hasSelection || !!q;
      return [
        html`
          <div
            class="row group"
            role="option"
            tabindex="0"
            aria-selected=${ids.every((id) => this.selectedIds.has(id))}
            @pointerdown=${(e: PointerEvent) => {
              if ((e.target as HTMLElement).closest('.chev')) return;
              e.stopPropagation();
              this.selectGroup(e, ids);
            }}
            @keydown=${(e: KeyboardEvent) => this.onRowKey(e, () => this.selectGroup(e, ids))}
          >
            <button
              class="chev"
              aria-label=${`${open ? 'Collapse' : 'Expand'} ${group}`}
              aria-expanded=${open}
              @click=${(e: Event) => {
                e.stopPropagation();
                this.toggle(group, open);
              }}
            >
              ${icon('chev-right')}
            </button>
            <span class="kind">${icon('box')}</span>
            <span class="name" title=${group}>${group}</span>
            <span class="meta">${members.length}</span>
          </div>
        `,
        ...(open ? visible.map((r) => this.renderLayer(r, true)) : []),
      ];
    });

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
        ${body.length === 0 ? html`<div class="empty">No layer matches “${this.filter}”.</div>` : body}
      </div>
    `;
  }
}

interface LayerRow {
  w: PlacedWidget;
  name: string;
  type: string;
  size: { w: number; h: number };
}
