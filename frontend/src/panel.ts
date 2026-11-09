import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './canvas/WidgetPalette';
import './canvas/Canvas';
import './canvas/LayerList';
import './canvas/PropertyPanel';
import './canvas/VersionHistory';
import './canvas/ThemeEditor';
import './canvas/RawEditor';
import './canvas/ConfigEditor';
import * as api from './api/client';
import type {
  Plate,
  WidgetDef,
  PlacedWidget,
  DeviceProfile,
  Version,
  Theme,
  CompositeTemplate,
} from './schema';

const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  square_480: { id: 'square_480', name: '480x480 Square Panel', width: 480, height: 480 },
};

let nextTempObjId = -1;

// openHASP page 0 is the global layer (msgboxes etc. drawn on top of every
// page), not a screen -- open on the first real page (id >= 1) instead.
function firstVisiblePageId(plate: Plate): number | null {
  const real = plate.pages.filter((p) => p.id >= 1);
  const pick = real.find((p) => p.has_declaration) ?? real[0] ?? plate.pages[0];
  return pick?.id ?? null;
}

@customElement('openhasp-builder-panel')
export class OpenhaspBuilderPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: var(--paper-font-body1_-_font-family, sans-serif);
      color: var(--primary-text-color, #eee);
      background: var(--primary-background-color, #1c1c1c);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--divider-color, #333);
    }
    .toolbar input[type='text'] {
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      padding: 4px 8px;
      border-radius: 3px;
    }
    .tabs {
      display: flex;
      gap: 4px;
    }
    .tab {
      padding: 4px 10px;
      border: 1px solid var(--divider-color, #333);
      border-radius: 3px;
      cursor: pointer;
      font-size: 13px;
    }
    .tab.active {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }
    button {
      padding: 6px 14px;
      border: none;
      border-radius: 3px;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      cursor: pointer;
      font-size: 13px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .canvas-area {
      flex: 1;
      overflow: auto;
      padding: 20px;
    }
    .side-stack {
      display: flex;
      flex-direction: column;
    }
    .errors {
      margin-left: auto;
      color: #ff6b6b;
      font-size: 12px;
      max-width: 400px;
    }
    .status {
      font-size: 12px;
      color: var(--secondary-text-color, #888);
    }
    .notice {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding: 24px;
      max-width: 640px;
    }
    .error-text {
      color: #ff6b6b;
      font-size: 14px;
    }
    code {
      font-size: 12px;
      background: var(--secondary-background-color, #2c2c2c);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .warnings {
      font-size: 12px;
      color: #ffb74d;
      max-width: 400px;
      max-height: 3.6em;
      overflow: auto;
    }
    .notice h2 {
      margin: 0;
      font-size: 20px;
    }
    .notice h3 {
      margin: 0 0 6px;
      font-size: 14px;
      color: var(--secondary-text-color, #888);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .notice section {
      width: 100%;
    }
    .plate-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .plate-list li {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .new-plate {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
    }
    .notice input[type='text'] {
      background: var(--secondary-background-color, #2c2c2c);
      border: 1px solid var(--divider-color, #333);
      color: inherit;
      padding: 6px 8px;
      border-radius: 3px;
    }
  `;

  // Set by HA's panel resolver, not by us. Needed for authenticated REST calls.
  @property({ attribute: false }) public hass?: { callApi<T>(m: string, p: string, b?: unknown): Promise<T> };

  // No default plate: with nothing selected the picker is shown, so the panel
  // never guesses at an id that may not exist. `?plate=` still deep-links.
  @state() private plateId = new URLSearchParams(location.search).get('plate') || '';
  @state() private plate: Plate | null = null;
  @state() private widgetDefs: Record<string, WidgetDef> = {};
  @state() private activePageId: number | null = null;
  @state() private selectedObjIds: Set<number> = new Set();
  @state() private publishErrors: string[] = [];
  @state() private statusMessage = '';
  @state() private saving = false;
  @state() private confirmLiveImport = false;
  @state() private versions: Version[] = [];
  @state() private showVersions = false;
  @state() private themes: Theme[] = [];
  @state() private showThemeEditor = false;
  @state() private composites: CompositeTemplate[] = [];
  @state() private rawEditorObjId: number | null = null;
  @state() private loadError = '';
  @state() private importWarnings: string[] = [];
  @state() private available: api.PlateListEntry[] = [];
  @state() private newPlateId = '';
  @state() private pickerBusy = '';
  @state() private evaluatedValues: Record<number, Record<string, string>> = {};
  @state() private showConfigEditor = false;
  @state() private configJsonl = '';
  @state() private configYaml = '';
  @state() private configBusy = false;
  @state() private configWarnings: string[] = [];
  @state() private configError = '';
  private loadStarted = false;
  private hassTimer?: number;
  private nextTempCompositeSuffix = 0;

  // `hass` is assigned by HA after the element is created, so connectedCallback
  // is too early to start loading -- without it every request 401s.
  protected willUpdate(changed: PropertyValues) {
    if (changed.has('hass') && this.hass && !this.loadStarted) {
      this.loadStarted = true;
      api.setHass(this.hass);
      void this.load();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // If `hass` never arrives, every code path below is dead and the panel
    // would sit on "Loading..." forever with nothing in the console. Say so
    // instead, and report which bundle is actually running so a stale cached
    // module is distinguishable from a missing `hass`.
    this.hassTimer = window.setTimeout(() => {
      if (!this.loadStarted) {
        this.loadError =
          'Home Assistant never provided the `hass` object to this panel, so no ' +
          'authenticated API call is possible.';
      }
    }, 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.hassTimer !== undefined) window.clearTimeout(this.hassTimer);
  }

  private get bundleVersion(): string {
    return new URL(import.meta.url).searchParams.get('v') ?? 'unknown';
  }

  private async load() {
    this.loadError = '';
    try {
      const [widgetDefs, themes, composites, plateList] = await Promise.all([
        api.getWidgets(),
        api.getThemes(),
        api.getComposites(),
        api.listPlates(),
      ]);
      this.widgetDefs = widgetDefs;
      this.themes = themes;
      this.composites = composites;
      this.available = plateList.plates;
    } catch (err) {
      this.loadError = `Could not load builder data: ${(err as Error).message}`;
      return;
    }

    // Nothing selected (or a deep-link to an id that isn't stored) -> picker.
    if (!this.plateId) return;
    if (!this.available.some((p) => p.id === this.plateId && p.source === 'stored')) {
      this.plateId = '';
      return;
    }
    await this.openPlate(this.plateId);
  }

  private async openPlate(plateId: string) {
    this.pickerBusy = plateId;
    try {
      const [plate, versions] = await Promise.all([
        api.getPlate(plateId),
        api.listVersions(plateId),
      ]);
      this.plateId = plateId;
      this.setPlate(plate);
      this.versions = versions;
      this.loadError = '';
    } catch (err) {
      this.loadError = `Could not open "${plateId}": ${(err as Error).message}`;
    } finally {
      this.pickerBusy = '';
    }
  }

  private async onCreatePlate() {
    const id = this.newPlateId.trim();
    if (!id) return;
    this.pickerBusy = id;
    this.statusMessage = '';
    try {
      const plate = await api.createPlate(id, { display_name: id });
      this.plateId = id;
      this.setPlate(plate);
      this.versions = await api.listVersions(id);
      this.newPlateId = '';
      this.loadError = '';
    } catch (err) {
      this.loadError = `Could not create "${id}": ${(err as Error).message}`;
    } finally {
      this.pickerBusy = '';
    }
  }

  private backToPicker() {
    this.plate = null;
    this.plateId = '';
    this.selectedObjIds = new Set();
    this.publishErrors = [];
    this.importWarnings = [];
    this.statusMessage = '';
    void this.load();
  }

  private setPlate(plate: Plate) {
    this.plate = plate;
    this.activePageId = firstVisiblePageId(plate);
    this.evaluatedValues = {};
    void this.refreshTemplates();
  }

  // Raw (imported) widgets carry live Jinja2 templates in params.properties
  // (e.g. "val": "{{ states('sensor.x')|float|round(0) }}"). HA owns the
  // Jinja2 engine, so evaluation happens server-side via /template_eval --
  // reimplementing states()/is_state()/filters in JS isn't worth it. Batched
  // once per page open/switch/refresh, not on every hass state tick.
  private async refreshTemplates() {
    const page = this.activePage;
    if (!page) return;
    const jobs: { objId: number; prop: string; template: string }[] = [];
    for (const w of page.widgets) {
      if (w.widget_def_id !== 'raw') continue;
      const props = (w.params?.properties as Record<string, unknown>) ?? {};
      for (const [prop, tpl] of Object.entries(props)) {
        if (typeof tpl === 'string' && tpl.includes('{{')) {
          jobs.push({ objId: w.obj_id_start, prop, template: tpl });
        }
      }
    }
    if (jobs.length === 0) return;
    try {
      const results = await api.evaluateTemplates(jobs.map((j) => j.template));
      const next: Record<number, Record<string, string>> = { ...this.evaluatedValues };
      jobs.forEach((job, i) => {
        next[job.objId] = { ...next[job.objId], [job.prop]: results[i] };
      });
      this.evaluatedValues = next;
    } catch {
      // Template eval is a best-effort live preview; canvas falls back to
      // static_props/obj_type on failure, so a fetch error is not fatal.
    }
  }

  // Re-import the latest live jsonl/yaml over the stored plate. The backend
  // snapshots the current plate into version history first, so this is
  // restorable; the button needs two clicks (no browser confirm() dialog).
  private async onImportLive() {
    if (!this.plate) return;
    if (!this.confirmLiveImport) {
      this.confirmLiveImport = true;
      return;
    }
    this.confirmLiveImport = false;
    const plateId = this.plate.id;
    this.saving = true;
    this.statusMessage = 'Importing live files...';
    try {
      const { plate, warnings } = await api.importPlate(plateId, true);
      this.selectedObjIds = new Set();
      this.setPlate(plate);
      this.importWarnings = warnings;
      this.versions = await api.listVersions(plateId);
      this.statusMessage = 'Imported latest live version. Previous state saved in history.';
    } catch (err) {
      this.statusMessage = `Live import failed: ${(err as Error).message}`;
    } finally {
      this.saving = false;
    }
  }

  private async onImport(plateId: string) {
    this.pickerBusy = plateId;
    try {
      const { plate, warnings } = await api.importPlate(plateId);
      this.plateId = plateId;
      this.setPlate(plate);
      this.importWarnings = warnings;
      this.versions = await api.listVersions(plateId);
      this.loadError = '';
      this.statusMessage = `Imported ${plateId}.`;
    } catch (err) {
      this.loadError = `Import of "${plateId}" failed: ${(err as Error).message}`;
    } finally {
      this.pickerBusy = '';
    }
  }

  private get activeTheme(): Theme | null {
    if (!this.plate) return null;
    return this.themes.find((t) => t.id === this.plate!.theme_id) ?? null;
  }

  private get activePage() {
    return this.plate?.pages.find((p) => p.id === this.activePageId) ?? null;
  }

  private get selectedWidget(): PlacedWidget | null {
    const [first] = this.selectedObjIds;
    if (first === undefined) return null;
    return this.activePage?.widgets.find((w) => w.obj_id_start === first) ?? null;
  }

  private get rawEditorWidget(): PlacedWidget | null {
    if (this.rawEditorObjId === null) return null;
    return this.activePage?.widgets.find((w) => w.obj_id_start === this.rawEditorObjId) ?? null;
  }

  private mutatePlate(fn: (plate: Plate) => void) {
    if (!this.plate) return;
    // Shallow clone so Lit's property-changed detection fires; nested
    // mutation via fn is fine since we reassign this.plate afterward.
    const next: Plate = { ...this.plate, pages: this.plate.pages.map((p) => ({ ...p, widgets: [...p.widgets] })) };
    fn(next);
    this.plate = next;
    this.publishErrors = [];
  }

  private onWidgetPlace(e: CustomEvent) {
    const { widgetDefId, x, y, w, h } = e.detail;
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      if (!page) return;
      const objId = nextTempObjId--;
      page.widgets.push({
        widget_def_id: widgetDefId,
        x,
        y,
        w,
        h,
        page: page.id,
        params: {},
        obj_id_start: objId,
        obj_id_end: objId,
        disabled: false,
      });
    });
  }

  private onWidgetSelect(e: CustomEvent) {
    this.selectedObjIds = new Set(e.detail.objIds);
  }

  private onCompositePlace(e: CustomEvent) {
    const { compositeId, x, y } = e.detail;
    const composite = this.composites.find((c) => c.id === compositeId);
    if (!composite) return;
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      if (!page) return;
      for (const member of composite.members) {
        const objId = nextTempObjId--;
        page.widgets.push({
          widget_def_id: 'raw',
          x: x + member.dx,
          y: y + member.dy,
          w: member.w,
          h: member.h,
          page: page.id,
          params: {
            obj_type: member.obj_type,
            static_props: member.static_props,
            properties: member.properties,
            event: member.event,
          },
          obj_id_start: objId,
          obj_id_end: objId,
          disabled: false,
        });
      }
    });
  }

  private async onSaveAsGroup() {
    if (!this.plate || !this.activePage || this.selectedObjIds.size === 0) return;
    const selected = this.activePage.widgets.filter((w) => this.selectedObjIds.has(w.obj_id_start));
    if (selected.length === 0) return;

    const name = prompt('Name this group:');
    if (!name) return;

    const anchorX = Math.min(...selected.map((w) => w.x));
    const anchorY = Math.min(...selected.map((w) => w.y));
    const members = selected.map((w) => {
      const params = w.params as any;
      return {
        dx: w.x - anchorX,
        dy: w.y - anchorY,
        w: w.w,
        h: w.h,
        obj_type: params.obj_type ?? w.widget_def_id,
        static_props: params.static_props ?? {},
        properties: params.properties ?? {},
        event: params.event ?? {},
      };
    });

    const id = `${name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}-${this.nextTempCompositeSuffix++}`;
    this.statusMessage = 'Saving group...';
    try {
      const saved = await api.saveComposite({ id, name: name.trim(), members });
      this.composites = [...this.composites, saved];
      this.statusMessage = `Group "${saved.name}" saved.`;
    } catch (err) {
      this.statusMessage = `Group save failed: ${(err as Error).message}`;
    }
  }

  private onEditRaw(e: CustomEvent) {
    this.rawEditorObjId = e.detail.objId;
  }

  private async onOpenConfigEditor() {
    if (!this.plate) return;
    this.configError = '';
    this.configWarnings = [];
    try {
      const { jsonl, yaml } = await api.getConfigText(this.plate);
      this.configJsonl = jsonl;
      this.configYaml = yaml;
      this.showConfigEditor = true;
    } catch (err) {
      this.statusMessage = `Could not load config text: ${(err as Error).message}`;
    }
  }

  private onConfigEditorClose() {
    this.showConfigEditor = false;
  }

  private async onConfigEditorPreview(e: CustomEvent) {
    if (!this.plate) return;
    const { jsonl, yaml } = e.detail as { jsonl: string; yaml: string };
    this.configBusy = true;
    this.configError = '';
    try {
      const { plate, warnings } = await api.previewConfigText(
        this.plate.id, jsonl, yaml, this.plate.device_profile_id, this.plate.theme_id
      );
      this.plate = plate;
      this.configWarnings = warnings;
      this.publishErrors = [];
      this.statusMessage = 'Previewed unsaved config edits -- Save Draft or Publish to keep them.';
    } catch (err) {
      this.configError = (err as Error).message;
    } finally {
      this.configBusy = false;
    }
  }

  private onRawEditorClose() {
    this.rawEditorObjId = null;
  }

  private onRawEditorSave(e: CustomEvent) {
    const { objId, params } = e.detail;
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      const widget = page?.widgets.find((w) => w.obj_id_start === objId);
      if (widget) {
        widget.widget_def_id = 'raw';
        widget.params = params;
      }
    });
    this.rawEditorObjId = null;
  }

  private onWidgetMove(e: CustomEvent) {
    const { moves } = e.detail as { moves: { objId: number; x: number; y: number }[] };
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      if (!page) return;
      for (const { objId, x, y } of moves) {
        const widget = page.widgets.find((w) => w.obj_id_start === objId);
        if (widget) {
          widget.x = x;
          widget.y = y;
        }
      }
    });
  }

  private onGeometryChange(e: CustomEvent) {
    const { objId, field, value } = e.detail;
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      const widget = page?.widgets.find((w) => w.obj_id_start === objId);
      if (widget) (widget as any)[field] = value;
    });
  }

  private onParamChange(e: CustomEvent) {
    const { objId, key, value } = e.detail;
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      const widget = page?.widgets.find((w) => w.obj_id_start === objId);
      if (widget) widget.params = { ...widget.params, [key]: value };
    });
  }

  private async onSave() {
    if (!this.plate) return;
    this.saving = true;
    this.statusMessage = 'Saving...';
    try {
      this.plate = await api.savePlate(this.plate);
      this.statusMessage = 'Saved as draft.';
    } catch (err) {
      this.statusMessage = `Save failed: ${(err as Error).message}`;
    } finally {
      this.saving = false;
    }
  }

  private async onPublish() {
    if (!this.plate) return;
    this.saving = true;
    this.statusMessage = 'Publishing...';
    this.publishErrors = [];
    try {
      this.plate = await api.savePlate(this.plate);
      const result = await api.publishPlate(this.plateId);
      if (result.errors.length > 0) {
        this.publishErrors = result.errors;
        this.statusMessage = 'Publish blocked by validation errors.';
      } else if (result.warning) {
        this.statusMessage = `Published (version ${result.version}) — ${result.warning}`;
      } else {
        this.statusMessage = `Published as version ${result.version}.`;
      }
      this.versions = await api.listVersions(this.plateId);
    } catch (err) {
      this.statusMessage = `Publish failed: ${(err as Error).message}`;
    } finally {
      this.saving = false;
    }
  }

  private async onRestoreVersion(e: CustomEvent) {
    const { versionNumber } = e.detail;
    this.saving = true;
    this.statusMessage = `Restoring version ${versionNumber}...`;
    try {
      this.plate = await api.restoreVersion(this.plateId, versionNumber);
      this.selectedObjIds = new Set();
      this.publishErrors = [];
      this.activePageId = firstVisiblePageId(this.plate);
      this.statusMessage = `Restored version ${versionNumber}.`;
    } catch (err) {
      this.statusMessage = `Restore failed: ${(err as Error).message}`;
    } finally {
      this.saving = false;
    }
  }

  private onThemeSelect(e: CustomEvent) {
    const { themeId } = e.detail;
    this.mutatePlate((plate) => {
      plate.theme_id = themeId;
    });
  }

  private async onThemeSave(e: CustomEvent) {
    const { theme } = e.detail as { theme: Theme };
    this.statusMessage = 'Saving theme...';
    try {
      const saved = await api.saveTheme(theme);
      this.themes = [...this.themes.filter((t) => t.id !== saved.id), saved];
      this.mutatePlate((plate) => {
        plate.theme_id = saved.id;
      });
      this.statusMessage = `Theme "${saved.name}" saved.`;
    } catch (err) {
      this.statusMessage = `Theme save failed: ${(err as Error).message}`;
    }
  }

  private invalidObjIds(): Set<number> {
    const ids = new Set<number>();
    for (const err of this.publishErrors) {
      const match = err.match(/obj id=(-?\d+)/);
      if (match) ids.add(Number(match[1]));
    }
    return ids;
  }

  private renderPicker() {
    if (!this.loadStarted && !this.loadError) {
      return html`<div class="notice">
        <div class="status">Loading... (bundle ${this.bundleVersion})</div>
      </div>`;
    }
    const stored = this.available.filter((p) => p.source === 'stored');
    const importable = this.available.filter((p) => p.source === 'importable');
    const taken = new Set(this.available.map((p) => p.id));
    const newId = this.newPlateId.trim();
    // Same charset the backend enforces, checked here so the button explains
    // itself rather than round-tripping to a 400.
    const newIdValid = /^[A-Za-z0-9_-]+$/.test(newId);
    const newIdTaken = taken.has(newId);

    return html`
      <div class="notice">
        <h2>OpenHASP Builder</h2>
        ${this.loadError ? html`<div class="error-text">${this.loadError}</div>` : html``}

        ${stored.length > 0
          ? html`
              <section>
                <h3>Your plates</h3>
                <ul class="plate-list">
                  ${stored.map(
                    (p) => html`
                      <li>
                        <button @click=${() => this.openPlate(p.id)} ?disabled=${!!this.pickerBusy}>
                          ${this.pickerBusy === p.id ? 'Opening...' : 'Open'}
                        </button>
                        <span>${p.display_name}</span>
                        <code>${p.id}</code>
                      </li>
                    `
                  )}
                </ul>
              </section>
            `
          : html``}

        ${importable.length > 0
          ? html`
              <section>
                <h3>Found in your live config</h3>
                <p class="status">
                  Importing reads <code>/config/openhasp/&lt;id&gt;_pages.jsonl</code> and
                  <code>/config/openhasp_configs/&lt;id&gt;.yaml</code>. It never writes to them.
                </p>
                <ul class="plate-list">
                  ${importable.map(
                    (p) => html`
                      <li>
                        <button @click=${() => this.onImport(p.id)} ?disabled=${!!this.pickerBusy}>
                          ${this.pickerBusy === p.id ? 'Importing...' : 'Import'}
                        </button>
                        <code>${p.id}</code>
                      </li>
                    `
                  )}
                </ul>
              </section>
            `
          : html``}

        <section>
          <h3>Start fresh</h3>
          <div class="new-plate">
            <input
              type="text"
              placeholder="plate id (e.g. kitchen)"
              .value=${this.newPlateId}
              @input=${(e: Event) => (this.newPlateId = (e.target as HTMLInputElement).value)}
            />
            <button
              @click=${this.onCreatePlate}
              ?disabled=${!newIdValid || newIdTaken || !!this.pickerBusy}
            >
              Create empty plate
            </button>
          </div>
          <span class="status">
            ${newId && !newIdValid
              ? 'Only letters, numbers, underscore and hyphen.'
              : newIdTaken
                ? `"${newId}" already exists.`
                : 'One blank page, no widgets. Nothing is written to your config until you Publish.'}
          </span>
        </section>

        ${stored.length === 0 && importable.length === 0
          ? html`<span class="status">
              No plates stored, and no importable configs found under <code>/config/openhasp/</code>.
            </span>`
          : html``}
        <span class="status">bundle ${this.bundleVersion}</span>
      </div>
    `;
  }

  render() {
    if (!this.plate) return this.renderPicker();
    const profile = DEVICE_PROFILES[this.plate.device_profile_id];
    const widgetDef = this.selectedWidget ? this.widgetDefs[this.selectedWidget.widget_def_id] : null;

    return html`
      <div class="toolbar">
        <button title="Back to plate list" @click=${this.backToPicker} ?disabled=${this.saving}>
          ←
        </button>
        <strong>${this.plate.display_name}</strong>
        <div class="tabs">
          ${this.plate.pages
            .filter((p) => p.id !== 0)
            .map(
              (p) => html`
                <div
                  class="tab ${p.id === this.activePageId ? 'active' : ''}"
                  @click=${() => {
                    this.activePageId = p.id;
                    this.selectedObjIds = new Set();
                    void this.refreshTemplates();
                  }}
                >
                  Page ${p.id}
                </div>
              `
            )}
        </div>
        <button @click=${this.onSave} ?disabled=${this.saving}>Save Draft</button>
        <button @click=${this.onPublish} ?disabled=${this.saving}>Publish</button>
        <button @click=${() => (this.showVersions = !this.showVersions)}>
          ${this.showVersions ? 'Hide' : 'Show'} History
        </button>
        <button @click=${() => (this.showThemeEditor = !this.showThemeEditor)}>
          ${this.showThemeEditor ? 'Hide' : 'Show'} Theme
        </button>
        <button @click=${this.onSaveAsGroup} ?disabled=${this.selectedObjIds.size === 0}>
          Save as Group
        </button>
        <button @click=${() => void this.refreshTemplates()}>Refresh Live Values</button>
        <button @click=${this.onOpenConfigEditor}>Edit Config</button>
        <button
          title="Replace this plate with the latest files on the device. The current state is saved to history first."
          ?disabled=${this.saving}
          @click=${() => void this.onImportLive()}
          @blur=${() => (this.confirmLiveImport = false)}
        >
          ${this.confirmLiveImport ? 'Click again to confirm' : 'Import live'}
        </button>
        <span class="status">${this.statusMessage}</span>
        ${this.publishErrors.length > 0
          ? html`<div class="errors">${this.publishErrors.join(' · ')}</div>`
          : this.importWarnings.length > 0
            ? html`<div class="warnings" title=${this.importWarnings.join('\n')}>
                ${this.importWarnings.length} import warning(s): ${this.importWarnings.join(' · ')}
              </div>`
            : html``}
      </div>
      <div class="body">
        <ohb-widget-palette .widgets=${this.widgetDefs} .composites=${this.composites}></ohb-widget-palette>
        <div class="canvas-area">
          ${this.activePage && profile
            ? html`
                <ohb-canvas
                  .page=${this.activePage}
                  .deviceProfile=${profile}
                  .widgetDefs=${this.widgetDefs}
                  .invalidObjIds=${this.invalidObjIds()}
                  .theme=${this.activeTheme}
                  .evaluatedValues=${this.evaluatedValues}
                  .selectedIds=${this.selectedObjIds}
                  @widget-place=${this.onWidgetPlace}
                  @composite-place=${this.onCompositePlace}
                  @widget-select=${this.onWidgetSelect}
                  @widget-move=${this.onWidgetMove}
                  @widget-edit-raw=${this.onEditRaw}
                ></ohb-canvas>
              `
            : html``}
        </div>
        <div class="side-stack">
          <ohb-layer-list
            .page=${this.activePage}
            .selectedIds=${this.selectedObjIds}
            @layer-select=${this.onWidgetSelect}
          ></ohb-layer-list>
          <ohb-property-panel
            .widget=${this.selectedWidget}
            .widgetDef=${widgetDef}
            @geometry-change=${this.onGeometryChange}
            @param-change=${this.onParamChange}
          ></ohb-property-panel>
        </div>
        ${this.showVersions
          ? html`<ohb-version-history
              .versions=${this.versions}
              @version-restore=${this.onRestoreVersion}
            ></ohb-version-history>`
          : html``}
        ${this.showThemeEditor
          ? html`<ohb-theme-editor
              .themes=${this.themes}
              .activeThemeId=${this.plate.theme_id}
              @theme-select=${this.onThemeSelect}
              @theme-save=${this.onThemeSave}
            ></ohb-theme-editor>`
          : html``}
      </div>
      ${this.rawEditorWidget
        ? html`<ohb-raw-editor
            .widget=${this.rawEditorWidget}
            @raw-editor-close=${this.onRawEditorClose}
            @raw-editor-save=${this.onRawEditorSave}
          ></ohb-raw-editor>`
        : html``}
      ${this.showConfigEditor
        ? html`<ohb-config-editor
            .jsonlText=${this.configJsonl}
            .yamlText=${this.configYaml}
            .busy=${this.configBusy}
            .warnings=${this.configWarnings}
            .error=${this.configError}
            @config-editor-close=${this.onConfigEditorClose}
            @config-editor-preview=${this.onConfigEditorPreview}
          ></ohb-config-editor>`
        : html``}
    `;
  }
}
