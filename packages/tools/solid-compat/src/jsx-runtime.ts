/**
 * Compat JSX runtime for SolidJS compatibility mode.
 *
 * When `jsxImportSource` is redirected to `@pyreon/solid-compat` (via the vite
 * plugin's `compat: "solid"` option), OXC rewrites JSX to import from this file.
 *
 * For component VNodes, we wrap the component function so it returns a reactive
 * accessor — enabling Solid-style re-renders on state change while Pyreon's
 * existing renderer handles all DOM work.
 *
 * The component body runs inside `runUntracked` to prevent signal reads (from
 * createSignal getters) from being tracked by the reactive accessor. Only the
 * version signal triggers re-renders.
 *
 * ## Child instance preservation
 *
 * When a parent component re-renders, mountReactive does a full teardown+rebuild
 * of the DOM tree. Without preservation, child components get brand new
 * RenderContexts with empty hooks arrays — causing `onMount` and `onCleanup`
 * to fire again, which can trigger infinite re-render loops.
 *
 * To fix this, we store child RenderContexts in the parent's hooks array (indexed
 * by the parent's hook counter). When the child wrapper is called again after a
 * parent re-render, it reuses the existing ctx (preserving hooks state), so
 * hook-indexed guards like `if (idx >= ctx.hooks.length) return` work correctly
 * and lifecycle hooks don't re-fire.
 */

import type { ComponentFn, Props, VNode, VNodeChild } from '@pyreon/core'
import {
  ErrorBoundary,
  For,
  Fragment,
  h,
  Match,
  onUnmount,
  Show,
  Suspense,
  Switch,
} from '@pyreon/core'
import { runUntracked, signal } from '@pyreon/reactivity'

export { Fragment }

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
  /** Callbacks to run on unmount (lifecycle + effect cleanups) */
  unmountCallbacks: (() => void)[]
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
    if (entry.cleanup) entry.cleanup()
    const cleanup = entry.fn()
    entry.cleanup = typeof cleanup === 'function' ? cleanup : undefined
  }
}

function scheduleEffects(ctx: RenderContext, entries: EffectEntry[]): void {
  if (entries.length === 0) return
  queueMicrotask(() => {
    for (const entry of entries) {
      if (ctx.unmounted) return
      if (entry.cleanup) entry.cleanup()
      const cleanup = entry.fn()
      entry.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  })
}

// ─── Child instance preservation ─────────────────────────────────────────────

/** Stored in the parent's hooks array to preserve child state across re-renders */
interface ChildInstance {
  ctx: RenderContext
  version: ReturnType<typeof signal<number>>
  updateScheduled: boolean
}

// Internal prop keys for passing parent context info to child wrappers
const _CHILD_INSTANCE = Symbol.for('pyreon.childInstance')
const noop = () => {
  /* noop */
}

// ─── Component wrapping ──────────────────────────────────────────────────────

const _wrapperCache = new WeakMap<Function, ComponentFn>()

// Pyreon core components that must NOT be wrapped — they rely on internal reactivity
const _nativeComponents: Set<Function> = new Set([
  Show,
  For,
  Switch,
  Match,
  Suspense,
  ErrorBoundary,
])

function wrapCompatComponent(solidComponent: Function): ComponentFn {
  if (_nativeComponents.has(solidComponent)) return solidComponent as ComponentFn

  let wrapped = _wrapperCache.get(solidComponent)
  if (wrapped) return wrapped

  // The wrapper returns a reactive accessor (() => VNodeChild) which Pyreon's
  // mountChild treats as a reactive expression via mountReactive.
  wrapped = ((props: Props) => {
    // Check for a preserved child instance from the parent's hooks
    const existing = (props as Record<symbol, unknown>)[_CHILD_INSTANCE] as
      | ChildInstance
      | undefined

    const ctx: RenderContext = existing?.ctx ?? {
      hooks: [],
      scheduleRerender: () => {
        // Will be replaced below after version signal is created
      },
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }

    // When reusing an existing ctx after parent re-render, reset unmounted flag
    // and clear stale unmount callbacks (they belong to the previous mount cycle)
    if (existing) {
      ctx.unmounted = false
      ctx.unmountCallbacks = []
    }

    const version = existing?.version ?? signal(0)

    // Use a shared updateScheduled flag (preserved across parent re-renders)
    let updateScheduled = existing?.updateScheduled ?? false

    ctx.scheduleRerender = () => {
      if (ctx.unmounted || updateScheduled) return
      updateScheduled = true
      queueMicrotask(() => {
        updateScheduled = false
        if (!ctx.unmounted) version.set(version.peek() + 1)
      })
    }

    // Register cleanup when component unmounts
    onUnmount(() => {
      ctx.unmounted = true
      for (const cb of ctx.unmountCallbacks) cb()
    })

    // Strip the internal prop before passing to the component
    const { [_CHILD_INSTANCE]: _stripped, ...cleanProps } = props as Record<
      string | symbol,
      unknown
    >

    // Return reactive accessor — Pyreon's mountChild calls mountReactive
    return () => {
      version() // tracked read — triggers re-execution when state changes
      beginRender(ctx)
      // runUntracked prevents signal reads (from createSignal getters) from
      // being tracked by this accessor — only the version signal should trigger re-renders
      const result = runUntracked(() => (solidComponent as ComponentFn)(cleanProps as Props))
      const layoutEffects = ctx.pendingLayoutEffects
      const effects = ctx.pendingEffects
      endRender()

      runLayoutEffects(layoutEffects)
      scheduleEffects(ctx, effects)

      return result
    }
  }) as unknown as ComponentFn

  // Forward __loading from lazy components so Pyreon's Suspense can detect them
  if ('__loading' in solidComponent) {
    ;(wrapped as unknown as Record<string, unknown>).__loading = (
      solidComponent as unknown as Record<string, unknown>
    ).__loading
  }

  _wrapperCache.set(solidComponent, wrapped)
  return wrapped
}

// ─── Child instance lookup ───────────────────────────────────────────────────

function createChildInstance(): ChildInstance {
  return {
    ctx: {
      hooks: [],
      scheduleRerender: noop,
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    },
    version: signal(0),
    updateScheduled: false,
  }
}

/**
 * During a parent component render, get or create the child instance at the
 * current hook index. Returns undefined when called outside a component render.
 */
function resolveChildInstance(): ChildInstance | undefined {
  const parentCtx = _currentCtx
  if (!parentCtx) return undefined

  const idx = _hookIndex++
  if (idx < parentCtx.hooks.length) {
    return parentCtx.hooks[idx] as ChildInstance
  }
  const instance = createChildInstance()
  parentCtx.hooks[idx] = instance
  return instance
}

// ─── JSX functions ───────────────────────────────────────────────────────────

// Tag used by compat context Providers to skip compat wrapping
const _NATIVE_COMPAT = Symbol.for('pyreon:native-compat')

export function jsx(
  type: string | ComponentFn | symbol,
  props: Props & { children?: VNodeChild | VNodeChild[] },
  key?: string | number | null,
): VNode {
  const { children, ...rest } = props
  const propsWithKey = (key != null ? { ...rest, key } : rest) as Props

  if (typeof type === 'function') {
    if (_nativeComponents.has(type)) {
      const componentProps = children !== undefined ? { ...propsWithKey, children } : propsWithKey
      return h(type as ComponentFn, componentProps)
    }

    // Native compat components (e.g. context Providers) skip compat wrapping
    if ((type as unknown as Record<symbol, boolean>)[_NATIVE_COMPAT]) {
      const componentProps = children !== undefined ? { ...propsWithKey, children } : propsWithKey
      return h(type as ComponentFn, componentProps)
    }

    const wrapped = wrapCompatComponent(type)
    const componentProps =
      children !== undefined ? { ...propsWithKey, children } : { ...propsWithKey }

    const childInstance = resolveChildInstance()
    if (childInstance) {
      ;(componentProps as Record<symbol, unknown>)[_CHILD_INSTANCE] = childInstance
    }

    return h(wrapped, componentProps)
  }

  // DOM element or symbol (Fragment): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]

  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

export const jsxs = jsx
export const jsxDEV = jsx
