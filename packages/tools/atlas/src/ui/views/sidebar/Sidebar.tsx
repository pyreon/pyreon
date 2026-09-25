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
import { countUnder, nodeEntries, partCount } from '../../hierarchy'
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
  //
  // Deferred a FRAME, for two reasons that each made the old synchronous
  // call a silent no-op: on first mount the sidebar is not yet attached to
  // the document when `onMount` runs (scrolling a detached element does
  // nothing — a link to `/accordion-item` landed with the row three screens
  // down), and on a selection change the model has just EXPANDED the folders
  // above the row, so the row itself does not exist until that re-render.
  let pending = 0
  const scrollToSelected = () => {
    if (typeof requestAnimationFrame !== 'function') return
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      const el = rows.get(m.selId.peek())
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
    })
  }
  onMount(() => {
    scrollToSelected()
    const off = m.selId.subscribe(scrollToSelected)
    return () => {
      off()
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pending)
    }
  })

  // Choosing something in the compact DRAWER is navigation — close it so the
  // canvas the choice was for is what the user sees next.
  const choose = (apply: () => void) => {
    apply()
    if (m.compact()) m.drawerOpen.set(false)
  }

  // "Show all N" is per selection: selecting another component collapses the
  // list again, so 60 scenarios never follow you across the tree.
  const showAll = signal(false)
  effect(() => {
    void m.selId()
    showAll.set(false)
  })

  const compBtn = (c: WorkbenchComponent, depth: number) => (
    <C.CompBtn
      data-testid={`component-${c.id}`}
      ref={rowRef(c.id)}
      state={() => (m.selId() === c.id ? 'active' : 'idle')}
      aria-current={() => (m.selId() === c.id ? 'true' : undefined)}
      onClick={() => choose(() => m.selId.set(c.id))}
      {...(depth > 0 ? { 'data-depth': String(depth) } : {})}
    >
      <C.CompBar state={() => (m.selId() === c.id ? 'active' : 'idle')} />
      <C.CompName>{c.title ?? c.name}</C.CompName>
      {c.isNew ? <C.NewTag>NEW</C.NewTag> : null}
    </C.CompBtn>
  )

  // `owner` → the row is ALSO a folder header: the component button plus a
  // sibling toggle for the folder's parts.
  const component = (c: WorkbenchComponent, depth: number, owns?: HierarchyNode) => (
    <>
      {owns && partCount(owns) > 0 ? (
        <C.CompRow>
          {compBtn(c, depth)}
          <C.TreeToggle
            data-testid={`group-${owns.path}`}
            data-depth={String(owns.depth)}
            aria-label={() => `${m.isCollapsed(owns.path) ? 'Show' : 'Hide'} parts of ${c.title ?? c.name}`}
            aria-expanded={() => (m.isCollapsed(owns.path) ? 'false' : 'true')}
            onClick={() => m.toggleGroup(owns.path)}
          >
            <span>{String(partCount(owns))}</span>
            <span aria-hidden="true">{() => (m.isCollapsed(owns.path) ? '▸' : '▾')}</span>
          </C.TreeToggle>
        </C.CompRow>
      ) : (
        compBtn(c, depth)
      )}
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
              {/* The scenario the canvas shows EXACTLY is marked — every dot
                  is a verdict colour, so without this nothing said which of
                  twelve green rows you were looking at. */}
              <C.ScenBtn
                data-testid={`scenario-${s.id}`}
                state={() => (m.activeScenario() === s.id ? 'active' : 'idle')}
                aria-current={() => (m.activeScenario() === s.id ? 'true' : undefined)}
                onClick={() => choose(() => m.selectScenario(c.id, s.id))}
              >
                <C.ScenDot variant={s.verdict} data-verdict={s.verdict} />
                <C.ScenName>{s.name}</C.ScenName>
              </C.ScenBtn>
              {s.play ? (
                <C.ScenPlay
                  data-testid={`play-${s.id}`}
                  aria-label={`Play ${s.name}`}
                  onClick={() => choose(() => void m.runPlay(c.id, s.id))}
                >
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

  // A folder NAMED after a component (`Accordion/` next to `Accordion`) has
  // that component as its `owner`: the header row IS the component, so the
  // name no longer appears twice — once as a leaf, once as a folder.
  const node = (n: HierarchyNode): VNodeChild => (
    <>
      {n.owner ? (
        component(n.owner, n.depth, n)
      ) : (
        <C.GroupBtn
          data-testid={`group-${n.path}`}
          data-depth={String(n.depth)}
          aria-expanded={() => (m.isCollapsed(n.path) ? 'false' : 'true')}
          onClick={() => m.toggleGroup(n.path)}
        >
          <C.GroupCaret aria-hidden="true">{() => (m.isCollapsed(n.path) ? '▸' : '▾')}</C.GroupCaret>
          <C.GroupText>{n.name}</C.GroupText>
          <C.GroupCount>{String(countUnder(n))}</C.GroupCount>
        </C.GroupBtn>
      )}
      {/* Collapse hides the whole branch — children AND items. A part renders
          one level deeper than its parent; an owned folder's contents sit one
          level under the OWNER row. */}
      {() =>
        m.isCollapsed(n.path)
          ? null
          : nodeEntries(n).map((entry) =>
              entry.kind === 'node'
                ? node(entry.node)
                : // A part of the OWNER is already one level under it by
                  // virtue of the folder — `partOf` must not indent it twice.
                  component(
                    entry.component,
                    n.depth + 1 + (entry.component.partOf && entry.component.partOf !== n.owner?.id ? 1 : 0),
                  ),
            )
      }
    </>
  )

  return (
    <C.Sidebar
      // Width is live drag geometry (measurement, not styling) — a hashed
      // class per pixel would grow the style cache without bound.
      style={() => (m.compact() ? 'width:100%;height:100%;border-right:none' : `width:${m.sidebarW()}px`)}
      aria-label="Components"
    >
      <C.SideHead>
        <C.SideLabel>Components</C.SideLabel>
        {/* The MATCHED count while filtering — a pill still reading 108 over
            an empty list contradicted the list. */}
        <C.CountPill data-testid="sidebar-count" aria-live="polite">
          {() => (m.filter().trim() ? `${m.matchCount()} / ${m.total}` : String(m.total))}
        </C.CountPill>
      </C.SideHead>
      <C.FilterWrap>
        <C.FilterInput
          data-testid="sidebar-filter"
          type="search"
          placeholder="Filter components…"
          aria-label="Filter components"
          value={() => m.filter()}
          onInput={(e: Event) => m.filter.set((e.target as HTMLInputElement).value)}
        />
      </C.FilterWrap>
      <C.SideList>
        {() => m.tree().map((n) => node(n)) as VNodeChild[]}
        <Show when={() => m.noResults()}>
          <C.Empty data-testid="sidebar-empty">
            <span>{() => `No components match “${m.filter().trim()}”.`}</span>
            <C.EmptyAction data-testid="sidebar-filter-clear" onClick={() => m.filter.set('')}>
              Clear filter
            </C.EmptyAction>
          </C.Empty>
        </Show>
      </C.SideList>
      {/* Real hints only — an earlier footer said "Tokens synced" next to a
          green dot, a health claim nothing measured. */}
      <C.SideFoot>↑↓ to browse · ⌘K to search</C.SideFoot>
    </C.Sidebar>
  )
}
