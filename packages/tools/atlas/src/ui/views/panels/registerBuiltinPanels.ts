/**
 * Register the four built-in panels — each lives in its own file; this is the
 * one place that turns their defs into registry entries. Idempotent — safe if
 * the UI module is evaluated twice (`registerAddonPanel` replaces by id).
 *
 * Mapping to Storybook's addon set: `controls` ≈ addon-controls, `actions` ≈
 * addon-actions, `a11y` ≈ addon-a11y, and `canvas` folds together
 * addon-viewport, addon-backgrounds, addon-pseudo-states and addon-outline.
 */
import { registerAddonPanel } from '../../panels'
import { registerStorePanel } from './StorePanel'
import { a11yPanel } from './A11yPanel'
import { actionsPanel } from './ActionsPanel'
import { canvasPanel } from './CanvasPanel'
import { controlsPanel } from './ControlsPanel'

export function registerBuiltinPanels(): void {
  registerAddonPanel(controlsPanel)
  registerAddonPanel(actionsPanel)
  registerAddonPanel(a11yPanel)
  registerAddonPanel(canvasPanel)
  registerStorePanel()
}
