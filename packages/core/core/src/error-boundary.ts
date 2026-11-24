import { signal } from '@pyreon/reactivity'
import { nativeCompat } from './compat-marker'
import { ErrorBoundaryContext } from './component'
import { provide, useContext } from './context'
import { reportError } from './telemetry'
import type { VNodeChild, VNodeChildAtom } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
/**
 * ErrorBoundary — catches errors thrown by child components and renders a
 * fallback UI instead of crashing the whole tree.
 *
 * Also reports caught errors to any registered telemetry handlers.
 *
 * How error propagation works:
 * ErrorBoundary `provide()`s its handler during setup (before children are
 * mounted). When mountComponent catches a child error, it calls
 * dispatchToErrorBoundary(), which resolves the nearest boundary through the
 * context owner chain, i.e. the component tree. Code that fails after mount
 * (a rejected `<Defer>` chunk) captures `nearestErrorBoundary()` during setup.
 *
 * Usage:
 *   h(ErrorBoundary, {
 *     fallback: (err) => h("p", null, `Error: ${err}`),
 *     children: h(MyComponent, null),
 *   })
 *
 *   // or with JSX:
 *   <ErrorBoundary fallback={(err) => <p>Error: {String(err)}</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
function ErrorBoundary(props: {
  /**
   * Rendered when a child throws. Receives the caught error and a `reset`
   * function — calling `reset()` clears the error and re-renders children.
   */
  fallback: (err: unknown, reset: () => void) => VNodeChild
  children?: VNodeChild
}): VNodeChild {
  if (process.env.NODE_ENV !== 'production' && typeof props.fallback !== 'function') {
    // oxlint-disable-next-line no-console
    console.warn(
      '[Pyreon] <ErrorBoundary> expects `fallback` to be a function: (err, reset) => VNode. ' +
        `Received ${typeof props.fallback}.`,
    )
  }

  const error = signal<unknown>(null)
  const reset = () => error.set(null)

  // The boundary this one sits in: an error that arrives while this boundary
  // already shows its fallback (the fallback itself threw) goes there.
  const outer = useContext(ErrorBoundaryContext)

  const handler = (err: unknown): boolean => {
    if (error.peek() !== null) return outer ? outer(err) : false
    // Synchronous signal write. The handler fires from inside mountComponent's
    // catch, itself inside the boundary's own mountReactive effect run (the run
    // that mounted the throwing child), or later from a rejected promise. The
    // two-tier flush handles both: the write enqueues the boundary's run, and
    // that run swaps to the fallback subtree.
    error.set(err)
    reportError({ component: 'ErrorBoundary', phase: 'render', error: err, timestamp: Date.now() })
    return true
  }

  // Provided before the children are built, so every descendant (and nothing
  // else: not a sibling, not a later-mounted unrelated subtree) resolves this
  // handler through the owner chain. Disposed with the boundary's scope.
  provide(ErrorBoundaryContext, handler)

  return (): VNodeChildAtom => {
    const err = error()
    // The error signal is set only by `handler`, fired from mountComponent's
    // catch during a child mount — so the fallback branch is reachable only
    // under a renderer (exercised by @pyreon/runtime-dom's ErrorBoundary mount
    // tests), never from a bare node-side `ErrorBoundary()` call.
    /* v8 ignore next */
    if (err != null) return props.fallback(err, reset) as VNodeChildAtom
    const ch = props.children
    return (typeof ch === 'function' ? ch() : ch) as VNodeChildAtom
  }
}

// Mark as native so compat-mode jsx() runtimes (react/preact/vue/solid-compat)
// skip wrapCompatComponent — ErrorBoundary uses provide/useContext,
// which need Pyreon's setup frame (compat wrapping breaks dispatchToErrorBoundary).
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _ErrorBoundary = /* @__PURE__ */ nativeCompat(ErrorBoundary)
export { _ErrorBoundary as ErrorBoundary }