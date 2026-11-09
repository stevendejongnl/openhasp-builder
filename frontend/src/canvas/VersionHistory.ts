import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Version } from '../schema';
import { tokens, controls } from '../ui/styles';

@customElement('ohb-version-history')
export class VersionHistory extends LitElement {
  static styles = [
    tokens,
    controls,
    css`
      :host {
        display: block;
        padding: 12px;
        font-family: var(--ohb-font);
        color: var(--ohb-text);
        font-size: 13px;
      }
      .empty {
        color: var(--ohb-muted);
        padding: 12px 4px;
      }
      ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .version {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--ohb-panel-2);
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-md);
      }
      .version.pinned {
        border-color: var(--ohb-accent);
      }
      .label {
        font-weight: 500;
        overflow-wrap: anywhere;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
        align-items: center;
        color: var(--ohb-muted);
        font: 400 11.5px var(--ohb-mono);
      }
      .badge {
        padding: 0 6px;
        border-radius: 999px;
        font: 500 11px/18px var(--ohb-font);
        border: 1px solid var(--ohb-border);
      }
      .badge.pinned {
        background: var(--ohb-accent-soft);
        border-color: var(--ohb-accent);
        color: var(--ohb-accent);
      }
      .badge.published {
        color: var(--ohb-ok);
        border-color: var(--ohb-ok);
      }
    `,
  ];

  @property({ attribute: false }) versions: Version[] = [];

  private onRestore(versionNumber: number) {
    this.dispatchEvent(
      new CustomEvent('version-restore', {
        detail: { versionNumber },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (this.versions.length === 0) {
      return html`<div class="empty">No versions yet. Publishing or re-importing saves one.</div>`;
    }
    // Newest first; version 1 (the pinned first import) is never pruned.
    const ordered = [...this.versions].reverse();
    return html`
      <ol>
        ${ordered.map(
          (v) => html`
            <li class="version ${v.version_number === 1 ? 'pinned' : ''}">
              <div>
                <div class="label">${v.label}</div>
                <div class="meta">
                  <span>v${v.version_number}</span>
                  ${v.version_number === 1 ? html`<span class="badge pinned">pinned</span>` : html``}
                  ${v.published ? html`<span class="badge published">published</span>` : html``}
                </div>
              </div>
              <button
                class="btn"
                aria-label=${`Restore version ${v.version_number}: ${v.label}`}
                @click=${() => this.onRestore(v.version_number)}
              >
                Restore
              </button>
            </li>
          `
        )}
      </ol>
    `;
  }
}
