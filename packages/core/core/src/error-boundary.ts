import { signal } from '@pyreon/reactivity'
import { nativeCompat } from './compat-marker'
import { popErrorBoundary, pushErrorBoundary } from './component'
import { onUnmount } from './lifecycle'
import { reportError } from './telemetry'
import type { VNodeChild, VNodeChildAtom } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

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
  if (__DEV__ && typeof props.fallback !== 'function') {
    // oxlint-disable-next-line no-console
    console.warn(
      '[Pyreon] <ErrorBoundary> expects `fallback` to be a function: (err, reset) => VNode. ' +
        `Received ${typeof props.fallback}.`,
    )
  }

  const error = signal<unknown>(null)
  // Synchronous "already handling" flag, separate from the deferred
  // `error` signal write. This lets `handler` correctly short-circuit on
  // a second error dispatched within the same flush — even though the
  // signal hasn't been written yet — while still deferring the actual
  // signal write to a microtask (see queueMicrotask comment below).
  let handling = false
  const reset = () => {
    handling = false
    error.set(null)
  }

  const handler = (err: unknown): boolean => {
    if (handling) return false // already handling — let outer boundary catch nested error
    handling = true
    // Defer the signal write to a microtask. The handler fires from inside
    // mountComponent's catch, which is itself inside the boundary's own
    // mountReactive effect run (the run that mounted the throwing child).
    // Calling error.set(err) inline would notify the boundary effect — but
    // the batch flush is currently iterating subscribers, and the boundary
    // effect is the SAME run that's already been visited this flush. Set
    // iteration semantics + Set.add idempotency mean re-enqueueing the
    // already-visited run is a no-op (intentional dedup to avoid infinite
    // loops on self-modifying effects — see batch.ts comment). Result: the
    // notification is silently dropped, the fallback never mounts.
    //
    // Deferring to a microtask runs error.set AFTER the current run + batch
    // flush complete. By then the boundary effect is no longer "in flight"
    // and a fresh notify queues a clean re-run that swaps to the fallback.
    queueMicrotask(() => {
      if (!handling) return // reset() raced ahead of us — drop the stale write
      error.set(err)
    })
    reportError({ component: 'ErrorBoundary', phase: 'render', error: err, timestamp: Date.now() })
    return true
  }

  // Push synchronously — before children are mounted — so child errors see this boundary
  pushErrorBoundary(handler)
  onUnmount(() => popErrorBoundary())

  return (): VNodeChildAtom => {
    const err = error()
    if (err != null) return props.fallback(err, reset) as VNodeChildAtom
    const ch = props.children
    return (typeof ch === 'function' ? ch() : ch) as VNodeChildAtom
  }
}

// Mark as native so compat-mode jsx() runtimes (react/preact/vue/solid-compat)
// skip wrapCompatComponent — ErrorBoundary uses pushErrorBoundary/onUnmount,
// which need Pyreon's setup frame (compat wrapping breaks dispatchToErrorBoundary).
nativeCompat(ErrorBoundary)
