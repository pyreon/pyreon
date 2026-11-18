/**
 * The dark value of every `--pyreon-flow-*` variable, applied by
 * `<Flow colorMode="dark">` and by `colorMode="system"` under a dark OS scheme.
 * The native palettes (`PyreonFlowView.swift` / `.kt`) are held to these.
 */
const FLOW_DARK_PALETTE: Readonly<Record<string, string>> = {
  'node-bg': '#1f2937',
  'node-color': '#f3f4f6',
  'node-border': '#374151',
  'node-selected': '#60a5fa',
  'edge': '#6b7280',
  'edge-label': '#9ca3af',
  'accent': '#60a5fa',
  'accent-bg': 'rgba(96, 165, 250, 0.12)',
  'selection-glow': 'rgba(96, 165, 250, 0.35)',
  'handle-bg': '#374151',
  'handle-border': '#6b7280',
  'handle-valid': '#4ade80',
  'panel-bg': '#111827',
  'panel-border': '#374151',
  'panel-shadow': '0 2px 8px rgba(0, 0, 0, 0.5)',
  'control-color': '#e5e7eb',
  'control-muted': '#9ca3af',
  'controls-hover': '#1f2937',
  'controls-active': '#374151',
  'minimap-node': '#374151',
  'minimap-mask': 'rgba(0, 0, 0, 0.4)',
  'toolbar-bg': '#111827',
  'toolbar-border': '#374151',
  'bg-pattern': '#374151',
  'resizer-bg': '#60a5fa',
}

/** The canvas background in dark mode. */
const DARK_CANVAS = '#0b1220'

/**
 * The dark-mode rules for one selector.
 *
 * The dark values are NOT declared as the public variables on `.pyreon-flow`:
 * a value declared on an element always beats one inherited from an ancestor,
 * so an app that themed Flow from a wrapper (the documented way) lost every
 * override in dark mode (#4427). Instead the element resolves each variable
 * once into a private one — the public value if any ancestor (or the element
 * itself) sets it, else the dark default — and its children get the public
 * variable back as that resolved value. Everything inside the canvas, custom
 * nodes and edges included, reads `var(--pyreon-flow-*)` and sees the value in
 * force. `:where()` keeps the children rule at zero specificity, so a rule of
 * yours on a panel (`.pyreon-flow-controls { … }`) still wins.
 */
function darkMode(selector: string, indent = ''): string {
  const names = Object.keys(FLOW_DARK_PALETTE)
  const lines = [
    `${selector} {`,
    ...names.map((n) => `  --_pyreon-flow-${n}: var(--pyreon-flow-${n}, ${FLOW_DARK_PALETTE[n]});`),
    `  background: ${DARK_CANVAS};`,
    '}',
    `:where(${selector}) > * {`,
    ...names.map((n) => `  --pyreon-flow-${n}: var(--_pyreon-flow-${n});`),
    '}',
  ]

  return lines.map((l) => indent + l).join('\n')
}

/**
 * Built by one call marked pure, so a bundle that never reads `flowStyles`
 * drops the whole sheet. The dark rules are generated (`darkMode`), and a
 * template with calls in it is not something a bundler will discard by itself:
 * without the marker the sheet stayed in every `@pyreon/flow` import, used or
 * not (+1.6 kB gzipped on the `createFlow` + `<Flow>` import).
 */
// The sheet in three literal parts, around the two generated dark blocks.
const SHEET_BEFORE_DARK = `
/* Marker: <Flow> checks for it in dev and warns when this sheet is missing. */
.pyreon-flow {
  --pyreon-flow-styles: 1;
}

/* ── Animated edges ────────────────────────────────────────────────────────── */

.pyreon-flow-edge-animated {
  stroke-dasharray: 5;
  animation: pyreon-flow-edge-dash 0.5s linear infinite;
}

@keyframes pyreon-flow-edge-dash {
  to {
    stroke-dashoffset: -10;
  }
}

/* ── Node states ──────────────────────────────────────────────────────────── */

.pyreon-flow-node {
  transition: box-shadow 0.15s ease;
}

.pyreon-flow-node.dragging {
  opacity: 0.9;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
  cursor: grabbing;
}

.pyreon-flow-node.selected {
  filter: drop-shadow(0 0 0 2px var(--pyreon-flow-selection-glow, rgba(59, 130, 246, 0.3)));
}

/* ── Handles ──────────────────────────────────────────────────────────────── */

.pyreon-flow-handle {
  transition: transform 0.1s ease, background 0.1s ease;
}

.pyreon-flow-handle:hover {
  transform: scale(1.4);
  background: var(--pyreon-flow-accent, #3b82f6) !important;
}

.pyreon-flow-handle-target:hover {
  background: var(--pyreon-flow-handle-valid, #22c55e) !important;
  border-color: var(--pyreon-flow-handle-valid, #22c55e) !important;
}

/* ── Resizer ──────────────────────────────────────────────────────────────── */

.pyreon-flow-resizer {
  transition: background 0.1s ease, transform 0.1s ease;
}

.pyreon-flow-resizer:hover {
  background: var(--pyreon-flow-accent, #3b82f6) !important;
  transform: scale(1.2);
}

/* ── Selection box ────────────────────────────────────────────────────────── */

.pyreon-flow-selection-box {
  pointer-events: none;
  border-radius: 2px;
}

/* ── MiniMap ──────────────────────────────────────────────────────────────── */

.pyreon-flow-minimap {
  transition: opacity 0.2s ease;
}

.pyreon-flow-minimap:hover {
  opacity: 1 !important;
}

/* ── Node toolbar ─────────────────────────────────────────────────────────── */

.pyreon-flow-node-toolbar {
  animation: pyreon-flow-toolbar-enter 0.15s ease;
}

@keyframes pyreon-flow-toolbar-enter {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* ── Controls ─────────────────────────────────────────────────────────────── */

.pyreon-flow-controls button:hover {
  background: var(--pyreon-flow-controls-hover, #f3f4f6) !important;
}

.pyreon-flow-controls button:active {
  background: var(--pyreon-flow-controls-active, #e5e7eb) !important;
}

/* ── Color modes ──────────────────────────────────────────────────────────── */

/* Dark values for every --pyreon-flow-* variable. Applied by
   <Flow colorMode="dark">, or by colorMode="system" under a dark OS scheme.
   Set the same variables on an ancestor, or on the Flow element, to override
   any of them in either mode. */
`

const SHEET_BETWEEN_DARK = `

@media (prefers-color-scheme: dark) {
`

const SHEET_AFTER_DARK = `
}

/* ── Accessibility ────────────────────────────────────────────────────────── */

/* Keyboard focus is shown, pointer focus is not — the UA stylesheets already
   draw their default ring under :focus-visible only; these rules theme it. */
.pyreon-flow:focus-visible {
  outline: 2px solid var(--_pyreon-flow-accent, var(--pyreon-flow-accent, #3b82f6));
  outline-offset: -2px;
}

.pyreon-flow-node:focus-visible {
  outline: 2px solid var(--pyreon-flow-accent, #3b82f6);
  outline-offset: 2px;
}

.pyreon-flow-edge-path:focus-visible {
  outline: 2px solid var(--pyreon-flow-accent, #3b82f6);
  outline-offset: 4px;
}

.pyreon-flow:focus:not(:focus-visible),
.pyreon-flow-node:focus:not(:focus-visible),
.pyreon-flow-edge-path:focus:not(:focus-visible) {
  outline: none;
}

/* Screen-reader-only text: keyboard instructions + the live region. */
.pyreon-flow-a11y-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pyreon-flow,
  .pyreon-flow *,
  .pyreon-flow-controls,
  .pyreon-flow-controls * {
    transition: none !important;
    animation: none !important;
  }
}
`

function buildFlowStyles(): string {
  return (
    SHEET_BEFORE_DARK +
    darkMode('.pyreon-flow[data-color-mode="dark"]') +
    SHEET_BETWEEN_DARK +
    darkMode('.pyreon-flow[data-color-mode="system"]', '  ') +
    SHEET_AFTER_DARK
  )
}

/**
 * Default CSS styles for the flow diagram.
 * Inject via `<style>` tag or import in your CSS.
 *
 * @example
 * ```tsx
 * import { flowStyles } from '@pyreon/flow'
 *
 * // Inject once at app root
 * const style = document.createElement('style')
 * style.textContent = flowStyles
 * document.head.appendChild(style)
 * ```
 */
export const flowStyles: string = /* @__PURE__ */ buildFlowStyles()
