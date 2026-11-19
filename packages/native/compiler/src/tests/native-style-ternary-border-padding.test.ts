// A reactive `style={cond ? {A} : {B}}` could not flip a border colour, nor a padding that is not one all-sides value
// (#4346). Both fell back to "first branch, statically" with a warning, so a light/dark card lost its hairline colour
// and its asymmetric padding, even with the same literal properties in both branches. A complete border in every
// branch now folds piecewise (width, colour and corner radius each become one conditional value), and a padding box
// whose branches set the same sides folds side by side; a value equal in every branch stays a plain value.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const card = (dark: string, light: string) => `import { useColorMode } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'

export function Card() {
  const mode = useColorMode()
  return (
    <Stack style={mode() === 'dark' ? ${dark} : ${light}}>
      <Text>Water the basil</Text>
    </Stack>
  )
}`

// The issue's repro.
const ISSUE = card(
  "{ backgroundColor: '#181822', borderRadius: 14, borderWidth: 1, borderColor: '#2E2E3B', padding: '10px 14px' }",
  "{ backgroundColor: '#FFFCF5', borderRadius: 14, borderWidth: 1, borderColor: '#E6DFD2', padding: '10px 14px' }",
)

// The `border` shorthand, a width and a radius that differ too, and a per-side padding whose values differ.
const SHORTHAND = card(
  "{ border: '2px solid #2E2E3B', borderRadius: 14, padding: '10px 14px' }",
  "{ border: '1px solid #E6DFD2', borderRadius: 8, padding: '8px 12px' }",
)

const emit = (src: string, target: 'swift' | 'kotlin') => {
  const r = transform(src, { target })
  expect(r.warnings).toEqual([])
  return r.code
}

const DARK = '(mode == "dark")'

describe('a style ternary flips a border colour and a per-side padding', () => {
  it('Swift: the border colour is conditional, the shared width / radius / padding stay plain', () => {
    const sw = emit(ISSUE, 'swift')
    expect(sw).toContain(`.overlay(RoundedRectangle(cornerRadius: 14).stroke((${DARK} ? Color(.sRGB, red: 0.180`)
    expect(sw).toContain(': Color(.sRGB, red: 0.902, green: 0.875, blue: 0.824, opacity: 1.000)), lineWidth: 1))')
    expect(sw).toContain('.padding(.vertical, 10).padding(.horizontal, 14)')
  })

  it('Kotlin: the border colour is conditional, the shared width / radius / padding stay plain', () => {
    const kt = emit(ISSUE, 'kotlin')
    expect(kt).toContain(
      `.border(BorderStroke(1.dp, (if ${DARK} Color(0xFF2E2E3B) else Color(0xFFE6DFD2))), RoundedCornerShape(14.dp))`,
    )
    expect(kt).toContain('.padding(horizontal = 14.dp, vertical = 10.dp)')
  })

  it('the `border` shorthand, a differing width and radius, and differing per-side padding values all fold', () => {
    const sw = emit(SHORTHAND, 'swift')
    expect(sw).toContain(`RoundedRectangle(cornerRadius: (${DARK} ? 14 : 8))`)
    expect(sw).toContain(`lineWidth: (${DARK} ? 2 : 1))`)
    expect(sw).toContain(`.padding(.vertical, (${DARK} ? 10 : 8)).padding(.horizontal, (${DARK} ? 14 : 12))`)
    const kt = emit(SHORTHAND, 'kotlin')
    expect(kt).toContain(`BorderStroke((if ${DARK} 2 else 1).dp, (if ${DARK} Color(0xFF2E2E3B) else Color(0xFFE6DFD2)))`)
    expect(kt).toContain(`RoundedCornerShape((if ${DARK} 14 else 8).dp))`)
    expect(kt).toContain(`.padding(horizontal = (if ${DARK} 14 else 12).dp, vertical = (if ${DARK} 10 else 8).dp)`)
  })

  it('branches that set DIFFERENT sides still fall back to the first branch, with the named warning', () => {
    const src = card("{ padding: '10px 14px' }", '{ paddingTop: 8 }')
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('.padding(.vertical, 10).padding(.horizontal, 14)')
    expect(r.warnings.join('\n')).toContain('property [padding] differ in shape or exist in only one branch')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks (real swiftc)', () => {
    for (const src of [ISSUE, SHORTHAND]) {
      const r = validateSwiftWithStubs(emit(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    for (const src of [ISSUE, SHORTHAND]) {
      const r = validateKotlin(emit(src, 'kotlin'))
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
