import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

type Tab = 'jsonl' | 'yaml';

@customElement('ohb-config-editor')
export class ConfigEditor extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
      z-index: 100;
    }
    .modal {
      width: 1200px;
      max-width: 95vw;
      height: 85vh;
      display: flex;
      flex-direction: column;
      background: var(--card-background-color, #222);
      border-radius: 6px;
      padding: 16px;
      color: var(--primary-text-color, #eee);
    }
    h3 {
      margin: 0 0 8px 0;
      font-size: 15px;
    }
    .tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid var(--divider-color, #333);
    }
    .tab {
      padding: 6px 14px;
      cursor: pointer;
      font-size: 13px;
      color: var(--secondary-text-color, #888);
      border-bottom: 2px solid transparent;
    }
    .tab.active {
      color: var(--primary-text-color, #eee);
      border-bottom-color: var(--primary-color, #03a9f4);
    }
    .editor-pane {
      flex: 1;
      min-height: 0;
      margin-top: 8px;
      overflow: hidden;
      border: 1px solid var(--divider-color, #333);
      border-radius: 3px;
    }
    .editor-pane .cm-editor {
      height: 100%;
    }
    .editor-pane .cm-scroller {
      overflow: auto;
    }
    .warnings {
      color: #ffb74d;
      font-size: 12px;
      margin-top: 8px;
      max-height: 80px;
      overflow-y: auto;
    }
    .error {
      color: #ff6b6b;
      font-size: 12px;
      margin-top: 8px;
    }
    .actions {
      margin-top: 14px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    button {
      padding: 6px 14px;
      border: 1px solid var(--divider-color, #333);
      border-radius: 3px;
      background: var(--secondary-background-color, #2c2c2c);
      color: inherit;
      cursor: pointer;
      font-size: 13px;
    }
    button.primary {
      background: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
      color: #fff;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;

  @property({ attribute: false }) jsonlText = '';
  @property({ attribute: false }) yamlText = '';
  @property({ attribute: false }) busy = false;
  @property({ attribute: false }) warnings: string[] = [];
  @property({ attribute: false }) error = '';
  @state() private activeTab: Tab = 'jsonl';

  // CodeMirror manages its own DOM/state outside Lit's render cycle -- one
  // persistent EditorView per tab, created once and reused, so cursor
  // position/scroll/undo history survive switching tabs back and forth.
  private jsonlView?: EditorView;
  private yamlView?: EditorView;
  private jsonlContainer?: HTMLDivElement;
  private yamlContainer?: HTMLDivElement;

  private makeView(container: HTMLDivElement, doc: string, lang: 'jsonl' | 'yaml'): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          lang === 'jsonl' ? json() : yaml(),
          oneDark,
          EditorView.theme({ '&': { fontSize: '12px' }, '.cm-content': { fontFamily: 'monospace' } }),
        ],
      }),
      parent: container,
    });
  }

  firstUpdated() {
    this.jsonlContainer = this.renderRoot.querySelector('.editor-pane.jsonl') as HTMLDivElement;
    this.yamlContainer = this.renderRoot.querySelector('.editor-pane.yaml') as HTMLDivElement;
    this.jsonlView = this.makeView(this.jsonlContainer, this.jsonlText, 'jsonl');
    this.yamlView = this.makeView(this.yamlContainer, this.yamlText, 'yaml');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.jsonlView?.destroy();
    this.yamlView?.destroy();
  }

  private onClose() {
    this.dispatchEvent(new CustomEvent('config-editor-close', { bubbles: true, composed: true }));
  }

  private onPreview() {
    const jsonl = this.jsonlView?.state.doc.toString() ?? this.jsonlText;
    const yamlText = this.yamlView?.state.doc.toString() ?? this.yamlText;
    this.dispatchEvent(
      new CustomEvent('config-editor-preview', {
        detail: { jsonl, yaml: yamlText },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    return html`
      <div class="modal">
        <h3>Raw Config Editor</h3>
        <div class="tabs">
          <div
            class="tab ${this.activeTab === 'jsonl' ? 'active' : ''}"
            @click=${() => (this.activeTab = 'jsonl')}
          >
            dashboard_pages.jsonl (layout)
          </div>
          <div
            class="tab ${this.activeTab === 'yaml' ? 'active' : ''}"
            @click=${() => (this.activeTab = 'yaml')}
          >
            dashboard.yaml (bindings)
          </div>
        </div>

        <div class="editor-pane jsonl" style="display:${this.activeTab === 'jsonl' ? 'block' : 'none'}"></div>
        <div class="editor-pane yaml" style="display:${this.activeTab === 'yaml' ? 'block' : 'none'}"></div>

        ${this.error ? html`<div class="error">${this.error}</div>` : ''}
        ${this.warnings.length > 0
          ? html`<div class="warnings">${this.warnings.map((w) => html`<div>${w}</div>`)}</div>`
          : ''}

        <div class="actions">
          <button @click=${this.onClose}>Close</button>
          <button class="primary" @click=${this.onPreview} ?disabled=${this.busy}>
            ${this.busy ? 'Previewing…' : 'Preview in canvas'}
          </button>
        </div>
      </div>
    `;
  }
}
