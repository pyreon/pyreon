/**
 * Compile-time regression lock — primitive BEHAVIOR props must survive the
 * rocketstyle wrapper (2026-07-21 audit, top DX bug).
 *
 * THE BUG. Every `@pyreon/ui-primitives` props interface ends with a
 * `[key: string]: unknown` index signature (pass-through rest props). TS
 * subsumes literal keys into `string` under `keyof`, so for such a type
 * `keyof O` is just `string | number`. Rocketstyle's DFP computed
 * `Omit<O, keyof EA & keyof O>` — and `Omit` (= `Pick<O, Exclude<keyof O,
 * K>>`) is NON-homomorphic over a computed key union: `Pick<O, string |
 * number>` produces `{ [x: string]: unknown }` with EVERY named key erased.
 * Result: on every primitive-backed component (Select / Checkbox /
 * NumberInput / Tabs / Tree / …) `value` degraded to `unknown` (so
 * `<Select value={123}>` compiled) and `onChange` callbacks lost contextual
 * typing (implicit-any error forcing manual annotation).
 *
 * THE FIX. `OmitSafe` in `@pyreon/rocketstyle` types/utils.ts — a
 * homomorphic (`[P in keyof T as …]`) key-remapped omit. Homomorphic mapped
 * types iterate T's ACTUAL declared properties (named keys AND index
 * signatures separately), so named keys survive and the index signature is
 * still preserved for pass-through.
 *
 * The call-site probes live in never-invoked closures — components need a
 * theme provider at runtime; tsc checks the closure bodies regardless.
 *
 * Bisect: reverting the DFP fix (back to plain `Omit`) makes the
 * `@ts-expect-error` probes below UNUSED (the bad calls compile) and the
 * contextual-callback probes implicit-any — `tsc --noEmit` fails either way.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { TreeState } from '@pyreon/ui-primitives'
import Checkbox from '../components/Checkbox'
import NumberInput from '../components/NumberInput'
import Select from '../components/Select'
import Tree from '../components/Tree'

type SelectProps = Parameters<typeof Select>[0]
type CheckboxProps = Parameters<typeof Checkbox>[0]
type NumberInputProps = Parameters<typeof NumberInput>[0]

describe('behavior props survive the rocketstyle wrapper (types)', () => {
  it('mechanism doc: keyof subsumes literal keys under a string index signature', () => {
    interface WithIndex {
      value?: string
      [key: string]: unknown
    }
    // The root cause in one line: named keys are absorbed into `string`.
    expectTypeOf<keyof WithIndex>().toEqualTypeOf<string | number>()
    // Standard (non-homomorphic) Omit therefore erases the named keys —
    // this is the collapse DFP used to perform on every primitive.
    expectTypeOf<Omit<WithIndex, never>['value']>().toEqualTypeOf<unknown>()
  })

  it('Select keeps SelectBase value/onChange types', () => {
    expectTypeOf<SelectProps['value']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<SelectProps['onChange']>().toEqualTypeOf<((value: string) => void) | undefined>()
  })

  it('Select rejects a wrong-typed value and contextually types onChange', () => {
    // Never invoked — tsc checks the body; runtime needs a theme provider.
    const probe = () => {
      // @ts-expect-error — SelectBase types value: string; a number must be rejected
      Select({ value: 123 })
      Select({
        onChange: (v) => {
          expectTypeOf(v).toEqualTypeOf<string>()
        },
      })
    }
    void probe
  })

  it('Checkbox keeps CheckboxBase checked/onChange types', () => {
    expectTypeOf<CheckboxProps['checked']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<CheckboxProps['onChange']>().toEqualTypeOf<
      ((checked: boolean) => void) | undefined
    >()
    const probe = () => {
      // @ts-expect-error — checked is boolean; a string must be rejected
      Checkbox({ checked: 'yes' })
      Checkbox({
        onChange: (checked) => {
          expectTypeOf(checked).toEqualTypeOf<boolean>()
        },
      })
    }
    void probe
  })

  it('NumberInput keeps NumberInputBase value/onChange types', () => {
    expectTypeOf<NumberInputProps['value']>().toEqualTypeOf<number | undefined>()
    const probe = () => {
      // @ts-expect-error — value is number; a string must be rejected
      NumberInput({ value: 'ten' })
      NumberInput({
        onChange: (v) => {
          expectTypeOf(v).toEqualTypeOf<number>()
        },
      })
    }
    void probe
  })

  it('pass-through props are STILL accepted (index signature preserved)', () => {
    // The index signature exists so consumers can pass data-*/aria-*/rest
    // props through to the underlying element — the fix must not remove it.
    const probe = () => {
      Select({ 'data-testid': 'x' })
      Checkbox({ 'aria-describedby': 'hint' })
    }
    void probe
  })

  it('render-fn children keep their state param typing (PR #2377 regression guard)', () => {
    // Tree's children is `(state: TreeState) => VNodeChild` — the #2377 fix
    // let the primitive's own `children` win over DefaultProps' VNodeChild.
    // Post-OmitSafe the callback must be contextually typed, not implicit-any.
    const probe = () => {
      Tree({
        data: [],
        children: (state) => {
          expectTypeOf(state).toEqualTypeOf<TreeState>()
          return null
        },
      })
    }
    void probe
  })
})
