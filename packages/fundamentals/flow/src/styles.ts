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
  filter: drop-shadow(0 0 0 2px rgba(59, 130, 246, 0.3));
}

/* ── Handles ──────────────────────────────────────────────────────────────── */

.pyreon-flow-handle {
  transition: transform 0.1s ease, background 0.1s ease;
}

.pyreon-flow-handle:hover {
  transform: scale(1.4);
  background: #3b82f6 !important;
}

.pyreon-flow-handle-target:hover {
  background: #22c55e !important;
  border-color: #22c55e !important;
}

/* ── Resizer ──────────────────────────────────────────────────────────────── */

.pyreon-flow-resizer {
  transition: background 0.1s ease, transform 0.1s ease;
}

.pyreon-flow-resizer:hover {
  background: #3b82f6 !important;
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
  background: #f3f4f6 !important;
}

.pyreon-flow-controls button:active {
  background: #e5e7eb !important;
}
`
