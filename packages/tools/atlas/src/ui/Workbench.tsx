/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the resize handles carry
   `role="separator"` on a div on purpose: the WAI-ARIA window-splitter pattern
   (a focusable, keyboard-movable divider). An <hr> is a thematic break, not a
   control. */
/**
 * `<Workbench>` — the Atlas component workbench, driven entirely by a
 * `WorkbenchCatalog` you pass in (no hardcoded component list). This file is
 * just the orchestrator: it builds the reactive `model`, wires global keyboard
 * shortcuts, and composes the region views (`./views/*`) inside the themed
 * `<PyreonUI>` + `<Shell>`. All chrome + state live in their own modules.
 *
 * Layout (the Pyreon app shell): a 48px top bar; below it the catalog column
 * and the main column — the scenario strip, the canvas, and the panels under
 * it. Below 860px the catalog is a drawer over everything.
 */
import { isClient, isServer, Show } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { createGlobalStyle } from '@pyreon/styler'
import { batch } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import type { WorkbenchCatalog } from './catalog'
import * as C from './components'
import { COMPACT_QUERY, createModel } from './model'
import { CHROME_TOKENS, chromeThemeCss, THEME_STORAGE_KEY } from './theme'
import {
  AddonPanel,
  Canvas,
  DocsView,
  LabView,
  ScenarioStrip,
  SearchDialog,
  Sidebar,
  TopBar,
} from './views'
import { trapTab } from './focus-trap'

export interface WorkbenchProps {
  /** The components to showcase + how to render them. */
  catalog: WorkbenchCatalog
  /** Brand title in the top bar (default `'Atlas'`). */
  title?: string
  /** Brand subtitle beside the title. */
  subtitle?: string
}

/**
 * Page-level CSS, injected once at first mount: the chrome palette as custom
 * properties (see ./theme), the reset, motion keyframes, and the focus ring.
 * The workbench owns the whole page, so it owns the reset (same shape as
 * loom's mountObservatory GLOBAL_CSS).
 *
 * The focus ring sits in `@layer elements` — the LOWEST layer the styler
 * emits into. Unlayered, it outranked every component rule (layered styles
 * lose to unlayered ones regardless of specificity), so a component could
 * never replace it.
 */
const GLOBAL_CSS = `${chromeThemeCss()}
@keyframes atlas-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes atlas-fade{from{opacity:0}to{opacity:1}}
@keyframes atlas-drawer{from{transform:translateX(-24px);opacity:.4}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{-webkit-font-smoothing:antialiased}
@layer elements{button:focus-visible,input:focus-visible,select:focus-visible,[role=tab]:focus-visible,[tabindex]:focus-visible,a:focus-visible{outline:2px solid var(--atlas-accent);outline-offset:2px}}
[data-atlas-theme-toggle] [data-icon=moon]{display:none}
:root[data-theme=light] [data-atlas-theme-toggle] [data-icon=moon]{display:inline}
:root[data-theme=light] [data-atlas-theme-toggle] [data-icon=sun]{display:none}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--atlas-line-2);border-radius:20px;border:3px solid transparent;background-clip:content-box}
`
let globalInjected = false

/**
 * Move focus INTO an overlay the moment it mounts, so keyboard and
 * screen-reader users land in it rather than behind the scrim. Deferred a
 * frame: the ref fires before the element is attached.
 */
const focusOnMount = (el: HTMLElement | null) => {
  if (el && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => el.focus())
}

/**
 * A reactive attribute whose JSX type only admits a plain value
 * (`aria-valuenow: number`). The runtime binds any function-valued attribute
 * reactively; the spread keeps the one cast here.
 */
const reactiveAttr = (name: string, read: () => number): Record<string, unknown> => ({ [name]: read })

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 420
const PANEL_MIN = 0.2
const PANEL_MAX = 0.8

export function Workbench(props: WorkbenchProps) {
  if (!globalInjected) {
    globalInjected = true
    createGlobalStyle([GLOBAL_CSS] as unknown as TemplateStringsArray)
  }
  // `const` is correct: the compiler's reactive-props inliner skips a
  // `useX`/`createX` initializer, so this is ONE model shared by every view
  // (see .agents/rules/anti-patterns.md "reactive-props inlining of a
  // stateful factory"; the atlas-workshop e2e is its live regression test).
  const m = createModel(props.catalog, { title: props.title, subtitle: props.subtitle })
  // The workbench IS a dev tool — its model is its public runtime surface. The
  // browser-verify runner (and any embedding host) drives scenarios through
  // it instead of scripting the DOM.
  ;(globalThis as Record<string, unknown>).__ATLAS_MODEL__ = m

  // Compact layout follows the viewport LIVE — rotating a tablet, or dragging
  // a desktop window narrow, switches between the catalog column and the
  // drawer. The model seeds the initial value synchronously (no desktop-layout
  // flash on a phone); this keeps it current.
  const compactQuery = isClient && typeof matchMedia === 'function' ? matchMedia(COMPACT_QUERY) : null
  if (compactQuery) {
    useEventListener(
      'change',
      (e: Event) => {
        const next = (e as MediaQueryListEvent).matches
        batch(() => {
          m.compact.set(next)
          if (!next) m.drawerOpen.set(false)
        })
      },
      undefined,
      () => compactQuery,
    )
  }

  // The shared theme preference changes underneath us in two ways: another
  // tab (the docs, Loom) writes `pyreon-theme`, or the OS flips while nothing
  // is stored. Both re-read it; neither overrides a mode the link chose.
  useEventListener('storage', (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) m.syncTheme()
  })
  const schemeQuery =
    isClient && typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null
  if (schemeQuery) useEventListener('change', () => m.syncTheme(), undefined, () => schemeQuery)

  // The drawer toggle, so closing the drawer can hand focus back to it.
  let drawerToggle: HTMLElement | null = null
  const closeDrawer = () => {
    if (!m.drawerOpen.peek()) return
    m.drawerOpen.set(false)
    drawerToggle?.focus()
  }

  // Global shortcuts: ⌘K opens search, Escape closes what is open, ↑↓ browse.
  // useEventListener is SSR-safe (isClient-guarded) + auto-cleans up on unmount.
  useEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select'
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      m.searchOpen.set(true)
      queueMicrotask(() => m.focusSearch())
      return
    }
    if (e.key === 'Escape' && m.searchOpen()) {
      m.searchOpen.set(false)
      m.query.set('')
      return
    }
    if (e.key === 'Escape' && m.drawerOpen()) {
      closeDrawer()
      return
    }
    if (e.key === 'Escape' && m.query()) m.query.set('')
    if (typing) return
    // ↑↓ browse the catalog — but not while focus is on a control that owns
    // its own arrows (a tab strip, a separator, a radio-like group).
    const role = (e.target as HTMLElement)?.getAttribute?.('role')
    if (role === 'tab' || role === 'separator' || role === 'switch') return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // The rows the catalog SHOWS — filtered, parts under their parent,
      // nothing inside a collapsed group.
      const ids = m.browseIds()
      if (!ids.length) return
      e.preventDefault()
      let i = ids.indexOf(m.selId())
      i = e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)
      m.selId.set(ids[i]!)
    }
  })

  // Region resizing: continuous per-pixel geometry is MEASUREMENT, not
  // styling (the Measure-overlay precedent). Pointer capture retargets
  // move/up to the handle, so plain JSX pointer props carry the whole gesture.
  let mainEl: HTMLElement | null = null
  let dragging: 'sidebar' | 'panel' | null = null
  const dragStart = (side: 'sidebar' | 'panel') => (e: PointerEvent) => {
    dragging = side
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const dragMove = (e: PointerEvent) => {
    if (isServer || !dragging) return
    if (dragging === 'sidebar') {
      m.sidebarW.set(clamp(e.clientX, SIDEBAR_MIN, SIDEBAR_MAX))
      return
    }
    const r = mainEl?.getBoundingClientRect()
    if (!r || r.height === 0) return
    m.panelFrac.set(clamp((r.bottom - e.clientY) / r.height, PANEL_MIN, PANEL_MAX))
  }
  const dragEnd = () => {
    dragging = null
  }
  // Keyboard resize — the handles are focusable separators: ←/→ move the
  // catalog edge by 16px (⇧ 64px), ↑/↓ move the panel edge by 4% (⇧ 12%).
  const sidebarKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = (e.shiftKey ? 64 : 16) * (e.key === 'ArrowRight' ? 1 : -1)
    m.sidebarW.set(clamp(m.sidebarW() + step, SIDEBAR_MIN, SIDEBAR_MAX))
  }
  const panelKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const step = (e.shiftKey ? 0.12 : 0.04) * (e.key === 'ArrowUp' ? 1 : -1)
    m.panelFrac.set(clamp(Math.round((m.panelFrac() + step) * 100) / 100, PANEL_MIN, PANEL_MAX))
  }

  // `theme` is the chrome token set: CSS custom-property references, so it
  // never changes — a mode flip rewrites the root's `data-theme` (the model
  // does that) and the custom properties follow. `mode` is still passed, as an
  // accessor, for anything that branches on it. The preview renders inside
  // its OWN `<PyreonUI>` with the brand tokens (see ./views/canvas/PreviewTheme).
  return (
    <PyreonUI theme={CHROME_TOKENS as never} mode={() => (m.dark() ? 'dark' : 'light')}>
      <C.Shell data-testid="atlas-shell" data-embed={m.embed ? 'true' : undefined}>
        <TopBar
          model={m}
          drawerToggleRef={(el: HTMLElement | null) => {
            drawerToggle = el
          }}
        />
        <C.Body>
          <Show when={() => !m.compact()}>
            <Sidebar model={m} />
            <C.ResizeHandle
              data-testid="resize-sidebar"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize catalog"
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              {...reactiveAttr('aria-valuenow', () => m.sidebarW())}
              tabIndex={0}
              onPointerDown={dragStart('sidebar')}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onKeyDown={sidebarKey}
            />
          </Show>
          <C.Main
            {...({
              innerRef: (el: HTMLElement | null) => {
                mainEl = el
              },
            } as Record<string, unknown>)}
          >
            <Show when={() => m.view() === 'canvas'}>
              <ScenarioStrip model={m} />
              <C.CanvasRegion style={() => `flex:${(1 - m.panelFrac()).toFixed(3)} 1 0px`}>
                <Canvas model={m} />
              </C.CanvasRegion>
              <C.SplitHandle
                data-testid="resize-panel"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize panels"
                aria-valuemin={PANEL_MIN * 100}
                aria-valuemax={PANEL_MAX * 100}
                {...reactiveAttr('aria-valuenow', () => Math.round(m.panelFrac() * 100))}
                tabIndex={0}
                onPointerDown={dragStart('panel')}
                onPointerMove={dragMove}
                onPointerUp={dragEnd}
                onKeyDown={panelKey}
              />
              <C.PanelRegion style={() => `flex:${m.panelFrac().toFixed(3)} 1 0px`}>
                <AddonPanel model={m} />
              </C.PanelRegion>
            </Show>
            <Show when={() => m.view() === 'docs'}>
              <DocsView model={m} />
            </Show>
            <Show when={() => m.view() === 'lab'}>
              <LabView model={m} />
            </Show>
          </C.Main>
        </C.Body>

        {/* Compact layout: the catalog is a drawer OVER the app instead of a
            column squeezing the canvas. A modal dialog: focus moves in on
            open, Tab cycles inside it, Escape or the scrim closes it and
            focus returns to the toggle. */}
        <Show when={() => m.compact() && m.drawerOpen()}>
          <C.Scrim data-testid="drawer-scrim" onClick={closeDrawer} />
          <C.Drawer
            data-testid="sidebar-drawer"
            id="atlas-catalog-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Catalog"
            tabIndex={-1}
            ref={focusOnMount}
            onKeyDown={(e: KeyboardEvent) => trapTab(e, e.currentTarget as HTMLElement)}
          >
            <Sidebar model={m} onChoose={closeDrawer} />
          </C.Drawer>
        </Show>
      </C.Shell>
      <SearchDialog model={m} />
    </PyreonUI>
  )
}
