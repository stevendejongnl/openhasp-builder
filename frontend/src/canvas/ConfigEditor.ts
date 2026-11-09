import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

import { tokens, controls, modalStyles } from '../ui/styles';

type Tab = 'jsonl' | 'yaml';

@customElement('ohb-config-editor')
export class ConfigEditor extends LitElement {
  static styles = [
    tokens,
    controls,
    modalStyles,
    css`
      .modal {
        width: min(1200px, 95vw);
        height: 85vh;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      }
      .tabs {
        display: grid;
        grid-auto-flow: column;
        justify-content: start;
        gap: 4px;
        border-bottom: 1px solid var(--ohb-border);
      }
      .tab {
        padding: 8px 14px;
        border: 0;
        background: transparent;
        color: var(--ohb-muted);
        border-bottom: 2px solid transparent;
      }
      .tab[aria-selected='true'] {
        color: var(--ohb-text);
        border-bottom-color: var(--ohb-accent);
      }
      .editor-pane {
        min-height: 0;
        overflow: hidden;
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-sm);
      }
      .editor-pane .cm-editor {
        height: 100%;
      }
      .editor-pane .cm-scroller {
        overflow: auto;
      }
    `,
  ];

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
          ...(this.isDarkTheme() ? [oneDark] : []),
          EditorView.theme({ '&': { fontSize: '12px' }, '.cm-content': { fontFamily: 'var(--code-font-family, monospace)' } }),
        ],
      }),
      parent: container,
    });
  }

  // The code editor should follow the Home Assistant theme: the dark colour
  // scheme only when the dialog itself is dark.
  private isDarkTheme(): boolean {
    const probe = this.renderRoot.querySelector('.modal') as HTMLElement | null;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(probe ? getComputedStyle(probe).backgroundColor : '');
    if (!m) return true;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKey);
    this.addEventListener('click', this.onBackdrop);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.onClose();
  };

  private onBackdrop = (e: MouseEvent) => {
    if (e.target === this) this.onClose();
  };

  firstUpdated() {
    (this.renderRoot.querySelector('.modal') as HTMLElement | null)?.focus();
    this.jsonlContainer = this.renderRoot.querySelector('.editor-pane.jsonl') as HTMLDivElement;
    this.yamlContainer = this.renderRoot.querySelector('.editor-pane.yaml') as HTMLDivElement;
    this.jsonlView = this.makeView(this.jsonlContainer, this.jsonlText, 'jsonl');
    this.yamlView = this.makeView(this.yamlContainer, this.yamlText, 'yaml');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKey);
    this.removeEventListener('click', this.onBackdrop);
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
      <div class="modal" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="cfg-title">
        <h2 id="cfg-title">Edit config</h2>
        <div class="tabs" role="tablist" aria-label="Config file">
          <button
            class="tab"
            role="tab"
            aria-selected=${this.activeTab === 'jsonl'}
            @click=${() => (this.activeTab = 'jsonl')}
          >
            pages.jsonl (layout)
          </button>
          <button
            class="tab"
            role="tab"
            aria-selected=${this.activeTab === 'yaml'}
            @click=${() => (this.activeTab = 'yaml')}
          >
            plate.yaml (bindings)
          </button>
        </div>

        <div>
          <div class="editor-pane jsonl" style="height:100%;display:${this.activeTab === 'jsonl' ? 'block' : 'none'}"></div>
          <div class="editor-pane yaml" style="height:100%;display:${this.activeTab === 'yaml' ? 'block' : 'none'}"></div>
        </div>

        ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ''}
        ${this.warnings.length > 0
          ? html`<div class="warnings">${this.warnings.map((w) => html`<div>${w}</div>`)}</div>`
          : ''}

        <div class="actions">
          <button class="btn" @click=${this.onClose}>Close</button>
          <button class="btn primary" @click=${this.onPreview} ?disabled=${this.busy}>
            ${this.busy ? 'Previewing…' : 'Preview in canvas'}
          </button>
        </div>
      </div>
    `;
  }
}
