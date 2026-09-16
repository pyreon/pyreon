/**
 * Addon panel view — the tab strip and the active tab's body.
 *
 * Both come from the panel REGISTRY (`../panels`), so this file no longer knows
 * what any individual panel is. Adding one — a built-in, or a UI-side panel for
 * a pipeline plugin — is a `registerAddonPanel` call, not a change here.
 */
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
      <C.AddonTabs role="tablist" aria-label="Addon panels">
        {panels.map((panel) => (
          <C.SegBtn
            data-testid={`addon-tab-${panel.id}`}
            title={panel.hint}
            role="tab"
            aria-selected={() => (m.addon() === panel.id ? 'true' : 'false')}
            aria-controls={`addon-panel-${panel.id}`}
            state={() => (m.addon() === panel.id ? 'active' : 'idle')}
            onClick={() => m.addon.set(panel.id)}
          >
            {panel.title}
          </C.SegBtn>
        ))}
      </C.AddonTabs>
      <C.AddonBody>
        {/*
          Each body is built ON DEMAND — the first time its tab is opened —
          KEPT across tab switches, and REBUILT when the selected component
          changes. Three constraints, and the middle one is the one that
          bites: as a plain child every panel's render ran at mount (twelve
          setups, a reactive-graph baseline walk among them, for a user who
          opened one tab), and a panel's result signals (an axe run, a Lens
          verdict) outlived the component they were about; but a body that
          UNMOUNTS when its tab is hidden loses a recording in progress —
          start recording coverage, edit a control, come back, and the session
          is gone. So the body is memoised per (panel, component) and returned
          BY IDENTITY while inactive: the reactive boundary keeps an identical
          value mounted, and the wrapper only hides it.
        */}
        {panels.map((panel) => {
          let built: { sel: string; node: unknown } | null = null
          return (
            <div
              id={`addon-panel-${panel.id}`}
              role="tabpanel"
              style={() => (m.addon() === panel.id ? 'display:contents' : 'display:none')}
            >
              {() => {
                const sel = m.selId()
                if (built && built.sel === sel) return built.node as never
                if (m.addon() !== panel.id) return null
                built = { sel, node: panel.render(m) }
                return built.node as never
              }}
            </div>
          )
        })}
      </C.AddonBody>
    </C.AddonPanel>
  )
}
