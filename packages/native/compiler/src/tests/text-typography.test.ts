// Text typography on native — fontSize / fontWeight / color / textAlign / fontStyle.
//
// Typography can't flow through the layout-modifier connector uniformly (SwiftUI
// wants a `.font(.system(size:weight:))` MODIFIER, Compose wants `Text(...)`
// CONSTRUCTOR ARGS), so the Text emit lifts typography out of the style object,
// emits it per-target, and passes the REST (background/padding/border) to the
// connector. Works for a rocketstyle/styled Text AND an inline `<Text style>`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const TITLE = `import { Text } from '@pyreon/primitives'
const theme = defineTheme({ color: { heading: '#111827' } })
const Title = rocketstyle()({ name: 'Title', component: Text })
  .theme(() => ({ fontSize: 24, fontWeight: 'bold', color: t.color.heading, textAlign: 'center' }))
export function App() { return (<Title>Hello</Title>) }`

describe('Text typography — rocketstyle over Text', () => {
  it('lowers fontSize/fontWeight/color/textAlign to SwiftUI modifiers', () => {
    const { code, warnings } = transform(TITLE, { target: 'swift' })
    expect(code).toContain('.font(.system(size: 24, weight: .bold))')
    expect(code).toContain('.foregroundColor(Color(.sRGB, red: 0.067') // #111827
    expect(code).toContain('.multilineTextAlignment(.center)')
    expect(warnings.join('\n')).not.toMatch(/not yet lowered|not lowered|no effect/)
  })

  it('lowers the same to Compose Text() constructor args', () => {
    const { code, warnings } = transform(TITLE, { target: 'kotlin' })
    expect(code).toContain('fontSize = 24.sp')
    expect(code).toContain('fontWeight = FontWeight.Bold')
    expect(code).toContain('color = Color(0xFF111827)')
    expect(code).toContain('textAlign = TextAlign.Center')
    expect(warnings.join('\n')).not.toMatch(/not yet lowered|no effect/)
  })
})

describe('Text typography — inline style + non-typography passthrough', () => {
  // fontSize (typography) → font; backgroundColor + padding (non-typography) →
  // the connector, on the SAME Text.
  const MIXED = `import { Text } from '@pyreon/primitives'
export function App() { return (<Text style={{ fontSize: 18, backgroundColor: '#2563eb', padding: 8 }}>Hi</Text>) }`

  it('splits typography (font) from layout (background/padding) on a Text (Swift)', () => {
    const { code } = transform(MIXED, { target: 'swift' })
    expect(code).toContain('.font(.system(size: 18))') // typography
    expect(code).toContain('.background(Color(.sRGB, red: 0.145') // #2563eb via connector
    expect(code).toContain('.padding(8)') // via connector
  })

  it('splits typography (args) from layout (modifier) on a Text (Kotlin)', () => {
    const { code } = transform(MIXED, { target: 'kotlin' })
    expect(code).toContain('fontSize = 18.sp') // typography arg
    expect(code).toContain('.background(Color(0xFF2563EB))') // connector modifier
    expect(code).toContain('.padding(8.dp)')
  })
})

describe('Text typography — toolchain gates (real SDKs)', () => {
  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the typographic Text typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(transform(TITLE, { target: 'swift' }).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the typographic Text compiles (real kotlinc)', () => {
    const res = validateKotlin(transform(TITLE, { target: 'kotlin' }).code)
    expect(res.ok, res.error).toBe(true)
  })
})
