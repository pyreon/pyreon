// Branch matrices for the TYPOGRAPHY half of `style-to-native.ts` —
// `extractTextTypography`, `swiftTextTypographyModifiers`,
// `kotlinTextTypographyArgs`, `parseCssColor` / `cssToRgba` and
// `parseDimension`.
//
// Typography is the one part of the style connector that CANNOT lower
// uniformly: SwiftUI wants trailing `.font(...)` / `.foregroundColor(...)`
// MODIFIERS, Compose wants `fontSize = …` / `color = …` CONSTRUCTOR ARGS on
// `Text(...)`. So every arm is asserted on BOTH targets — an arm that lands on
// one target and silently vanishes on the other is exactly the parity break
// the shared-source model exists to prevent.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function app(inner: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal(true)
  return (<Stack>${inner}</Stack>)
}`
}

const textLine = (inner: string, target: 'swift' | 'kotlin'): string =>
  transform(app(inner), { target }).code.split('\n').find((l) => l.includes('Text(')) ?? ''
const sw = (inner: string): string => textLine(inner, 'swift')
/** The WHOLE emit — a container modifier lands on the closing-brace line, not
 *  on the `Text(` line the typography helpers above read. */
const full = (inner: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(inner), { target }).code
const kt = (inner: string): string => textLine(inner, 'kotlin')
const warns = (inner: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(inner), { target }).warnings.join('\n')

// ── fontSize / fontWeight ──────────────────────────────────────────────────

describe('font size + weight — the `.font(.system(...))` / Text-arg split', () => {
  it('size ALONE emits just `size:` (the weight slot is skipped)', () => {
    expect(sw(`<Text style={{ fontSize: 20 }}>x</Text>`)).toContain('.font(.system(size: 20))')
    expect(kt(`<Text style={{ fontSize: 20 }}>x</Text>`)).toContain('fontSize = 20.sp')
  })

  it('weight ALONE emits just `weight:` — the `parts.length > 0` arm with no size', () => {
    expect(sw(`<Text style={{ fontWeight: 'bold' }}>x</Text>`)).toContain(
      '.font(.system(weight: .bold))',
    )
    expect(kt(`<Text style={{ fontWeight: 'bold' }}>x</Text>`)).toContain(
      'fontWeight = FontWeight.Bold',
    )
  })

  it('size AND weight fold into ONE `.font(.system(size:weight:))`', () => {
    expect(sw(`<Text style={{ fontSize: 14, fontWeight: 'medium' }}>x</Text>`)).toContain(
      '.font(.system(size: 14, weight: .medium))',
    )
    expect(kt(`<Text style={{ fontSize: 14, fontWeight: 'medium' }}>x</Text>`)).toContain(
      'fontSize = 14.sp, fontWeight = FontWeight.Medium',
    )
  })

  it.each([
    ['normal', '.regular', 'FontWeight.Normal'],
    ['regular', '.regular', 'FontWeight.Normal'],
    ['medium', '.medium', 'FontWeight.Medium'],
    ['semibold', '.semibold', 'FontWeight.SemiBold'],
    ['bold', '.bold', 'FontWeight.Bold'],
  ])('named weight `%s` maps on both targets', (w, swiftW, ktW) => {
    expect(sw(`<Text style={{ fontWeight: '${w}' }}>x</Text>`)).toContain(`weight: ${swiftW}`)
    expect(kt(`<Text style={{ fontWeight: '${w}' }}>x</Text>`)).toContain(`fontWeight = ${ktW}`)
  })

  it.each([
    [400, '.regular', 'FontWeight.Normal'],
    [500, '.medium', 'FontWeight.Medium'],
    [600, '.semibold', 'FontWeight.SemiBold'],
    [700, '.bold', 'FontWeight.Bold'],
  ])('NUMERIC weight %s maps through the same table (String()-keyed)', (w, swiftW, ktW) => {
    expect(sw(`<Text style={{ fontWeight: ${w} }}>x</Text>`)).toContain(`weight: ${swiftW}`)
    expect(kt(`<Text style={{ fontWeight: ${w} }}>x</Text>`)).toContain(`fontWeight = ${ktW}`)
  })

  it('a DYNAMIC fontSize is not a literal — it drops with a NAMED warning, not silently', () => {
    expect(sw(`<Text style={{ fontSize: on() ? 10 : 20 }}>x</Text>`)).not.toContain('.font(')
    expect(warns(`<Text style={{ fontSize: on() ? 10 : 20 }}>x</Text>`)).toContain('[fontSize]')
  })
})

// ── color ──────────────────────────────────────────────────────────────────

describe('parseCssColor — every accepted CSS form, and the per-target literal', () => {
  it.each([
    ['#rrggbb', '#00aa00', 'red: 0.000, green: 0.667, blue: 0.000, opacity: 1.000', '0xFF00AA00'],
    ['#rgb shorthand', '#abc', 'red: 0.667, green: 0.733, blue: 0.800, opacity: 1.000', '0xFFAABBCC'],
    ['#rrggbbaa', '#11223344', 'red: 0.067, green: 0.133, blue: 0.200, opacity: 0.267', '0x44112233'],
    ['rgb()', 'rgb(10, 20, 30)', 'red: 0.039, green: 0.078, blue: 0.118, opacity: 1.000', '0xFF0A141E'],
    ['rgba()', 'rgba(10, 20, 30, 0.25)', 'red: 0.039, green: 0.078, blue: 0.118, opacity: 0.250', '0x400A141E'],
  ])('%s', (_k, css, swiftBody, ktHex) => {
    expect(sw(`<Text style={{ color: '${css}' }}>x</Text>`)).toContain(swiftBody)
    expect(kt(`<Text style={{ color: '${css}' }}>x</Text>`)).toContain(`Color(${ktHex})`)
  })

  it('rgb() CLAMPS an out-of-range channel and alpha instead of emitting garbage', () => {
    expect(kt(`<Text style={{ color: 'rgb(300, 20, 30)' }}>x</Text>`)).toContain('Color(0xFFFF141E)')
    expect(kt(`<Text style={{ color: 'rgba(10, 20, 30, 2)' }}>x</Text>`)).toContain(
      'Color(0xFF0A141E)',
    )
  })

  it('a NEGATIVE channel does not even match the rgb() grammar — refused, not clamped', () => {
    // `[\d.]+` admits no sign, so the whole function form fails to match and
    // falls to the null return. Asserted so the clamp above is not mistaken
    // for a guard against negatives.
    expect(warns(`<Stack style={{ background: 'rgb(-5, 20, 30)' }}><Text>x</Text></Stack>`)).toContain(
      '[background] could not be parsed',
    )
  })

  it('a NAMED color has no fixed native value — dropped, and REPORTED', () => {
    // An unresolvable typography value must fall back to `rest` so the
    // container path names it; accepting it into `typo` instead made the whole
    // property vanish with zero warnings (fixed upstream — see
    // cov-helpers2-known-bugs.test.ts for the regression lock).
    expect(sw(`<Text style={{ color: 'red' }}>x</Text>`)).not.toContain('.foregroundColor(')
    expect(kt(`<Text style={{ color: 'red' }}>x</Text>`)).not.toContain('color = Color(')
    expect(warns(`<Text style={{ color: 'red' }}>x</Text>`)).toContain('[color] could not be parsed')
  })

  it('a named color on a CONTAINER background DOES warn — same parser, different caller', () => {
    expect(warns(`<Stack style={{ background: 'red' }}><Text>x</Text></Stack>`)).toContain(
      '[background] could not be parsed to a native value',
    )
  })

  it('hsl() / a gradient / a token are all rejected by the same guard', () => {
    for (const css of ['hsl(120, 50%, 50%)', 'linear-gradient(red, blue)', 'var(--brand)']) {
      expect(warns(`<Stack style={{ background: '${css}' }}><Text>x</Text></Stack>`)).toContain(
        '[background] could not be parsed',
      )
    }
  })
})

// ── conditionalColor (the Kotlin-only ternary lift) ────────────────────────

describe('conditionalColor — a reactive colour on <Text>', () => {
  const T = `<Text style={on() ? { color: '#00aa00' } : { color: '#aa0000' }}>x</Text>`

  it('KOTLIN lifts it into a `color = if (…) A else B` Text ARG', () => {
    expect(kt(T)).toContain('color = if (on) Color(0xFF00AA00) else Color(0xFFAA0000)')
  })

  it('SWIFT needs no lift — `.foregroundColor` takes the ternary directly', () => {
    expect(sw(T)).toContain('.foregroundColor(((on) ? Color(')
  })

  it('the REST of each branch still lowers through the container path', () => {
    const both = `<Text style={on() ? { color: '#00aa00', padding: 4 } : { color: '#aa0000', padding: 8 }}>x</Text>`
    expect(kt(both)).toContain('color = if (on)')
    expect(kt(both)).toContain('Modifier.padding((if (on) 4 else 8).dp)')
    expect(sw(both)).toContain('.padding(((on) ? 4 : 8))')
  })

  it('a ternary with NO colour takes the ordinary container path on both targets', () => {
    const noColor = `<Text style={on() ? { padding: 4 } : { padding: 8 }}>x</Text>`
    expect(kt(noColor)).not.toContain('color = if (')
    expect(kt(noColor)).toContain('Modifier.padding((if (on) 4 else 8).dp)')
  })

  it('one UNPARSEABLE branch colour declines the lift — Kotlin falls back, and says so', () => {
    const mixed = `<Text style={on() ? { color: 'red' } : { color: '#aa0000' }}>x</Text>`
    expect(kt(mixed)).not.toContain('color = if (')
    expect(warns(mixed, 'kotlin')).toContain('CSS `color` on a container has no Compose Modifier')
  })
})

// ── textAlign / fontStyle / letterSpacing ──────────────────────────────────

describe('textAlign / fontStyle / letterSpacing', () => {
  it.each([
    ['left', '.leading', 'TextAlign.Start'],
    ['start', '.leading', 'TextAlign.Start'],
    ['center', '.center', 'TextAlign.Center'],
    ['right', '.trailing', 'TextAlign.End'],
    ['end', '.trailing', 'TextAlign.End'],
  ])('textAlign `%s` maps on both targets', (a, swiftA, ktA) => {
    expect(sw(`<Text style={{ textAlign: '${a}' }}>x</Text>`)).toContain(
      `.multilineTextAlignment(${swiftA})`,
    )
    expect(kt(`<Text style={{ textAlign: '${a}' }}>x</Text>`)).toContain(`textAlign = ${ktA}`)
  })

  it('an UNMAPPED textAlign (`justify`) emits nothing on either target, and is NAMED', () => {
    expect(sw(`<Text style={{ textAlign: 'justify' }}>x</Text>`)).not.toContain(
      '.multilineTextAlignment(',
    )
    expect(kt(`<Text style={{ textAlign: 'justify' }}>x</Text>`)).not.toContain('textAlign =')
    expect(warns(`<Text style={{ textAlign: 'justify' }}>x</Text>`)).toContain('[textAlign]')
  })

  it('fontStyle `italic` emits; any other value does NOT', () => {
    expect(sw(`<Text style={{ fontStyle: 'italic' }}>x</Text>`)).toContain('.italic()')
    expect(kt(`<Text style={{ fontStyle: 'italic' }}>x</Text>`)).toContain(
      'fontStyle = FontStyle.Italic',
    )
    expect(sw(`<Text style={{ fontStyle: 'oblique' }}>x</Text>`)).not.toContain('.italic()')
    expect(kt(`<Text style={{ fontStyle: 'oblique' }}>x</Text>`)).not.toContain('fontStyle =')
  })

  it('letterSpacing accepts a NUMBER and a `px` string, 1:1 across targets', () => {
    expect(sw(`<Text style={{ letterSpacing: 0.5 }}>x</Text>`)).toContain('.tracking(0.5)')
    expect(kt(`<Text style={{ letterSpacing: 0.5 }}>x</Text>`)).toContain('letterSpacing = 0.5.sp')
    expect(sw(`<Text style={{ letterSpacing: '1.5px' }}>x</Text>`)).toContain('.tracking(1.5)')
    expect(kt(`<Text style={{ letterSpacing: '1.5px' }}>x</Text>`)).toContain(
      'letterSpacing = 1.5.sp',
    )
  })

  it('a NON-dimension letterSpacing (`normal`) falls to `rest` and warns by name', () => {
    expect(sw(`<Text style={{ letterSpacing: 'normal' }}>x</Text>`)).not.toContain('.tracking(')
    expect(warns(`<Text style={{ letterSpacing: 'normal' }}>x</Text>`)).toContain('[letterSpacing]')
  })
})

// ── the `rest` split ───────────────────────────────────────────────────────

describe('extractTextTypography — the typography / rest split', () => {
  it('typography leaves are CONSUMED; the rest still reaches the container path', () => {
    const line = sw(
      `<Text style={{ fontSize: 12, padding: 4, background: '#ffffff' }}>x</Text>`,
    )
    expect(line).toContain('.font(.system(size: 12))')
    expect(line).toContain('.padding(4)')
    expect(line).toContain('.background(Color(')
  })

  it('a NON-OBJECT style value is passed through whole (typo stays empty)', () => {
    // A bare identifier style value is neither an object nor a two-branch
    // ternary — it takes the "not lowered" arm with its own diagnostic.
    expect(warns(`<Text style={someStyle}>x</Text>`)).toContain(
      'only a static inline-style object literal',
    )
  })

  it('a style-less <Text> emits no typography at all', () => {
    expect(sw(`<Text>x</Text>`)).not.toContain('.font(')
    expect(kt(`<Text>x</Text>`)).not.toContain('fontSize =')
  })
})

// ── parseDimension ─────────────────────────────────────────────────────────

describe('parseDimension — unitless / px accepted, every other unit refused', () => {
  it.each([
    ['plain number', '16', '.padding(16)'],
    ['px string', "'16px'", '.padding(16)'],
    ['negative px', "'-4px'", '.padding(-4)'],
    ['fractional', "'2.5px'", '.padding(2.5)'],
  ])('accepts a %s', (_k, v, expected) => {
    expect(full(`<Stack style={{ padding: ${v} }}><Text>x</Text></Stack>`)).toContain(expected)
  })

  it.each(['%', 'em', 'rem', 'vh', 'pt'])('refuses the `%s` unit with a named warning', (unit) => {
    expect(warns(`<Stack style={{ width: '10${unit}' }}><Text>x</Text></Stack>`)).toContain(
      '[width] could not be parsed',
    )
  })
})
