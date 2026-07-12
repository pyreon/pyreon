import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/runtime-dom
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export type { BoundReactiveNode } from './binding-registry'
export { nodesForElement } from './binding-registry'
export { DELEGATED_EVENTS, delegatedPropName, setupDelegation } from './delegate'
export type { DevtoolsComponentEntry, PyreonDevtools } from './devtools'
export { hydrateRoot } from './hydrate'
export type {
  HydrationMismatchContext,
  HydrationMismatchHandler,
  HydrationMismatchType,
} from './hydration-debug'
export {
  disableHydrationWarnings,
  enableHydrationWarnings,
  onHydrationMismatch,
} from './hydration-debug'
export type { KeepAliveProps } from './keep-alive'
export { KeepAlive } from './keep-alive'
export { bindPolymorphicText, mountChild } from './mount'
export type { SanitizeFn } from './props'
export {
  applyClassProp as _setClass,
  applyProp,
  applyProps,
  applyProps as _applyProps,
  applyStyleProp as _setStyle,
  sanitizeHtml,
  setSanitizer,
} from './props'
export {
  _bindDirect,
  _bindText,
  _mountSlot,
  _setChild,
  _setChildAt,
  _rsCollapse,
  _rsCollapseDyn,
  _rsCollapseDynH,
  _rsCollapseH,
  _tpl,
  createTemplate,
} from './template'
export type { TransitionProps } from './transition'
export { Transition } from './transition'
export type { TransitionGroupProps } from './transition-group'
export { TransitionGroup } from './transition-group'

import type { VNodeChild } from '@pyreon/core'
import { setupDelegation } from './delegate'
import { installDevTools } from './devtools'
import { mountChild } from './mount'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Mount a VNode tree into a container element.
 * Clears the container's existing content first (`container.innerHTML = ''`),
 * then mounts the given child.
 *
 * Returns an `unmount` function that:
 *   1. Disposes all reactive effects + lifecycle hooks registered during mount.
 *   2. Removes the root mounted nodes from the container.
 *
 * **Caveats (read before asserting on post-unmount DOM):**
 * - `unmount()` does NOT reset the container to its pre-mount state.
 *   If your test asserts `container.textContent === ''` post-unmount,
 *   the assertion can fail for shapes that leave structural anchor
 *   comments (For/Suspense markers, fragment boundaries). The framework
 *   contract is "the mounted subtree's roots are removed and reactive
 *   work stops" — not "the container becomes pristine."
 * - For cleanup-sensitive tests, run `container.innerHTML = ''` AFTER
 *   `unmount()` if you need a guaranteed-empty container.
 *
 * @example
 * const unmount = mount(h("div", null, "Hello Pyreon"), document.getElementById("app")!)
 * // later:
 * unmount()
 */
export function mount(root: VNodeChild, container: Element): () => void {
  if (process.env.NODE_ENV !== 'production' && container == null) {
    throw new Error(
      '[pyreon] mount() called with a null/undefined container. Make sure the element exists in the DOM, e.g. document.getElementById("app")',
    )
  }
  if (process.env.NODE_ENV !== 'production') {
    _countSink.__pyreon_count__?.('runtime.mount')
    installDevTools()
  }
  setupDelegation(container)
  container.innerHTML = ''
  const unmount = mountChild(root, container, null)
  return () => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.unmount')
    unmount()
  }
}

/** Alias for `mount` */
export const render = mount
