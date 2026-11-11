/**
 * Register every panel that ships with Atlas, in the order the tab strip shows
 * them. Idempotent — safe if the UI module is evaluated twice
 * (`registerAddonPanel` replaces by id).
 *
 * Registration order IS tab order (the registry is insertion-ordered), and
 * this is the design's order: authoring first (Controls, Schema, Actions),
 * then the checks (A11y, Perf, Permissions, Query, Store), then the three
 * that read the signal graph and the compiler (Update cause, Reactive
 * coverage, Lens), then the environment (Canvas, Addons).
 *
 * Mapping to Storybook's addon set: `controls` ≈ addon-controls, `actions` ≈
 * addon-actions, `a11y` ≈ addon-a11y, and `addons` folds together
 * addon-viewport, addon-backgrounds, addon-pseudo-states and addon-outline.
 */
import { registerAddonPanel } from '../../panels'
import { a11yPanel } from './A11yPanel'
import { actionsPanel } from './ActionsPanel'
import { addonsPanel, canvasPanel } from './CanvasPanel'
import { controlsPanel } from './ControlsPanel'
import { registerLensPanel } from './LensPanel'
import { registerPerfPanel } from './PerfPanel'
import { registerPermissionsPanel } from './PermissionsPanel'
import { registerQueryPanel } from './QueryPanel'
import { registerReactiveCoveragePanel } from './ReactiveCoveragePanel'
import { registerSchemaPanel } from './SchemaPanel'
import { registerStorePanel } from './StorePanel'
import { registerUpdateCausePanel } from './UpdateCausePanel'

export function registerBuiltinPanels(): void {
  registerAddonPanel(controlsPanel)
  registerSchemaPanel()
  registerAddonPanel(actionsPanel)
  registerAddonPanel(a11yPanel)
  registerPerfPanel()
  registerPermissionsPanel()
  registerQueryPanel()
  registerStorePanel()
  registerUpdateCausePanel()
  registerReactiveCoveragePanel()
  registerLensPanel()
  registerAddonPanel(canvasPanel)
  registerAddonPanel(addonsPanel)
}
