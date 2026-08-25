// `kinetic(tag).preset(fadeUp)` — the form @pyreon/kinetic-presets documents.
//
// The kinetic lowering originally accepted only a STRING LITERAL preset, so the
// preset pack's own example (`kinetic('div').preset(fadeUp)`) fell through to
// the plain-container decline and did not animate. The pack ships 123 presets;
// native knows seven, so this maps the unambiguous names and declines the rest
// BY NAME.
//
// Mapping the rest to the nearest native motion would be worse than declining:
// a `bounceIn` that silently plays a fade is a bug the author cannot see,
// whereas a named decline is one they can act on.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const src = (imported: string) => `
import { kinetic } from '@pyreon/kinetic'
import { ${imported} } from '@pyreon/kinetic-presets'
import { Stack, Text } from '@pyreon/primitives'
const Hero = kinetic('div').preset(${imported})
export function C() { return (<Stack><Hero><Text>hi</Text></Hero></Stack>) }
`

describe('a named preset from the pack resolves to the native vocabulary', () => {
  it('a mapped preset animates on both targets, with no warnings', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src('fadeUp'), { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toMatch(/transition|AnimatedVisibility/)
    }
  })

  it('the direction survives — fadeUp is not flattened to a plain fade', () => {
    // The whole point of mapping rather than defaulting: `fadeUp` carries a
    // direction, and dropping it would animate the wrong motion silently.
    expect(transform(src('fadeUp'), { target: 'swift' }).code).toContain('.move(edge:')
  })

  it('an UNMAPPED preset declines by name, naming the preset and the vocabulary', () => {
    const w = transform(src('bounceIn'), { target: 'swift' }).warnings
    const hit = w.find((x) => x.includes('bounceIn'))
    expect(hit, 'no warning naming the preset').toBeDefined()
    expect(hit).toContain('no native analogue')
    // It must name what IS available, or the author has nothing to act on.
    expect(hit).toContain('slide-up')
  })

  it('an unmapped preset does NOT animate rather than animating something else', () => {
    const { code } = transform(src('bounceIn'), { target: 'swift' })
    expect(code).not.toContain('.transition(')
  })

  it('a literal preset still works — the pack form is additive', () => {
    const literal = `
import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Hero = kinetic('div').preset('fade')
export function C() { return (<Stack><Hero><Text>hi</Text></Hero></Stack>) }
`
    expect(transform(literal, { target: 'swift' }).warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())('the mapped emit typechecks', () => {
    const v = validateSwiftWithStubs(transform(src('fadeUp'), { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the mapped emit compiles on Kotlin', () => {
    const v = validateKotlin(transform(src('fadeUp'), { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
