import type { VNodeChild } from '@pyreon/core'

export type TObj = Record<string, unknown>
export type TFn = (...args: any) => any
export type CallBackParam = TObj | TFn
export type DisplayName = string

/** In Pyreon, components are plain functions — no forwardRef needed. */
export type ComponentFn<P = any> = ((props: P) => VNodeChild) & Partial<Record<string, any>>

export type ElementType<T extends TObj | unknown = any> = ComponentFn<T>

export type ValueOf<T> = T[keyof T]

export type ArrayOfValues<T> = T[keyof T][]

export type ArrayOfKeys<T> = Array<keyof T>

export type SimpleHoc<P extends Record<string, unknown> = Record<string, unknown>> = <
  T extends ComponentFn<any>,
>(
  WrappedComponent: T,
) => ComponentFn<MergeTypes<[P, ExtractProps<T>]>>

type IsFalseOrNullable<T> = T extends null | undefined | false ? never : true
export type NullableKeys<T> = { [K in keyof T]: IsFalseOrNullable<T[K]> }

export type ReturnCbParam<P extends TFn | TObj> = P extends TFn ? ReturnType<P> : P

// ─── OmitSafe ─────────────────────────────────────────────────
/**
 * Homomorphic (key-remapped) Omit that survives string index signatures.
 *
 * **Why standard `Omit` is wrong here.** `Omit<T, K>` expands to
 * `Pick<T, Exclude<keyof T, K>>`. When `T` carries a string index signature
 * (`[key: string]: unknown` — every `@pyreon/ui-primitives` props interface
 * does, for rest-prop pass-through), `keyof T` subsumes ALL literal keys
 * into `string`, so it is just `string | number`. `Pick` over that computed
 * union is NON-homomorphic — it produces `{ [x: string]: unknown }` with
 * every named key ERASED. That collapse was rocketstyle's DFP bug: on every
 * primitive-backed component, `value`/`onChange`/`checked`/… degraded to
 * `unknown`, so `<Select value={123}>` compiled and every `onChange`
 * callback was an implicit-any error.
 *
 * **Why this shape works.** `{ [P in keyof T as …]: T[P] }` is a
 * HOMOMORPHIC mapped type — TS iterates T's actual declared properties
 * (named keys AND index signatures individually, preserving `?`/`readonly`
 * modifiers), so named keys keep their declared types and the index
 * signature survives for pass-through. For a `T` without an index
 * signature the result is byte-identical to `Omit<T, K>`.
 */
export type OmitSafe<T, K> = {
  [P in keyof T as P extends K ? never : P]: T[P]
}

// ─── MergeTypes ───────────────────────────────────────────────
type Id<T> = T extends infer U ? { [K in keyof U]: U[K] } : never

type IsAny<T> = 0 extends 1 & T ? true : false

type ExtractNullableKeys<T> = {
  [P in keyof T as IsAny<T[P]> extends true
    ? P
    : [T[P]] extends [never]
      ? never
      : [T[P]] extends [null | undefined]
        ? never
        : P]: T[P]
}

type SpreadTwo<L, R> = Id<Pick<L, Exclude<keyof L, keyof R>> & R>

export type Spread<A extends readonly [...any]> = A extends [infer L, ...infer R]
  ? SpreadTwo<L, Spread<R>>
  : unknown

export type MergeTypes<A extends readonly [...any]> = ExtractNullableKeys<Spread<A>>

// ─── ExtractProps ─────────────────────────────────────────────
/**
 * Extracts the props type from a Pyreon component function — or passes
 * through the input unchanged when it's already a props type.
 *
 * Multi-overload aware: matches up to 4 call signatures and produces the
 * UNION of their first-argument types. A single-overload function still
 * works (the union of 4 copies of the same props type dedupes back to
 * the single shape).
 *
 * **Why this shape**. `T extends (props: infer P) => any ? P : never` only
 * captures the LAST overload of a multi-overload function — TS's overload-
 * resolution-against-conditional-types semantics. Iterator / List / Element
 * are 3-overload primitives where the LAST overload (`ChildrenProps`) is the
 * loosest; without overload-aware extraction, `ExtractProps<Iterator>`
 * returned just `ChildrenProps` and lost both `SimpleProps<T>` and
 * `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` /
 * `attrs()` silently downgraded the public prop surface.
 *
 * The pattern-match shape `T extends { (props: infer P1, ...args: any): any;
 * (props: infer P2, ...args: any): any; ... }` is the canonical TS trick
 * for extracting overload sets — see also `Parameters<T>` semantics.
 *
 * Mirrors vitus-labs PR #222.
 */
export type ExtractProps<TComponentOrTProps> = TComponentOrTProps extends {
  (props: infer P1, ...args: any): any
  (props: infer P2, ...args: any): any
  (props: infer P3, ...args: any): any
  (props: infer P4, ...args: any): any
}
  ? P1 | P2 | P3 | P4
  : TComponentOrTProps extends {
        (props: infer P1, ...args: any): any
        (props: infer P2, ...args: any): any
        (props: infer P3, ...args: any): any
      }
    ? P1 | P2 | P3
    : TComponentOrTProps extends {
          (props: infer P1, ...args: any): any
          (props: infer P2, ...args: any): any
        }
      ? P1 | P2
      : TComponentOrTProps extends ComponentFn<infer TProps>
        ? TProps
        : TComponentOrTProps
