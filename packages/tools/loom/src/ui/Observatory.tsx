/**
 * <Observatory> — the Loom UI root, in the tool-app layout: a top bar (brand
 * + workspace · view switch · scan summary · search · theme), the package
 * list grouped by depth, the active view under its view bar, the detail rail,
 * and the scan status bar.
 *
 * Wrapped in `<PyreonUI>` with the token set as the theme; the theme is
 * passed as an ACCESSOR so a dark-mode flip re-resolves every rocketstyle
 * chain (the Atlas Workbench wiring, including the `as never` cast the
 * prebuilt-lib path needs).
 */
import { cx, h, onMount, Show, type VNode } from '@pyreon/core'
import { useEventListener, useMediaQuery } from '@pyreon/hooks'
import { batch, computed, effect, isServer } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import type { LoomReport } from '../core/types'
import * as C from './chrome'
import { ensureGlobalStyles } from './global-css'
import {
  createModel,
  depthGroups,
  scanSummary,
  shortName,
  type ObservatoryModel,
  type ViewId,
} from './model'
import {
  hashForSel,
  MOBILE_QUERY,
  NAV_QUERY,
  readPrefs,
  THEME_KEY,
  writeThemePref,
} from './prefs'
import { tokens } from './theme'
import { GraphView } from './views/GraphView'
import { SearchDialog } from './views/SearchDialog'
import { MatrixView } from './views/MatrixView'
import { CyclesView } from './views/CyclesView'
import { ImpactView } from './views/ImpactView'
import { TableView } from './views/TableView'
import { DetailPanel } from './views/DetailPanel'
import { LoomGlyph, SearchIcon, ThemeIcon } from './views/icons'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'graph', label: 'graph' },
  { id: 'matrix', label: 'matrix' },
  { id: 'cycles', label: 'cycles' },
  { id: 'impact', label: 'impact' },
  { id: 'table', label: 'manifest' },
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The workspace's display name: the root manifest's `name`, else its folder. */
export function workspaceName(report: LoomReport): string {
  return report.model.root.name ?? report.model.root.dir.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

export function Observatory(props: {
  report: LoomReport
  brand?: string
  /** Seeds the active view. Routed hosts pass their own; the default keeps
   * `mountObservatory` byte-identical. */
  initialView?: ViewId
  /** When supplied, the view switch renders as real links to these hrefs
   * instead of flipping a signal — that is what makes a routed host's URLs
   * mean something. Absent (the single-page host), it stays signal-driven. */
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
  const narrowList = useMediaQuery(NAV_QUERY)
  const narrowPanel = useMediaQuery(MOBILE_QUERY)
  const summary = scanSummary(m.report)

  // Crossing a breakpoint re-lays out the chrome: below it the list (860) or
  // the detail rail (760) is an overlay drawer, closed by default; above it,
  // a column, open by default. Only a TRANSITION moves them — a user who
  // closed the rail keeps it closed until the viewport changes.
  const followBreakpoint = (query: () => boolean, open: (v: boolean) => void) => {
    let was: boolean | undefined
    effect(() => {
      const narrow = query()
      if (was !== undefined && narrow !== was) open(!narrow)
      was = narrow
    })
  }
  followBreakpoint(narrowList, (v) => m.navOpen.set(v))
  followBreakpoint(narrowPanel, (v) => m.panelOpen.set(v))

  const closeDrawers = () =>
    batch(() => {
      if (narrowList()) m.navOpen.set(false)
      if (narrowPanel()) m.panelOpen.set(false)
    })
  const drawerOpen = () => (narrowList() && m.navOpen()) || (narrowPanel() && m.panelOpen())

  // The theme is the SHARED Pyreon preference: another tab (the docs, Atlas)
  // choosing light or dark applies here too, live.
  useEventListener('storage', (e: StorageEvent) => {
    if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
      m.dark.set(e.newValue === 'dark')
    }
  })

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
    // must not leave 50 history entries), and keep the list row on screen
    // when the selection moves by keyboard or ⌘K.
    const revealRow = () =>
      requestAnimationFrame(() => {
        sideListEl
          ?.querySelector(`[data-testid="pkg-${m.selId()}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      })
    revealRow() // a selection restored from the URL starts on screen too
    const offSel = m.selId.subscribe(() => {
      const id = m.selId()
      // No selection = no hash: the URL of the overview is the bare page.
      history.replaceState(history.state, '', id ? hashForSel(id) : location.pathname + location.search)
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

  // The ⌘K field, captured by REF — focused via a live element reference.
  let searchEl: HTMLInputElement | null = null
  const searchRef = (el: HTMLInputElement | null) => {
    searchEl = el
  }
  const openSearch = () => {
    m.searchOpen.set(true)
    queueMicrotask(() => searchEl?.focus())
  }

  // ⌘K → search, Escape → close / clear the filter, ↑/↓ → walk the list.
  // Registered through `useEventListener` (lifecycle-owned cleanup, SSR-safe
  // no-op) — never a raw document.addEventListener in a component body.
  useEventListener('keydown', (e: KeyboardEvent) => {
    if (isServer) return
    const target = e.target as HTMLElement | null
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      openSearch()
      return
    }
    if (e.key === 'Escape') {
      if (m.searchOpen()) {
        m.searchOpen.set(false)
        return
      }
      if (drawerOpen()) {
        closeDrawers()
        return
      }
      // Then the filter, then the selection (back to the workspace overview).
      if (m.query()) m.query.set('')
      else if (m.selId()) m.select('')
      ;(document.activeElement as HTMLElement | null)?.blur()
      return
    }
    if (typing && !(target as HTMLInputElement).dataset.lmFilter) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const ids = m.shown().map((n) => n.id)
      if (!ids.length) return
      e.preventDefault()
      const i = ids.indexOf(m.selId())
      const next =
        i < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)
      m.select(ids[next]!)
    }
  })

  const viewSwitch = (
    <C.ViewSeg aria-label="View" data-testid="view-switch">
      {VIEWS.map((v) => (
        <C.ViewBtn
          data-testid={`view-${v.id}`}
          state={() => (m.view() === v.id ? 'active' : 'idle')}
          {...(props.hrefFor
            ? // The selection rides along in the hash, so a routed host's
              // full-page navigation keeps what you were looking at.
              {
                tag: 'a',
                href: () => props.hrefFor!(v.id) + (m.selId() ? hashForSel(m.selId()) : ''),
                'aria-current': () => (m.view() === v.id ? 'page' : undefined),
              }
            : {
                'aria-pressed': () => (m.view() === v.id ? 'true' : 'false'),
                onClick: () => m.view.set(v.id),
              })}
        >
          {v.label}
        </C.ViewBtn>
      ))}
    </C.ViewSeg>
  )

  const list = (): VNode | VNode[] => {
    const groups = depthGroups(m.shown())
    if (!groups.length) {
      return (
        <div class="lm-pk-empty" data-testid="pkg-empty">
          {`Nothing matches “${m.query()}”.`}
          <br />
          Esc clears the filter.
        </div>
      )
    }
    return groups.map((g) => (
      <div>
        <div class="lm-pk-g">
          <span>{g.label}</span>
          <span>{String(g.items.length)}</span>
        </div>
        {g.items.map((n) => (
          <button
            type="button"
            class="lm-pk"
            data-testid={`pkg-${n.id}`}
            title={n.id}
            aria-current={() => (m.selId() === n.id ? 'true' : 'false')}
            onClick={() => {
              m.select(n.id)
              if (narrowList()) m.navOpen.set(false)
            }}
          >
            <span class={cx(['lm-sev', `lm-sev--${n.worst ?? 'none'}`])} aria-hidden="true" />
            <span class="lm-pk-n">{n.kind === 'internal' ? shortName(n.id) : n.id}</span>
            <span class="lm-pk-d" title="blast radius">
              {String(m.reachOf(n.id))}
            </span>
          </button>
        ))}
      </div>
    ))
  }

  const SUBS: Record<ViewId, () => string> = {
    graph: () =>
      `internal runtime edges · layered by depth from the entry points · dev edges ${m.showDev() ? 'shown' : 'hidden'}`,
    matrix: () =>
      m.matrixMode() === 'versions'
        ? 'external version usage · drift highlighted, cross-major in red'
        : 'internal imports · rows depend on columns · foundations first',
    cycles: () =>
      `${plural(m.report.stats.cycles, 'runtime cycle')} · dev edges excluded`,
    impact: () => 'what changes if the selected package changes',
    table: () => 'every package and dependency · the full report as data',
  }
  const TITLES: Record<ViewId, string> = {
    graph: 'Graph',
    matrix: 'Matrix',
    cycles: 'Cycles',
    impact: 'Impact',
    table: 'Manifest',
  }

  const chips = (): VNode | null => {
    switch (m.view()) {
      case 'graph':
        return (
          <C.ChipGroup>
            <C.Chip
              data-testid="dev-toggle"
              state={() => (m.showDev() ? 'on' : 'off')}
              aria-pressed={() => (m.showDev() ? 'true' : 'false')}
              onClick={() => m.showDev.set(!m.showDev())}
            >
              dev edges
            </C.Chip>
            <C.Chip
              data-testid="cycles-toggle"
              state={() => (m.showCycles() ? 'on' : 'off')}
              aria-pressed={() => (m.showCycles() ? 'true' : 'false')}
              onClick={() => m.showCycles.set(!m.showCycles())}
            >
              {m.report.stats.cycles > 0
                ? `highlight cycles · ${m.report.stats.cycles}`
                : 'highlight cycles'}
            </C.Chip>
          </C.ChipGroup>
        )
      case 'matrix':
        return (
          <C.ChipGroup>
            <Show when={() => m.matrixMode() === 'versions'}>
              <C.Chip
                data-testid="drift-toggle"
                state={() => (m.driftOnly() ? 'on' : 'off')}
                aria-pressed={() => (m.driftOnly() ? 'true' : 'false')}
                onClick={() => m.driftOnly.set(!m.driftOnly())}
              >
                drift only
              </C.Chip>
            </Show>
            {(['versions', 'imports'] as const).map((mode) => (
              <C.Chip
                data-testid={`matrix-${mode}`}
                state={() => (m.matrixMode() === mode ? 'on' : 'off')}
                aria-pressed={() => (m.matrixMode() === mode ? 'true' : 'false')}
                onClick={() => m.matrixMode.set(mode)}
              >
                {mode}
              </C.Chip>
            ))}
          </C.ChipGroup>
        )
      default:
        return null
    }
  }

  return (
    <PyreonUI
      theme={(() => theme()) as never}
      mode={(() => (m.dark() ? 'dark' : 'light')) as never}
    >
      <C.Shell data-testid="loom-shell" data-lm-theme={() => (m.dark() ? 'dark' : 'light')}>
        <C.Header>
          <C.Brand aria-label={`${props.brand ?? 'loom'} · ${workspaceName(m.report)}`}>
            <LoomGlyph />
            <C.BrandName>{props.brand ?? 'loom'}</C.BrandName>
            <C.BrandWorkspace data-testid="workspace-name" title={m.report.model.root.dir}>
              {workspaceName(m.report)}
            </C.BrandWorkspace>
          </C.Brand>
          {viewSwitch}
          <C.Spacer />
          <C.ScanSummary
            data-testid="loom-health"
          >
            <C.ScanItem>
              <span class="lm-sev lm-sev--error" aria-hidden="true" />
              <C.ScanCount variant="error">{String(summary.errors)}</C.ScanCount>
              {summary.errors === 1 ? ' error' : ' errors'}
            </C.ScanItem>
            <C.ScanItem>
              <span class="lm-sev lm-sev--warning" aria-hidden="true" />
              <C.ScanCount variant="warning">{String(summary.warnings)}</C.ScanCount>
              {summary.warnings === 1 ? ' warning' : ' warnings'}
            </C.ScanItem>
            <C.ScanItem>
              <span class="lm-sev lm-sev--info" aria-hidden="true" />
              <C.ScanCount variant="info">{String(summary.infos)}</C.ScanCount>
              {' info'}
            </C.ScanItem>
            <span
              data-testid="scan-exit"
              title={
                m.report.gate?.strict
                  ? 'what `loom scan` exits with — strict: warnings gate too'
                  : 'what `loom scan` exits with'
              }
            >{`exit ${summary.exit}`}</span>
          </C.ScanSummary>
          <C.IconBtn
            data-testid="search-trigger"
            aria-label="Search packages and findings (⌘K)"
            title="Search (⌘K)"
            onClick={openSearch}
          >
            <SearchIcon />
          </C.IconBtn>
          <C.IconBtn
            data-testid="dark-toggle"
            aria-label={() => (m.dark() ? 'Switch to light theme' : 'Switch to dark theme')}
            title="Toggle theme"
            onClick={() => {
              const next = !m.dark()
              m.dark.set(next)
              writeThemePref(next)
            }}
          >
            <ThemeIcon />
          </C.IconBtn>
        </C.Header>

        <C.Body>
          <Show when={() => m.navOpen()}>
            <C.Sidebar data-testid="loom-sidebar" aria-label="Packages">
              <C.SideHead>
                <C.FilterField
                  type="search"
                  data-testid="pkg-filter"
                  data-lm-filter="1"
                  aria-label="Filter packages"
                  placeholder={`Filter ${m.nodes.length} packages…`}
                  value={() => m.query()}
                  onInput={(e: Event) => m.query.set((e.target as HTMLInputElement).value)}
                />
              </C.SideHead>
              <C.SideList
                ref={(el: HTMLElement | null) => {
                  sideListEl = el
                }}
              >
                {list}
              </C.SideList>
            </C.Sidebar>
          </Show>

          <C.Main>
            <C.ViewBar>
              <Show when={narrowList}>
                <C.DrawerBtn
                  data-testid="nav-toggle"
                  aria-label="Toggle package list"
                  aria-expanded={() => (m.navOpen() ? 'true' : 'false')}
                  onClick={() => m.navOpen.set(!m.navOpen())}
                >
                  ☰
                </C.DrawerBtn>
              </Show>
              <C.ViewTitle data-testid="view-title">{() => TITLES[m.view()]}</C.ViewTitle>
              <C.ViewSub data-testid="view-sub">{() => SUBS[m.view()]()}</C.ViewSub>
              {chips}
              <Show when={narrowPanel}>
                <C.DrawerBtn
                  data-testid="panel-toggle"
                  aria-label="Toggle package detail"
                  aria-expanded={() => (m.panelOpen() ? 'true' : 'false')}
                  onClick={() => m.panelOpen.set(!m.panelOpen())}
                >
                  ⓘ
                </C.DrawerBtn>
              </Show>
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

          <Show when={() => m.panelOpen()}>
            {h(DetailPanel, { model: m })}
          </Show>
          <Show when={drawerOpen}>
            <C.DrawerScrim
              data-testid="drawer-scrim"
              aria-label="Close"
              tabIndex={-1}
              onClick={closeDrawers}
            />
          </Show>
        </C.Body>

        <C.StatusBar data-testid="loom-status">
          <span>{`loom scan · ${plural(m.report.stats.internal, 'package')} · ${plural(m.report.stats.edges, 'runtime edge')} · depth ${m.report.stats.depth}`}</span>
          <span>{`${plural(summary.errors, 'error')} · ${plural(summary.warnings, 'warning')} · ${summary.infos} info`}</span>
          <span data-testid="status-ignored">
            {summary.ignored.length
              ? `ignored: ${summary.ignored.length} (${summary.ignored[0]!.dep ?? summary.ignored[0]!.pkg} · ${summary.ignored[0]!.code} — ${summary.ignored[0]!.ignored})`
              : 'ignored: 0'}
          </span>
        </C.StatusBar>
      </C.Shell>
      <SearchDialog model={m} fieldRef={searchRef} focusField={() => searchEl?.focus()} />
    </PyreonUI>
  )
}

export { shortName, type ObservatoryModel }
