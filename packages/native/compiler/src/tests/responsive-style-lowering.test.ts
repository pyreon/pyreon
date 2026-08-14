// A mobile-first responsive array with exactly TWO entries lowers to a
// size-class conditional: `[compact, regular]`.
//
// Two is the only length that maps losslessly. Native resolves two size
// classes (the 600dp boundary `useSizeClass` already uses), not N
// breakpoints — a three-element array's middle band spans BOTH classes, so
// collapsing it would silently pick a wrong value for part of its range.
// Longer arrays keep the refusal and its diagnostic.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (style: string) => `
  import { Stack, Text } from '@pyreon/primitives'
  export function C() {
    return (<Stack style={${style}}><Text>x</Text></Stack>)
  }
  `

describe('two-element responsive arrays lower to a size-class conditional', () => {
  it('Swift: emits the conditional AND the environment injection', () => {
    const out = transform(app('{ padding: [8, 16] }'), { target: 'swift' })
    expect(out.warnings ?? []).toEqual([])
    expect(out.code).toContain('pyreonSizeClass == .regular ? 16 : 8')
    // The injection must be present, and it is decided BEFORE the body is
    // emitted — a flag set during style lowering would arrive too late and
    // the conditional would reference an undeclared property.
    expect(out.code).toContain('@Environment(\\.horizontalSizeClass)')
  })

  it('Kotlin: emits the width comparison, no injection needed', () => {
    const out = transform(app('{ padding: [8, 16] }'), { target: 'kotlin' })
    expect(out.warnings ?? []).toEqual([])
    expect(out.code).toContain('LocalConfiguration.current.screenWidthDp >= 600')
    expect(out.code).toContain('16')
  })

  it('THREE elements still REFUSE — no lossless 2-bucket mapping exists', () => {
    // A 3-element array's middle band spans BOTH size classes, so collapsing
    // it would silently pick a wrong value for part of its range. It must
    // warn and drop rather than guess. (The wording of that warning is
    // asserted where the diagnostic lives; here the contract is that it
    // warns and emits NO conditional.)
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(app('{ padding: [8, 16, 24] }'), { target })
      expect(out.warnings ?? [], target).not.toEqual([])
      expect(out.code).not.toContain('pyreonSizeClass')
      expect(out.code).not.toContain('screenWidthDp')
    }
  })

  it('a plain literal is unchanged — no injection, no conditional', () => {
    const out = transform(app('{ padding: 12 }'), { target: 'swift' })
    expect(out.code).toContain('.padding(12)')
    expect(out.code).not.toContain('pyreonSizeClass')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift compiles', () => {
    const r = validateSwiftWithStubs(transform(app('{ padding: [8, 16] }'), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const r = validateKotlin(transform(app('{ padding: [8, 16] }'), { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
