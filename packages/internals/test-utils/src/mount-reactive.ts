/**
 * Mount-and-mutate helpers for reactive component tests.
 *
 * These helpers compress the boilerplate of "create a DOM container,
 * mount a vnode, mutate signals, assert, clean up" into one or two
 * function calls. They are designed for the most common reactive
 * test pattern across the Pyreon UI system: prove that a component
 * patches its DOM (or doesn't re-run its parent) when a signal
 * dependency changes.
 *
 * **Required environment**: these helpers require a DOM. Consumer
 * test files (or their package's `vitest.config.ts`) must set
 * `environment: 'happy-dom'`. The helpers throw a clear error
 * pointing at the fix if `document` is undefined at call time.
 */
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'

export interface MountReactiveResult {
  /** The DOM container that received the mounted tree. */
  container: HTMLDivElement
  /** Unmount the tree (disposes effects) AND remove the container from the DOM. */
  cleanup: () => void
  /** Just unmount — leaves the container in the DOM for further inspection. */
  unmount: () => void
}

/**
 * Mount a VNode tree into a fresh detached container appended to
 * `document.body`. Returns the container and a cleanup function.
 *
 * Use this for any test that needs to mount a component, mutate a
 * signal, and assert that the DOM updated correctly.
 *
 * @example
 * ```ts
 * import { mountReactive } from '@pyreon/test-utils'
 * import { signal } from '@pyreon/reactivity'
 * import { h } from '@pyreon/core'
 *
 * it('text updates when signal changes', () => {
 *   const name = signal('Aisha')
 *   const { container, cleanup } = mountReactive(
 *     h('div', null, () => name())
 *   )
 *
 *   expect(container.textContent).toBe('Aisha')
 *   name.set('Marcus')
 *   expect(container.textContent).toBe('Marcus')
 *
 *   cleanup()
 * })
 * ```
 *
 * @throws {Error} when called outside a DOM environment (e.g. in a
 * vitest project without `environment: 'happy-dom'` set).
 */
export function mountReactive(vnode: VNodeChild): MountReactiveResult {
  ensureDom('mountReactive')

  const container = document.createElement('div')
  document.body.appendChild(container)

  const unmount = mount(vnode, container)

  return {
    container,
    unmount,
    cleanup: () => {
      unmount()
      container.remove()
    },
  }
}

export interface MountAndExpectOnceResult extends MountReactiveResult {
  /**
   * The number of times the component factory was invoked. The
   * factory is wrapped to count parent re-runs — for fine-grained
   * reactivity to be working, this should remain `1` across all
   * mutations.
   */
  parentCalls: () => number
}

/**
 * Wrap a component factory in a counter, mount it, run a sequence of
 * mutations against it, and expose `parentCalls()` so tests can
 * assert how many times the factory was invoked.
 *
 * ### Read this before using the helper
 *
 * **The bug pattern this helper catches**: a component is mounted
 * *inside an outer reactive thunk* somewhere up the tree, causing
 * the runtime to re-instantiate the component (and its entire
 * subtree) on every signal change. Concretely, this is the resume
 * builder bug from PR #191:
 *
 * ```tsx
 * // BAD — re-mounts ResumeTemplate on every keystroke
 * <PreviewFrame>
 *   {() => <ResumeTemplate resume={store.resume()} />}
 * </PreviewFrame>
 * ```
 *
 * The fix moves the signal read inside `ResumeTemplate`'s body via
 * per-text-node thunks, and the route stops wrapping the component
 * in an outer thunk. After the fix, the template factory runs
 * **exactly once** at mount, no matter how many keystrokes happen.
 *
 * **The bug pattern this helper does NOT catch**: a component whose
 * body reads `signal()` directly into a captured value, without a
 * thunk. Pyreon components only subscribe to signals via reactive
 * scopes (`effect`, `computed`, JSX child accessors), so such a
 * component captures the value once at mount and *never updates*.
 * The DOM goes stale silently. That's a different class of bug,
 * detected by asserting on the rendered output, not on the
 * `parentCalls` counter.
 *
 * **The contract this helper expresses**: "this factory should run
 * exactly once during the test, regardless of how many signal
 * mutations happen." A passing test (`parentCalls() === 1`) proves
 * the consumer's *call site* is wrapped correctly. A failing test
 * means an outer thunk somewhere is re-creating the component.
 *
 * Phrased differently: `mountAndExpectOnce` tests **how the consumer
 * mounts the factory**, not the factory's own internal correctness.
 *
 * ### Parameters
 *
 * @param factory - Component factory. Wrapped to count invocations.
 *                   Must return a VNodeChild (typically the result
 *                   of an `h(...)` call).
 * @param mutations - Synchronous function that performs N signal
 *                     mutations. Called AFTER initial mount.
 *
 * ### Example
 *
 * ```ts
 * import { mountAndExpectOnce } from '@pyreon/test-utils'
 * import { signal } from '@pyreon/reactivity'
 * import { h } from '@pyreon/core'
 * import { DocText } from '@pyreon/document-primitives'
 *
 * it('DocText with signal-thunk child does not re-mount on mutation', () => {
 *   const name = signal('Aisha')
 *
 *   const { container, parentCalls, cleanup } = mountAndExpectOnce(
 *     () => h(DocText, null, () => name()),
 *     () => {
 *       name.set('Marcus')
 *       name.set('Priya')
 *       name.set('Sofia')
 *       name.set('Wei')
 *       name.set('Jordan')
 *     },
 *   )
 *
 *   expect(parentCalls()).toBe(1)        // factory wrapped correctly
 *   expect(container.textContent).toBe('Jordan')  // DOM patched live
 *   cleanup()
 * })
 * ```
 *
 * @throws {Error} when called outside a DOM environment.
 */
export function mountAndExpectOnce(
  factory: () => VNodeChild,
  mutations: () => void,
): MountAndExpectOnceResult {
  ensureDom('mountAndExpectOnce')

  let calls = 0

  // Wrap the user's factory as a component and mount it via
  // `h(Parent, null)`. This is what makes the "parent runs once"
  // contract testable — if `factory` had been called inline before
  // mount, the runtime would never have a chance to re-invoke it,
  // so a passing test would prove nothing.
  //
  // With this wiring, the runtime calls `Parent` once during mount.
  // If signal mutations cause the runtime to re-instantiate the
  // parent (a reactivity bug), `calls` increments past 1.
  const Parent = () => {
    calls++
    return factory()
  }

  const result = mountReactive(h(Parent, null))

  mutations()

  return {
    ...result,
    parentCalls: () => calls,
  }
}

/**
 * Throw a clear error if no DOM is available. The error tells the
 * consumer exactly how to fix the problem rather than letting them
 * see a cryptic `ReferenceError: document is not defined`.
 */
function ensureDom(helperName: string): void {
  if (typeof document === 'undefined') {
    throw new Error(buildDomErrorMessage(helperName))
  }
}

/**
 * Build the helpful "you need happy-dom" error message. Extracted as
 * a pure function so tests can verify the message text without having
 * to actually unset `document` at runtime — which is brittle, depends
 * on vitest internals, and pollutes the global scope. The throw site
 * itself (in `ensureDom`) is one trivial line; what's worth testing
 * is that the message says the right things.
 *
 * @internal
 */
export function buildDomErrorMessage(helperName: string): string {
  return (
    `[@pyreon/test-utils] ${helperName}() requires a DOM environment. ` +
    `Set \`environment: 'happy-dom'\` in your package's vitest.config.ts:\n\n` +
    `  import { mergeConfig } from 'vite'\n` +
    `  import { defineConfig } from 'vitest/config'\n` +
    `  import { sharedConfig } from '../../../vitest.shared'\n\n` +
    `  export default mergeConfig(\n` +
    `    sharedConfig,\n` +
    `    defineConfig({\n` +
    `      test: { globals: true, environment: 'happy-dom' },\n` +
    `    }),\n` +
    `  )\n`
  )
}
