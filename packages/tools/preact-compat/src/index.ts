/**
 * @pyreon/preact-compat
 *
 * Preact-compatible API shim that runs on Pyreon's reactive engine.
 *
 * Provides the core Preact API surface: h, Fragment, render, hydrate,
 * Component class, PureComponent, createContext, createRef, cloneElement,
 * toChildArray, isValidElement, createPortal, lazy, Suspense, ErrorBoundary,
 * and the options hook object.
 *
 * For hooks, import from "@pyreon/preact-compat/hooks".
 * For signals, import from "@pyreon/preact-compat/signals".
 */

import type { ComponentFn, Props, VNode, VNodeChild } from '@pyreon/core'
import {
  createRef,
  ErrorBoundary,
  Fragment,
  lazy,
  nativeCompat,
  Portal,
  provide,
  Suspense,
  createContext as pyreonCreateContext,
  h as pyreonH,
  useContext,
} from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import { hydrateRoot, mount } from '@pyreon/runtime-dom'

// ─── Core JSX ────────────────────────────────────────────────────────────────

/** Preact's hyperscript function — maps directly to Pyreon's h() */
export { pyreonH as h }

/** Alias: Preact also exports createElement */
export const createElement = pyreonH

export { Fragment }

// ─── Render / Hydrate ────────────────────────────────────────────────────────

/**
 * Preact's `render(vnode, container)`.
 * Maps to Pyreon's `mount(vnode, container)`.
 */
export function render(vnode: VNodeChild, container: Element): void {
  mount(vnode, container)
}

/**
 * Preact's `hydrate(vnode, container)`.
 * Maps to Pyreon's `hydrateRoot(container, vnode)`.
 */
export function hydrate(vnode: VNodeChild, container: Element): void {
  hydrateRoot(container, vnode as VNode)
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface PreactContext<T> {
  readonly id: symbol
  readonly defaultValue: T
  Provider: ComponentFn<{ value: T; children?: VNodeChild }>
}

/**
 * Preact-compatible createContext — returns a context with a `.Provider` component.
 */
export function createContext<T>(defaultValue: T): PreactContext<T> {
  const ctx = pyreonCreateContext<T>(defaultValue)
  const Provider = ((props: { value: T; children?: VNodeChild }) => {
    provide(ctx, props.value)
    return props.children
  }) as ComponentFn<{ value: T; children?: VNodeChild }>
  // Mark as native so jsx() doesn't wrap it with wrapCompatComponent
  nativeCompat(Provider)
  return { ...ctx, Provider }
}

export { useContext }

// ─── Refs ────────────────────────────────────────────────────────────────────

export { createRef }

// ─── Component class ─────────────────────────────────────────────────────────

/**
 * Preact-compatible class-based Component.
 *
 * Wraps Pyreon's signal-based reactivity so `setState` triggers re-renders.
 * Usage: `class MyComp extends Component { render() { ... } }`
 */
export class Component<
  P extends Props = Props,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  props: P
  state: S
  _stateSignal: ReturnType<typeof signal<S>>
  _lastResult?: VNodeChild

  // Lifecycle methods (overridden by subclasses)
  componentDidMount?(): void
  componentDidUpdate?(): void
  componentWillUnmount?(): void
  shouldComponentUpdate?(nextProps: P, nextState: S): boolean

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
      const update =
        typeof partial === 'function' ? (partial as (prev: S) => Partial<S>)(current) : partial
      const next = { ...current, ...update } as S
      this.state = next
      this._stateSignal.set(next)
    })
  }

  /**
   * Force a re-render. In Pyreon this triggers the state signal to re-fire.
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

// ─── PureComponent ──────────────────────────────────────────────────────────

/**
 * Preact-compatible PureComponent — extends Component.
 * In Pyreon's compat layer this behaves identically to Component
 * (signal-based reactivity already avoids unnecessary re-renders).
 */
export class PureComponent<
  P extends Props = Props,
  S extends Record<string, unknown> = Record<string, unknown>,
> extends Component<P, S> {}

// ─── cloneElement ────────────────────────────────────────────────────────────

/**
 * Clone a VNode with merged props (like Preact's cloneElement).
 */
export function cloneElement(vnode: VNode, props?: Props, ...children: VNodeChild[]): VNode {
  const mergedProps = props ? { ...vnode.props, ...props } : { ...vnode.props }
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
type NestedChildren = VNodeChild | NestedChildren[]

export function toChildArray(children: NestedChildren): VNodeChild[] {
  const result: VNodeChild[] = []
  flatten(children, result)
  return result
}

function flatten(value: NestedChildren, out: VNodeChild[]): void {
  if (value == null || typeof value === 'boolean') return
  if (Array.isArray(value)) {
    for (const child of value) {
      flatten(child, out)
    }
  } else {
    out.push(value as VNodeChild)
  }
}

// ─── isValidElement ──────────────────────────────────────────────────────────

/**
 * Check if a value is a VNode (like Preact's isValidElement).
 */
export function isValidElement(x: unknown): x is VNode {
  return (
    x !== null &&
    typeof x === 'object' &&
    'type' in (x as Record<string, unknown>) &&
    'props' in (x as Record<string, unknown>) &&
    'children' in (x as Record<string, unknown>)
  )
}

// ─── createPortal ───────────────────────────────────────────────────────────

/**
 * Preact-compatible `createPortal(children, target)`.
 */
export function createPortal(children: VNodeChild, target: Element): VNodeChild {
  return Portal({ target, children })
}

// ─── Suspense / lazy / ErrorBoundary ─────────────────────────────────────────

export { ErrorBoundary, lazy, Suspense }

// ─── options ─────────────────────────────────────────────────────────────────

/**
 * Preact's plugin/hook system. Exposed as an empty object for compatibility
 * with libraries that check for `options._hook`, `options.vnode`, etc.
 */
export const options: Record<string, unknown> = {}

// ─── version ────────────────────────────────────────────────────────────────

export const version = '10.0.0-pyreon'
