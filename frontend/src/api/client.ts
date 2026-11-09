import type { Plate, Version, WidgetDef, PublishResult, Theme, CompositeTemplate } from '../schema';

// `hass.callApi` paths are relative to `/api/`, so no leading `/api/` here.
const BASE = 'openhasp_builder';

// All our views are `requires_auth = True`, and HA authenticates REST calls
// with a bearer token, never a cookie -- a bare `fetch('/api/...')` from panel
// JS always 401s. `hass.callApi` is the frontend's own wrapper: it attaches the
// current access token (and refreshes it), so the panel must hand us its `hass`
// object via setHass() before any request is made.
type Hass = {
  callApi<T>(method: string, path: string, parameters?: unknown): Promise<T>;
};

let hass: Hass | null = null;

export function setHass(h: Hass): void {
  hass = h;
}

// callApi rejects with a plain object ({error, status_code, body}), not an
// Error, so `.message` would be undefined everywhere we report a failure.
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const o = e as { status_code?: number; error?: string; body?: { message?: string } };
  const detail = o?.body?.message || o?.error;
  const status = o?.status_code;
  return new Error([status, detail].filter(Boolean).join(' ') || String(e));
}

async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!hass) throw new Error('hass not available yet');
  try {
    return await hass.callApi<T>(method, `${BASE}${path}`, body);
  } catch (e) {
    throw toError(e);
  }
}

export type PlateListEntry = {
  id: string;
  display_name: string;
  source: 'stored' | 'importable';
};

export type DeviceProfile = { id: string; name: string; width: number; height: number };

export function listPlates(): Promise<{ plates: PlateListEntry[]; device_profiles: DeviceProfile[] }> {
  return req('/plates');
}

export function createPlate(
  plateId: string,
  opts: { display_name?: string; device_profile_id?: string }
): Promise<Plate> {
  return req(`/plates/${plateId}/create`, 'POST', opts);
}

export function getPlate(plateId: string): Promise<Plate> {
  return req(`/plates/${plateId}`);
}

export function savePlate(plate: Plate): Promise<Plate> {
  return req(`/plates/${plate.id}`, 'POST', plate);
}

export function importPlate(
  plateId: string,
  overwrite = false
): Promise<{ plate: Plate; warnings: string[] }> {
  return req(`/plates/${plateId}/import`, 'POST', overwrite ? { overwrite: true } : {});
}

export function getWidgets(): Promise<Record<string, WidgetDef>> {
  return req('/widgets');
}

export function getThemes(): Promise<Theme[]> {
  return req('/themes');
}

export function saveTheme(theme: Theme): Promise<Theme> {
  return req('/themes', 'POST', theme);
}

export function getComposites(): Promise<CompositeTemplate[]> {
  return req('/composites');
}

export function saveComposite(composite: CompositeTemplate): Promise<CompositeTemplate> {
  return req('/composites', 'POST', composite);
}

export function listVersions(plateId: string): Promise<Version[]> {
  return req(`/plates/${plateId}/versions`);
}

export function restoreVersion(plateId: string, versionNumber: number): Promise<Plate> {
  return req(`/plates/${plateId}/versions/${versionNumber}/restore`, 'POST', {});
}

export function publishPlate(plateId: string): Promise<PublishResult> {
  return req(`/plates/${plateId}/publish`, 'POST', {});
}

export async function evaluateTemplates(templates: string[]): Promise<string[]> {
  if (templates.length === 0) return [];
  const { results } = await req<{ results: string[] }>('/template_eval', 'POST', { templates });
  return results;
}

export function getConfigText(plate: Plate): Promise<{ jsonl: string; yaml: string }> {
  return req(`/plates/${plate.id}/config`, 'POST', plate);
}

export function previewConfigText(
  plateId: string,
  jsonl: string,
  yaml: string,
  deviceProfileId: string,
  themeId: string
): Promise<{ plate: Plate; warnings: string[] }> {
  return req(`/plates/${plateId}/config/preview`, 'POST', {
    jsonl,
    yaml,
    device_profile_id: deviceProfileId,
    theme_id: themeId,
  });
}
