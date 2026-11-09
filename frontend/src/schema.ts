export interface WidgetDef {
  id: string;
  type: string;
  default_w: number;
  default_h: number;
  param_schema: string[];
  render_spec: unknown[];
}

export interface PlacedWidget {
  widget_def_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  params: Record<string, unknown>;
  obj_id_start: number;
  obj_id_end: number;
  disabled: boolean;
  /** Name from the jsonl comment line preceding this widget; empty when it has none. */
  group?: string;
}

export interface Page {
  id: number;
  order: number;
  background: string;
  widgets: PlacedWidget[];
  page_props: Record<string, unknown>;
  has_declaration: boolean;
}

export interface Plate {
  id: string;
  device_profile_id: string;
  theme_id: string;
  display_name: string;
  pages: Page[];
}

export interface DeviceProfile {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface CompositeTemplateMember {
  dx: number;
  dy: number;
  w: number;
  h: number;
  obj_type: string;
  static_props: Record<string, unknown>;
  properties: Record<string, unknown>;
  event: Record<string, unknown>;
}

export interface CompositeTemplate {
  id: string;
  name: string;
  members: CompositeTemplateMember[];
}

export interface Theme {
  id: string;
  name: string;
  colors: {
    bg: string;
    card_bg: string;
    accent_on: string;
    accent_off: string;
    text: string;
    text_muted: string;
  };
  fonts: { family: string; sizes: Record<string, number> };
  spacing: { grid_unit: number; corner_radius: number; padding: number };
}

export interface Version {
  plate_id: string;
  version_number: number;
  timestamp: string;
  label: string;
  published: boolean;
  snapshot: Plate;
}

export interface PublishResult {
  errors: string[];
  warning?: string;
  version?: number;
}
