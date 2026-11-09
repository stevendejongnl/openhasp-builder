import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
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
import { tokens, controls } from './ui/styles';
import { icon } from './ui/icons';
import { fitZoom, nudgePosition, resizeBy } from './lib/geometry';
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
  static styles = [
    tokens,
    controls,
    css`
    :host {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      height: 100vh;
      font-family: var(--ohb-font);
      font-size: 13px;
      color: var(--ohb-text);
      background: var(--ohb-bg);
      overflow: hidden;
    }

    /* ---------- top bar ---------- */
    .top {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
      align-items: center;
      gap: 16px;
      min-height: 52px;
      padding: 0 12px;
      background: var(--ohb-panel);
      border-bottom: 1px solid var(--ohb-border);
    }
    .plate {
      display: grid;
      grid-auto-flow: column;
      align-items: center;
      gap: 12px;
    }
    .plate .name {
      font-weight: 600;
      font-size: 14px;
    }
    .tabs {
      display: grid;
      grid-auto-flow: column;
      gap: 2px;
      align-items: center;
      overflow-x: auto;
    }
    .tab {
      height: var(--ohb-ctl);
      padding: 0 12px;
      border: 0;
      background: transparent;
      border-radius: var(--ohb-r-sm);
      color: var(--ohb-muted);
      white-space: nowrap;
    }
    .tab:hover {
      background: var(--ohb-panel-2);
      color: var(--ohb-text);
    }
    .tab[aria-selected='true'] {
      background: var(--ohb-accent-soft);
      color: var(--ohb-accent);
      font-weight: 600;
    }
    .split {
      display: grid;
      grid-auto-flow: column;
      position: relative;
    }
    .split .btn:first-child {
      border-radius: var(--ohb-r-sm) 0 0 var(--ohb-r-sm);
    }
    .split .btn:nth-child(2) {
      border-radius: 0 var(--ohb-r-sm) var(--ohb-r-sm) 0;
      border-left-color: rgba(0, 0, 0, 0.25);
      width: 30px;
      padding: 0;
      justify-content: center;
    }
    .menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 280px;
      z-index: 30;
      padding: 4px;
      background: var(--ohb-panel);
      border: 1px solid var(--ohb-border);
      border-radius: var(--ohb-r-md);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
      display: grid;
    }
    .menu button {
      display: grid;
      grid-template-columns: 20px 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 7px 8px;
      text-align: left;
      border: 0;
      background: transparent;
      border-radius: var(--ohb-r-sm);
    }
    .menu button:hover:not(:disabled),
    .menu button:focus-visible {
      background: var(--ohb-accent-soft);
    }
    .menu button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .menu hr {
      border: 0;
      border-top: 1px solid var(--ohb-border);
      margin: 4px 0;
      width: 100%;
    }

    /* ---------- banners ---------- */
    .banner {
      padding: 6px 16px;
      font-size: 12px;
      border-bottom: 1px solid var(--ohb-border);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
    }
    .banner.error {
      color: var(--ohb-danger);
      background: color-mix(in srgb, var(--ohb-danger) 10%, transparent);
    }
    .banner.warn {
      color: var(--ohb-warn);
      background: color-mix(in srgb, var(--ohb-warn) 10%, transparent);
    }
    .banner:empty {
      display: none;
    }

    /* ---------- body ---------- */
    .body {
      display: grid;
      grid-template-columns: 288px minmax(0, 1fr) 316px;
      min-height: 0;
    }
    .left,
    .right {
      background: var(--ohb-panel);
      min-height: 0;
      display: grid;
    }
    .left {
      border-right: 1px solid var(--ohb-border);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .right {
      border-left: 1px solid var(--ohb-border);
      grid-template-rows: minmax(0, 1fr);
    }
    .rail-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border-bottom: 1px solid var(--ohb-border);
    }
    .rail-tabs button {
      height: 40px;
      border: 0;
      background: transparent;
      color: var(--ohb-muted);
      border-bottom: 2px solid transparent;
      display: grid;
      grid-auto-flow: column;
      justify-content: center;
      align-items: center;
      gap: 6px;
    }
    .rail-tabs button[aria-selected='true'] {
      color: var(--ohb-text);
      border-bottom-color: var(--ohb-accent);
    }
    .rail-body {
      overflow: auto;
      min-height: 0;
    }

    /* ---------- stage ---------- */
    .stage {
      position: relative;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
      background: var(--ohb-bg);
    }
    .stagebar {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 6px 12px;
    }
    .stagebar .info {
      color: var(--ohb-muted);
      font-size: 12px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .compare {
      display: grid;
      grid-auto-flow: column;
      align-items: center;
      gap: 8px;
    }
    .opacity {
      display: grid;
      grid-template-columns: 110px 40px;
      align-items: center;
      gap: 8px;
    }
    .opacity input {
      width: 100%;
      accent-color: var(--ohb-accent);
    }
    .opacity output {
      font: 500 12px var(--ohb-mono);
    }
    .zoom {
      display: grid;
      grid-auto-flow: column;
      align-items: center;
      gap: 2px;
      background: var(--ohb-panel);
      border: 1px solid var(--ohb-border);
      border-radius: var(--ohb-r-sm);
      padding: 2px;
    }
    .zoom output {
      min-width: 48px;
      text-align: center;
      font: 500 12px var(--ohb-mono);
    }
    .zoom .btn {
      min-height: 28px;
      width: 28px;
    }
    .zoom .btn.fit {
      width: auto;
      padding: 0 8px;
    }
    .canvas-area {
      display: grid;
      overflow: auto;
      min-height: 0;
      padding: 32px;
      background-image: radial-gradient(var(--ohb-border) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .canvas-area > ohb-canvas {
      margin: auto;
    }
    .drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 320px;
      z-index: 10;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--ohb-panel);
      border-left: 1px solid var(--ohb-border);
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18);
    }
    .drawer header {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      padding: 8px 8px 8px 16px;
      border-bottom: 1px solid var(--ohb-border);
      font-weight: 600;
    }
    .drawer .drawer-body {
      overflow: auto;
      min-height: 0;
    }
    .drawer ohb-version-history,
    .drawer ohb-theme-editor {
      width: auto;
      border: 0;
      display: block;
    }

    /* ---------- status bar ---------- */
    .statusbar {
      display: grid;
      grid-auto-flow: column;
      justify-content: start;
      align-items: center;
      gap: 24px;
      min-height: 28px;
      padding: 0 16px;
      background: var(--ohb-panel);
      border-top: 1px solid var(--ohb-border);
      color: var(--ohb-muted);
      font-size: 12px;
    }
    .statusbar .mono {
      font: 400 11.5px var(--ohb-mono);
    }

    /* ---------- dialog ---------- */
    dialog {
      border: 1px solid var(--ohb-border);
      border-radius: 14px;
      background: var(--ohb-panel);
      color: var(--ohb-text);
      padding: 0;
      width: min(520px, 92vw);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.55);
    }
    .dlg {
      display: grid;
      gap: 16px;
      padding: 24px;
    }
    .dlg h2 {
      margin: 0;
      font-size: 16px;
    }
    .dlg p {
      margin: 0;
      color: var(--ohb-muted);
    }
    .dlg .actions {
      display: grid;
      grid-auto-flow: column;
      justify-content: end;
      gap: 8px;
    }
    .field {
      display: grid;
      gap: 4px;
    }
    .field > span {
      color: var(--ohb-muted);
      font-size: 11.5px;
    }
    .field .field-error {
      color: var(--ohb-danger);
    }
    .changes {
      padding: 12px;
      background: var(--ohb-panel-2);
      border: 1px solid var(--ohb-border);
      border-radius: var(--ohb-r-md);
      font: 400 12px var(--ohb-mono);
    }

    /* ---------- picker (no plate open) ---------- */
    .picker {
      grid-row: 1 / -1;
      overflow: auto;
    }
    .notice {
      display: grid;
      gap: 24px;
      padding: 32px 24px;
      max-width: 640px;
      margin: 0 auto;
      align-content: start;
    }
    .notice h2 {
      margin: 0;
      font-size: 22px;
    }
    .notice h3 {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--ohb-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .plate-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .plate-list li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: var(--ohb-panel);
      border: 1px solid var(--ohb-border);
      border-radius: var(--ohb-r-md);
    }
    .new-plate {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      margin-bottom: 6px;
    }
    .status {
      font-size: 12px;
      color: var(--ohb-muted);
    }
    .error-text {
      color: var(--ohb-danger);
      font-size: 14px;
    }
    code {
      font: 400 12px var(--ohb-mono);
      background: var(--ohb-panel-2);
      padding: 1px 6px;
      border-radius: 4px;
    }
  `,
  ];

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
  @state() private drawer: 'history' | 'theme' | null = null;
  @state() private themes: Theme[] = [];
  @state() private dirty = false;
  @state() private compareOn = false;
  @state() private compareSrc = '';
  @state() private compareOpacity = 50;
  @state() private compareDifference = false;
  @state() private compareBusy = false;
  @state() private componentName = '';
  @state() private zoom = 1;
  @state() private autoFit = true;
  @state() private leftTab: 'layers' | 'add' | 'components' = 'layers';
  @state() private menuOpen = false;
  @state() private cursor: { x: number; y: number } | null = null;
  private resizeObserver?: ResizeObserver;
  private observedArea: Element | null = null;
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
    window.addEventListener('keydown', this.onWindowKeyDown);
    window.addEventListener('pointerdown', this.onWindowPointerDown);
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
    window.removeEventListener('keydown', this.onWindowKeyDown);
    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    this.resizeObserver?.disconnect();
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
    this.compareOn = false;
    this.compareSrc = '';
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
    this.dirty = false;
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
    // Object ids repeat across pages (id 1 exists on page 1 and on page 2), so
    // values evaluated for another page must never be kept: start from empty.
    if (jobs.length === 0) {
      this.evaluatedValues = {};
      return;
    }
    try {
      const results = await api.evaluateTemplates(jobs.map((j) => j.template));
      if (page !== this.activePage) return; // the user switched pages while this was in flight
      const next: Record<number, Record<string, string>> = {};
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
    this.dirty = true;
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

  private onSaveAsGroup() {
    if (!this.plate || !this.activePage || this.selectedObjIds.size === 0) return;
    this.componentName = '';
    (this.renderRoot.querySelector('#component-dialog') as HTMLDialogElement | null)?.showModal();
  }

  private get componentNameError(): string {
    const name = this.componentName.trim();
    if (!name) return '';
    if (name.length > 40) return 'Use 40 characters or fewer.';
    if (this.composites.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return 'A component with this name already exists.';
    }
    return '';
  }

  private closeComponentDialog() {
    (this.renderRoot.querySelector('#component-dialog') as HTMLDialogElement | null)?.close();
  }

  private confirmSaveComponent(e: Event) {
    e.preventDefault();
    const name = this.componentName.trim();
    if (!name || this.componentNameError) return;
    this.closeComponentDialog();
    void this.saveComponent(name);
  }

  private async saveComponent(name: string) {
    if (!this.plate || !this.activePage) return;
    const selected = this.activePage.widgets.filter((w) => this.selectedObjIds.has(w.obj_id_start));
    if (selected.length === 0) return;

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
      this.dirty = true;
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
      this.dirty = false;
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
      this.dirty = false;
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
      this.dirty = false;
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

  // ---------- shell behaviour (zoom, menu, dialog, keyboard) ----------

  private renderMenu() {
    const item = (iconName: string, label: string, onClick: () => void, opts: { kbd?: string; disabled?: boolean } = {}) => html`
      <button role="menuitem" ?disabled=${opts.disabled} @click=${onClick}>
        ${icon(iconName)}<span>${label}</span>${opts.kbd ? html`<kbd>${opts.kbd}</kbd>` : html`<span></span>`}
      </button>
    `;
    const close = () => (this.menuOpen = false);
    return html`
      <div class="menu" role="menu" @keydown=${this.onMenuKeyDown}>
        ${item('down', this.confirmLiveImport ? 'Click again to replace this plate' : 'Import live from device', () => {
          if (this.confirmLiveImport) close();
          void this.onImportLive();
        }, { disabled: this.saving })}
        ${item('history', 'Version history', () => { this.drawer = 'history'; close(); })}
        ${item('palette', 'Theme…', () => { this.drawer = 'theme'; close(); })}
        ${item('code', 'Edit config (jsonl / yaml)', () => { close(); void this.onOpenConfigEditor(); })}
        <hr />
        ${item('box', 'Save selection as component', () => { close(); void this.onSaveAsGroup(); }, { disabled: this.selectedObjIds.size === 0 })}
        ${item('up', 'Save draft', () => { close(); void this.onSave(); }, { kbd: 'Ctrl S', disabled: this.saving })}
      </div>
    `;
  }

  private onMenuKeyDown = (e: KeyboardEvent) => {
    const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const i = items.indexOf(this.shadowRoot!.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  };

  // "Compare with device": overlay the real panel's current screen on the canvas.
  // It shows whichever page the device is on right now, so Refresh re-reads it.
  private async fetchCompare(): Promise<boolean> {
    if (!this.plate) return false;
    this.compareBusy = true;
    try {
      const shot = await api.getDeviceScreenshot(this.plate.id);
      this.compareSrc = `data:image/png;base64,${shot.png_base64}`;
      return true;
    } catch (err) {
      this.statusMessage = `Compare with device failed: ${(err as Error).message}`;
      return false;
    } finally {
      this.compareBusy = false;
    }
  }

  private async toggleCompare() {
    if (this.compareOn) {
      this.compareOn = false;
      this.compareSrc = '';
      return;
    }
    this.compareOn = await this.fetchCompare();
  }

  private openPublishDialog() {
    (this.renderRoot.querySelector('#publish-dialog') as HTMLDialogElement | null)?.showModal();
  }

  private closePublishDialog() {
    (this.renderRoot.querySelector('#publish-dialog') as HTMLDialogElement | null)?.close();
  }

  private confirmPublish() {
    this.closePublishDialog();
    void this.onPublish();
  }

  private fitZoom(): number {
    const area = this.renderRoot.querySelector('.canvas-area') as HTMLElement | null;
    const profile = this.plate ? DEVICE_PROFILES[this.plate.device_profile_id] : null;
    if (!area || !profile) return 1;
    return fitZoom(area.clientWidth, area.clientHeight, profile.width, profile.height);
  }

  private setZoom(z: number, auto: boolean) {
    this.zoom = Math.max(0.5, Math.min(3, z));
    this.autoFit = auto;
  }

  protected updated() {
    const area = this.renderRoot.querySelector('.canvas-area');
    if (area !== this.observedArea) {
      this.resizeObserver?.disconnect();
      this.observedArea = area;
      if (area) {
        this.resizeObserver ??= new ResizeObserver(() => {
          if (this.autoFit) this.zoom = this.fitZoom();
        });
        this.resizeObserver.observe(area);
        if (this.autoFit) this.zoom = this.fitZoom();
      }
    }
  }

  private onWindowKeyDown = (e: KeyboardEvent) => {
    if (!this.plate) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void this.onSave();
      return;
    }
    if (e.key === 'Escape') {
      this.menuOpen = false;
      return;
    }
    if (this.showConfigEditor || this.rawEditorObjId !== null) return;
    if (
      (this.renderRoot.querySelectorAll('dialog[open]').length ?? 0) > 0
    )
      return;
    const typing = e.composedPath().some(
      (n) =>
        n instanceof HTMLElement &&
        (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable)
    );
    if (typing) return;
    const step = e.shiftKey ? 5 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (d) {
      e.preventDefault(); // also stops Alt+Left/Right from navigating the browser back/forward
      if (e.altKey) this.resizeSelected(d[0], d[1]);
      else this.nudgeSelected(d[0], d[1]);
    }
  };

  private onWindowPointerDown = (e: PointerEvent) => {
    if (!this.menuOpen) return;
    const inside = e.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains('split'));
    if (!inside) this.menuOpen = false;
  };

  // Keyboard/button alternative to dragging (WCAG 2.2 dragging movements).
  private nudgeSelected(dx: number, dy: number) {
    if (this.selectedObjIds.size === 0) return;
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      if (!page) return;
      page.widgets = page.widgets.map((w) =>
        this.selectedObjIds.has(w.obj_id_start)
          ? { ...w, ...nudgePosition(w.x, w.y, dx, dy) }
          : w
      );
    });
  }

  private onWidgetResize(e: CustomEvent) {
    const { objId, x, y, w, h } = e.detail as { objId: number; x: number; y: number; w: number; h: number };
    this.mutatePlate((plate) => {
      const widget = plate.pages.find((p) => p.id === this.activePageId)?.widgets.find((x2) => x2.obj_id_start === objId);
      if (widget) Object.assign(widget, { x, y, w, h });
    });
  }

  // Keyboard alternative to dragging a resize handle (WCAG 2.2 dragging movements).
  private resizeSelected(dw: number, dh: number) {
    if (this.selectedObjIds.size === 0 || !this.plate) return;
    const profile = DEVICE_PROFILES[this.plate.device_profile_id];
    if (!profile) return;
    const bounds = { w: profile.width, h: profile.height };
    this.mutatePlate((plate) => {
      const page = plate.pages.find((p) => p.id === this.activePageId);
      if (!page) return;
      page.widgets = page.widgets.map((w) =>
        this.selectedObjIds.has(w.obj_id_start) ? { ...w, ...resizeBy(w, dw, dh, bounds) } : w
      );
    });
  }

  private onWidgetAdd(e: CustomEvent) {
    const def = this.widgetDefs[e.detail.widgetDefId];
    if (!def) return;
    this.onWidgetPlace(
      new CustomEvent('widget-place', {
        detail: { widgetDefId: def.type, x: 10, y: 10, w: def.default_w, h: def.default_h },
      })
    );
    this.selectedObjIds = new Set([nextTempObjId + 1]);
  }

  private onCompositeAdd(e: CustomEvent) {
    this.onCompositePlace(
      new CustomEvent('composite-place', { detail: { compositeId: e.detail.compositeId, x: 10, y: 10 } })
    );
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
                        <button class="btn primary" @click=${() => this.openPlate(p.id)} ?disabled=${!!this.pickerBusy}>
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
                        <button class="btn primary" @click=${() => this.onImport(p.id)} ?disabled=${!!this.pickerBusy}>
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
              class="txt"
              type="text"
              placeholder="plate id (e.g. kitchen)"
              .value=${this.newPlateId}
              @input=${(e: Event) => (this.newPlateId = (e.target as HTMLInputElement).value)}
            />
            <button
              class="btn primary"
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
    if (!this.plate) return html`<div class="picker">${this.renderPicker()}</div>`;
    const profile = DEVICE_PROFILES[this.plate.device_profile_id];
    const widgetDef = this.selectedWidget ? this.widgetDefs[this.selectedWidget.widget_def_id] : null;
    const selected = this.selectedWidget;
    const dirty = this.dirty;
    const leftTabs: [typeof this.leftTab, string, string][] = [
      ['layers', 'Layers', 'layers'],
      ['add', 'Add', 'plus'],
      ['components', 'Components', 'box'],
    ];

    return html`
      <header class="top">
        <div class="plate">
          <button class="btn icon ghost" aria-label="Back to plate list" @click=${this.backToPicker} ?disabled=${this.saving}>
            ${icon('arrow-left')}
          </button>
          <span class="name">${this.plate.display_name}</span>
          ${profile ? html`<span class="chip" title="Device profile">${profile.width} × ${profile.height}</span>` : nothing}
        </div>

        <nav class="tabs" role="tablist" aria-label="Pages">
          ${this.plate.pages
            .filter((p) => p.id !== 0)
            .map(
              (p) => html`
                <button
                  class="tab"
                  role="tab"
                  aria-selected=${p.id === this.activePageId}
                  @click=${() => {
                    this.activePageId = p.id;
                    this.selectedObjIds = new Set();
                    this.evaluatedValues = {};
                    void this.refreshTemplates();
                  }}
                >
                  Page ${p.id}
                </button>
              `
            )}
        </nav>

        <span></span>

        <button
          class="btn icon ghost"
          aria-label="Refresh live values"
          title="Re-evaluate the Home Assistant templates"
          @click=${() => void this.refreshTemplates()}
        >
          ${icon('refresh')}
        </button>
        <span class="chip ${dirty ? 'draft' : ''}" role="status">
          <span class="dot"></span>${dirty ? 'Unsaved changes' : 'No unsaved changes'}
        </span>
        <div class="split">
          <button class="btn primary" @click=${this.openPublishDialog} ?disabled=${this.saving}>
            ${icon('up')}Publish
          </button>
          <button
            class="btn primary"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded=${this.menuOpen}
            @click=${(e: Event) => {
              e.stopPropagation();
              this.menuOpen = !this.menuOpen;
            }}
          >
            ${icon('chev-down')}
          </button>
          ${this.menuOpen ? this.renderMenu() : nothing}
        </div>
      </header>

      <div class="banners">
        ${this.publishErrors.length > 0
          ? html`<div class="banner error" role="alert">
              <span>${this.publishErrors.join(' · ')}</span>
            </div>`
          : nothing}
        ${this.importWarnings.length > 0
          ? html`<div class="banner warn" title=${this.importWarnings.join('\n')}>
              <span>${this.importWarnings.length} import warning(s): ${this.importWarnings.join(' · ')}</span>
              <button class="btn ghost" style="min-height:24px" @click=${() => (this.importWarnings = [])}>Dismiss</button>
            </div>`
          : nothing}
      </div>

      <div class="body">
        <aside class="left" aria-label="Plate contents">
          <div class="rail-tabs" role="tablist">
            ${leftTabs.map(
              ([id, label, ic]) => html`<button
                role="tab"
                aria-selected=${this.leftTab === id}
                @click=${() => (this.leftTab = id)}
              >
                ${icon(ic)}${label}
              </button>`
            )}
          </div>
          <div class="rail-body">
            ${this.leftTab === 'layers'
              ? html`<ohb-layer-list
                  .page=${this.activePage}
                  .selectedIds=${this.selectedObjIds}
                  .evaluatedValues=${this.evaluatedValues}
                  @layer-select=${this.onWidgetSelect}
                ></ohb-layer-list>`
              : html`<ohb-widget-palette
                  .mode=${this.leftTab}
                  .widgets=${this.widgetDefs}
                  .composites=${this.composites}
                  @widget-add=${this.onWidgetAdd}
                  @composite-add=${this.onCompositeAdd}
                ></ohb-widget-palette>`}
          </div>
        </aside>

        <main class="stage">
          <div class="stagebar">
            <div class="zoom" role="group" aria-label="Zoom">
              <button class="btn icon ghost" aria-label="Zoom out" @click=${() => this.setZoom(this.zoom - 0.25, false)}>
                ${icon('minus')}
              </button>
              <output aria-live="polite">${Math.round(this.zoom * 100)}%</output>
              <button class="btn icon ghost" aria-label="Zoom in" @click=${() => this.setZoom(this.zoom + 0.25, false)}>
                ${icon('plus')}
              </button>
              <button class="btn ghost fit" aria-pressed=${this.autoFit} @click=${() => this.setZoom(this.fitZoom(), true)}>
                ${icon('fit')}Fit
              </button>
            </div>
            <div class="info">Click to select · arrows nudge · Alt+arrows resize (⇧ = 5 px) · drag a handle to resize · double-click: raw editor</div>
            <div class="compare">
              ${this.compareOn
                ? html`
                    <label class="opacity">
                      <span class="sr">Device overlay opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        .value=${String(this.compareOpacity)}
                        @input=${(e: Event) => (this.compareOpacity = Number((e.target as HTMLInputElement).value))}
                      />
                      <output>${this.compareOpacity}%</output>
                    </label>
                    <button
                      class="btn"
                      aria-pressed=${this.compareDifference}
                      title="Show only where the preview and the device differ"
                      @click=${() => (this.compareDifference = !this.compareDifference)}
                    >
                      Difference
                    </button>
                    <button
                      class="btn icon ghost"
                      aria-label="Refresh the device screenshot"
                      title="Read the device's screen again"
                      ?disabled=${this.compareBusy}
                      @click=${() => void this.fetchCompare()}
                    >
                      ${icon('refresh')}
                    </button>
                  `
                : nothing}
              <button
                class="btn"
                aria-pressed=${this.compareOn}
                ?disabled=${this.compareBusy}
                title="Overlay the device's current screen (the page it is showing now) on the canvas"
                @click=${() => void this.toggleCompare()}
              >
                ${icon('layers')}${this.compareBusy ? 'Reading device…' : 'Compare with device'}
              </button>
            </div>
          </div>
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
                    .zoom=${this.zoom}
                    .overlaySrc=${this.compareOn ? this.compareSrc : ''}
                    .overlayOpacity=${this.compareOpacity / 100}
                    .overlayDifference=${this.compareDifference}
                    @widget-place=${this.onWidgetPlace}
                    @composite-place=${this.onCompositePlace}
                    @widget-select=${this.onWidgetSelect}
                    @widget-move=${this.onWidgetMove}
                    @widget-resize=${this.onWidgetResize}
                    @widget-edit-raw=${this.onEditRaw}
                    @canvas-cursor=${(e: CustomEvent) => (this.cursor = e.detail)}
                  ></ohb-canvas>
                `
              : nothing}
          </div>
          ${this.drawer
            ? html`<aside class="drawer" aria-label=${this.drawer === 'history' ? 'Version history' : 'Theme'}>
                <header>
                  <span>${this.drawer === 'history' ? 'Version history' : 'Theme'}</span>
                  <button class="btn icon ghost" aria-label="Close panel" @click=${() => (this.drawer = null)}>
                    ${icon('close')}
                  </button>
                </header>
                <div class="drawer-body">
                  ${this.drawer === 'history'
                    ? html`<ohb-version-history
                        .versions=${this.versions}
                        @version-restore=${this.onRestoreVersion}
                      ></ohb-version-history>`
                    : html`<ohb-theme-editor
                        .themes=${this.themes}
                        .activeThemeId=${this.plate.theme_id}
                        @theme-select=${this.onThemeSelect}
                        @theme-save=${this.onThemeSave}
                      ></ohb-theme-editor>`}
                </div>
              </aside>`
            : nothing}
        </main>

        <aside class="right" aria-label="Inspector">
          <ohb-property-panel
            .widget=${selected}
            .widgetDef=${widgetDef}
            .evaluated=${selected ? this.evaluatedValues[selected.obj_id_start] : undefined}
            .selectionCount=${this.selectedObjIds.size}
            @geometry-change=${this.onGeometryChange}
            @param-change=${this.onParamChange}
            @nudge=${(e: CustomEvent) => this.nudgeSelected(e.detail.dx, e.detail.dy)}
            @widget-edit-raw=${this.onEditRaw}
          ></ohb-property-panel>
        </aside>
      </div>

      <footer class="statusbar">
        <span class="mono">${this.cursor ? `x ${this.cursor.x}  y ${this.cursor.y}` : 'x —  y —'}</span>
        <span>${this.selectedObjIds.size > 0 ? `${this.selectedObjIds.size} selected` : 'No selection'}</span>
        <span role="status">${this.statusMessage}</span>
        <span class="mono">bundle ${this.bundleVersion}</span>
      </footer>

      <dialog id="publish-dialog">
        <div class="dlg">
          <h2>Publish “${this.plate.display_name}” to the device?</h2>
          <p>
            This saves the plate, writes its jsonl and yaml files and reloads it. The version is saved to history, so
            you can restore it.
          </p>
          <div class="changes">
            ${dirty ? 'Your unsaved edits will be included.' : 'No unsaved edits: this re-publishes the stored draft.'}
          </div>
          <div class="actions">
            <button class="btn" @click=${this.closePublishDialog}>Cancel</button>
            <button class="btn primary" @click=${this.confirmPublish}>Publish</button>
          </div>
        </div>
      </dialog>

      <dialog id="component-dialog">
        <form class="dlg" @submit=${this.confirmSaveComponent}>
          <h2>Save selection as component</h2>
          <p>
            ${this.selectedObjIds.size} layer${this.selectedObjIds.size === 1 ? '' : 's'} will be saved, so you can add
            them to any plate from the Components tab.
          </p>
          <label class="field">
            <span>Name</span>
            <input
              class="txt"
              placeholder="e.g. Toggle card"
              autocomplete="off"
              aria-invalid=${this.componentNameError !== ''}
              .value=${this.componentName}
              @input=${(e: Event) => (this.componentName = (e.target as HTMLInputElement).value)}
            />
            ${this.componentNameError ? html`<span class="field-error" role="alert">${this.componentNameError}</span>` : nothing}
          </label>
          <div class="actions">
            <button type="button" class="btn" @click=${this.closeComponentDialog}>Cancel</button>
            <button
              type="submit"
              class="btn primary"
              ?disabled=${this.componentName.trim() === '' || this.componentNameError !== ''}
            >
              Save component
            </button>
          </div>
        </form>
      </dialog>

      ${this.rawEditorWidget
        ? html`<ohb-raw-editor
            .widget=${this.rawEditorWidget}
            @raw-editor-close=${this.onRawEditorClose}
            @raw-editor-save=${this.onRawEditorSave}
          ></ohb-raw-editor>`
        : nothing}
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
        : nothing}
    `;
  }
}
