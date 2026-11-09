import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Version } from '../schema';

@customElement('ohb-version-history')
export class VersionHistory extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 280px;
      border-left: 1px solid var(--divider-color, #333);
      padding: 12px;
      overflow-y: auto;
    }
    h3 {
      font-size: 13px;
      margin: 0 0 8px 0;
      color: var(--secondary-text-color, #888);
    }
    .empty {
      color: var(--secondary-text-color, #888);
      font-size: 13px;
    }
    .version {
      padding: 8px;
      margin-bottom: 4px;
      border: 1px solid var(--divider-color, #333);
      border-radius: 4px;
      font-size: 12px;
    }
    .version.pinned {
      border-color: var(--primary-color, #03a9f4);
    }
    .version .label {
      font-weight: 500;
    }
    .version .meta {
      display: flex;
      gap: 6px;
      margin-top: 2px;
      color: var(--secondary-text-color, #888);
    }
    .badge {
      display: inline-block;
      padding: 0 5px;
      border-radius: 3px;
      font-size: 10px;
      line-height: 16px;
    }
    .badge.pinned {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }
    .badge.published {
      background: #4caf50;
      color: #fff;
    }
    button {
      margin-top: 6px;
      padding: 3px 10px;
      border: none;
      border-radius: 3px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      cursor: pointer;
      font-size: 11px;
    }
    button:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }
  `;

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
      return html`<h3>Version History</h3>
        <div class="empty">No versions yet.</div>`;
    }
    // Most recent first, but version 1 (pinned initial import) always sorts to the front already
    // per the backend's pruning order -- just reverse so newest is on top for browsing.
    const ordered = [...this.versions].reverse();
    return html`
      <h3>Version History</h3>
      ${ordered.map(
        (v) => html`
          <div class="version ${v.version_number === 1 ? 'pinned' : ''}">
            <div class="label">${v.label}</div>
            <div class="meta">
              <span>v${v.version_number}</span>
              ${v.version_number === 1 ? html`<span class="badge pinned">pinned</span>` : html``}
              ${v.published ? html`<span class="badge published">published</span>` : html``}
            </div>
            <button @click=${() => this.onRestore(v.version_number)}>Restore</button>
          </div>
        `
      )}
    `;
  }
}
