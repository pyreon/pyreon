/**
 * `NumberInputBase` against numbers that are not numbers.
 *
 * The state surface promises `value()` is "always finite, always within
 * `[min, max]`. Never `NaN`." Every non-finite guard in this file exists to
 * hold that, and none of them was tested — which is the wrong half to leave
 * open, because a NaN here does not throw. It flows into `aria-valuenow`,
 * into the form value, and eventually into a request body, and the first
 * anyone hears of it is a server rejecting a field the user filled in
 * correctly.
 *
 * The inputs are not exotic. `Infinity` is what an unbounded `max` looks
 * like. A `min` of `-Infinity` is the default. A parent re-render can hand
 * back `NaN` from a controlled value that failed to parse upstream. A
 * `step` of `0` is a plausible prop typo, and it is the one that poisons
 * arithmetic silently: `Math.round((n - base) / 0)` is `Infinity`.
 *
 * The step grid is anchored at `min` per the HTML stepping algorithm, so an
 * unbounded `min` has to fall back to 0 — otherwise the anchor itself is
 * `-Infinity` and every snapped value is `NaN`.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { NumberInputBase, type NumberInputState } from './index'

const mountInput = (props: Record<string, unknown> = {}): NumberInputState => {
  let captured: NumberInputState | undefined
  mountInBrowser(
    h(NumberInputBase as never, {
      ...props,
      children: (s: NumberInputState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

describe('value() is total — it can never be NaN', () => {
  it('folds a NaN controlled value to a finite number', () => {
    // A controlled parent whose upstream parse failed. Passing the NaN
    // through would put it in `aria-valuenow` and in the submitted form.
    const s = mountInput({ value: Number.NaN })
    expect(Number.isFinite(s.value()), 'value() must stay finite').toBe(true)
  })

  it('folds an Infinity controlled value to a clamped 0, as documented', () => {
    // Note it does NOT clamp Infinity to `max`: the source says a
    // non-finite raw "folds to a clamped 0", so the fold happens FIRST and
    // the clamp applies to 0. Checked against the behaviour rather than
    // assumed — my first guess was `max`, which is the more intuitive
    // answer and the wrong one.
    const s = mountInput({ value: Number.POSITIVE_INFINITY, min: 0, max: 10 })
    expect(s.value()).toBe(0)
    expect(Number.isFinite(s.value())).toBe(true)
  })

  it('ignores a non-finite defaultValue and falls back to min', () => {
    // `defaultValue: NaN` from a computed initial. The documented fallback
    // is `min`, which is the only value guaranteed to be in range.
    expect(mountInput({ defaultValue: Number.NaN, min: 5, max: 10 }).value()).toBe(5)
  })

  it('falls back to 0 when min is unbounded too', () => {
    // With no `min`, the fallback chain has nothing finite to land on, and
    // `-Infinity` would poison every subsequent step calculation.
    expect(mountInput({ defaultValue: Number.NaN }).value()).toBe(0)
  })

  it('a finite defaultValue is respected — the fallback is not unconditional', () => {
    // The control. Without it the specs above pass against an input that
    // ignores `defaultValue` entirely.
    expect(mountInput({ defaultValue: 7 }).value()).toBe(7)
  })
})

describe('a degenerate step falls back to 1 rather than freezing', () => {
  // `stepOf()` normalises a step that is 0, negative or NaN to 1. That is
  // the right call and not the obvious one: the defensive alternative is to
  // refuse the step, which leaves the user with a control whose buttons do
  // nothing and no indication why. A prop typo should degrade to the
  // default, not disable the widget.
  //
  // (`snapToStep`'s own `step <= 0` guard is therefore unreachable through
  // increment/decrement — `stepOf` can never hand it one. It is left
  // uncovered deliberately; reaching it means calling the internal.)
  for (const [label, step] of [
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
  ] as Array<[string, number]>) {
    it(`a ${label} step still increments, by 1`, () => {
      const s = mountInput({ defaultValue: 5, step })
      s.increment()
      expect(s.value(), 'the control must stay usable').toBe(6)
    })
  }

  it('a valid step is NOT overridden by the fallback', () => {
    // The control. Without it the three above pass against a widget that
    // ignores `step` entirely and always moves by 1.
    const s = mountInput({ defaultValue: 5, step: 2 })
    s.increment()
    expect(s.value(), 'grid-snapped to the next multiple of 2').toBe(6)

    const t = mountInput({ defaultValue: 5, step: 4 })
    t.increment()
    expect(t.value(), 'a different step gives a different grid').toBe(8)
  })
})

describe('stepping stays on the grid without binary drift', () => {
  it('lands on 0.3 exactly, not 0.30000000000000004', () => {
    // The reason rounding goes through the decimal string form rather than
    // a multiply/divide pair — the latter re-introduces the drift it is
    // meant to remove, and the user sees a number they did not type.
    //
    // `min` anchors the grid at 0.1 so the next point IS 0.3 and the
    // arithmetic actually crosses the drifting case. Anchored at 0 the
    // grid would be 0.2 / 0.4 and the spec would prove nothing about
    // rounding.
    const s = mountInput({ min: 0.1, defaultValue: 0.1, step: 0.2 })
    s.increment()
    expect(s.value()).toBe(0.3)
  })

  it('derives its precision from a step in EXPONENT form', () => {
    // `String(1e-7)` is `"1e-7"`, so a naive decimal count reports 0 and
    // the rounding flattens the value to an integer.
    const s = mountInput({ defaultValue: 0, step: 1e-7 })
    s.increment()
    expect(s.value(), 'the step must survive rounding').toBeCloseTo(1e-7, 12)
    expect(s.value(), 'and must not be flattened to 0').not.toBe(0)
  })

  it('anchors the grid at min when there is one', () => {
    // The HTML stepping algorithm's "step base". Anchoring at 0 instead
    // would let a value land off the grid the author defined.
    const s = mountInput({ min: 1, step: 2, defaultValue: 1 })
    s.increment()
    expect(s.value()).toBe(3)
  })
})

describe('clamping holds at the edges', () => {
  it('cannot step above max, and reports it cannot', () => {
    const s = mountInput({ defaultValue: 9, max: 10, step: 5 })
    s.increment()
    expect(s.value()).toBe(10)
    expect(s.canIncrement(), 'the + button must disable').toBe(false)
  })

  it('cannot step below min, and reports it cannot', () => {
    const s = mountInput({ defaultValue: 1, min: 0, step: 5 })
    s.decrement()
    expect(s.value()).toBe(0)
    expect(s.canDecrement()).toBe(false)
  })

  it('a readOnly input refuses both directions', () => {
    // Disabled and readOnly are different props but the same contract
    // here: the value must not move, and the buttons must say so.
    const s = mountInput({ defaultValue: 5, readOnly: true })
    s.increment()
    s.decrement()
    expect(s.value()).toBe(5)
    expect(s.canIncrement()).toBe(false)
    expect(s.canDecrement()).toBe(false)
  })

  it('a disabled input refuses both directions', () => {
    const s = mountInput({ defaultValue: 5, disabled: true })
    s.increment()
    expect(s.value()).toBe(5)
    expect(s.canIncrement()).toBe(false)
  })
})
