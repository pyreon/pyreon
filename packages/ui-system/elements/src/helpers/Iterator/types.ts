import type { ComponentFn, VNodeChild } from '@pyreon/core'
import type { HTMLTags } from '@pyreon/ui-core'

export type MaybeNull = undefined | null
export type TObj = Record<string, unknown>
export type SimpleValue = string | number
export type ObjectValue = Partial<{
  id: SimpleValue
  key: SimpleValue
  itemId: SimpleValue
  component: ElementType
}> &
  Record<string, unknown>

export type ElementType<T extends Record<string, unknown> = any> = ComponentFn<T> | HTMLTags

export type ExtendedProps = {
  index: number
  first: boolean
  last: boolean
  odd: boolean
  even: boolean
  position: number
}

// ---------------------------------------------------------------------------
// Per-mode prop shapes — narrowed via the `T` data-element type
// ---------------------------------------------------------------------------

/**
 * Iterator over an array of strings/numbers. Each item is wrapped in
 * `{ [valueName]: item }` and that object is what callbacks see + what's
 * spread onto the rendered component.
 */
export type SimpleProps<T extends SimpleValue> = {
  data: Array<T | MaybeNull>
  /** A component to be rendered per item. */
  component: ElementType
  /**
   * Key under which each primitive value is exposed to `component` and
   * callbacks. Defaults to `'children'` at runtime — i.e. the value is
   * passed to the component as its children.
   */
  valueName?: string
  /** Optional wrapper around each item. */
  wrapComponent?: ElementType
  /** Stable key per item (defaults to index). */
  itemKey?: (item: T, index: number) => SimpleValue
  /** Extra props merged onto the rendered component, optionally per-item. */
  itemProps?: TObj | ((item: { [k: string]: T }, ext: ExtendedProps) => TObj)
  /** Extra props merged onto the wrapper, optionally per-item. */
  wrapProps?: TObj | ((item: { [k: string]: T }, ext: ExtendedProps) => TObj)
  children?: never
}

/**
 * Iterator over an array of objects. Each item is spread onto the rendered
 * component as props. Per-item `component` overrides also work — when an
 * item carries its own `component` field, the wrapper is bypassed.
 */
export type ObjectProps<T extends ObjectValue> = {
  data: Array<T | MaybeNull>
  /** Default component to be rendered per item (item-level `component` overrides). */
  component: ElementType
  /** `valueName` is meaningless when iterating objects — TS forbids it. */
  valueName?: never
  /** Optional wrapper around each item. */
  wrapComponent?: ElementType
  /** Stable key per item — pick a key from the item, or compute it. */
  itemKey?: keyof T | ((item: T, index: number) => SimpleValue)
  /** Extra props merged onto the rendered component, optionally per-item. */
  itemProps?: TObj | ((item: T, ext: ExtendedProps) => TObj)
  /** Extra props merged onto the wrapper, optionally per-item. */
  wrapProps?: TObj | ((item: T, ext: ExtendedProps) => TObj)
  children?: never
}

/**
 * Iterator over `children` — no `data`/`component`. Each child gets
 * positional metadata via `itemProps` and an optional `wrapComponent`.
 */
export type ChildrenProps = {
  children: VNodeChild
  data?: never
  component?: never
  valueName?: never
  itemKey?: never
  wrapComponent?: ElementType
  itemProps?: TObj | ((_: Record<string, never>, ext: ExtendedProps) => TObj)
  wrapProps?: TObj | ((_: Record<string, never>, ext: ExtendedProps) => TObj)
}

// ---------------------------------------------------------------------------
// Loose backward-compatible fallback shape (today's behavior)
//
// Used when callers don't (or can't) parameterize `Props<T>` — keeps the
// existing call surface intact so this refactor lands non-breaking.
// ---------------------------------------------------------------------------

export type PropsCallback =
  | TObj
  | ((
      itemProps: Record<string, never> | Record<string, SimpleValue> | ObjectValue,
      extendedProps: ExtendedProps,
    ) => TObj)

export type LooseProps = Partial<{
  children: VNodeChild
  data: Array<SimpleValue | ObjectValue | MaybeNull>
  component: ElementType
  valueName: string
  wrapComponent: ElementType
  itemProps: PropsCallback
  wrapProps: PropsCallback
  itemKey:
    | keyof ObjectValue
    | ((item: SimpleValue | Omit<ObjectValue, 'component'>, index: number) => SimpleValue)
}>

// ---------------------------------------------------------------------------
// Public, generic-aware Props<T>
//
//   Props<string>          → SimpleProps<string>     (valueName REQUIRED)
//   Props<{ id; name }>    → ObjectProps<{...}>      (valueName FORBIDDEN)
//   Props<unknown> / Props → LooseProps              (today's behavior)
//
// `unknown extends T` is the canonical "did the caller actually narrow T?"
// check — true only when T is left as `unknown`, false for any concrete
// narrowing. Fallback to LooseProps preserves existing call sites.
// ---------------------------------------------------------------------------

export type Props<T = unknown> = unknown extends T
  ? LooseProps
  : T extends SimpleValue
    ? SimpleProps<T>
    : T extends ObjectValue
      ? ObjectProps<T>
      : ChildrenProps
