import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlacedWidget } from '../schema';
import { tokens, controls, modalStyles } from '../ui/styles';

@customElement('ohb-raw-editor')
export class RawEditor extends LitElement {
  static styles = [
    tokens,
    controls,
    modalStyles,
    css`
      .modal {
        width: min(560px, 94vw);
        overflow-y: auto;
      }
    `,
  ];

  @property({ attribute: false }) widget!: PlacedWidget;
  @state() private objTypeText = '';
  @state() private staticPropsText = '';
  @state() private propertiesText = '';
  @state() private eventText = '';
  @state() private jsonError = '';

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('widget') && this.widget) {
      const params = this.widget.params as any;
      this.objTypeText = params.obj_type ?? '';
      this.staticPropsText = JSON.stringify(params.static_props ?? {}, null, 2);
      this.propertiesText = JSON.stringify(params.properties ?? {}, null, 2);
      this.eventText = JSON.stringify(params.event ?? {}, null, 2);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // A dialog: Escape and a click on the dim backdrop close it.
    window.addEventListener('keydown', this.onKey);
    this.addEventListener('click', this.onBackdrop);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKey);
    this.removeEventListener('click', this.onBackdrop);
  }

  firstUpdated() {
    (this.renderRoot.querySelector('input, textarea') as HTMLElement | null)?.focus();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.onClose();
  };

  private onBackdrop = (e: MouseEvent) => {
    if (e.target === this) this.onClose();
  };

  private onClose() {
    this.dispatchEvent(new CustomEvent('raw-editor-close', { bubbles: true, composed: true }));
  }

  private onSave() {
    try {
      const staticProps = JSON.parse(this.staticPropsText || '{}');
      const properties = JSON.parse(this.propertiesText || '{}');
      const event = JSON.parse(this.eventText || '{}');
      this.jsonError = '';
      this.dispatchEvent(
        new CustomEvent('raw-editor-save', {
          detail: {
            objId: this.widget.obj_id_start,
            params: {
              obj_type: this.objTypeText,
              static_props: staticProps,
              properties,
              event,
            },
          },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      this.jsonError = `Invalid JSON: ${(err as Error).message}`;
    }
  }

  render() {
    return html`
      <div class="modal" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="raw-title">
        <h2 id="raw-title">Raw object editor · id ${this.widget?.obj_id_start}</h2>
        <p class="hint">The object exactly as it is stored: device properties, Home Assistant bindings and events.</p>

        <label class="field">
          <span>obj type</span>
          <input
            class="txt"
            type="text"
            .value=${this.objTypeText}
            @input=${(e: Event) => (this.objTypeText = (e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span>static_props (JSON)</span>
          <textarea
            class="code"
            .value=${this.staticPropsText}
            @input=${(e: Event) => (this.staticPropsText = (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>

        <label class="field">
          <span>properties (JSON, HA templates / bindings)</span>
          <textarea
            class="code"
            .value=${this.propertiesText}
            @input=${(e: Event) => (this.propertiesText = (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>

        <label class="field">
          <span>event (JSON, HA service calls)</span>
          <textarea
            class="code"
            .value=${this.eventText}
            @input=${(e: Event) => (this.eventText = (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>

        ${this.jsonError ? html`<div class="error" role="alert">${this.jsonError}</div>` : html``}

        <div class="actions">
          <button class="btn" @click=${this.onClose}>Cancel</button>
          <button class="btn primary" @click=${this.onSave}>Save</button>
        </div>
      </div>
    `;
  }
}
