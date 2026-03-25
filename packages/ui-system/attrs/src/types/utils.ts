import type { VNode } from "@pyreon/core"

// ─── Base Types ───────────────────────────────────────────────

export type TObj = Record<string, unknown>
export type TFn = (...args: any) => any
export type CallBackParam = TObj | TFn
export type DisplayName = string

/**
 * A Pyreon component function that accepts additional static properties.
 * In Pyreon, components are plain functions: (props: P) => VNode | null.
 */
export type ComponentFn<P = any> = ((props: P) => VNode | null) & Partial<Record<string, any>>

/**
 * An element type — either a Pyreon component function or an intrinsic tag string.
 */
export type ElementType<T extends TObj | unknown = any> = ComponentFn<T>

export type ValueOf<T> = T[keyof T]

export type ArrayOfValues<T> = T[keyof T]

export type ArrayOfKeys<T> = keyof T[]

/**
 * A HOC that wraps a component and merges additional props `P`
 * with the wrapped component's own props.
 */
export type SimpleHoc<P extends Record<string, unknown> = Record<string, unknown>> = <
  T extends ComponentFn<any>,
>(
  WrappedComponent: T,
) => ComponentFn<MergeTypes<[P, ExtractProps<T>]>>

/** Maps each key to `never` if the value is null, undefined, or false. */
type IsFalseOrNullable<T> = T extends null | undefined | false ? never : true
export type NullableKeys<T> = { [K in keyof T]: IsFalseOrNullable<T[K]> }

/** Unwraps a callback to its return type, or returns the object as-is. */
export type ReturnCbParam<P extends TFn | TObj> = P extends TFn ? ReturnType<P> : P

// ─── MergeTypes ───────────────────────────────────────────────
//
// Merges a tuple of object types left-to-right (like Object.assign),
// then strips keys whose values resolved to `never`, `null`, or `undefined`.
//
// Usage: MergeTypes<[BaseProps, ExtendedProps, OverrideProps]>
//
// This is the backbone of the chaining API — each `.attrs<P>()`
// call produces MergeTypes<[PreviousProps, P]> so later definitions
// override earlier ones while preserving the rest.
// ──────────────────────────────────────────────────────────────

/**
 * Forces TypeScript to expand/flatten a type for better IDE display.
 * Short-circuits for `any` — the mapped type would turn `any` into
 * `{ [x: string]: any; [x: number]: any; [x: symbol]: any }`, losing
 * its identity as `any` and breaking downstream type checks.
 */
type Id<T> = 0 extends 1 & T ? T : T extends infer U ? { [K in keyof U]: U[K] } : never

/**
 * Strips keys whose values are `never`, `null`, or `undefined`.
 * Uses tuple wrapping `[T[P]] extends [never]` to avoid distribution
 * over union types (a bare `T[P] extends never` would incorrectly
 * match union members).
 *
 * Short-circuits for `any` — the `as` clause in mapped types loses
 * index signatures, which would turn `any` into an empty type.
 */
type IsAny<T> = 0 extends 1 & T ? true : false

type ExtractNullableKeys<T> = 0 extends 1 & T
  ? T
  : {
      [P in keyof T as IsAny<T[P]> extends true
        ? P
        : [T[P]] extends [never]
          ? never
          : [T[P]] extends [null | undefined]
            ? never
            : P]: T[P]
    }

/** Merges two types: keeps all keys from L that don't exist in R, then adds all of R. */
type SpreadTwo<L, R> = Id<Pick<L, Exclude<keyof L, keyof R>> & R>

/** Recursively spreads a tuple of types left-to-right. */
type Spread<A extends readonly [...any]> = A extends [infer L, ...infer R]
  ? SpreadTwo<L, Spread<R>>
  : unknown

/** Recursively checks whether any element in the tuple is `any`. */
type _HasAny<A> = A extends [infer L, ...infer R] ? (0 extends 1 & L ? true : _HasAny<R>) : false

export type MergeTypes<A extends readonly [...any]> =
  _HasAny<A> extends true ? any : ExtractNullableKeys<Spread<A>>

// ─── ExtractProps ─────────────────────────────────────────────

/** Extracts the props type from a Pyreon component function. */
export type ExtractProps<TComponentOrTProps> =
  TComponentOrTProps extends ComponentFn<infer TProps> ? TProps : TComponentOrTProps
