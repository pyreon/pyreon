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
import { Fragment, h, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { Component } from './index'

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

// ─── Native component marker ────────────────────────────────────────────────

const NATIVE_COMPONENT = Symbol.for('pyreon:native-compat')

// ─── Class component detection ──────────────────────────────────────────────

function isClassComponent(type: Function): boolean {
  return type.prototype != null && typeof type.prototype.render === 'function'
}

// ─── Class component wrapping ───────────────────────────────────────────────

function wrapClassComponent(ClassComp: Function): ComponentFn {
  const wrapped = ((props: Props) => {
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
    onUnmount(() => {
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

    // Register cleanup for all hooks on unmount
    onUnmount(() => {
      ctx.unmounted = true
      for (const hook of ctx.hooks) {
        if (hook && typeof hook === 'object' && 'cleanup' in hook) {
          const entry = hook as EffectEntry
          if (typeof entry.cleanup === 'function') entry.cleanup()
        }
      }
    })

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
    const componentProps = children !== undefined ? { ...propsWithKey, children } : propsWithKey
    // Native Pyreon components (e.g. context Provider) skip compat wrapping
    if ((type as unknown as Record<symbol, boolean>)[NATIVE_COMPONENT]) {
      return h(type as ComponentFn, componentProps)
    }
    // Wrap Preact-style component for re-render support
    const wrapped = wrapCompatComponent(type)
    return h(wrapped, componentProps)
  }

  // DOM element or symbol (Fragment): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]

  // Map Preact-style attributes to standard HTML attributes
  if (typeof type === 'string') {
    if (propsWithKey.className !== undefined) {
      propsWithKey.class = propsWithKey.className
      delete propsWithKey.className
    }
    if (propsWithKey.htmlFor !== undefined) {
      propsWithKey.for = propsWithKey.htmlFor
      delete propsWithKey.htmlFor
    }

    // Preact's onChange fires on every keystroke for form elements (like onInput)
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

    // Strip Preact-only props that have no DOM equivalent
    delete propsWithKey.suppressHydrationWarning
  }

  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

export const jsxs = jsx
export const jsxDEV = jsx
