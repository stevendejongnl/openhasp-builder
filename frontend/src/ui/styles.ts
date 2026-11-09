import { css } from 'lit';

// Every colour here is a Home Assistant theme variable (with a neutral
// fallback only for running outside HA), so the builder follows whatever
// theme the user has selected -- light, dark or custom. Nothing is hard-coded.
export const tokens = css`
  :host {
    --ohb-bg: var(--primary-background-color, #fafafa);
    --ohb-panel: var(--card-background-color, #fff);
    --ohb-panel-2: var(--secondary-background-color, #e5e5e5);
    --ohb-text: var(--primary-text-color, #212121);
    --ohb-muted: var(--secondary-text-color, #727272);
    --ohb-faint: var(--disabled-text-color, #9a9a9a);
    --ohb-border: var(--divider-color, #e0e0e0);
    --ohb-accent: var(--primary-color, #03a9f4);
    --ohb-on-accent: var(--text-primary-color, #fff);
    --ohb-accent-soft: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent);
    --ohb-danger: var(--error-color, #db4437);
    --ohb-warn: var(--warning-color, #ffa600);
    --ohb-ok: var(--success-color, #43a047);
    --ohb-font: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif));
    --ohb-mono: var(--code-font-family, ui-monospace, 'Roboto Mono', monospace);
    --ohb-r-sm: 6px;
    --ohb-r-md: 10px;
    --ohb-ctl: 32px;
  }
`;

export const controls = css`
  svg.i {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid var(--ohb-accent);
    outline-offset: 2px;
  }
  .btn {
    min-height: var(--ohb-ctl);
    padding: 0 12px;
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 8px;
    background: var(--ohb-panel-2);
    border: 1px solid var(--ohb-border);
    border-radius: var(--ohb-r-sm);
    white-space: nowrap;
    transition: background 120ms, border-color 120ms;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--ohb-muted);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.icon {
    width: var(--ohb-ctl);
    padding: 0;
    justify-content: center;
  }
  .btn.ghost {
    background: transparent;
    border-color: transparent;
  }
  .btn.ghost:hover:not(:disabled) {
    background: var(--ohb-panel-2);
  }
  .btn.primary {
    background: var(--ohb-accent);
    border-color: var(--ohb-accent);
    color: var(--ohb-on-accent);
    font-weight: 600;
  }
  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn[aria-pressed='true'] {
    background: var(--ohb-accent-soft);
    border-color: var(--ohb-accent);
    color: var(--ohb-accent);
  }
  .chip {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border: 1px solid var(--ohb-border);
    border-radius: 999px;
    color: var(--ohb-muted);
    font-size: 11.5px;
    background: var(--ohb-panel-2);
    white-space: nowrap;
  }
  .chip .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ohb-ok);
  }
  .chip.draft .dot {
    background: var(--ohb-warn);
  }
  .seg {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    background: var(--ohb-panel-2);
    border: 1px solid var(--ohb-border);
    border-radius: var(--ohb-r-sm);
    padding: 2px;
  }
  .seg button {
    height: 26px;
    border: 0;
    background: transparent;
    border-radius: 4px;
    color: var(--ohb-muted);
  }
  .seg button[aria-selected='true'],
  .seg button[aria-pressed='true'] {
    background: var(--ohb-panel);
    color: var(--ohb-text);
    box-shadow: 0 0 0 1px var(--ohb-border);
  }
  .num {
    display: grid;
    grid-template-columns: 22px 1fr;
    align-items: center;
    background: var(--ohb-panel-2);
    border: 1px solid var(--ohb-border);
    border-radius: var(--ohb-r-sm);
    height: var(--ohb-ctl);
  }
  .num:focus-within {
    border-color: var(--ohb-accent);
  }
  .num label {
    color: var(--ohb-faint);
    font: 500 11px var(--ohb-mono);
    text-align: center;
    margin: 0;
  }
  .num input {
    width: 100%;
    height: 100%;
    background: transparent;
    border: 0;
    padding: 0 6px 0 0;
    font: 500 12.5px var(--ohb-mono);
    color: inherit;
    outline: none;
    box-sizing: border-box;
  }
  .txt {
    height: var(--ohb-ctl);
    background: var(--ohb-panel-2);
    border: 1px solid var(--ohb-border);
    border-radius: var(--ohb-r-sm);
    padding: 0 12px;
    width: 100%;
    box-sizing: border-box;
    font: 500 12.5px var(--ohb-mono);
    color: inherit;
  }
  .txt:focus {
    border-color: var(--ohb-accent);
    outline: none;
  }
  kbd {
    font: 500 11px var(--ohb-mono);
    padding: 1px 5px;
    border: 1px solid var(--ohb-border);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: var(--ohb-muted);
    background: var(--ohb-panel-2);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
`;

// Shared look for the full-screen dialogs (raw editor, config editor): the same
// treatment as the Publish dialog in the panel.
export const modalStyles = css`
  :host {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    z-index: 100;
    font-family: var(--ohb-font);
    color: var(--ohb-text);
    font-size: 13px;
  }
  .modal {
    background: var(--ohb-panel);
    border: 1px solid var(--ohb-border);
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    display: grid;
    gap: 16px;
    min-height: 0;
    max-height: 88vh;
    box-sizing: border-box;
  }
  .modal h2 {
    margin: 0;
    font-size: 16px;
  }
  .modal .hint {
    margin: 0;
    color: var(--ohb-muted);
  }
  .actions {
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
  textarea.code {
    width: 100%;
    box-sizing: border-box;
    min-height: 110px;
    font: 400 12px/1.5 var(--ohb-mono);
    padding: 8px 12px;
    background: var(--ohb-panel-2);
    border: 1px solid var(--ohb-border);
    color: inherit;
    border-radius: var(--ohb-r-sm);
    resize: vertical;
  }
  textarea.code:focus {
    border-color: var(--ohb-accent);
    outline: none;
  }
  .error {
    color: var(--ohb-danger);
    font-size: 12px;
  }
  .warnings {
    color: var(--ohb-warn);
    font-size: 12px;
    max-height: 80px;
    overflow-y: auto;
  }
`;
