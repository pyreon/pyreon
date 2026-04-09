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
 * Mount a component and run a sequence of mutations against it,
 * tracking how many times the component factory is invoked.
 *
 * The canonical assertion is `parentCalls() === 1` — proving that
 * signal-driven updates patch the DOM in place rather than
 * re-instantiating the parent.
 *
 * **What this catches**: in Pyreon, components run **once** at mount
 * by design — they don't re-run on signal changes from the body's
 * static reads. The bug pattern this helper catches is when a parent
 * component is mounted *inside a reactive thunk* (e.g.
 * `{() => <Template prop={signal()} />}`), causing the entire
 * subtree to be re-created on every signal change. The resume
 * builder PR (#191) fixed exactly this — the route did
 * `{() => <ResumeTemplate resume={r.store.resume()} />}`, which
 * remounted the entire template on every keystroke. After the fix,
 * the template reads the signal accessor inside its body via
 * per-text-node thunks, and `parentCalls()` would have caught the
 * regression if a mount test had existed.
 *
 * **What it does NOT catch**: a parent that reads `signal()` directly
 * in its body (without a thunk) does NOT re-run on mutations,
 * because Pyreon components only subscribe to signals via reactive
 * scopes (`effect`, `computed`, JSX child accessors). Such a parent
 * captures the value at mount time and never updates — that's a
 * different bug, caught by asserting on the rendered DOM, not on
 * the parentCalls counter.
 *
 * @param factory - Component factory. Wrapped to count invocations.
 *                   Must return a VNodeChild (typically the result
 *                   of an `h(...)` call).
 * @param mutations - Synchronous function that performs N signal
 *                     mutations. Called AFTER initial mount.
 *
 * @example
 * ```ts
 * import { mountAndExpectOnce } from '@pyreon/test-utils'
 * import { signal } from '@pyreon/reactivity'
 * import { h } from '@pyreon/core'
 * import DocText from '../primitives/DocText'
 *
 * it('parent runs once across 5 signal mutations', () => {
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
 *   expect(parentCalls()).toBe(1)        // factory ran exactly once
 *   expect(container.textContent).toBe('Jordan')
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
    throw new Error(
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
        `  )\n`,
    )
  }
}
