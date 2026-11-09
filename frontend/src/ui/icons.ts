import { html, svg, type TemplateResult } from 'lit';

// 16px outline icons (Lucide-style, 24px viewBox). Decorative by default: any
// button that contains only an icon must carry an aria-label itself.
const shapes: Record<string, TemplateResult> = {
  'arrow-left': svg`<path d="M19 12H5M12 5l-7 7 7 7"/>`,
  'arrow-right': svg`<path d="M5 12h14M12 5l7 7-7 7"/>`,
  'arrow-up': svg`<path d="M12 19V5M5 12l7-7 7 7"/>`,
  'arrow-down': svg`<path d="M12 5v14M5 12l7 7 7-7"/>`,
  plus: svg`<path d="M12 5v14M5 12h14"/>`,
  minus: svg`<path d="M5 12h14"/>`,
  up: svg`<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>`,
  down: svg`<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>`,
  'chev-down': svg`<path d="m6 9 6 6 6-6"/>`,
  'chev-right': svg`<path d="m9 6 6 6-6 6"/>`,
  layers: svg`<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>`,
  box: svg`<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>`,
  type: svg`<path d="M4 7V5h16v2M9 19h6M12 5v14"/>`,
  square: svg`<rect x="4" y="4" width="16" height="16" rx="4"/>`,
  image: svg`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4-4-9 9"/>`,
  bar: svg`<rect x="3" y="10" width="18" height="4" rx="2"/><rect x="3" y="10" width="9" height="4" rx="2" fill="currentColor"/>`,
  slider: svg`<path d="M4 12h16"/><circle cx="14" cy="12" r="3"/>`,
  gauge: svg`<path d="M4 18a9 9 0 1 1 16 0"/><path d="m12 14 4-5"/>`,
  toggle: svg`<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/>`,
  msg: svg`<path d="M4 5h16v11H9l-5 4V5Z"/>`,
  history: svg`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>`,
  palette: svg`<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.5-1.5-1.5-3 0-1 .8-2 2-2H17a4 4 0 0 0 4-4c0-4-4-7-9-7Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>`,
  code: svg`<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>`,
  search: svg`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
  link: svg`<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>`,
  refresh: svg`<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>`,
  fit: svg`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  close: svg`<path d="M6 6l12 12M18 6 6 18"/>`,
  copy: svg`<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>`,
  trash: svg`<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>`,
  'eye-off': svg`<path d="M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="m3 3 18 18"/>`,
};

export function icon(name: string): TemplateResult {
  return html`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${shapes[name] ?? shapes.box}</svg>`;
}

// Layer / palette glyph for a widget type.
export function iconForType(type: string): string {
  switch (type) {
    case 'label':
    case 'text':
      return 'type';
    case 'obj':
    case 'card':
    case 'toggle_card':
      return 'square';
    case 'btn':
    case 'button':
      return 'toggle';
    case 'img':
    case 'image':
      return 'image';
    case 'slider':
      return 'slider';
    case 'gauge':
      return 'gauge';
    case 'bar':
      return 'bar';
    case 'msgbox':
      return 'msg';
    default:
      return 'box';
  }
}
