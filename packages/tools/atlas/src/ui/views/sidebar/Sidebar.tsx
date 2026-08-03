/**
 * Sidebar view — the search-filtered component TREE.
 *
 * Group paths are `/`-separated (`Components/Forms`) and render as nested,
 * collapsible headers — the flat single-level list this replaces was unusable
 * past ~30 components. Ordering stays first-seen (a curatorial choice the
 * catalog already made); search drops branches that end up empty.
 */
import { Show, type VNodeChild } from '@pyreon/core'
import * as C from '../../components'
import type { HierarchyNode } from '../../hierarchy'
import { countUnder } from '../../hierarchy'
import type { WorkbenchComponent } from '../../catalog'
import type { WorkbenchModel } from '../../model'

export function Sidebar(props: { model: WorkbenchModel }) {
  const m = props.model

  const component = (c: WorkbenchComponent, depth: number) => (
    <>
      <C.CompBtn
        state={() => (m.selId() === c.id ? 'active' : 'idle')}
        onClick={() => m.selId.set(c.id)}
        {...(depth > 0 ? { 'data-depth': String(depth) } : {})}
      >
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
              <C.ScenRow>
                <C.ScenBtn data-testid={`scenario-${s.id}`} onClick={() => m.selectScenario(c.id, s.id)}>
                  <C.ScenDot variant={s.verdict} data-verdict={s.verdict} />
                  <C.ScenName>{s.name}</C.ScenName>
                </C.ScenBtn>
                {s.play ? (
                  <C.ScenPlay data-testid={`play-${s.id}`} onClick={() => void m.runPlay(c.id, s.id)}>
                    ▶
                  </C.ScenPlay>
                ) : null}
              </C.ScenRow>
            ))
          : null}
    </>
  )

  const node = (n: HierarchyNode): VNodeChild => (
    <>
      <C.GroupBtn
        data-testid={`group-${n.path}`}
        data-depth={String(n.depth)}
        onClick={() => m.toggleGroup(n.path)}
      >
        <C.GroupCaret>{() => (m.collapsed().has(n.path) ? '▸' : '▾')}</C.GroupCaret>
        <C.GroupText>{n.name}</C.GroupText>
        <C.GroupCount>{String(countUnder(n))}</C.GroupCount>
      </C.GroupBtn>
      {/* Collapse hides the whole branch — children AND items. */}
      {() =>
        m.collapsed().has(n.path)
          ? null
          : [
              ...n.items.map((c) => component(c, n.depth + 1)),
              ...n.children.map((child) => node(child)),
            ]
      }
    </>
  )

  return (
    <C.Sidebar
      // Width is live drag geometry (measurement, not styling) — a hashed
      // class per pixel would grow the style cache without bound.
      style={() => `width:${m.sidebarW()}px`}
    >
      <C.SideHead>
        <C.SideLabel>components</C.SideLabel>
        <C.CountPill>{m.total}</C.CountPill>
      </C.SideHead>
      <C.SideList>
        {() => m.tree().map((n) => node(n)) as VNodeChild[]}
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
