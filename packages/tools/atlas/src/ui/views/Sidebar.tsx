/** Sidebar view — the search-filtered, grouped component list. */
import { Show } from '@pyreon/core'
import type { CatalogGroup } from '../catalog'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'

export function Sidebar(props: { model: WorkbenchModel }) {
  const m = props.model
  const group = (g: CatalogGroup) => (
    <>
      <C.GroupLabel>
        <C.GroupNum>{g.num}</C.GroupNum>
        {g.group}
      </C.GroupLabel>
      {g.items.map((c) => (
        <>
          <C.CompBtn state={() => (m.selId() === c.id ? 'active' : 'idle')} onClick={() => m.selId.set(c.id)}>
            <C.CompBar state={() => (m.selId() === c.id ? 'active' : 'idle')} />
            <C.CompName>{c.name}</C.CompName>
            {c.isNew ? <C.NewTag>NEW</C.NewTag> : null}
          </C.CompBtn>
          {/* The pipeline's derived scenarios, expanded under the SELECTED
              component (expansion = selection, so 40 scenarios never flood the
              list). Each carries its three-state verdict dot; clicking applies
              the scenario's args, so the canvas renders exactly the state the
              verdict covered. */}
          {() =>
            m.selId() === c.id && c.scenarios && c.scenarios.length > 0
              ? c.scenarios.map((s) => (
                  <C.ScenBtn
                    data-testid={`scenario-${s.id}`}
                    onClick={() => m.selectScenario(c.id, s.id)}
                  >
                    <C.ScenDot variant={s.verdict} data-verdict={s.verdict} />
                    <C.ScenName>{s.name}</C.ScenName>
                  </C.ScenBtn>
                ))
              : null}
        </>
      ))}
    </>
  )
  return (
    <C.Sidebar>
      <C.SideHead>
        <C.SideLabel>components</C.SideLabel>
        <C.CountPill>{m.total}</C.CountPill>
      </C.SideHead>
      <C.SideList>
        {() => m.visibleGroups().map((g) => group(g))}
        <Show when={() => m.noResults()}>
          <C.Empty>no matches</C.Empty>
        </Show>
      </C.SideList>
      {/* Real hints only — an earlier footer said "Tokens synced" next to a
          green dot, a health claim nothing measured. */}
      <C.SideFoot>↑↓ to browse · ⌘K to search</C.SideFoot>
    </C.Sidebar>
  )
}
