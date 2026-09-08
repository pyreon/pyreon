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
export const flowStyles = `
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
   Set the same variables on an ancestor to override any of them. */
.pyreon-flow[data-color-mode="dark"] {
  --pyreon-flow-node-bg: #1f2937;
  --pyreon-flow-node-color: #f3f4f6;
  --pyreon-flow-node-border: #374151;
  --pyreon-flow-node-selected: #60a5fa;
  --pyreon-flow-edge: #6b7280;
  --pyreon-flow-edge-label: #9ca3af;
  --pyreon-flow-accent: #60a5fa;
  --pyreon-flow-accent-bg: rgba(96, 165, 250, 0.12);
  --pyreon-flow-selection-glow: rgba(96, 165, 250, 0.35);
  --pyreon-flow-handle-bg: #374151;
  --pyreon-flow-handle-border: #6b7280;
  --pyreon-flow-handle-valid: #4ade80;
  --pyreon-flow-panel-bg: #111827;
  --pyreon-flow-panel-border: #374151;
  --pyreon-flow-panel-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  --pyreon-flow-control-color: #e5e7eb;
  --pyreon-flow-control-muted: #9ca3af;
  --pyreon-flow-controls-hover: #1f2937;
  --pyreon-flow-controls-active: #374151;
  --pyreon-flow-minimap-node: #374151;
  --pyreon-flow-minimap-mask: rgba(0, 0, 0, 0.4);
  --pyreon-flow-toolbar-bg: #111827;
  --pyreon-flow-toolbar-border: #374151;
  --pyreon-flow-bg-pattern: #374151;
  --pyreon-flow-resizer-bg: #60a5fa;
  background: #0b1220;
}

@media (prefers-color-scheme: dark) {
  .pyreon-flow[data-color-mode="system"] {
    --pyreon-flow-node-bg: #1f2937;
    --pyreon-flow-node-color: #f3f4f6;
    --pyreon-flow-node-border: #374151;
    --pyreon-flow-node-selected: #60a5fa;
    --pyreon-flow-edge: #6b7280;
    --pyreon-flow-edge-label: #9ca3af;
    --pyreon-flow-accent: #60a5fa;
    --pyreon-flow-accent-bg: rgba(96, 165, 250, 0.12);
    --pyreon-flow-selection-glow: rgba(96, 165, 250, 0.35);
    --pyreon-flow-handle-bg: #374151;
    --pyreon-flow-handle-border: #6b7280;
    --pyreon-flow-handle-valid: #4ade80;
    --pyreon-flow-panel-bg: #111827;
    --pyreon-flow-panel-border: #374151;
    --pyreon-flow-panel-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    --pyreon-flow-control-color: #e5e7eb;
    --pyreon-flow-control-muted: #9ca3af;
    --pyreon-flow-controls-hover: #1f2937;
    --pyreon-flow-controls-active: #374151;
    --pyreon-flow-minimap-node: #374151;
    --pyreon-flow-minimap-mask: rgba(0, 0, 0, 0.4);
    --pyreon-flow-toolbar-bg: #111827;
    --pyreon-flow-toolbar-border: #374151;
    --pyreon-flow-bg-pattern: #374151;
    --pyreon-flow-resizer-bg: #60a5fa;
    background: #0b1220;
  }
}

/* ── Accessibility ────────────────────────────────────────────────────────── */

/* Keyboard focus is shown, pointer focus is not — the UA stylesheets already
   draw their default ring under :focus-visible only; these rules theme it. */
.pyreon-flow:focus-visible {
  outline: 2px solid var(--pyreon-flow-accent, #3b82f6);
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
