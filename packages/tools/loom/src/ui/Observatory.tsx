/**
 * <Observatory> — the Loom UI root: header (brand · view tabs · search ·
 * health · theme toggle), sidebar (kind filters + grouped package list),
 * the active view, the detail panel, and the stats footer.
 *
 * Wrapped in `<PyreonUI>` with the token set as the theme; the theme is
 * passed as an ACCESSOR so a dark-mode flip re-resolves every rocketstyle
 * chain (the Atlas Workbench wiring, including the `as never` cast the
 * prebuilt-lib path needs).
 */
import { h, onMount, Show, type VNodeChild } from '@pyreon/core'
import { useEventListener, useMediaQuery } from '@pyreon/hooks'
import { batch, computed, effect, isServer } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import type { LoomReport } from '../core/types'
import * as C from './chrome'
import { ensureGlobalStyles } from './global-css'
import { createModel, shortName, type ObservatoryModel, type ViewId } from './model'
import { hashForSel, MOBILE_QUERY, readPrefs, writeThemePref } from './prefs'
import { tokens } from './theme'
import { GraphView } from './views/GraphView'
import { SearchDialog } from './views/SearchDialog'
import { MatrixView } from './views/MatrixView'
import { CyclesView } from './views/CyclesView'
import { ImpactView } from './views/ImpactView'
import { TableView } from './views/TableView'
import { DetailPanel } from './views/DetailPanel'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'graph', label: 'graph' },
  { id: 'matrix', label: 'matrix' },
  { id: 'cycles', label: 'cycles' },
  { id: 'impact', label: 'impact' },
  { id: 'table', label: 'manifest' },
]

const TITLES: Record<ViewId, [string, string]> = {
  graph: ['Dependency graph', '01 · graph · layered by resolution depth'],
  matrix: ['Adjacency matrix', '02 · matrix · who imports whom'],
  cycles: ['Circular dependencies', '03 · cycles · runtime-edge loop detection'],
  impact: ['Blast radius', '04 · impact · transitive dependents'],
  table: ['Package manifest', '05 · manifest · versions · licenses · findings'],
}

export function Observatory(props: {
  report: LoomReport
  brand?: string
  /** Seeds the active view. Routed hosts pass their own; the default keeps
   * `mountObservatory` byte-identical. */
  initialView?: ViewId
  /** When supplied, the view tabs render as real links to these hrefs instead
   * of flipping a signal — that is what makes a routed host's URLs mean
   * something. Absent (the single-page host), the tabs stay signal-driven. */
  hrefFor?: (id: ViewId) => string
}) {
  ensureGlobalStyles()
  // Theme (remembered choice, else the OS), viewport class, and a selection
  // carried in the URL hash are browser state — resolved here, once, so the
  // model stays pure. SSR gets `{}` (dark, everything open).
  const m = createModel(props.report, props.initialView ?? 'graph', readPrefs())
  // The observatory IS a dev tool — its model is its public runtime surface
  // (the same contract the Atlas workbench exposes for its browser runner).
  ;(globalThis as Record<string, unknown>).__LOOM_MODEL__ = m

  const theme = computed(() => tokens(m.dark()))
  const mobile = useMediaQuery(MOBILE_QUERY)

  // Crossing the breakpoint re-lays out the chrome: below it the sidebar and
  // detail panel are overlay drawers (closed by default), above it they are
  // columns (open by default). Only a TRANSITION moves them — a user who
  // closed the panel on desktop keeps it closed until the viewport changes.
  let wasMobile: boolean | undefined
  effect(() => {
    const mob = mobile()
    if (wasMobile !== undefined && mob !== wasMobile) {
      batch(() => {
        m.navOpen.set(!mob)
        m.panelOpen.set(!mob)
      })
    }
    wasMobile = mob
  })
  const closeDrawersOnMobile = () => {
    if (!mobile()) return
    batch(() => {
      m.navOpen.set(false)
      m.panelOpen.set(false)
    })
  }

  let sideListEl: HTMLElement | null = null
  let canvasEl: HTMLElement | null = null

  onMount(() => {
    const root = document.documentElement
    // <html> carries the theme too, so the PAGE background (and anything the
    // host renders outside the shell) follows the toggle.
    root.setAttribute('data-lm-theme', m.dark() ? 'dark' : 'light')
    const offDark = m.dark.subscribe(() =>
      root.setAttribute('data-lm-theme', m.dark() ? 'dark' : 'light'),
    )
    // Selection → URL hash (replace, not push: arrowing through 50 packages
    // must not leave 50 history entries), and keep the sidebar row on screen
    // when the selection moves by keyboard or ⌘K.
    const revealRow = () =>
      requestAnimationFrame(() => {
        sideListEl
          ?.querySelector(`[data-testid="pkg-${m.selId()}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      })
    revealRow() // a selection restored from the URL starts on screen too
    const offSel = m.selId.subscribe(() => {
      history.replaceState(history.state, '', hashForSel(m.selId()))
      revealRow()
    })
    // Each view starts at its top-left — the canvas element is shared, so a
    // deep scroll into the graph used to carry over into the matrix.
    const offView = m.view.subscribe(() => canvasEl?.scrollTo(0, 0))
    return () => {
      offDark()
      offSel()
      offView()
    }
  })

  // The search input, captured by REF — focusing via a live element reference
  // instead of a runtime document.querySelector (better, and the AST walker
  // can actually see it's DOM-free at setup).
  let searchEl: HTMLInputElement | null = null
  const searchRef = (el: HTMLInputElement | null) => {
    searchEl = el
  }

  // ⌘K → search, Escape → clear, ↑/↓ → walk the visible list. Registered
  // through `useEventListener` (lifecycle-owned cleanup, SSR-safe no-op) —
  // never a raw document.addEventListener in a component body.
  useEventListener('keydown', (e: KeyboardEvent) => {
    if (isServer) return
    const target = e.target as HTMLElement | null
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      m.searchOpen.set(true)
      queueMicrotask(() => searchEl?.focus())
      return
    }
    if (e.key === 'Escape') {
      if (m.searchOpen()) {
        m.searchOpen.set(false)
        return
      }
      if (m.query()) m.query.set('')
      ;(document.activeElement as HTMLElement | null)?.blur()
      return
    }
    if (typing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const ids = m.shown().map((n) => n.id)
      if (!ids.length) return
      e.preventDefault()
      const i = ids.indexOf(m.selId())
      const next = e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)
      m.select(ids[next]!)
    }
  })

  const health = () => (m.report.stats.cycles > 0 || m.report.stats.errors > 0 ? 'bad' : 'ok')
  const healthLabel = () =>
    m.report.stats.errors > 0
      ? `${m.report.stats.errors} error${m.report.stats.errors === 1 ? '' : 's'}`
      : m.report.stats.cycles > 0
        ? `${m.report.stats.cycles} cycle${m.report.stats.cycles === 1 ? '' : 's'}`
        : 'fabric clean'

  const sidebarGroup = (
    label: string,
    num: string,
    glyph: string,
    kind: 'internal' | 'external',
  ): VNodeChild => (
    <>
      {() => {
        const items = m.shown().filter((n) => n.kind === kind)
        if (!items.length) return null
        return (
          <>
            <C.GroupHead>
              <C.GroupNum>{num}</C.GroupNum>
              <C.GroupGlyph>{glyph}</C.GroupGlyph>
              <C.GroupLabel>{label}</C.GroupLabel>
              <C.GroupCount>{String(items.length)}</C.GroupCount>
            </C.GroupHead>
            {items.map((n) => (
              <C.PkgBtn
                data-testid={`pkg-${n.id}`}
                state={() => (m.selId() === n.id ? 'active' : 'idle')}
                title={n.id}
                onClick={() => {
                  m.select(n.id)
                  closeDrawersOnMobile()
                }}
              >
                <C.PkgBar state={() => (m.selId() === n.id ? 'active' : 'idle')} />
                <C.PkgName>{n.id}</C.PkgName>
                {n.status !== 'current' ? (
                  <C.PkgFlag
                    data-flag={n.status}
                    variant={n.status === 'circular' || n.status === 'issue' ? 'danger' : 'warn'}
                  />
                ) : null}
              </C.PkgBtn>
            ))}
          </>
        )
      }}
    </>
  )
  const internalGroup = sidebarGroup('internal', '01', '~>', 'internal')
  const externalGroup = sidebarGroup('external', '02', '//', 'external')

  return (
    <PyreonUI
      theme={(() => theme()) as never}
      mode={(() => (m.dark() ? 'dark' : 'light')) as never}
    >
      <C.Shell data-testid="loom-shell" data-lm-theme={() => (m.dark() ? 'dark' : 'light')}>
        <C.Header>
          <C.BrandBlock>
            <C.BrandMark>
              <C.BrandGlyph>{'{}'}</C.BrandGlyph>
            </C.BrandMark>
            <C.Col>
              <C.BrandName>{props.brand ?? 'loom'}</C.BrandName>
              <C.BrandSub>dependency observatory</C.BrandSub>
            </C.Col>
          </C.BrandBlock>
          <C.NavTabs>
            {VIEWS.map((v) => (
              <C.NavTab
                data-testid={`view-${v.id}`}
                state={() => (m.view() === v.id ? 'active' : 'idle')}
                {...(props.hrefFor
                  ? // The selection rides along in the hash, so a routed host's
                    // full-page tab navigation keeps what you were looking at.
                    { tag: 'a', href: () => props.hrefFor!(v.id) + hashForSel(m.selId()) }
                  : { onClick: () => m.view.set(v.id) })}
              >
                {v.label}
              </C.NavTab>
            ))}
          </C.NavTabs>
          <C.Spacer />
          <C.SearchWrap>
            <C.SearchTrigger data-testid="search-trigger" onClick={() => m.searchOpen.set(true)}>
              <C.SearchGlyph>⌕</C.SearchGlyph>
              <C.SearchTriggerText>Search packages, findings…</C.SearchTriggerText>
              <C.SearchTriggerKbd>⌘K</C.SearchTriggerKbd>
            </C.SearchTrigger>
          </C.SearchWrap>
          <C.Spacer />
          <C.HealthPill data-testid="loom-health" state={health}>
            <C.HealthDot state={health} />
            <C.HealthText state={health}>{healthLabel}</C.HealthText>
          </C.HealthPill>
          <C.IconBtn
            data-testid="dark-toggle"
            onClick={() => {
              const next = !m.dark()
              m.dark.set(next)
              writeThemePref(next)
            }}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {() => (m.dark() ? '☀' : '☾')}
          </C.IconBtn>
        </C.Header>

        <C.Body>
          <Show when={() => m.navOpen()}>
            <C.Sidebar data-testid="loom-sidebar">
              <C.KindRow>
                {(['all', 'internal', 'external'] as const).map((k) => (
                  <C.KindBtn
                    data-testid={`kind-${k}`}
                    state={() => (m.kind() === k ? 'active' : 'idle')}
                    onClick={() => m.kind.set(k)}
                  >
                    {k}
                  </C.KindBtn>
                ))}
              </C.KindRow>
              <C.SideList
                ref={(el: HTMLElement | null) => {
                  sideListEl = el
                }}
              >
                {internalGroup}
                {externalGroup}
                <Show when={() => m.shown().length === 0}>
                  <C.SideEmpty>no packages match</C.SideEmpty>
                </Show>
              </C.SideList>
              <C.SideFoot>{`${m.nodes.length} packages · ↑↓ browse`}</C.SideFoot>
            </C.Sidebar>
          </Show>

          <C.Main>
            <C.ViewBar>
              <C.SmallBtn
                data-testid="nav-toggle"
                onClick={() => m.navOpen.set(!m.navOpen())}
                title="Toggle package list"
              >
                {() => (m.navOpen() ? '⇤' : '⇥')}
              </C.SmallBtn>
              <C.ViewTitleBlock>
                <C.ViewTitle data-testid="view-title">{() => TITLES[m.view()][0]}</C.ViewTitle>
                <C.ViewEyebrow>{() => TITLES[m.view()][1]}</C.ViewEyebrow>
              </C.ViewTitleBlock>
              <C.Spacer />
              <C.CyclesBtn
                data-testid="cycles-toggle"
                title="Highlight dependency cycles"
                // Red only when there is something to be alarmed about — an
                // acyclic workspace used to wear the same alarm as a broken one.
                state={() => (!m.showCycles() ? 'off' : m.report.stats.cycles > 0 ? 'on' : 'clean')}
                aria-pressed={() => (m.showCycles() ? 'true' : 'false')}
                onClick={() => m.showCycles.set(!m.showCycles())}
              >
                <C.CyclesDot variant={m.report.stats.cycles > 0 ? 'danger' : 'ok'} />
                <C.CyclesLabel>
                  {m.report.stats.cycles > 0
                    ? `highlight cycles · ${m.report.stats.cycles}`
                    : 'highlight cycles'}
                </C.CyclesLabel>
              </C.CyclesBtn>
              <C.SmallBtn
                data-testid="panel-toggle"
                onClick={() => m.panelOpen.set(!m.panelOpen())}
                title="Toggle detail panel"
              >
                {() => (m.panelOpen() ? '⇥' : '⇤')}
              </C.SmallBtn>
            </C.ViewBar>
            <C.Canvas
              data-testid="loom-canvas"
              ref={(el: HTMLElement | null) => {
                canvasEl = el
              }}
            >
              {() => {
                switch (m.view()) {
                  case 'graph':
                    return h(GraphView, { model: m })
                  case 'matrix':
                    return h(MatrixView, { model: m })
                  case 'cycles':
                    return h(CyclesView, { model: m })
                  case 'impact':
                    return h(ImpactView, { model: m })
                  case 'table':
                    return h(TableView, { model: m })
                }
              }}
            </C.Canvas>
          </C.Main>

          <Show when={() => m.panelOpen()}>{h(DetailPanel, { model: m })}</Show>
          <Show when={() => mobile() && (m.navOpen() || m.panelOpen())}>
            <C.DrawerScrim
              data-testid="drawer-scrim"
              aria-hidden="true"
              onClick={closeDrawersOnMobile}
            />
          </Show>
        </C.Body>

        <C.Footer>
          <span>{`${m.report.stats.internal} internal`}</span>
          <C.FootSep>·</C.FootSep>
          <span>{`${m.report.stats.external} external`}</span>
          <C.FootSep>·</C.FootSep>
          <span>{`${m.report.stats.edges} edges`}</span>
          <C.FootSep>·</C.FootSep>
          <span>{`depth ${m.report.stats.depth}`}</span>
          <C.Spacer />
          <C.FootDanger variant={m.report.stats.cycles ? 'danger' : 'ok'}>
            {`● ${m.report.stats.cycles} cycles`}
          </C.FootDanger>
          <C.FootSep>·</C.FootSep>
          <C.FootDanger variant={m.report.stats.errors ? 'danger' : 'ok'}>
            {`✗ ${m.report.stats.errors} errors`}
          </C.FootDanger>
          <C.FootSep>·</C.FootSep>
          <C.FootDanger variant={m.report.stats.warnings ? 'warn' : 'ok'}>
            {`▲ ${m.report.stats.warnings} warnings`}
          </C.FootDanger>
        </C.Footer>
      </C.Shell>
      <SearchDialog model={m} fieldRef={searchRef} focusField={() => searchEl?.focus()} />
    </PyreonUI>
  )
}

export { shortName, type ObservatoryModel }
