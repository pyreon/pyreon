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
import { Fragment, h, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export { Fragment }

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

// ─── Component wrapping ──────────────────────────────────────────────────────

const _wrapperCache = new WeakMap<Function, ComponentFn>()

function wrapCompatComponent(reactComponent: Function): ComponentFn {
  let wrapped = _wrapperCache.get(reactComponent)
  if (wrapped) return wrapped

  // The wrapper returns a reactive accessor (() => VNodeChild) which Pyreon's
  // mountChild treats as a reactive expression via mountReactive.
  wrapped = ((props: Props) => {
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
    onUnmount(() => {
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

    // Return reactive accessor — Pyreon's mountChild calls mountReactive
    return () => {
      version() // tracked read — triggers re-execution when state changes
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
    // Native Pyreon components (e.g. context Provider) skip compat wrapping
    const NATIVE = Symbol.for('pyreon:native-compat')
    if ((type as unknown as Record<symbol, boolean>)[NATIVE]) {
      return h(type as ComponentFn, componentProps)
    }
    // Wrap React-style component for re-render support
    const wrapped = wrapCompatComponent(type)
    return h(wrapped, componentProps)
  }

  // DOM element or symbol (Fragment): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]

  // Map React-style attributes to standard HTML attributes
  if (typeof type === 'string') {
    if (propsWithKey.className !== undefined) {
      propsWithKey.class = propsWithKey.className
      delete propsWithKey.className
    }
    if (propsWithKey.htmlFor !== undefined) {
      propsWithKey.for = propsWithKey.htmlFor
      delete propsWithKey.htmlFor
    }

    // React's onChange fires on every keystroke for form elements (like onInput)
    if (
      (type === 'input' || type === 'textarea' || type === 'select') &&
      propsWithKey.onChange !== undefined
    ) {
      if (propsWithKey.onInput === undefined) {
        propsWithKey.onInput = propsWithKey.onChange
      }
      delete propsWithKey.onChange
    }

    // autoFocus → autofocus
    if (propsWithKey.autoFocus !== undefined) {
      propsWithKey.autofocus = propsWithKey.autoFocus
      delete propsWithKey.autoFocus
    }

    // defaultValue / defaultChecked → value / checked when no controlled value
    if (type === 'input' || type === 'textarea') {
      if (propsWithKey.defaultValue !== undefined && propsWithKey.value === undefined) {
        propsWithKey.value = propsWithKey.defaultValue
        delete propsWithKey.defaultValue
      }
      if (propsWithKey.defaultChecked !== undefined && propsWithKey.checked === undefined) {
        propsWithKey.checked = propsWithKey.defaultChecked
        delete propsWithKey.defaultChecked
      }
    }

    // Strip React-only props that have no DOM equivalent
    delete propsWithKey.suppressHydrationWarning
    delete propsWithKey.suppressContentEditableWarning
  }

  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

export const jsxs = jsx
export const jsxDEV = jsx
