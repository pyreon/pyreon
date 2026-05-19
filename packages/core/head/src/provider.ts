import type { ComponentFn, Props, VNodeChild } from '@pyreon/core'
import { nativeCompat, provide, useContext } from '@pyreon/core'
import type { HeadContextValue } from './context'
import { createHeadContext, HeadContext } from './context'

export interface HeadProviderProps extends Props {
  context?: HeadContextValue | undefined
  children?: VNodeChild
}

/**
 * Provides a HeadContextValue to all descendant components.
 * Wrap your app root with this to enable useHead() throughout the tree.
 *
 * Resolution order (first non-null wins):
 * 1. `props.context` — explicit context (documented SSR pattern).
 * 2. An outer `HeadContext` already in scope — inherited transparently.
 *    This is what makes `renderWithHead(h(HeadProvider, null, h(App)))`
 *    work without manual context plumbing: `renderWithHead` pushes its
 *    own `HeadContext` onto the per-request stack, and a nested
 *    `HeadProvider` (e.g. one zero's `App` renders unconditionally)
 *    inherits it instead of silently shadowing it with a fresh,
 *    write-only registry.
 * 3. A freshly-created `HeadContext` — root-level fallback (pure CSR).
 *
 * The inheritance step is load-bearing for any consumer wrapping
 * `<HeadProvider>` inside `renderWithHead()` (the documented JSDoc
 * pattern below) AND for the SSG / runtime-SSR pipeline in `@pyreon/zero`,
 * whose `createApp` always mounts `h(HeadProvider, null, …)` with no
 * `context` prop. Without inheritance, all `useHead()` calls in the
 * subtree wrote tags into the inner ctx while `renderWithHead` resolved
 * the outer ctx — producing an empty `<head>` for the whole app.
 *
 * Apps that genuinely need an isolated registry (e.g. iframe / micro-
 * frontend boundaries) can still opt out by passing
 * `context={createHeadContext()}` explicitly — `props.context` always wins.
 *
 * @example
 * // Auto-create context (root of a CSR app):
 * <HeadProvider><App /></HeadProvider>
 *
 * // Explicit context (e.g. for SSR):
 * const headCtx = createHeadContext()
 * mount(h(HeadProvider, { context: headCtx }, h(App, null)), root)
 *
 * // Composes with `renderWithHead` out of the box — no plumbing needed:
 * const { html, head } = await renderWithHead(h(HeadProvider, null, h(App, null)))
 */
export const HeadProvider: ComponentFn<HeadProviderProps> = (props) => {
  // `useContext(HeadContext)` returns `null` when no outer provider exists
  // (the context's defaultValue). The `??` chain therefore resolves to:
  //   explicit prop  →  inherited outer ctx  →  fresh ctx
  // and `provide()` re-pushes the same ctx for the subtree (harmless: the
  // descendant `useContext` walk finds it identically via either frame).
  const ctx = props.context ?? useContext(HeadContext) ?? createHeadContext()
  provide(HeadContext, ctx)

  const ch = props.children
  return typeof ch === 'function' ? (ch as () => VNodeChild)() : ch
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// HeadProvider's provide(HeadContext, ...) call runs inside Pyreon's setup
// frame, not the compat wrapper's runUntracked accessor.
nativeCompat(HeadProvider)
