import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Theme } from '../schema';

const COLOR_FIELDS: Array<{ key: keyof Theme['colors']; label: string }> = [
  { key: 'bg', label: 'Background' },
  { key: 'card_bg', label: 'Card background' },
  { key: 'accent_on', label: 'Accent (on)' },
  { key: 'accent_off', label: 'Accent (off)' },
  { key: 'text', label: 'Text' },
  { key: 'text_muted', label: 'Text (muted)' },
];

@customElement('ohb-theme-editor')
export class ThemeEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 300px;
      border-left: 1px solid var(--divider-color, #333);
      padding: 12px;
      overflow-y: auto;
    }
    h3 {
      font-size: 13px;
      margin: 0 0 8px 0;
      color: var(--secondary-text-color, #888);
    }
    select {
      width: 100%;
      margin-bottom: 10px;
      padding: 4px 6px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      border-radius: 3px;
    }
    label {
      display: block;
      font-size: 12px;
      margin-top: 8px;
      margin-bottom: 2px;
      color: var(--secondary-text-color, #888);
    }
    .color-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .color-row input[type='color'] {
      width: 32px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--divider-color, #333);
      border-radius: 3px;
      background: none;
    }
    .color-row span {
      font-size: 12px;
    }
    input[type='text'],
    input[type='number'] {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      border-radius: 3px;
    }
    .row {
      display: flex;
      gap: 6px;
    }
    .row > div {
      flex: 1;
    }
    button {
      margin-top: 12px;
      padding: 6px 14px;
      border: none;
      border-radius: 3px;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      cursor: pointer;
      font-size: 13px;
    }
  `;

  @property({ attribute: false }) themes: Theme[] = [];
  @property({ attribute: false }) activeThemeId = '';
  @state() private draft: Theme | null = null;
  @state() private draftName = '';
  @state() private isNew = false;

  willUpdate(changed: Map<string, unknown>) {
    if ((changed.has('themes') || changed.has('activeThemeId')) && !this.draft) {
      this.loadDraftFromActive();
    }
  }

  private loadDraftFromActive() {
    const found = this.themes.find((t) => t.id === this.activeThemeId);
    if (found) {
      this.draft = structuredClone(found);
      this.draftName = found.name;
      this.isNew = false;
    }
  }

  private onSelectTheme(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    if (id === '__new__') {
      const base = this.themes[0];
      this.draft = base
        ? structuredClone(base)
        : {
            id: '',
            name: '',
            colors: { bg: '#111111', card_bg: '#1c1c1c', accent_on: '#4caf50', accent_off: '#6F6F6F', text: '#FFFFFF', text_muted: '#9b9b9b' },
            fonts: { family: 'montserrat', sizes: { label: 16, value: 24 } },
            spacing: { grid_unit: 5, corner_radius: 15, padding: 10 },
          };
      this.draft.id = '';
      this.draftName = '';
      this.isNew = true;
      return;
    }
    this.dispatchEvent(
      new CustomEvent('theme-select', { detail: { themeId: id }, bubbles: true, composed: true })
    );
    this.draft = null; // force reload from the newly-selected theme
    this.activeThemeId = id;
    this.loadDraftFromActive();
  }

  private updateColor(key: keyof Theme['colors'], value: string) {
    if (!this.draft) return;
    this.draft = { ...this.draft, colors: { ...this.draft.colors, [key]: value } };
  }

  private updateSpacing(field: keyof Theme['spacing'], value: number) {
    if (!this.draft) return;
    this.draft = { ...this.draft, spacing: { ...this.draft.spacing, [field]: value } };
  }

  private updateFontFamily(value: string) {
    if (!this.draft) return;
    this.draft = { ...this.draft, fonts: { ...this.draft.fonts, family: value } };
  }

  private async onSave() {
    if (!this.draft) return;
    const id = this.isNew
      ? this.draftName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
      : this.draft.id;
    if (!id) return;
    const theme: Theme = { ...this.draft, id, name: this.draftName.trim() || id };
    this.dispatchEvent(
      new CustomEvent('theme-save', { detail: { theme }, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <h3>Theme</h3>
      <select @change=${this.onSelectTheme} .value=${this.isNew ? '__new__' : this.activeThemeId}>
        ${this.themes.map((t) => html`<option value=${t.id}>${t.name}</option>`)}
        <option value="__new__">+ New theme...</option>
      </select>

      ${this.draft
        ? html`
            <label>Name</label>
            <input
              type="text"
              .value=${this.draftName}
              @input=${(e: Event) => (this.draftName = (e.target as HTMLInputElement).value)}
            />

            <label>Colors</label>
            ${COLOR_FIELDS.map(
              (f) => html`
                <div class="color-row">
                  <input
                    type="color"
                    .value=${this.draft!.colors[f.key]}
                    @input=${(e: Event) => this.updateColor(f.key, (e.target as HTMLInputElement).value)}
                  />
                  <span>${f.label}</span>
                </div>
              `
            )}

            <label>Font family</label>
            <input
              type="text"
              .value=${this.draft.fonts.family}
              @input=${(e: Event) => this.updateFontFamily((e.target as HTMLInputElement).value)}
            />

            <label>Spacing</label>
            <div class="row">
              <div>
                <input
                  type="number"
                  .value=${String(this.draft.spacing.grid_unit)}
                  @change=${(e: Event) => this.updateSpacing('grid_unit', Number((e.target as HTMLInputElement).value))}
                />
              </div>
              <div>
                <input
                  type="number"
                  .value=${String(this.draft.spacing.corner_radius)}
                  @change=${(e: Event) => this.updateSpacing('corner_radius', Number((e.target as HTMLInputElement).value))}
                />
              </div>
              <div>
                <input
                  type="number"
                  .value=${String(this.draft.spacing.padding)}
                  @change=${(e: Event) => this.updateSpacing('padding', Number((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>

            <button @click=${this.onSave}>${this.isNew ? 'Create Theme' : 'Save Theme'}</button>
          `
        : html``}
    `;
  }
}
