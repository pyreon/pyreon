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
 * The four light panels (Controls — the opening tab — Actions, A11y, Canvas,
 * Addons) are in the main bundle; the rest load their body on first open
 * (./lazy). Their metadata lives HERE so the strip and `?p=` links never wait.
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
import { lazyPanel } from './lazy'

export function registerBuiltinPanels(): void {
  registerAddonPanel(controlsPanel)
  registerAddonPanel(
    lazyPanel(
      { id: 'schema', title: 'Schema', hint: 'Where each control comes from, and a live validation verdict' },
      () => import('./SchemaPanel'),
    ),
  )
  registerAddonPanel(actionsPanel)
  registerAddonPanel(a11yPanel)
  registerAddonPanel(
    lazyPanel(
      { id: 'perf', title: 'Perf', hint: 'Framework work done per interaction (counters, not timings)' },
      () => import('./PerfPanel'),
    ),
  )
  registerAddonPanel(
    lazyPanel(
      { id: 'permissions', title: 'Permissions', hint: 'The scenario as each role sees it, judged against the role policy' },
      () => import('./PermissionsPanel'),
    ),
  )
  registerAddonPanel(
    lazyPanel(
      { id: 'data', title: 'Query', hint: 'Loading / success / error / refetching, without a network' },
      () => import('./QueryPanel'),
    ),
  )
  registerAddonPanel(
    lazyPanel(
      { id: 'store', title: 'Store', hint: 'Writes this interaction made, steppable — @pyreon/store only' },
      () => import('./StorePanel'),
    ),
  )
  registerAddonPanel(
    lazyPanel(
      { id: 'why', title: 'Update cause', hint: 'The exact signal → computed → effect chain behind an update' },
      () => import('./UpdateCausePanel'),
    ),
  )
  registerAddonPanel(
    lazyPanel(
      { id: 'reactivity', title: 'Reactive coverage', hint: 'Which reactive edges never fired' },
      () => import('./ReactiveCoveragePanel'),
    ),
  )
  registerAddonPanel(
    lazyPanel(
      { id: 'lens', title: 'Lens', hint: "The compiler's live/static verdict for each expression" },
      () => import('./LensPanel'),
    ),
  )
  registerAddonPanel(canvasPanel)
  registerAddonPanel(addonsPanel)
}
