import { signal } from '@pyreon/reactivity'
import { nativeCompat } from './compat-marker'
import { popErrorBoundary, pushErrorBoundary } from './component'
import { onUnmount } from './lifecycle'
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
 * ErrorBoundary pushes a handler onto the module-level boundary stack
 * synchronously during its own setup (before children are mounted).
 * When mountComponent catches a child error, it calls dispatchToErrorBoundary()
 * which invokes the innermost boundary's handler.
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
export function ErrorBoundary(props: {
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

  const handler = (err: unknown): boolean => {
    if (error.peek() !== null) return false // already in error state — let outer boundary catch it
    // Synchronous signal write. The handler fires from inside mountComponent's
    // catch, which is itself inside the boundary's own mountReactive effect
    // run (the run that mounted the throwing child). The batch system's
    // two-tier flush handles this correctly: this `error.set(err)` enqueues
    // the boundary's run into the effects queue's nextPass (since the run is
    // currently being visited), and the next pass fires it to swap to the
    // fallback subtree. See packages/core/reactivity/src/batch.ts for the
    // multi-pass effect drain contract.
    error.set(err)
    reportError({ component: 'ErrorBoundary', phase: 'render', error: err, timestamp: Date.now() })
    return true
  }

  // Push synchronously — before children are mounted — so child errors see this boundary
  pushErrorBoundary(handler)
  // Identity-based pop: pass our own handler reference. Sibling boundaries
  // can unmount in any order driven by the renderer (keyed `<For>` removal
  // of a non-last item, `<Show>` flipping on the FIRST of N siblings, route
  // nav, etc.) — without passing the handler reference, the position-based
  // `pop()` would remove the WRONG boundary's handler. Same bug class as
  // #725 (`popContext()` orphaning provider frames under reactive remount).
  onUnmount(() => popErrorBoundary(handler))

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
// skip wrapCompatComponent — ErrorBoundary uses pushErrorBoundary/onUnmount,
// which need Pyreon's setup frame (compat wrapping breaks dispatchToErrorBoundary).
nativeCompat(ErrorBoundary)
