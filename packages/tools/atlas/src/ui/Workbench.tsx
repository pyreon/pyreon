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
 */
import { isClient, isServer, Show } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { createGlobalStyle } from '@pyreon/styler'
import { batch } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import type { WorkbenchCatalog } from './catalog'
import * as C from './components'
import { createModel } from './model'
import { AddonPanel, Canvas, DocsView, LabView, SearchDialog, Sidebar, TopBar } from './views'

export interface WorkbenchProps {
  /** The components to showcase + how to render them. */
  catalog: WorkbenchCatalog
  /** Brand title in the top bar (default `'atlas'`). */
  title?: string
  /** Brand subtitle under the title. */
  subtitle?: string
}

/**
 * Page-level reset, injected once at first mount. Without it the browser's
 * default `body { margin: 8px }` framed the 100vh shell with a white gap —
 * the workbench owns the whole page, so it owns the reset (same shape as
 * loom's mountObservatory GLOBAL_CSS).
 *
 * The focus ring sits in `@layer elements` — the LOWEST layer the styler
 * emits into. Unlayered, it outranked every component rule (layered styles
 * lose to unlayered ones regardless of specificity), so a component could
 * never replace it: the ⌘K field drew a square outline through its rounded
 * card no matter what its own styles said.
 */
const GLOBAL_CSS = `
@keyframes atlas-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes atlas-fade{from{opacity:0}to{opacity:1}}
@keyframes atlas-drawer{from{transform:translateX(-24px);opacity:.4}to{transform:none;opacity:1}}
@keyframes atlas-sheet{from{transform:translateY(32px);opacity:.4}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{-webkit-font-smoothing:antialiased}
@layer elements{button:focus-visible,input:focus-visible,[role=tab]:focus-visible,[tabindex]:focus-visible{outline:2px solid #ff6b3d;outline-offset:2px}}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(120,128,150,.3);border-radius:20px;border:3px solid transparent;background-clip:content-box}
`
let globalInjected = false

/** The compact-layout breakpoint — below it the side panels become overlays. */
const COMPACT_QUERY = '(max-width: 900px)'

/**
 * Move focus INTO an overlay the moment it mounts, so keyboard and
 * screen-reader users land in it rather than behind the scrim. Deferred a
 * frame: the ref fires before the element is attached.
 */
const focusOnMount = (el: HTMLElement | null) => {
  if (el && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => el.focus())
}

export function Workbench(props: WorkbenchProps) {
  if (!globalInjected) {
    globalInjected = true
    createGlobalStyle([GLOBAL_CSS] as unknown as TemplateStringsArray)
  }
  // `const` is correct again. This was `let` for a long time — load-bearing,
  // because the compiler's reactive-props inlining re-invoked a prop-derived
  // `const`'s STATEFUL initializer at every JSX use site, minting a fresh
  // disconnected model per `<View model={m}>` (signals written in one instance,
  // read in another). `let` bindings were never tracked by the inliner, so it
  // worked — but it was folklore the next author could not be expected to know,
  // and `@pyreon/loom`'s Observatory duly wrote `const` and inherited the same
  // dead UI, as did `@pyreon/zero-content`'s `useSearch` (the pyreon.dev search
  // overlay). The inliner now skips a `useX`/`createX` initializer outright, so
  // this reads normally AND the atlas-workshop e2e is a live regression test of
  // that compiler fix. See .agents/rules/anti-patterns.md "reactive-props
  // inlining of a stateful factory".
  const m = createModel(props.catalog, { title: props.title, subtitle: props.subtitle })
  // The workbench IS a dev tool — its model is its public runtime surface. The
  // browser-verify runner (and any embedding host) drives scenarios through
  // it instead of scripting the DOM.
  ;(globalThis as Record<string, unknown>).__ATLAS_MODEL__ = m

  // Compact layout follows the viewport LIVE — rotating a tablet, or dragging
  // a desktop window narrow, switches between the sidebar/panel columns and
  // the drawer/sheet. The model seeds the initial value synchronously (no
  // desktop-layout flash on a phone); this keeps it current.
  const compactQuery = isClient && typeof matchMedia === 'function' ? matchMedia(COMPACT_QUERY) : null
  if (compactQuery) {
    useEventListener(
      'change',
      (e: Event) => {
        const next = (e as MediaQueryListEvent).matches
        batch(() => {
          m.compact.set(next)
          if (!next) {
            m.drawerOpen.set(false)
            m.sheetOpen.set(false)
          }
        })
      },
      undefined,
      () => compactQuery,
    )
  }

  // Global shortcuts: ⌘K focuses search, Escape clears it, ↑↓ browse components.
  // useEventListener is SSR-safe (isClient-guarded) + auto-cleans up on unmount.
  useEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    const typing = tag === 'input' || tag === 'textarea'
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
    // The compact overlays close on Escape like any other modal surface.
    if (e.key === 'Escape' && (m.drawerOpen() || m.sheetOpen())) {
      m.drawerOpen.set(false)
      m.sheetOpen.set(false)
      return
    }
    if (e.key === 'Escape' && m.query()) m.query.set('')
    if (typing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // The rows the sidebar SHOWS — filtered, parts under their parent,
      // nothing inside a collapsed group. Walking the flat catalog order
      // selected components the sidebar was not displaying.
      const ids = m.browseIds()
      if (!ids.length) return
      e.preventDefault()
      let i = ids.indexOf(m.selId())
      i = e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)
      m.selId.set(ids[i]!)
    }
  })

  // rocketstyle reads its tokens from @pyreon/ui-core's reactive context AND
  // needs the theme enriched — so wrap in <PyreonUI> (autoInit + enrichTheme +
  // context layers). A brand/dark swap re-resolves reactively.
  //
  // `theme` and `mode` are both passed as ACCESSORS on purpose.
  //
  // The prebuilt `lib/ui.js` is built with the plain automatic JSX runtime (as is
  // every other @pyreon UI package's lib), so it gets none of the compiler's
  // `_rp()` prop wrapping. A raw `theme={m.theme()}` is therefore read exactly
  // once there, and the brand / dark swap silently does nothing for anyone
  // resolving the `import` condition instead of `bun`. An accessor is live on
  // BOTH paths: the compiler wraps it and `PyreonUI` calls it, or — with no
  // compiler — `PyreonUI` just calls it.
  //
  // Hand-wrapping in `_rp()` is NOT the answer: in a compiled file the compiler
  // wraps it a SECOND time, `props.theme` becomes the inner thunk, `enrichTheme`
  // receives a function, and every token reads `undefined` (this broke all 7
  // atlas-workshop e2e specs with `t.accent === undefined` before being caught).
  // Panel drag-resize: continuous per-pixel geometry is MEASUREMENT, not
  // styling (the Measure-overlay precedent). Pointer capture retargets
  // move/up to the handle, so plain JSX pointer props carry the whole
  // gesture — no raw listeners.
  let dragging: 'sidebar' | 'panel' | null = null
  const dragStart = (side: 'sidebar' | 'panel') => (e: PointerEvent) => {
    dragging = side
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const dragMove = (e: PointerEvent) => {
    if (isServer) return
    if (dragging === 'sidebar') m.sidebarW.set(Math.min(420, Math.max(200, e.clientX)))
    else if (dragging === 'panel') m.panelW.set(Math.min(560, Math.max(280, window.innerWidth - e.clientX)))
  }
  const dragEnd = () => {
    dragging = null
  }
  // Keyboard resize — the handle is a focusable separator, and ←/→ move it
  // by 16px (⇧ for 64px). Mouse-only panel widths locked keyboard users out.
  const dragKey = (side: 'sidebar' | 'panel') => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = (e.shiftKey ? 64 : 16) * (e.key === 'ArrowRight' ? 1 : -1)
    if (side === 'sidebar') m.sidebarW.set(Math.min(420, Math.max(200, m.sidebarW() + step)))
    else m.panelW.set(Math.min(560, Math.max(280, m.panelW() - step)))
  }

  // Same reasoning drives the `state={() => …}` accessors in ./views.
  return (
    <PyreonUI
      theme={(() => m.theme()) as never}
      mode={() => (m.dark() ? 'dark' : 'light')}
    >
      <C.Shell data-testid="atlas-shell">
        <TopBar model={m} />
        <C.Body>
          <Show when={() => !m.compact() && m.sidebarOpen()}>
            <Sidebar model={m} />
            <C.ResizeHandle
              data-testid="resize-sidebar"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              tabIndex={0}
              onPointerDown={dragStart('sidebar')}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onKeyDown={dragKey('sidebar')}
              onDblClick={() => m.sidebarOpen.set(false)}
            />
          </Show>
          <Show when={() => m.view() === 'canvas'}>
            <Canvas model={m} />
          </Show>
          <Show when={() => !m.compact() && m.view() === 'canvas' && m.panelOpen()}>
            <C.ResizeHandle
              data-testid="resize-panel"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize addon panel"
              tabIndex={0}
              onPointerDown={dragStart('panel')}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onKeyDown={dragKey('panel')}
              onDblClick={() => m.panelOpen.set(false)}
            />
            <AddonPanel model={m} />
          </Show>
          <Show when={() => m.view() === 'docs'}>
            <DocsView model={m} />
          </Show>
          <Show when={() => m.view() === 'lab'}>
            <LabView model={m} />
          </Show>
        </C.Body>
        {/* The path + catalog size. The render context (brand · mode · …) is
            the canvas header's job; the bar used to repeat it. Hidden in the
            compact layout, where 32px of repeated context is 4% of a phone. */}
        <Show when={() => !m.compact()}>
          <C.StatusBar>
            <C.StatusText>{() => `components/${m.selId()}`}</C.StatusText>
            <C.Spacer />
            <C.StatusText>{`${m.total} components`}</C.StatusText>
          </C.StatusBar>
        </Show>

        {/* Compact layout: the sidebar is a drawer and the addon panel a
            bottom sheet, both OVER the canvas instead of squeezing it. */}
        <Show when={() => m.compact() && m.drawerOpen()}>
          <C.Scrim data-testid="drawer-scrim" onClick={() => m.drawerOpen.set(false)} />
          <C.Drawer
            data-testid="sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Components"
            tabIndex={-1}
            ref={focusOnMount}
          >
            <Sidebar model={m} />
          </C.Drawer>
        </Show>
        <Show when={() => m.compact() && m.sheetOpen() && m.view() === 'canvas'}>
          <C.Scrim data-testid="sheet-scrim" onClick={() => m.sheetOpen.set(false)} />
          <C.Sheet
            data-testid="panel-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Addon panels"
            tabIndex={-1}
            ref={focusOnMount}
          >
            <C.SheetHead>
              <span>{() => m.sel()?.name ?? ''}</span>
              <C.ZoomBtn
                data-testid="sheet-close"
                aria-label="Close panels"
                onClick={() => m.sheetOpen.set(false)}
              >
                ✕
              </C.ZoomBtn>
            </C.SheetHead>
            <AddonPanel model={m} />
          </C.Sheet>
        </Show>
      </C.Shell>
      <SearchDialog model={m} />
    </PyreonUI>
  )
}
