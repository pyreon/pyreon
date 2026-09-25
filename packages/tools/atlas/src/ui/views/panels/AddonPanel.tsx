/**
 * Addon panel view — the tab strip and the active tab's body.
 *
 * Both come from the panel REGISTRY (`../panels`), so this file no longer knows
 * what any individual panel is. Adding one — a built-in, or a UI-side panel for
 * a pipeline plugin — is a `registerAddonPanel` call, not a change here.
 */
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { onMount } from '@pyreon/core'
import { getAddonPanels, sealAddonPanels } from '../../panels'
import { panelApplies } from '../../panel-applicability'
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

  // ── The tab strip: one row that scrolls ─────────────────────────────────
  // Tab elements + the strip, by ref, for the two imperative jobs a
  // horizontally scrolling strip has: keep the ACTIVE tab in view, and mark
  // which edge still has more tabs (the fade — pure measurement, written as
  // a data attribute the strip's CSS reads).
  let strip: HTMLElement | null = null
  const tabEls = new Map<string, HTMLElement>()
  const updateFade = () => {
    const el = strip
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    el.setAttribute('data-fade', left && right ? 'both' : left ? 'left' : right ? 'right' : 'none')
  }
  const revealActive = () => {
    // Roving tabindex, written here rather than as an accessor prop: only the
    // active tab is in the Tab order, the rest are reached with ←/→.
    for (const [id, tabEl] of tabEls) tabEl.tabIndex = id === m.addon.peek() ? 0 : -1
    const el = tabEls.get(String(m.addon.peek()))
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    updateFade()
  }
  onMount(() => {
    // A frame later: the strip has to be attached and laid out to measure.
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(revealActive) : 0
    const off = m.addon.subscribe(revealActive)
    return () => {
      off()
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    }
  })

  // WAI-ARIA tabs keyboard model: ←/→ move between tabs (wrapping),
  // Home/End jump to the ends. Activation follows focus — every panel body is
  // lazy and cheap to show.
  const onTabKey = (e: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const ids = panels.map((p) => p.id)
    const i = ids.indexOf(String(m.addon()))
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? ids.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
    const id = ids[next]!
    m.addon.set(id)
    tabEls.get(id)?.focus()
  }

  return (
    <C.AddonPanel
      style={() => (m.compact() ? 'width:100%;flex:1;border-left:none' : `width:${m.panelW()}px`)}
    >
      <C.AddonTabs
        role="tablist"
        aria-label="Addon panels"
        data-testid="addon-tabs"
        ref={(el: HTMLElement | null) => {
          strip = el
        }}
        onScroll={updateFade}
        onKeyDown={onTabKey}
      >
        {panels.map((panel) => {
          // Dimmed, never hidden: a panel that has nothing for THIS component
          // stays one click away, and says why in its tooltip.
          const applies = () => panelApplies(panel, m)
          return (
            <C.SegBtn
              data-testid={`addon-tab-${panel.id}`}
              data-applicable={() => (applies() ? 'true' : 'false')}
              ref={(el: HTMLElement | null) => {
                if (el) tabEls.set(panel.id, el)
                else tabEls.delete(panel.id)
              }}
              title={() =>
                applies() ? panel.hint : `${panel.hint} — nothing detected for this component`
              }
              role="tab"
              id={`addon-tab-${panel.id}`}
              aria-selected={() => (m.addon() === panel.id ? 'true' : 'false')}
              aria-controls={`addon-panel-${panel.id}`}
              state={() => (m.addon() === panel.id ? 'active' : 'idle')}
              variant={() => (applies() ? 'applicable' : 'inapplicable')}
              size="small"
              onClick={() => m.addon.set(panel.id)}
            >
              {panel.title}
            </C.SegBtn>
          )
        })}
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
              aria-labelledby={`addon-tab-${panel.id}`}
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
