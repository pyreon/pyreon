import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { effectScope, getContextOwner, registerSingleton, setContextOwner } from '@pyreon/reactivity'

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
// `_mountChild` is the compiler-facing entry (same underscore convention as
// `_setAttr` / `_setStyle` / `_applyProps`): the template emit appends an
// absorbed COMPONENT child with it when no static content follows, which is
// what lets that child skip the `<!>` placeholder `_mountSlot` needs. It is a
// thin wrapper over `mountChild` rather than an alias, because inside an
// ADOPTING bind the same call must HYDRATE the server's copy of that component
// instead of mounting a second one — see `template.ts`'s MOUNT HOLES section.
export { bindPolymorphicText, mountChild } from './mount'
export type { SanitizeFn } from './props'
export {
  applyAttrProp as _setAttr,
  applyClassProp as _setClass,
  applyProp,
  applyProps,
  // The compiled `<div {...props}>` template path lowers to `_applyProps`; it
  // must wire a spread `ref` (the h()/hydrate paths do it separately). See
  // `applyPropsWithRef`. Dynamic spreads (`{...make()}`) use `_bindSpread`.
  applyPropsWithRef as _applyProps,
  bindSpread as _bindSpread,
  // The "adjust foreign attributes" resolver. Exported so the parity test can
  // assert the table against the real HTML parser rather than restate it.
  foreignAttrNamespace,
  applyStyleProp as _setStyle,
  applyStyleOnce as _setStyleOnce,
  // `<input>`/`<textarea>` `value`: property assignment plus a first-time
  // `defaultValue` reflection, so a client-mounted form resets like a hydrated
  // one. Emitted by the compiler for those two tags only.
  applyValueProp as _setValue,
  // DOM-property bindings (`checked`, `disabled`, …): a function value is an
  // accessor, as on the h() path. `_setProp` runs inside a reactive binding;
  // `_setPropStatic` is the static-position form that binds a function live.
  applyDomProp as _setProp,
  applyDomPropStatic as _setPropStatic,
  // `dangerouslySetInnerHTML`: raw innerHTML assignment (developer owns
  // sanitization — same as React) with the hydration-adoption first-write
  // skip. Emitted by the compiler for every dangerouslySetInnerHTML binding
  // so the template path and the h() path share one sink.
  applyDangerousHtml as _setHtml,
  sanitizeHtml,
  setSanitizer,
} from './props'
export {
  _bindDirect,
  _bindText,
  _bindProp,
  _ref,
  _mountChild,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _rsCollapse,
  _rsCollapseDyn,
  _rsCollapseDynH,
  _rsCollapseH,
  _tpl,
  createTemplate,
} from './template'
export { _dispose2, _dispose3, _dispose4, _disposeN } from './dispose-helpers'
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
      '[Pyreon] [pyreon] mount() called with a null/undefined container. Make sure the element exists in the DOM, e.g. document.getElementById("app")',
    )
  }
  if (process.env.NODE_ENV !== 'production') {
    _countSink.__pyreon_count__?.('runtime.mount')
    installDevTools()
  }
  setupDelegation(container)
  container.innerHTML = ''
  // ROOT OWNER: a component becomes a context owner only on its first
  // `provide()`, so without one a tree with no provider above it would run
  // with NO owner. Every effect and binding captures the owner at setup and
  // restores it on re-run only when it was non-null, so such a re-run would
  // resolve `useContext()` (and mount components) under whatever owner
  // happened to be current when the scheduler fired — another subtree's
  // provider. A contextless root owner keeps "inside a mounted tree the owner
  // is never null" true. An owner that is already current (an island mounted
  // under a captured owner) is kept. Set and restored directly, not through a
  // callback: a closure over `root` would share this function's context with
  // the returned unmount closure and keep the root vnode (and its props)
  // alive for the app's lifetime.
  const prevOwner = getContextOwner()
  if (prevOwner === null) setContextOwner(effectScope())
  let unmount: () => void
  try {
    unmount = mountChild(root, container, null)
  } finally {
    setContextOwner(prevOwner)
  }
  return () => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.unmount')
    unmount()
  }
}
