/**
 * Compile-time type tests for `ExtractProps` multi-overload narrowing.
 *
 * Regression: pre-fix, `ExtractProps<T>` collapsed multi-overload functions
 * to the LAST overload's props — TS's overload-resolution-against-conditional-
 * types semantics. Multi-overload primitives (Iterator / List / Element in
 * `@pyreon/elements`) silently downgraded their public prop surface to the
 * loosest overload when wrapped through `rocketstyle()` / `attrs()`. The
 * fix matches up to 4 call signatures via pattern matching and produces the
 * UNION of every overload's first-argument type.
 *
 * Mirrors vitus-labs PR #222. Kept in sync across the 4 copies in
 * `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, and `@pyreon/rocketstyle`
 * — the canonical reference test lives here.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { ComponentFn, ExtractProps, VNodeChild } from '../index'

describe('ExtractProps — single-overload functions still work', () => {
  it('extracts props from a ComponentFn<P>', () => {
    type Greet = ComponentFn<{ name: string }>
    expectTypeOf<ExtractProps<Greet>>().toEqualTypeOf<{ name: string }>()
  })

  it('extracts props from a bare (props: P) => any signature', () => {
    type Fn = (props: { count: number }) => string
    expectTypeOf<ExtractProps<Fn>>().toEqualTypeOf<{ count: number }>()
  })

  it('passes through a non-function shape unchanged', () => {
    type Props = { id: string; value: number }
    expectTypeOf<ExtractProps<Props>>().toEqualTypeOf<Props>()
  })
})

describe('ExtractProps — multi-overload narrowing (load-bearing assertions)', () => {
  it('unions both arms of a 2-overload function', () => {
    interface TwoOverloads {
      (props: { kind: 'a'; value: number }): VNodeChild
      (props: { kind: 'b'; value: string }): VNodeChild
    }
    type Props = ExtractProps<TwoOverloads>
    // Both shapes appear in the extracted union.
    expectTypeOf<Props>().toEqualTypeOf<
      { kind: 'a'; value: number } | { kind: 'b'; value: string }
    >()
  })

  it('unions all three arms of a 3-overload function (Iterator/List/Element shape)', () => {
    interface ThreeOverloads {
      (props: { mode: 'simple'; data: string[] }): VNodeChild
      (props: { mode: 'object'; data: { id: number }[] }): VNodeChild
      (props: { mode: 'children'; children: unknown }): VNodeChild
    }
    type Props = ExtractProps<ThreeOverloads>
    expectTypeOf<Props>().toEqualTypeOf<
      | { mode: 'simple'; data: string[] }
      | { mode: 'object'; data: { id: number }[] }
      | { mode: 'children'; children: unknown }
    >()
  })

  it('unions all four arms of a 4-overload function', () => {
    interface FourOverloads {
      (props: { variant: 'a' }): VNodeChild
      (props: { variant: 'b' }): VNodeChild
      (props: { variant: 'c' }): VNodeChild
      (props: { variant: 'd' }): VNodeChild
    }
    type Props = ExtractProps<FourOverloads>
    expectTypeOf<Props>().toEqualTypeOf<
      { variant: 'a' } | { variant: 'b' } | { variant: 'c' } | { variant: 'd' }
    >()
  })
})

describe('ExtractProps — bisect-load-bearing: pre-fix shape would FAIL these', () => {
  /**
   * If `ExtractProps<T>` were reverted to `T extends ComponentFn<infer P> ? P : T`,
   * each of these would extract only the LAST overload's props and the
   * `toEqualTypeOf<union>` check would fail at compile time. This is the
   * structural anchor — the load-bearing regression guard.
   */

  it('a 2-overload function MUST extract BOTH arms (not just the last)', () => {
    interface OverloadedComp {
      (props: { mode: 'a'; valueA: number }): VNodeChild
      (props: { mode: 'b'; valueB: string }): VNodeChild
    }
    // The first arm `{ mode: 'a'; valueA: number }` must be present in the
    // union. Pre-fix, the conditional collapsed to just the LAST arm.
    type Props = ExtractProps<OverloadedComp>
    // Assignability check: both shapes must be assignable to the extracted type.
    const a: Props = { mode: 'a', valueA: 1 }
    const b: Props = { mode: 'b', valueB: 'x' }
    void a
    void b
  })

  it("a 3-overload Iterator-shaped surface MUST surface SimpleProps + ObjectProps + ChildrenProps", () => {
    // Synthetic Iterator overload-shape — mirrors the real
    // `@pyreon/elements` Iterator. The structural failure mode pre-fix:
    // `ExtractProps<typeof Iterator>` returned just `ChildrenProps`, so any
    // HOC wrapping (rocketstyle, attrs) lost the SimpleProps + ObjectProps
    // surfaces from the public typed API.
    type SimpleItem = ComponentFn<{ value: string }>
    type ObjectItem = ComponentFn<{ id: number }>
    interface IteratorLike {
      <T extends string | number>(props: {
        data: T[]
        component: SimpleItem
        valueName?: string
      }): VNodeChild
      <T extends { id: number }>(props: {
        data: T[]
        component: ObjectItem
      }): VNodeChild
      (props: { children: VNodeChild }): VNodeChild
    }
    type Props = ExtractProps<IteratorLike>

    const noopSimple: SimpleItem = () => null
    const noopObject: ObjectItem = () => null
    // SimpleProps arm assignable:
    const simple: Props = { data: ['a', 'b'], component: noopSimple, valueName: 'text' }
    // ObjectProps arm assignable:
    const obj: Props = { data: [{ id: 1 }], component: noopObject }
    // ChildrenProps arm assignable:
    const ch: Props = { children: null }
    void simple
    void obj
    void ch
  })
})
