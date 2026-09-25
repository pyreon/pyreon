/**
 * Which addon panels have something to say about the selected component.
 *
 * Kept OUT of the panel files on purpose: applicability is a question about
 * the tab STRIP (what to dim), and answering it must not require touching —
 * or even loading — a panel's body. A registered panel can still answer for
 * itself through `AddonPanelDef.applies`; that wins over this table.
 *
 * Every predicate here errs toward "applies": a dimmed tab is still one
 * click away, but a relevant tab dimmed by a wrong guess would teach the user
 * to ignore the dimming. So each one only says "no" on positive evidence.
 */
import type { AddonPanelDef } from './panels'
import type { WorkbenchModel } from './model'
import { isStoreAvailable } from './store-bridge'

type Predicate = (m: WorkbenchModel) => boolean

const BUILTIN: Record<string, Predicate> = {
  // No schema declared → the panel can only say so.
  schema: (m) => m.sel()?.schema !== undefined,
  // The Data panel feeds `ctx.query`; a component that neither declares a
  // `queryData` control nor pins one in a scenario has not been wired to it.
  data: (m) => {
    const c = m.sel()
    if (!c) return false
    if (c.controls.some((ctrl) => ctrl.key === 'queryData')) return true
    return (c.scenarios ?? []).some((s) => s.args && 'queryData' in s.args)
  },
  // Roles matter when the project declared its own, or when the LAST render
  // actually consulted a permission key. `renderTick` makes this re-ask after
  // each render, since the consulted list is filled by rendering.
  permissions: (m) => {
    if (m.catalog.presets?.roles !== undefined) return true
    void m.renderTick()
    return m.permissions().consulted().length > 0
  },
  // Without `@pyreon/store` loaded there is nothing to record.
  store: () => isStoreAvailable(),
}

/** Is `panel` applicable to the model's current selection? */
export function panelApplies(panel: AddonPanelDef, m: WorkbenchModel): boolean {
  if (panel.applies) return panel.applies(m)
  const predicate = BUILTIN[panel.id]
  return predicate ? predicate(m) : true
}
