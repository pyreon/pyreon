/**
 * Compile-time type tests for the `@pyreon/reactivity` inference helpers
 * (`SignalValue` / `ComputedValue` / `MaybeAccessor` / `AccessorReturn`).
 *
 * Follows the `extract-props-overloads.types.test.ts` precedent: positive
 * `expectTypeOf` assignability assertions + `@ts-expect-error` negative
 * cases. These specs are load-bearing at TYPECHECK time — the runtime pass
 * is trivially green, `tsc --noEmit` is the gate.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  AccessorReturn,
  Computed,
  ComputedValue,
  MaybeAccessor,
  Signal,
  SignalValue,
} from '../index'
import { computed, signal } from '../index'

describe('SignalValue — unwraps signal/computed/accessor value types', () => {
  it('unwraps Signal<T>', () => {
    const count = signal(0)
    expectTypeOf<SignalValue<typeof count>>().toEqualTypeOf<number>()

    const items = signal<string[]>([])
    expectTypeOf<SignalValue<typeof items>>().toEqualTypeOf<string[]>()
  })

  it('unwraps a union value type', () => {
    const maybe = signal<{ id: number } | null>(null)
    expectTypeOf<SignalValue<typeof maybe>>().toEqualTypeOf<{ id: number } | null>()
  })

  it('unwraps the Signal interface directly (no instance needed)', () => {
    expectTypeOf<SignalValue<Signal<Date>>>().toEqualTypeOf<Date>()
  })

  it('unwraps ReadonlySignal / bare accessors', () => {
    expectTypeOf<SignalValue<() => boolean>>().toEqualTypeOf<boolean>()
  })

  it('resolves to never for non-callable values (negative)', () => {
    expectTypeOf<SignalValue<number>>().toEqualTypeOf<never>()
    expectTypeOf<SignalValue<{ value: number }>>().toEqualTypeOf<never>()
    // A function REQUIRING arguments is not a zero-arg accessor.
    expectTypeOf<SignalValue<(x: number) => string>>().toEqualTypeOf<never>()
  })

  it('rejects using the unwrapped type where the wrapper is required', () => {
    const count = signal(0)
    const takesValue = (_v: SignalValue<typeof count>) => {}
    takesValue(1)
    // @ts-expect-error — the signal itself is not its value type
    takesValue(count)
  })
})

describe('ComputedValue — unwraps Computed<T>', () => {
  it('unwraps a computed instance', () => {
    const price = signal(10)
    const total = computed(() => price() * 2)
    expectTypeOf<ComputedValue<typeof total>>().toEqualTypeOf<number>()
  })

  it('unwraps the Computed interface directly', () => {
    expectTypeOf<ComputedValue<Computed<string[]>>>().toEqualTypeOf<string[]>()
  })

  it('resolves to never for plain values (negative)', () => {
    expectTypeOf<ComputedValue<string>>().toEqualTypeOf<never>()
  })
})

describe('MaybeAccessor — value-or-accessor parameter shape', () => {
  it('accepts both the value form and the accessor form', () => {
    const takes = (_v: MaybeAccessor<string>) => {}
    takes('static')
    takes(() => 'reactive')
    const label = signal('from-signal')
    takes(label) // a Signal<string> IS a () => string
  })

  it('rejects a mismatched value type (negative)', () => {
    const takes = (_v: MaybeAccessor<string>) => {}
    // @ts-expect-error — number is not string | (() => string)
    takes(42)
    // @ts-expect-error — accessor returning the wrong type
    takes(() => 42)
  })
})

describe('AccessorReturn — resolves MaybeAccessor to its value type', () => {
  it('unwraps the accessor arm and passes values through', () => {
    expectTypeOf<AccessorReturn<() => number>>().toEqualTypeOf<number>()
    expectTypeOf<AccessorReturn<string>>().toEqualTypeOf<string>()
  })

  it('resolves MaybeAccessor<T> back to T (round-trip)', () => {
    expectTypeOf<AccessorReturn<MaybeAccessor<boolean>>>().toEqualTypeOf<boolean>()
    expectTypeOf<AccessorReturn<MaybeAccessor<{ a: 1 } | undefined>>>().toEqualTypeOf<
      { a: 1 } | undefined
    >()
  })

  it('unwraps a Signal to its value (a signal is an accessor)', () => {
    const flag = signal(false)
    expectTypeOf<AccessorReturn<typeof flag>>().toEqualTypeOf<boolean>()
  })
})

// Runtime smoke — the file must execute under vitest without assertions
// beyond types (keeps the suite green while tsc carries the real load).
describe('type-helpers runtime surface', () => {
  it('has no runtime exports (types only — zero bundle bytes)', async () => {
    const mod = await import('../type-helpers')
    expect(Object.keys(mod)).toEqual([])
  })
})
