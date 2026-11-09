import type { PlacedWidget } from '../schema';

export function staticProps(w: PlacedWidget): Record<string, unknown> {
  return (w.params?.static_props as Record<string, unknown>) ?? {};
}


// Evaluated live values win over static_props (a jsonl literal is only the
// value at export time; the /template_eval result is current). Falls back
// to static_props for plates where the template hasn't resolved yet (still
// loading, or eval failed) so the canvas never regresses to blank.
export function liveValue(
  evaluated: Record<string, string> | undefined,
  props: Record<string, unknown>,
  key: string
): string | undefined {
  if (evaluated && key in evaluated) return evaluated[key];
  const v = props[key];
  return v === undefined ? undefined : String(v);
}


// Value of a raw widget prop: the live /template_eval result wins over the
// jsonl literal (templated props such as bg_color, text_color and w only
// exist as templates in the yaml bindings).
export function rawProp(
  w: PlacedWidget,
  evaluated: Record<string, string> | undefined,
  key: string
): unknown {
  if (evaluated && key in evaluated) {
    const v = evaluated[key];
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
  }
  return staticProps(w)[key];
}

