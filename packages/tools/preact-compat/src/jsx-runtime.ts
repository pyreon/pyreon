/**
 * Compat JSX runtime for Preact compatibility mode.
 *
 * When `jsxImportSource` is redirected to `@pyreon/preact-compat` (via the vite
 * plugin's `compat: "preact"` option), OXC rewrites JSX to import from this file.
 *
 * For component VNodes, we wrap the component function so it returns a reactive
 * accessor — enabling Preact-style re-renders on state change while Pyreon's
 * existing renderer handles all DOM work.
 */

import type { ComponentFn, Props, VNode, VNodeChild } from '@pyreon/core'
import { _compatProps, Fragment, h, isNativeCompat, mapCompatDomProps, onUnmount } from '@pyreon/core'
import { getCurrentScope, onScopeDispose, signal } from '@pyreon/reactivity'
import type { Component } from './index'

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
}

export interface EffectEntry {
  fn: () => (() => void) | void
  deps: unknown[] | undefined
  cleanup: (() => void) | undefined
}

let _currentCtx: RenderContext | null = null
let _hookIndex = 0

export function getCurrentCtx(): RenderContext | null {
  return _currentCtx
}

export function getHookIndex(): number {
  return _hookIndex++
}

export function beginRender(ctx: RenderContext): void {
  _currentCtx = ctx
  _hookIndex = 0
  ctx.pendingEffects = []
  ctx.pendingLayoutEffects = []
}

export function endRender(): void {
  _currentCtx = null
  _hookIndex = 0
}

// ─── Effect runners ──────────────────────────────────────────────────────────

function runLayoutEffects(entries: EffectEntry[]): void {
  for (const entry of entries) {
    /* v8 ignore next — defensive prior-cleanup guard */
    if (entry.cleanup) entry.cleanup()
    const cleanup = entry.fn()
    /* v8 ignore next — defensive cleanup-return typeof guard */
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

// ─── Class component detection ──────────────────────────────────────────────

function isClassComponent(type: Function): boolean {
  return type.prototype != null && typeof type.prototype.render === 'function'
}

// ─── Class component wrapping ───────────────────────────────────────────────

function wrapClassComponent(ClassComp: Function): ComponentFn {
  const wrapped = ((props: Props) => {
    // Third-party compat code may call props.hasOwnProperty — give the
    // (possibly null-prototype) Pyreon props object a normal prototype.
    props = _compatProps(props)
    const instance = new (ClassComp as new (props: Props) => Component)(props)
    const version = signal(0)
    let updateScheduled = false

    // Override setState to trigger re-render via version signal
    const origSetState = instance.setState.bind(instance)
    instance.setState = (partial: Partial<Record<string, unknown>>) => {
      origSetState(partial)
      if (!updateScheduled) {
        updateScheduled = true
        queueMicrotask(() => {
          updateScheduled = false
          version.set(version.peek() + 1)
        })
      }
    }

    // Override forceUpdate
    instance.forceUpdate = () => {
      version.set(version.peek() + 1)
    }

    // Lifecycle: componentWillUnmount
    let didMountFired = false
    onTeardown(() => {
      /* v8 ignore next 3 — defensive typeof componentWillUnmount guard */
      if (typeof instance.componentWillUnmount === 'function') {
        instance.componentWillUnmount()
      }
    })

    // Return reactive accessor for re-renders
    return () => {
      const ver = version() // track for re-renders
      instance.props = props // update props on re-render

      // shouldComponentUpdate only applies after mount (ver > 0 means setState/forceUpdate)
      if (didMountFired && ver > 0 && typeof instance.shouldComponentUpdate === 'function') {
        if (!instance.shouldComponentUpdate(props, instance.state)) {
          return instance._lastResult // skip render
        }
      }

      const result = instance.render()
      instance._lastResult = result

      // componentDidMount fires once after the initial render settles
      if (!didMountFired) {
        didMountFired = true
        if (typeof instance.componentDidMount === 'function') {
          queueMicrotask(() => instance.componentDidMount!())
        }
      } else if (ver > 0) {
        // componentDidUpdate only fires on explicit re-renders (setState/forceUpdate)
        if (typeof instance.componentDidUpdate === 'function') {
          queueMicrotask(() => instance.componentDidUpdate!())
        }
      }

      return result
    }
  }) as unknown as ComponentFn
  return wrapped
}

// ─── Component wrapping ──────────────────────────────────────────────────────

const _wrapperCache = new WeakMap<Function, ComponentFn>()

function wrapCompatComponent(preactComponent: Function): ComponentFn {
  let wrapped = _wrapperCache.get(preactComponent)
  if (wrapped) return wrapped

  // Handle class components (those with prototype.render)
  if (isClassComponent(preactComponent)) {
    wrapped = wrapClassComponent(preactComponent)
    _wrapperCache.set(preactComponent, wrapped)
    return wrapped
  }

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
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
    }

    const version = signal(0)
    let renderedVersion = 0
    let updateScheduled = false

    ctx.scheduleRerender = () => {
      /* v8 ignore next — defensive double-call guard */
      if (ctx.unmounted || updateScheduled) return
      updateScheduled = true
      queueMicrotask(() => {
        updateScheduled = false
        /* v8 ignore next — defensive deferred unmount check */
        if (!ctx.unmounted) version.set(version.peek() + 1)
      })
    }

    // Register cleanup for all hooks on unmount
    onTeardown(() => {
      ctx.unmounted = true
      for (const hook of ctx.hooks) {
        /* v8 ignore next 4 — defensive hook-shape narrowing */
        if (hook && typeof hook === 'object' && 'cleanup' in hook) {
          const entry = hook as EffectEntry
          if (typeof entry.cleanup === 'function') entry.cleanup()
        }
      }
    })

    // Return reactive accessor — Pyreon's mountChild calls mountReactive
    return () => {
      // tracked read — triggers re-execution when state changes
      const v = version()
      ctx._selfUpdate = v !== renderedVersion
      renderedVersion = v
      beginRender(ctx)
      const result = (preactComponent as ComponentFn)(props)
      const layoutEffects = ctx.pendingLayoutEffects
      const effects = ctx.pendingEffects
      endRender()

      runLayoutEffects(layoutEffects)
      scheduleEffects(ctx, effects)

      return result
    }
  }) as unknown as ComponentFn

  _wrapperCache.set(preactComponent, wrapped)
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
    // etc.) skip compat wrapping — see `@pyreon/core`'s `nativeCompat()` for the
    // full contract.
    if (isNativeCompat(type)) {
      return h(type as ComponentFn, componentProps)
    }
    // Wrap Preact-style component for re-render support
    const wrapped = wrapCompatComponent(type)
    return h(wrapped, componentProps)
  }

  // DOM element or symbol (Fragment): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]

  // Map Preact-style attributes to standard HTML attributes.
  // Shared with @pyreon/react-compat — see @pyreon/core/compat-shared.
  mapCompatDomProps(propsWithKey, type)

  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

export const jsxs = jsx

/**
 * The layer's element factory (``h` / `createElement``) — routed through {@link jsx} so a
 * component built with it gets exactly what a JSX-written one gets: the compat
 * wrapper (hooks run inside a render frame, state changes re-render), or the
 * component itself when it is marked `nativeCompat`. Handing a user component
 * to core's `h()` directly skipped the wrapper, so its hooks threw
 * "Hook called outside of a component render" or it never re-rendered.
 * `key` in `props` is passed as the key, and positional `children` win over
 * `props.children`, as in Preact.
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
