/**
 * Type-level contract: every ARIA attribute that accepts a reactive accessor
 * accepts an UNDEFINED-RETURNING accessor.
 *
 * The runtime removes an attribute when a dynamic value resolves to
 * `undefined` (`applyAttrProp` / the template `_setAttr`), and
 * `aria-x={cond ? 'true' : undefined}` is the framework's documented
 * recommended shape — so `() => T | undefined` must typecheck everywhere
 * `() => T` does. Pre-fix, `aria-label` (and 7 siblings: hidden / disabled /
 * expanded / selected / checked / required / readonly) typed the accessor as
 * `() => T` only, while the neighbouring `role` / `aria-describedby` /
 * `aria-current` / `aria-invalid` already permitted the undefined return —
 * forcing consumers into `?? ''` workarounds for a purely type-level gap
 * (upstream report, 2026-07).
 */
import { describe, expectTypeOf, it } from 'vitest'
import type { PyreonHTMLAttributes } from '../index'

// Mirrors jsx-runtime's private `Booleanish` (not exported by design).
type Booleanish = boolean | 'true' | 'false'

type Attr<K extends keyof PyreonHTMLAttributes> = PyreonHTMLAttributes[K]

describe('ARIA accessors accept undefined-returning functions', () => {
  it('aria-label (the reported gap)', () => {
    expectTypeOf<() => string | undefined>().toMatchTypeOf<Attr<'aria-label'>>()
    // The value + plain-accessor forms still assign.
    expectTypeOf<string>().toMatchTypeOf<Attr<'aria-label'>>()
    expectTypeOf<() => string>().toMatchTypeOf<Attr<'aria-label'>>()
  })

  it('the Booleanish siblings', () => {
    expectTypeOf<() => Booleanish | undefined>().toMatchTypeOf<Attr<'aria-hidden'>>()
    expectTypeOf<() => Booleanish | undefined>().toMatchTypeOf<Attr<'aria-disabled'>>()
    expectTypeOf<() => Booleanish | undefined>().toMatchTypeOf<Attr<'aria-expanded'>>()
    expectTypeOf<() => Booleanish | undefined>().toMatchTypeOf<Attr<'aria-selected'>>()
    expectTypeOf<() => Booleanish | undefined>().toMatchTypeOf<Attr<'aria-required'>>()
    expectTypeOf<() => Booleanish | undefined>().toMatchTypeOf<Attr<'aria-readonly'>>()
    expectTypeOf<() => Booleanish | 'mixed' | undefined>().toMatchTypeOf<Attr<'aria-checked'>>()
  })

  it('the neighbours that already permitted it (consistency lock)', () => {
    expectTypeOf<() => string | undefined>().toMatchTypeOf<Attr<'aria-describedby'>>()
    expectTypeOf<() => 'page' | undefined>().toMatchTypeOf<Attr<'aria-current'>>()
    expectTypeOf<() => 'grammar' | undefined>().toMatchTypeOf<Attr<'aria-invalid'>>()
  })

  // #4392: `aria-sort={() => dir()}` was a type error, like most `aria-*`
  // attributes outside the eight above. Every one is a value or an accessor.
  it('every aria-* attribute accepts an accessor (the class, not the eight)', () => {
    // The declared attributes only: the catch-all `aria-${string}` index
    // signature is typed `unknown` and is not one of them.
    type Declared = keyof {
      [K in keyof PyreonHTMLAttributes as `aria-${string}` extends K ? never : K]: unknown
    }
    type AriaKey = Extract<Declared, `aria-${string}`>
    type RejectsAccessor = {
      [K in AriaKey]: Extract<NonNullable<PyreonHTMLAttributes[K]>, (...args: never[]) => unknown> extends never ? K : never
    }[AriaKey]
    expectTypeOf<RejectsAccessor>().toEqualTypeOf<never>()
  })

  it('the reported attribute and a numeric one', () => {
    expectTypeOf<() => 'ascending' | undefined>().toMatchTypeOf<Attr<'aria-sort'>>()
    expectTypeOf<() => number | undefined>().toMatchTypeOf<Attr<'aria-valuenow'>>()
    expectTypeOf<'ascending'>().toMatchTypeOf<Attr<'aria-sort'>>()
  })
})
