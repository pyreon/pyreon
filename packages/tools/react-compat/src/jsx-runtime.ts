/**
 * Compat JSX runtime for React compatibility mode.
 *
 * When `jsxImportSource` is set to `@pyreon/react-compat` (via the vite plugin's
 * `compat: "react"` option), OXC rewrites JSX to import from this file:
 *   <div className="x" />  →  jsx("div", { className: "x" })
 *
 * For component VNodes, we wrap the component function so it returns a reactive
 * accessor — enabling React-style re-renders on state change while Pyreon's
 * existing renderer handles all DOM work.
 */

import type { ComponentFn, Props, VNode, VNodeChild } from '@pyreon/core'
import { _compatProps, Fragment, h, isNativeCompat, mapCompatDomProps, onUnmount } from '@pyreon/core'
import { getCurrentScope, onScopeDispose, signal } from '@pyreon/reactivity'

export { Fragment }

/**
 * Register teardown on the component's SCOPE when there is one. `mount.ts`
 * stops a component's scope BEFORE tearing down its subtree, so scope
 * callbacks run parent-before-child — React's (and Preact's) unmount order for
 * effect cleanups and `componentWillUnmount`. `onUnmount` hooks run after the
 * subtree, i.e. child-before-parent, which is what this used to use.
 */
function onTeardown(fn: () => void): void {
  if (getCurrentScope()) onScopeDispose(fn)
  else onUnmount(fn)
}

// ─── Render context (used by hooks) ──────────────────────────────────────────

export interface RenderContext {
  hooks: unknown[]
  scheduleRerender: () => void
  /** Insertion effect entries pending execution before layout effects */
  pendingInsertionEffects: EffectEntry[]
  /** Effect entries pending execution after render */
  pendingEffects: EffectEntry[]
  /** Layout effect entries pending execution after render */
  pendingLayoutEffects: EffectEntry[]
  /** Set to true when the component is unmounted */
  unmounted: boolean
  /**
   * True while a render runs because the component itself asked for it (a
   * `useState` setter, `dispatch`, a context change, an external store). `memo`
   * reads it: React never skips such a render, only a parent-driven one whose
   * props are shallow-equal.
   */
  _selfUpdate?: boolean
  /** Hook count from the previous render (dev-mode ordering guard) */
  _hookCount?: number
}

export interface EffectEntry {
  fn: () => (() => void) | void
  deps: unknown[] | undefined
  cleanup: (() => void) | undefined
}

let _currentCtx: RenderContext | null = null
let _hookIndex = 0
let _expectedHookCount = -1

export function getCurrentCtx(): RenderContext | null {
  return _currentCtx
}

export function getHookIndex(): number {
  return _hookIndex++
}

/**
 * A render that bails out part-way (`memo` returning its cached result) skips
 * the hooks the component would have called. Advance the index past them so
 * the dev hook-order check does not report a conditional hook that is not one.
 */
export function skipRemainingHooks(): void {
  if (_currentCtx && _currentCtx._hookCount !== undefined && _currentCtx._hookCount > _hookIndex) {
    _hookIndex = _currentCtx._hookCount
  }
}

export function beginRender(ctx: RenderContext): void {
  _currentCtx = ctx
  _hookIndex = 0
  ctx.pendingInsertionEffects = []
  ctx.pendingEffects = []
  ctx.pendingLayoutEffects = []

  // On re-renders, remember the hook count from last render
  if (ctx._hookCount !== undefined) {
    _expectedHookCount = ctx._hookCount
  } else {
    _expectedHookCount = -1
  }
}

export function endRender(): void {
  if (_currentCtx) {
    // Dev-mode: check hook count matches expected
    /* v8 ignore next 9 — dev-mode hook-count mismatch warning; only fires on bad consumer code */
    if (
      process.env.NODE_ENV !== 'production' &&
      _expectedHookCount !== -1 &&
      _hookIndex !== _expectedHookCount
    ) {
      console.error(
        `[Pyreon] Hook count changed between renders (expected ${_expectedHookCount}, got ${_hookIndex}). ` +
          `This usually means a hook is called conditionally. Hooks must be called in the same order every render.`,
      )
    }
    _currentCtx._hookCount = _hookIndex
  }
  _currentCtx = null
  _hookIndex = 0
}

// ─── Effect runners ──────────────────────────────────────────────────────────

function runLayoutEffects(entries: EffectEntry[]): void {
  for (const entry of entries) {
    if (entry.cleanup) entry.cleanup()
    const cleanup = entry.fn()
    entry.cleanup = typeof cleanup === 'function' ? cleanup : undefined
  }
}

function scheduleEffects(ctx: RenderContext, entries: EffectEntry[]): void {
  /* v8 ignore next — defensive empty-entries guard */
  if (entries.length === 0) return
  queueMicrotask(() => {
    for (const entry of entries) {
      /* v8 ignore next — defensive unmounted check during deferred effect */
      if (ctx.unmounted) return
      if (entry.cleanup) entry.cleanup()
      const cleanup = entry.fn()
      entry.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  })
}

// ─── Component wrapping ──────────────────────────────────────────────────────

const _wrapperCache = new WeakMap<Function, ComponentFn>()

function wrapCompatComponent(reactComponent: Function): ComponentFn {
  let wrapped = _wrapperCache.get(reactComponent)
  if (wrapped) return wrapped

  // The wrapper returns a reactive accessor (() => VNodeChild) which Pyreon's
  // mountChild treats as a reactive expression via mountReactive.
  wrapped = ((props: Props) => {
    // Third-party compat code may call props.hasOwnProperty — give the
    // (possibly null-prototype) Pyreon props object a normal prototype.
    props = _compatProps(props)
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {
        // Will be replaced below after version signal is created
      },
      pendingInsertionEffects: [],
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
    }

    const version = signal(0)
    let renderedVersion = 0
    let updateScheduled = false

    ctx.scheduleRerender = () => {
      if (ctx.unmounted || updateScheduled) return
      updateScheduled = true
      queueMicrotask(() => {
        updateScheduled = false
        if (!ctx.unmounted) version.set(version.peek() + 1)
      })
    }

    // Register cleanup for all hooks on unmount
    /* v8 ignore start — defensive cleanup combinations over hook types; structurally exercised but counted per-branch */
    onTeardown(() => {
      ctx.unmounted = true
      for (const hook of ctx.hooks) {
        if (hook && typeof hook === 'object' && 'cleanup' in hook) {
          const entry = hook as EffectEntry
          if (typeof entry.cleanup === 'function') entry.cleanup()
        }
        if (hook && typeof hook === 'object' && 'unsubscribe' in hook) {
          const sub = hook as { unsubscribe?: () => void }
          if (typeof sub.unsubscribe === 'function') sub.unsubscribe()
        }
        if (hook && typeof hook === 'object' && '_contextUnsub' in hook) {
          const ctxHook = hook as { _contextUnsub?: () => void }
          if (typeof ctxHook._contextUnsub === 'function') ctxHook._contextUnsub()
        }
      }
    })
    /* v8 ignore stop */

    // Return reactive accessor — Pyreon's mountChild calls mountReactive
    return () => {
      // tracked read — triggers re-execution when state changes
      const v = version()
      ctx._selfUpdate = v !== renderedVersion
      renderedVersion = v
      beginRender(ctx)
      const result = (reactComponent as ComponentFn)(props)
      const insertionEffects = ctx.pendingInsertionEffects
      const layoutEffects = ctx.pendingLayoutEffects
      const effects = ctx.pendingEffects
      endRender()

      // Run in React's order: insertion → layout → passive
      runLayoutEffects(insertionEffects)
      runLayoutEffects(layoutEffects)
      scheduleEffects(ctx, effects)

      return result
    }
  }) as unknown as ComponentFn

  _wrapperCache.set(reactComponent, wrapped)
  return wrapped
}

/**
 * The component a compat `lazy()` should mount once its chunk resolves: the
 * compat wrapper for a framework-style component (so hooks run inside a render
 * frame), or the component itself when it is marked `nativeCompat`. Exactly
 * the choice `jsx()` makes — a lazy's loaded component must get the same
 * treatment it would have got written as JSX, or its hooks throw
 * "Hook called outside of a component render".
 */
export function toCompatComponent<P extends object>(component: ComponentFn<P>): ComponentFn<P> {
  return isNativeCompat(component)
    ? component
    : (wrapCompatComponent(component) as unknown as ComponentFn<P>)
}

// ─── JSX functions ───────────────────────────────────────────────────────────

export function jsx(
  type: string | ComponentFn | symbol,
  props: Props & { children?: VNodeChild | VNodeChild[] },
  key?: string | number | null,
): VNode {
  const { children, ...rest } = props
  const propsWithKey = (key != null ? { ...rest, key } : rest) as Props

  if (typeof type === 'function') {
    const componentProps = children !== undefined ? { ...propsWithKey, children } : propsWithKey
    // Native Pyreon components (context Provider, RouterView, QueryClientProvider,
    // etc.) skip compat wrapping — they manage their own reactivity via signals
    // and Pyreon's lifecycle, and wrapping them would run their setup body inside
    // the compat layer's render context instead of Pyreon's, breaking `provide()`,
    // `onMount()`, and `onUnmount()`.
    if (isNativeCompat(type)) {
      return h(type as ComponentFn, componentProps)
    }
    // Wrap React-style component for re-render support
    const wrapped = wrapCompatComponent(type)
    return h(wrapped, componentProps)
  }

  // DOM element or symbol (Fragment): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]

  // Map React-style attributes to standard HTML attributes.
  // Shared with @pyreon/preact-compat — see @pyreon/core/compat-shared.
  mapCompatDomProps(propsWithKey, type)

  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

export const jsxs = jsx

/**
 * The layer's element factory (``createElement` / `h``) — routed through {@link jsx} so a
 * component built with it gets exactly what a JSX-written one gets: the compat
 * wrapper (hooks run inside a render frame, state changes re-render), or the
 * component itself when it is marked `nativeCompat`. Handing a user component
 * to core's `h()` directly skipped the wrapper, so its hooks threw
 * "Hook called outside of a component render" or it never re-rendered.
 * `key` in `props` is passed as the key, and positional `children` win over
 * `props.children`, as in React.
 */
export function createElement(
  type: string | ComponentFn | symbol,
  props?: (Props & { key?: string | number | null }) | null,
  ...children: VNodeChild[]
): VNode {
  const { key, ...rest } = (props ?? {}) as Props & { key?: string | number | null }
  const merged = rest as Props & { children?: VNodeChild | VNodeChild[] }
  if (children.length > 0) merged.children = children.length === 1 ? children[0] : children
  return jsx(type, merged, key ?? null)
}
export const jsxDEV = jsx
