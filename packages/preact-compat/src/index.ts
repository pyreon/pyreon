/**
 * @pyreon/preact-compat
 *
 * Preact-compatible API shim that runs on Nova's reactive engine.
 *
 * Provides the core Preact API surface: h, Fragment, render, hydrate,
 * Component class, createContext, createRef, cloneElement, toChildArray,
 * isValidElement, and the options hook object.
 *
 * For hooks, import from "@pyreon/preact-compat/hooks".
 * For signals, import from "@pyreon/preact-compat/signals".
 */

import { h as novaH, Fragment } from "@pyreon/core"
import type { VNode, VNodeChild, Props, ComponentFn } from "@pyreon/core"
import { createContext, useContext, createRef } from "@pyreon/core"
import { mount } from "@pyreon/runtime-dom"
import { hydrateRoot } from "@pyreon/runtime-dom"
import { signal, batch } from "@pyreon/reactivity"

// ─── Core JSX ────────────────────────────────────────────────────────────────

/** Preact's hyperscript function — maps directly to Nova's h() */
export { novaH as h }

/** Alias: Preact also exports createElement */
export const createElement = novaH

export { Fragment }

// ─── Render / Hydrate ────────────────────────────────────────────────────────

/**
 * Preact's `render(vnode, container)`.
 * Maps to Nova's `mount(vnode, container)`.
 */
export function render(vnode: VNodeChild, container: Element): void {
  mount(vnode, container)
}

/**
 * Preact's `hydrate(vnode, container)`.
 * Maps to Nova's `hydrateRoot(container, vnode)`.
 */
export function hydrate(vnode: VNodeChild, container: Element): void {
  hydrateRoot(container, vnode as VNode)
}

// ─── Context ─────────────────────────────────────────────────────────────────

export { createContext, useContext }

// ─── Refs ────────────────────────────────────────────────────────────────────

export { createRef }

// ─── Component class ─────────────────────────────────────────────────────────

/**
 * Preact-compatible class-based Component.
 *
 * Wraps Nova's signal-based reactivity so `setState` triggers re-renders.
 * Usage: `class MyComp extends Component { render() { ... } }`
 */
export class Component<P extends Props = Props, S extends Record<string, unknown> = Record<string, unknown>> {
  props: P
  state: S
  private _stateSignal: ReturnType<typeof signal<S>>
  private _mounted = false

  constructor(props: P) {
    this.props = props
    this.state = {} as S
    this._stateSignal = signal<S>(this.state)
  }

  /**
   * Update state — accepts a partial state object or an updater function.
   * Merges into existing state (shallow merge, like Preact/React).
   */
  setState(partial: Partial<S> | ((prev: S) => Partial<S>)): void {
    batch(() => {
      const current = this._stateSignal()
      const update = typeof partial === "function" ? (partial as (prev: S) => Partial<S>)(current) : partial
      const next = { ...current, ...update } as S
      this.state = next
      this._stateSignal.set(next)
    })
  }

  /**
   * Force a re-render. In Nova this triggers the state signal to re-fire.
   */
  forceUpdate(): void {
    this._stateSignal.set({ ...this.state })
  }

  /**
   * Override in subclass to return VNode tree.
   */
  render(): VNodeChild {
    return null
  }
}

// ─── cloneElement ────────────────────────────────────────────────────────────

/**
 * Clone a VNode with merged props (like Preact's cloneElement).
 */
export function cloneElement(vnode: VNode, props?: Props, ...children: VNodeChild[]): VNode {
  const mergedProps = { ...vnode.props, ...(props ?? {}) }
  const mergedChildren = children.length > 0 ? children : vnode.children
  return {
    type: vnode.type,
    props: mergedProps,
    children: mergedChildren,
    key: (props?.key as string | number | null) ?? vnode.key,
  }
}

// ─── toChildArray ────────────────────────────────────────────────────────────

/**
 * Flatten children into a flat array, filtering out null/undefined/boolean.
 * Matches Preact's `toChildArray` utility.
 */
export function toChildArray(children: VNodeChild | VNodeChild[]): VNodeChild[] {
  const result: VNodeChild[] = []
  flatten(children, result)
  return result
}

function flatten(value: VNodeChild | VNodeChild[], out: VNodeChild[]): void {
  if (value == null || typeof value === "boolean") return
  if (Array.isArray(value)) {
    for (const child of value) {
      flatten(child as VNodeChild, out)
    }
  } else {
    out.push(value)
  }
}

// ─── isValidElement ──────────────────────────────────────────────────────────

/**
 * Check if a value is a VNode (like Preact's isValidElement).
 */
export function isValidElement(x: unknown): x is VNode {
  return (
    x !== null &&
    typeof x === "object" &&
    "type" in (x as Record<string, unknown>) &&
    "props" in (x as Record<string, unknown>) &&
    "children" in (x as Record<string, unknown>)
  )
}

// ─── options ─────────────────────────────────────────────────────────────────

/**
 * Preact's plugin/hook system. Exposed as an empty object for compatibility
 * with libraries that check for `options._hook`, `options.vnode`, etc.
 */
export const options: Record<string, unknown> = {}
