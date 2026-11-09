import type { PlacedWidget } from '../schema';

export function objType(w: PlacedWidget): string {
  return String((w.params as any)?.obj_type ?? w.widget_def_id);
}

// A layer's name is what you recognise on the canvas: a label's text, else its
// type. Live (template-evaluated) text wins over the literal in the jsonl.
export function layerName(w: PlacedWidget, evaluated?: Record<string, string>): string {
  const type = objType(w);
  const staticText = (w.params as any)?.static_props?.text;
  const text = evaluated?.text ?? (typeof staticText === 'string' ? staticText : '');
  const trimmed = text.replace(/\s+/g, ' ').trim();
  // A lone private-use character is an MDI icon: it is invisible text.
  const cp = trimmed.codePointAt(0) ?? 0;
  if ([...trimmed].length === 1 && cp >= 0xe000 && cp <= 0xf8ff) return 'icon';
  if ((type === 'label' || type === 'btn') && trimmed) {
    return trimmed.length > 26 ? `${trimmed.slice(0, 25)}…` : trimmed;
  }
  if (type === 'obj') return describeObj(w, evaluated);
  return type;
}

// Plain `obj` rows are cards, bars, icon discs and invisible touch areas; name
// them by what they look like instead of a wall of identical "obj".
export function describeObj(w: PlacedWidget, evaluated?: Record<string, string>): string {
  const sp = ((w.params as any)?.static_props ?? {}) as Record<string, unknown>;
  const geo = layerSize(w, evaluated);
  if (sp.bg_opa === 0 || (sp.bg_color === undefined && evaluated?.bg_color === undefined)) return 'touch area';
  if (geo.h <= 12) return evaluated?.w !== undefined ? 'bar fill' : 'bar track';
  if (geo.w === geo.h) return 'disc';
  if (geo.w >= 100 && geo.h >= 40) return 'card';
  return 'box';
}

// Size shown for a layer: live (template-evaluated) w/h win over the jsonl literal.
export function layerSize(w: PlacedWidget, evaluated?: Record<string, string>): { w: number; h: number } {
  const num = (key: string, fallback: number) => {
    const n = Number(evaluated?.[key]);
    return evaluated?.[key] !== undefined && Number.isFinite(n) ? n : fallback;
  };
  return { w: num('w', w.w), h: num('h', w.h) };
}

