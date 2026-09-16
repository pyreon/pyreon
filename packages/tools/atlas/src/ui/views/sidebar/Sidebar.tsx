/**
 * Sidebar view — the filter-driven component TREE.
 *
 * Group paths are `/`-separated (`Components/Forms`) and render as nested,
 * collapsible headers — the flat single-level list this replaces was unusable
 * past ~30 components. Ordering stays first-seen (a curatorial choice the
 * catalog already made); the filter drops branches that end up empty. A PART
 * (`partOf`) sits indented under its parent, and a long scenario list is
 * capped until asked for.
 */
import { onMount, Show, type VNodeChild } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { HierarchyNode } from '../../hierarchy'
import { countUnder, withParts } from '../../hierarchy'
import type { WorkbenchComponent } from '../../catalog'
import type { WorkbenchModel } from '../../model'

/** Scenarios shown under the selected component before "show all". */
const SCENARIO_CAP = 8

export function Sidebar(props: { model: WorkbenchModel }) {
  const m = props.model

  // Every rendered row by id, so a selection made elsewhere (↑↓, the ⌘K
  // dialog, a scenario link on the docs page) scrolls its row into view.
  // Refs, not a DOM query: the rows are this view's own elements.
  const rows = new Map<string, HTMLElement>()
  const rowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rows.set(id, el)
    else rows.delete(id)
  }
  // A subscription opened on mount rather than a setup-time effect: scrolling
  // is imperative DOM work, and the rows only exist once mounted.
  const scrollToSelected = () => {
    const el = rows.get(m.selId.peek())
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }
  onMount(() => {
    scrollToSelected()
    return m.selId.subscribe(scrollToSelected)
  })

  // "Show all N" is per selection: selecting another component collapses the
  // list again, so 60 scenarios never follow you across the tree.
  const showAll = signal(false)
  effect(() => {
    void m.selId()
    showAll.set(false)
  })

  const component = (c: WorkbenchComponent, depth: number) => (
    <>
      <C.CompBtn
        data-testid={`component-${c.id}`}
        ref={rowRef(c.id)}
        state={() => (m.selId() === c.id ? 'active' : 'idle')}
        aria-current={() => (m.selId() === c.id ? 'true' : undefined)}
        onClick={() => m.selId.set(c.id)}
        {...(depth > 0 ? { 'data-depth': String(depth) } : {})}
      >
        <C.CompBar state={() => (m.selId() === c.id ? 'active' : 'idle')} />
        <C.CompName>{c.title ?? c.name}</C.CompName>
        {c.isNew ? <C.NewTag>NEW</C.NewTag> : null}
      </C.CompBtn>
      {/* The pipeline's derived scenarios, expanded under the SELECTED
          component (expansion = selection, so 40 scenarios never flood the
          list), capped until "show all". Each carries its three-state verdict
          dot; clicking applies the scenario's args, so the canvas renders
          exactly the state the verdict covered. */}
      {() => {
        if (m.selId() !== c.id || !c.scenarios || c.scenarios.length === 0) return null
        const all = c.scenarios
        const shown = showAll() || all.length <= SCENARIO_CAP ? all : all.slice(0, SCENARIO_CAP)
        return [
          ...shown.map((s) => (
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
          )),
          ...(shown.length < all.length
            ? [
                <C.ScenRow>
                  <C.ScenBtn data-testid={`scenarios-more-${c.id}`} onClick={() => showAll.set(true)}>
                    <C.ScenName>{`show all ${all.length}`}</C.ScenName>
                  </C.ScenBtn>
                </C.ScenRow>,
              ]
            : []),
        ]
      }}
    </>
  )

  const node = (n: HierarchyNode): VNodeChild => (
    <>
      <C.GroupBtn
        data-testid={`group-${n.path}`}
        data-depth={String(n.depth)}
        aria-expanded={() => (m.collapsed().has(n.path) ? 'false' : 'true')}
        onClick={() => m.toggleGroup(n.path)}
      >
        <C.GroupCaret>{() => (m.collapsed().has(n.path) ? '▸' : '▾')}</C.GroupCaret>
        <C.GroupText>{n.name}</C.GroupText>
        <C.GroupCount>{String(countUnder(n))}</C.GroupCount>
      </C.GroupBtn>
      {/* Collapse hides the whole branch — children AND items. A part renders
          one level deeper than its parent. */}
      {() =>
        m.collapsed().has(n.path)
          ? null
          : [
              ...withParts(n.items).map((c) => component(c, n.depth + 1 + (c.partOf ? 1 : 0))),
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
      aria-label="Components"
    >
      <C.SideHead>
        <C.SideLabel>components</C.SideLabel>
        <C.CountPill>{m.total}</C.CountPill>
      </C.SideHead>
      <C.SideList>
        <C.FilterInput
          data-testid="sidebar-filter"
          type="search"
          placeholder="Filter…"
          aria-label="Filter components"
          value={() => m.filter()}
          onInput={(e: Event) => m.filter.set((e.target as HTMLInputElement).value)}
        />
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
