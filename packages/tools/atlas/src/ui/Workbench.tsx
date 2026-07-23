/**
 * `<Workbench>` — the Atlas component workbench, driven entirely by a
 * `WorkbenchCatalog` you pass in (no hardcoded component list). This file is
 * just the orchestrator: it builds the reactive `model`, wires global keyboard
 * shortcuts, and composes the region views (`./views/*`) inside the themed
 * `<PyreonUI>` + `<Shell>`. All chrome + state live in their own modules.
 */
import { onMount, Show } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import type { WorkbenchCatalog } from './catalog'
import * as C from './chrome'
import { createModel } from './model'
import { AddonPanel } from './views/AddonPanel'
import { Canvas } from './views/Canvas'
import { DocsView } from './views/DocsView'
import { LabView } from './views/LabView'
import { Sidebar } from './views/Sidebar'
import { TopBar } from './views/TopBar'

export interface WorkbenchProps {
  /** The components to showcase + how to render them. */
  catalog: WorkbenchCatalog
  /** Brand title in the top bar (default `'atlas'`). */
  title?: string
  /** Brand subtitle under the title. */
  subtitle?: string
}

export function Workbench(props: WorkbenchProps) {
  // `let`, NOT `const` — load-bearing. The compiler's reactive-props inlining
  // inlines a prop-derived `const` at every JSX use site; for a STATEFUL factory
  // call like createModel() that would mint a FRESH, disconnected model per
  // `<View model={m}>` (signals written in one instance, read in another → the
  // reactive graph is severed and nothing updates). `let`/`var` bindings are not
  // tracked by the inliner, so `m` stays the single shared model. See
  // .claude/rules/anti-patterns.md "reactive-props inlining of a stateful factory".
  // oxlint-disable-next-line prefer-const
  let m = createModel(props.catalog, { title: props.title, subtitle: props.subtitle })

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const typing = tag === 'input' || tag === 'textarea'
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[data-search]')?.focus()
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // rocketstyle reads its tokens from @pyreon/ui-core's reactive context AND
  // needs the theme enriched — so wrap in <PyreonUI> (autoInit + enrichTheme +
  // context layers). A brand/dark swap re-resolves reactively.
  return (
    <PyreonUI theme={m.theme() as never} mode={m.dark() ? 'dark' : 'light'}>
      <C.Shell data-testid="atlas-shell">
        <TopBar model={m} />
        <C.Body>
          <Sidebar model={m} />
          <Show when={() => m.view() === 'canvas'}>
            <Canvas model={m} />
          </Show>
          <Show when={() => m.view() === 'canvas'}>
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
    </PyreonUI>
  )
}
