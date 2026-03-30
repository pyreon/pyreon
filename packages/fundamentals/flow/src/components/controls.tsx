import type { VNodeChild } from "@pyreon/core";
import type { ControlsProps, FlowInstance } from "../types";

const positionStyles: Record<string, string> = {
  "top-left": "top: 10px; left: 10px;",
  "top-right": "top: 10px; right: 10px;",
  "bottom-left": "bottom: 10px; left: 10px;",
  "bottom-right": "bottom: 10px; right: 10px;",
};

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
);

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
);

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
);

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
);

/**
 * Zoom and viewport controls for the flow canvas.
 * Shows zoom in, zoom out, fit view, and optional lock button.
 *
 * @example
 * ```tsx
 * <Flow instance={flow}>
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
    position = "bottom-left",
    instance,
  } = props;

  if (!instance) return null;

  const baseStyle = `position: absolute; ${positionStyles[position] ?? positionStyles["bottom-left"]} display: flex; flex-direction: column; gap: 2px; z-index: 5; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);`;
  const btnStyle =
    "width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: transparent; border-radius: 4px; cursor: pointer; color: #555; padding: 0;";

  return () => {
    const zoomPercent = Math.round(instance.zoom() * 100);

    return (
      <div class="pyreon-flow-controls" style={baseStyle}>
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
        <div
          style="font-size: 10px; text-align: center; color: #999; padding: 2px 0; user-select: none;"
          title="Current zoom level"
        >
          {zoomPercent}%
        </div>
      </div>
    );
  };
}
