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
  const reset = () => error.set(null)

  const handler = (err: unknown): boolean => {
    if (error.peek() !== null) return false // already in error state — let outer boundary catch it
    error.set(err)
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
