import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlacedWidget } from '../schema';

@customElement('ohb-raw-editor')
export class RawEditor extends LitElement {
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
      width: 480px;
      max-height: 80vh;
      overflow-y: auto;
      background: var(--card-background-color, #222);
      border-radius: 6px;
      padding: 16px;
      color: var(--primary-text-color, #eee);
    }
    h3 {
      margin-top: 0;
      font-size: 15px;
    }
    label {
      display: block;
      font-size: 12px;
      margin-top: 10px;
      margin-bottom: 2px;
      color: var(--secondary-text-color, #888);
    }
    input[type='text'] {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      border-radius: 3px;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 120px;
      font-family: monospace;
      font-size: 12px;
      padding: 6px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      border-radius: 3px;
    }
    .error {
      color: #ff6b6b;
      font-size: 12px;
      margin-top: 4px;
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
  `;

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
      <div class="modal">
        <h3>Raw Object Editor — id ${this.widget?.obj_id_start}</h3>

        <label>obj type</label>
        <input
          type="text"
          .value=${this.objTypeText}
          @input=${(e: Event) => (this.objTypeText = (e.target as HTMLInputElement).value)}
        />

        <label>static_props (JSON)</label>
        <textarea
          .value=${this.staticPropsText}
          @input=${(e: Event) => (this.staticPropsText = (e.target as HTMLTextAreaElement).value)}
        ></textarea>

        <label>properties (JSON, HA templates/bindings)</label>
        <textarea
          .value=${this.propertiesText}
          @input=${(e: Event) => (this.propertiesText = (e.target as HTMLTextAreaElement).value)}
        ></textarea>

        <label>event (JSON, HA service calls)</label>
        <textarea
          .value=${this.eventText}
          @input=${(e: Event) => (this.eventText = (e.target as HTMLTextAreaElement).value)}
        ></textarea>

        ${this.jsonError ? html`<div class="error">${this.jsonError}</div>` : html``}

        <div class="actions">
          <button @click=${this.onClose}>Cancel</button>
          <button class="primary" @click=${this.onSave}>Save</button>
        </div>
      </div>
    `;
  }
}
