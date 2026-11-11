/**
 * Catalog view — the filter-driven component TREE.
 *
 * Group paths are `/`-separated (`Components/Forms`) and render as nested,
 * collapsible headers — the flat single-level list this replaces was unusable
 * past ~30 components. Ordering stays first-seen (a curatorial choice the
 * catalog already made); the filter drops branches that end up empty. A PART
 * (`partOf`) sits indented under its parent. Each row carries the component's
 * verify verdict as a dot; its scenarios are the strip above the canvas.
 *
 * Semantics: a `nav` of buttons, folders as disclosure buttons
 * (`aria-expanded`), the selection as `aria-current` — the disclosure
 * navigation pattern. ↑↓ walk the visible rows from anywhere in the app.
 */
import { onMount, Show, type VNodeChild } from '@pyreon/core'
import * as C from '../../components'
import type { HierarchyNode } from '../../hierarchy'
import { countUnder, nodeEntries, partCount } from '../../hierarchy'
import type { WorkbenchComponent } from '../../catalog'
import type { WorkbenchModel } from '../../model'
import { componentVerdict, type ComponentVerdict } from '../../verdict'

// The verdict reaches assistive tech as the row's DESCRIPTION (its title),
// not its name — the name stays the component's, so "Chip" is still "Chip".
const VERDICT_WORDS: Record<ComponentVerdict, string> = {
  ok: 'Verified',
  fail: 'A check failed',
  unverified: 'Not verified',
}

export function Sidebar(props: {
  model: WorkbenchModel
  /** Called after a component is chosen — the drawer closes on it. */
  onChoose?: () => void
}) {
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

  // Choosing a component in the compact DRAWER is navigation — the drawer
  // closes (and hands focus back to its toggle) so the canvas the choice was
  // for is what the user sees next.
  const choose = (apply: () => void) => {
    apply()
    props.onChoose?.()
  }

  const compBtn = (c: WorkbenchComponent, depth: number) => {
    const verdict = componentVerdict(c)
    return (
      <C.CompBtn
        data-testid={`component-${c.id}`}
        data-verdict={verdict}
        title={VERDICT_WORDS[verdict]}
        ref={rowRef(c.id)}
        state={() => (m.selId() === c.id ? 'active' : 'idle')}
        aria-current={() => (m.selId() === c.id ? 'true' : undefined)}
        onClick={() => choose(() => m.selId.set(c.id))}
        {...(depth > 0 ? { 'data-depth': String(depth) } : {})}
      >
        <C.CompDot variant={verdict} aria-hidden="true" />
        <C.CompName>{c.title ?? c.name}</C.CompName>
        {c.isNew ? <C.NewTag>NEW</C.NewTag> : null}
      </C.CompBtn>
    )
  }

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
    </>
  )

  const verifiedCount = m.catalog.components.filter((c) => componentVerdict(c) === 'ok').length

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
      style={() => (m.compact() ? 'width:100%;border-right:none' : `width:${m.sidebarW()}px`)}
      aria-label="Catalog"
      data-testid="catalog"
    >
      <C.SideHead>
        <C.SideLabel>Catalog</C.SideLabel>
        {/* The MATCHED count while filtering — a total over an empty list
            contradicted the list. */}
        <C.CountPill data-testid="sidebar-count" aria-live="polite" variant="plain">
          {() => (m.filter().trim() ? `${m.matchCount()} / ${m.total}` : String(m.total))}
        </C.CountPill>
        <C.Spacer />
        <C.CountPill data-testid="verified-count" variant="ok">
          {`${verifiedCount} verified`}
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
    </C.Sidebar>
  )
}
