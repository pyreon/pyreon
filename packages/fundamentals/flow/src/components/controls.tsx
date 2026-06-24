import { useContext, type VNodeChild } from '@pyreon/core'
import type { ControlsProps, FlowInstance } from '../types'
import { FlowContext } from './flow-context'

const positionStyles: Record<string, string> = {
  'top-left': 'top: 10px; left: 10px;',
  'top-right': 'top: 10px; right: 10px;',
  'bottom-left': 'bottom: 10px; left: 10px;',
  'bottom-right': 'bottom: 10px; right: 10px;',
}

// Simple SVG icons
const ZoomInIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <circle cx="7" cy="7" r="5" />
    <line x1="7" y1="5" x2="7" y2="9" />
    <line x1="5" y1="7" x2="9" y2="7" />
    <line x1="11" y1="11" x2="14" y2="14" />
  </svg>
)

const ZoomOutIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <circle cx="7" cy="7" r="5" />
    <line x1="5" y1="7" x2="9" y2="7" />
    <line x1="11" y1="11" x2="14" y2="14" />
  </svg>
)

const FitViewIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <line x1="2" y1="6" x2="14" y2="6" />
    <line x1="6" y1="2" x2="6" y2="14" />
  </svg>
)

const LockIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <rect x="3" y="7" width="10" height="7" rx="1" />
    <path d="M5 7V5a3 3 0 0 1 6 0v2" />
  </svg>
)

/**
 * Zoom and viewport controls for the flow canvas.
 * Shows zoom in, zoom out, fit view, and optional lock button.
 *
 * @remarks
 * Place `<Controls>` AFTER `<MiniMap>` in the `<Flow>` children. A
 * `<Controls>` mounted as a sibling *before* a `<MiniMap>` currently
 * fails to render (it resolves the flow instance fine, but its DOM is
 * never mounted) — a known framework slot-ordering limitation where an
 * earlier reactive sibling shifts the dynamic-slot element-ref walk.
 * See `.claude/rules/anti-patterns.md` → "Flow overlay child order".
 *
 * @example
 * ```tsx
 * <Flow instance={flow}>
 *   <MiniMap />
 *   <Controls />
 * </Flow>
 * ```
 */
export function Controls(props: ControlsProps & { instance?: FlowInstance }): VNodeChild {
  const {
    showZoomIn = true,
    showZoomOut = true,
    showFitView = true,
    showLock = false,
    position = 'bottom-left',
  } = props

  // Resolve the instance from an explicit prop, else the <Flow> context.
  const instance = props.instance ?? useContext(FlowContext)
  if (!instance) return null

  const baseStyle = `position: absolute; ${positionStyles[position] ?? positionStyles['bottom-left']} display: flex; flex-direction: column; gap: 2px; z-index: 5; background: var(--pyreon-flow-panel-bg, #fff); border: 1px solid var(--pyreon-flow-panel-border, #ddd); border-radius: 6px; padding: 2px; box-shadow: 0 1px 4px var(--pyreon-flow-panel-shadow, rgba(0,0,0,0.08));`
  const btnStyle =
    'width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: transparent; border-radius: 4px; cursor: pointer; color: var(--pyreon-flow-control-color, #555); padding: 0;'

  return () => {
    const zoomPercent = Math.round(instance.zoom() * 100)

    return (
      <div class="pyreon-flow-controls" style={baseStyle}>
        {/* Static `display: contents` wrapper isolates the dynamic conditional
            buttons so their mount (which removes their placeholders) can't
            shift the element-ref walk the compiler uses for the trailing
            reactive zoom-% <div>. contents keeps them flex items of the
            controls column. */}
        <div style="display: contents;">
        {showZoomIn && (
          <button type="button" style={btnStyle} title="Zoom in" onClick={() => instance.zoomIn()}>
            <ZoomInIcon />
          </button>
        )}
        {showZoomOut && (
          <button
            type="button"
            style={btnStyle}
            title="Zoom out"
            onClick={() => instance.zoomOut()}
          >
            <ZoomOutIcon />
          </button>
        )}
        {showFitView && (
          <button
            type="button"
            style={btnStyle}
            title="Fit view"
            onClick={() => instance.fitView()}
          >
            <FitViewIcon />
          </button>
        )}
        {showLock && (
          <button
            type="button"
            style={btnStyle}
            title="Lock/unlock"
            onClick={() => {
              // Toggle pan/zoom by updating config
              // This is a simple toggle — could be improved with state
            }}
          >
            <LockIcon />
          </button>
        )}
        </div>
        <div
          style="font-size: 10px; text-align: center; color: var(--pyreon-flow-control-muted, #999); padding: 2px 0; user-select: none;"
          title="Current zoom level"
        >
          {() => `${zoomPercent}%`}
        </div>
      </div>
    )
  }
}
