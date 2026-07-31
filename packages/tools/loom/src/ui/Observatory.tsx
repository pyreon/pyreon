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
import { h, Show, type VNodeChild } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { computed, isServer } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import type { LoomReport } from '../core/types'
import * as C from './chrome'
import { createModel, shortName, type ObservatoryModel, type ViewId } from './model'
import { tokens } from './theme'
import { GraphView } from './views/GraphView'
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

export function Observatory(props: { report: LoomReport; brand?: string }) {
  const m = createModel(props.report)
  // The observatory IS a dev tool — its model is its public runtime surface
  // (the same contract the Atlas workbench exposes for its browser runner).
  ;(globalThis as Record<string, unknown>).__LOOM_MODEL__ = m

  const theme = computed(() => tokens(m.dark()))

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
      searchEl?.focus()
      return
    }
    if (e.key === 'Escape') {
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

  const sidebarGroup = (label: string, num: string, glyph: string, kind: 'internal' | 'external'): VNodeChild => (
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
                onClick={() => m.select(n.id)}
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
    <PyreonUI theme={((() => theme()) as never)} mode={(() => (m.dark() ? 'dark' : 'light')) as never}>
      <C.Shell data-testid="loom-shell">
        <C.Header>
          <C.Row css="gap:11px;flex:none;">
            <C.BrandMark>
              <C.BrandGlyph>{'{}'}</C.BrandGlyph>
            </C.BrandMark>
            <C.Col>
              <C.BrandName>{props.brand ?? 'loom'}</C.BrandName>
              <C.BrandSub>dependency observatory</C.BrandSub>
            </C.Col>
          </C.Row>
          <C.NavTabs>
            {VIEWS.map((v) => (
              <C.NavTab
                data-testid={`view-${v.id}`}
                state={() => (m.view() === v.id ? 'active' : 'idle')}
                onClick={() => m.view.set(v.id)}
              >
                {v.label}
              </C.NavTab>
            ))}
          </C.NavTabs>
          <C.Spacer />
          <C.SearchWrap>
            <C.SearchGlyph>⌕</C.SearchGlyph>
            <C.SearchInput
              data-testid="loom-search"
              ref={searchRef}
              placeholder="Search packages…"
              value={() => m.query()}
              onInput={(e: Event) => m.query.set((e.target as HTMLInputElement).value)}
            />
            <C.SearchKbd>⌘K</C.SearchKbd>
          </C.SearchWrap>
          <C.Spacer />
          <C.HealthPill data-testid="loom-health" state={health}>
            <C.HealthDot state={health} />
            <C.HealthText state={health}>{healthLabel}</C.HealthText>
          </C.HealthPill>
          <C.IconBtn data-testid="dark-toggle" onClick={() => m.dark.set(!m.dark())} title="Toggle theme">
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
              <C.SideList>
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
              <C.SmallBtn data-testid="nav-toggle" onClick={() => m.navOpen.set(!m.navOpen())} title="Toggle package list">
                {() => (m.navOpen() ? '⇤' : '⇥')}
              </C.SmallBtn>
              <C.Col>
                <C.ViewTitle data-testid="view-title">{() => TITLES[m.view()][0]}</C.ViewTitle>
                <C.ViewEyebrow>{() => TITLES[m.view()][1]}</C.ViewEyebrow>
              </C.Col>
              <C.Spacer />
              <C.CyclesBtn
                data-testid="cycles-toggle"
                state={() => (m.showCycles() ? 'on' : 'off')}
                onClick={() => m.showCycles.set(!m.showCycles())}
              >
                <C.CyclesDot />
                highlight cycles
              </C.CyclesBtn>
              <C.SmallBtn data-testid="panel-toggle" onClick={() => m.panelOpen.set(!m.panelOpen())} title="Toggle detail panel">
                {() => (m.panelOpen() ? '⇥' : '⇤')}
              </C.SmallBtn>
            </C.ViewBar>
            <C.Canvas data-testid="loom-canvas">
              {() => {
                switch (m.view()) {
                  case 'graph':
                    return h(GraphView, { model: m, theme: () => theme() })
                  case 'matrix':
                    return h(MatrixView, { model: m, theme: () => theme() })
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
    </PyreonUI>
  )
}

export { shortName, type ObservatoryModel }
