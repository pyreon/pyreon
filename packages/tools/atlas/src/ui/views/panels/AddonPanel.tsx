/**
 * Addon panel view — the tab strip and the active tab's body.
 *
 * Both come from the panel REGISTRY (`../panels`), so this file no longer knows
 * what any individual panel is. Adding one — a built-in, or a UI-side panel for
 * a pipeline plugin — is a `registerAddonPanel` call, not a change here.
 */
import { Show } from '@pyreon/core'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { getAddonPanels, sealAddonPanels } from '../../panels'
import { registerBuiltinPanels } from './registerBuiltinPanels'
import { registerReactiveCoveragePanel } from './ReactiveCoveragePanel'
import { registerPerfPanel } from './PerfPanel'
import { registerPermissionsPanel } from './PermissionsPanel'
import { registerQueryPanel } from './QueryPanel'
import { registerLensPanel } from './LensPanel'
import { registerSchemaPanel } from './SchemaPanel'
import { registerUpdateCausePanel } from './UpdateCausePanel'

// Registering at module scope keeps the built-ins available to anything that
// imports the view, including tests that render it directly. `sealAddonPanels`
// inside makes it idempotent.
registerBuiltinPanels()
// Registered THROUGH the seam rather than moved into it — the first panel that
// proves a non-built-in can contribute UI.
registerReactiveCoveragePanel()
registerUpdateCausePanel()
registerPerfPanel()
registerPermissionsPanel()
registerQueryPanel()
registerSchemaPanel()
registerLensPanel()
// Seal AFTER every ship-with-Atlas panel is registered — sealing inside
// `registerBuiltinPanels` would have baselined only the four built-ins, so
// `resetAddonPanels()` would silently drop the Reactivity tab.
sealAddonPanels()

export function AddonPanel(props: { model: WorkbenchModel }) {
  const m = props.model
  // Read ONCE per mount: the registry is a startup-time registration surface,
  // not reactive state. A panel registered later is picked up on the next
  // mount, which is the same contract `ADDON_TABS` had.
  const panels = getAddonPanels()

  return (
    <C.AddonPanel style={() => `width:${m.panelW()}px`}>
      <C.AddonTabs>
        {panels.map((panel) => (
          <C.SegBtn
            data-testid={`addon-tab-${panel.id}`}
            title={panel.hint}
            state={() => (m.addon() === panel.id ? 'active' : 'idle')}
            onClick={() => m.addon.set(panel.id)}
          >
            {panel.title}
          </C.SegBtn>
        ))}
      </C.AddonTabs>
      <C.AddonBody>
        {panels.map((panel) => (
          <Show when={() => m.addon() === panel.id}>{panel.render(m)}</Show>
        ))}
      </C.AddonBody>
    </C.AddonPanel>
  )
}
