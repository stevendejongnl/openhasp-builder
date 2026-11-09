import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { tokens, controls } from '../ui/styles';
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
  static styles = [
    tokens,
    controls,
    css`
      :host {
        display: grid;
        gap: 12px;
        padding: 12px;
        font-family: var(--ohb-font);
        color: var(--ohb-text);
        font-size: 13px;
      }
      .field {
        display: grid;
        gap: 4px;
      }
      .field > span,
      .group-label {
        color: var(--ohb-muted);
        font-size: 11.5px;
      }
      select {
        height: var(--ohb-ctl);
        padding: 0 8px;
        background: var(--ohb-panel-2);
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-sm);
        color: inherit;
        font: inherit;
      }
      .color-row {
        display: grid;
        grid-template-columns: 32px 1fr;
        gap: 8px;
        align-items: center;
      }
      .color-row input[type='color'] {
        width: 32px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--ohb-border);
        border-radius: var(--ohb-r-sm);
        background: none;
        cursor: pointer;
      }
      .spacing {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
    `,
  ];

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
      <label class="field">
        <span>Theme</span>
        <select @change=${this.onSelectTheme} .value=${this.isNew ? '__new__' : this.activeThemeId}>
          ${this.themes.map((t) => html`<option value=${t.id}>${t.name}</option>`)}
          <option value="__new__">+ New theme…</option>
        </select>
      </label>

      ${this.draft
        ? html`
            <label class="field">
              <span>Name</span>
              <input
                class="txt"
                type="text"
                .value=${this.draftName}
                @input=${(e: Event) => (this.draftName = (e.target as HTMLInputElement).value)}
              />
            </label>

            <div class="field" role="group" aria-label="Colours">
              <span class="group-label">Colours</span>
              ${COLOR_FIELDS.map(
                (f) => html`
                  <label class="color-row">
                    <input
                      type="color"
                      .value=${this.draft!.colors[f.key]}
                      @input=${(e: Event) => this.updateColor(f.key, (e.target as HTMLInputElement).value)}
                    />
                    <span>${f.label}</span>
                  </label>
                `
              )}
            </div>

            <label class="field">
              <span>Font family</span>
              <input
                class="txt"
                type="text"
                .value=${this.draft.fonts.family}
                @input=${(e: Event) => this.updateFontFamily((e.target as HTMLInputElement).value)}
              />
            </label>

            <div class="field" role="group" aria-label="Spacing">
              <span class="group-label">Spacing (grid · corner radius · padding)</span>
              <div class="spacing">
                ${(
                  [
                    ['grid_unit', 'Grid unit'],
                    ['corner_radius', 'Corner radius'],
                    ['padding', 'Padding'],
                  ] as const
                ).map(
                  ([key, label]) => html`<input
                    class="txt"
                    type="number"
                    aria-label=${label}
                    .value=${String(this.draft!.spacing[key])}
                    @change=${(e: Event) => this.updateSpacing(key, Number((e.target as HTMLInputElement).value))}
                  />`
                )}
              </div>
            </div>

            <button class="btn primary" @click=${this.onSave}>${this.isNew ? 'Create theme' : 'Save theme'}</button>
          `
        : html``}
    `;
  }
}
