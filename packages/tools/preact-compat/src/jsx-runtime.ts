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
import { Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

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
}

export interface EffectEntry {
  // biome-ignore lint/suspicious/noConfusingVoidType: matches Preact's effect signature
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

// ─── Component wrapping ──────────────────────────────────────────────────────

// biome-ignore lint/complexity/noBannedTypes: Function is needed for generic component wrapping
const _wrapperCache = new WeakMap<Function, ComponentFn>()

// biome-ignore lint/complexity/noBannedTypes: Function is needed for generic component wrapping
function wrapCompatComponent(preactComponent: Function): ComponentFn {
  let wrapped = _wrapperCache.get(preactComponent)
  if (wrapped) return wrapped

  // The wrapper returns a reactive accessor (() => VNodeChild) which Pyreon's
  // mountChild treats as a reactive expression via mountReactive.
  wrapped = ((props: Props) => {
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
    let updateScheduled = false

    ctx.scheduleRerender = () => {
      if (ctx.unmounted || updateScheduled) return
      updateScheduled = true
      queueMicrotask(() => {
        updateScheduled = false
        if (!ctx.unmounted) version.set(version.peek() + 1)
      })
    }

    // Return reactive accessor — Pyreon's mountChild calls mountReactive
    return () => {
      version() // tracked read — triggers re-execution when state changes
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

// ─── JSX functions ───────────────────────────────────────────────────────────

export function jsx(
  type: string | ComponentFn | symbol,
  props: Props & { children?: VNodeChild | VNodeChild[] },
  key?: string | number | null,
): VNode {
  const { children, ...rest } = props
  const propsWithKey = (key != null ? { ...rest, key } : rest) as Props

  if (typeof type === 'function') {
    // Wrap Preact-style component for re-render support
    const wrapped = wrapCompatComponent(type)
    const componentProps = children !== undefined ? { ...propsWithKey, children } : propsWithKey
    return h(wrapped, componentProps)
  }

  // DOM element or symbol (Fragment): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]

  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

export const jsxs = jsx
export const jsxDEV = jsx
