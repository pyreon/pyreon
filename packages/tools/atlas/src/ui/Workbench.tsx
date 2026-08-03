/**
 * `<Workbench>` — the Atlas component workbench, driven entirely by a
 * `WorkbenchCatalog` you pass in (no hardcoded component list). This file is
 * just the orchestrator: it builds the reactive `model`, wires global keyboard
 * shortcuts, and composes the region views (`./views/*`) inside the themed
 * `<PyreonUI>` + `<Shell>`. All chrome + state live in their own modules.
 */
import { Show } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { createGlobalStyle } from '@pyreon/styler'
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
 */
const GLOBAL_CSS = `
@keyframes atlas-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{-webkit-font-smoothing:antialiased}
button:focus-visible,input:focus-visible{outline:2px solid #ff6b3d;outline-offset:2px}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(120,128,150,.3);border-radius:20px;border:3px solid transparent;background-clip:content-box}
`
let globalInjected = false

export function Workbench(props: WorkbenchProps) {
  if (!globalInjected) {
    globalInjected = true
    createGlobalStyle([GLOBAL_CSS] as unknown as TemplateStringsArray)
  }
  // `let`, NOT `const` — load-bearing. The compiler's reactive-props inlining
  // inlines a prop-derived `const` at every JSX use site; for a STATEFUL factory
  // call like createModel() that would mint a FRESH, disconnected model per
  // `<View model={m}>` (signals written in one instance, read in another → the
  // reactive graph is severed and nothing updates). `let`/`var` bindings are not
  // tracked by the inliner, so `m` stays the single shared model. See
  // .claude/rules/anti-patterns.md "reactive-props inlining of a stateful factory".
  // oxlint-disable-next-line prefer-const
  let m = createModel(props.catalog, { title: props.title, subtitle: props.subtitle })
  // The workbench IS a dev tool — its model is its public runtime surface. The
  // browser-verify runner (and any embedding host) drives scenarios through
  // it instead of scripting the DOM.
  ;(globalThis as Record<string, unknown>).__ATLAS_MODEL__ = m

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
    if (e.key === 'Escape' && m.query()) m.query.set('')
    if (typing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const ids = m.search(m.query())
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
    if (dragging === 'sidebar') m.sidebarW.set(Math.min(420, Math.max(200, e.clientX)))
    else if (dragging === 'panel') m.panelW.set(Math.min(560, Math.max(280, window.innerWidth - e.clientX)))
  }
  const dragEnd = () => {
    dragging = null
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
          <Show when={() => m.sidebarOpen()}>
            <Sidebar model={m} />
            <C.ResizeHandle
              data-testid="resize-sidebar"
              onPointerDown={dragStart('sidebar')}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onDblClick={() => m.sidebarOpen.set(false)}
            />
          </Show>
          <Show when={() => m.view() === 'canvas'}>
            <Canvas model={m} />
          </Show>
          <Show when={() => m.view() === 'canvas' && m.panelOpen()}>
            <C.ResizeHandle
              data-testid="resize-panel"
              onPointerDown={dragStart('panel')}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
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
        <C.StatusBar>
          <C.StatusText>{() => `components/${m.selId()}`}</C.StatusText>
          <C.StatusDim>·</C.StatusDim>
          <C.StatusText>{() => `${m.brand().name} theme`}</C.StatusText>
          <C.Spacer />
          <C.StatusText>{`${m.total} components`}</C.StatusText>
        </C.StatusBar>
      </C.Shell>
      <SearchDialog model={m} />
    </PyreonUI>
  )
}
