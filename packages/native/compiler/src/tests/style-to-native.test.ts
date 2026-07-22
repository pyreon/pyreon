// Inline `style={{ … }}` → native modifier lowering (the CSS-in-JS connector).
//
// Three layers:
//   1. EMIT assertions (always run) — the bisect-load-bearing regression tests.
//      Reverting the wiring in emit-swift/emit-kotlin drops the modifiers and
//      these fail.
//   2. Pure-helper unit tests for the CSS-value parsers.
//   3. Toolchain GATES — the emitted Swift typechecks against the real SwiftUI
//      SDK (macOS) and the emitted Kotlin compiles via kotlinc + Compose stubs
//      (CI Docker). These prove the emit is not just string-shaped but real.

import { describe, expect, it, vi } from 'vitest'
import { transform } from '../index'
import { parseCssColor, parseDimension, styleToNativeModifiers } from '../style-to-native'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

// kotlinc/swiftc cold-start a toolchain per case; give the gate cases headroom.
vi.setConfig({ testTimeout: 90_000 })

const wrap = (jsx: string): string =>
  `import { Stack, Text } from '@pyreon/primitives'\nfunction App() { return (${jsx}) }`

const swift = (jsx: string) => transform(wrap(jsx), { target: 'swift' })
const kotlin = (jsx: string) => transform(wrap(jsx), { target: 'kotlin' })

describe('inline style → native modifiers (emit)', () => {
  it('lowers the core box on Swift with the SwiftUI chain order', () => {
    const { code } = swift(
      `<Stack style={{ padding: 16, backgroundColor: '#2563eb', borderRadius: 8 }}><Text>x</Text></Stack>`,
    )
    expect(code).toContain('.padding(16)')
    expect(code).toContain('.background(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922')
    expect(code).toContain('.cornerRadius(8)')
    // SwiftUI order: padding → background → cornerRadius (bg wraps padded content, then rounds).
    expect(code.indexOf('.padding(16)')).toBeLessThan(code.indexOf('.background('))
    expect(code.indexOf('.background(')).toBeLessThan(code.indexOf('.cornerRadius('))
  })

  it('lowers the core box on Compose with the clip-first chain order', () => {
    const { code } = kotlin(
      `<Stack style={{ padding: 16, backgroundColor: '#2563eb', borderRadius: 8 }}><Text>x</Text></Stack>`,
    )
    expect(code).toContain('.clip(RoundedCornerShape(8.dp))')
    expect(code).toContain('.background(Color(0xFF2563EB))')
    expect(code).toContain('.padding(16.dp)')
    // Compose order: clip → background → padding (clip first so the fill is rounded).
    expect(code.indexOf('.clip(')).toBeLessThan(code.indexOf('.background('))
    expect(code.indexOf('.background(')).toBeLessThan(code.indexOf('.padding('))
  })

  it('collapses a horizontal-only padding to the axis form', () => {
    expect(swift(`<Stack style={{ paddingX: 12 }}><Text>x</Text></Stack>`).code).toContain(
      '.padding(.horizontal, 12)',
    )
    expect(kotlin(`<Stack style={{ paddingX: 12 }}><Text>x</Text></Stack>`).code).toContain(
      '.padding(horizontal = 12.dp)',
    )
  })

  it('expands a padding shorthand string to the two-axis form', () => {
    expect(swift(`<Stack style={{ padding: '8px 16px' }}><Text>x</Text></Stack>`).code).toContain(
      '.padding(.vertical, 8).padding(.horizontal, 16)',
    )
    expect(kotlin(`<Stack style={{ padding: '8px 16px' }}><Text>x</Text></Stack>`).code).toContain(
      '.padding(horizontal = 16.dp, vertical = 8.dp)',
    )
  })

  it('lowers width/height and opacity', () => {
    const s = swift(`<Stack style={{ width: 200, height: 48, opacity: 0.9 }}><Text>x</Text></Stack>`).code
    expect(s).toContain('.frame(width: 200)')
    expect(s).toContain('.frame(height: 48)')
    expect(s).toContain('.opacity(0.9)')
    const k = kotlin(`<Stack style={{ width: 200, height: 48, opacity: 0.9 }}><Text>x</Text></Stack>`).code
    expect(k).toContain('.width(200.dp)')
    expect(k).toContain('.height(48.dp)')
    expect(k).toContain('.alpha(0.9f)')
  })

  it('strips web-only declarations with NO warning', () => {
    const { code, warnings } = swift(
      `<Stack style={{ cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s', outline: 'none' }}><Text>x</Text></Stack>`,
    )
    expect(code).not.toContain('cursor')
    expect(code).not.toContain('userSelect')
    expect(warnings.join('\n')).not.toMatch(/cursor|userSelect|transition|outline/)
  })

  it('warns + drops a CSS property with no native lowering yet (never silent)', () => {
    const { warnings } = swift(`<Stack style={{ margin: 4, boxShadow: '0 1px 2px #000' }}><Text>x</Text></Stack>`)
    const joined = warnings.join('\n')
    expect(joined).toMatch(/margin/)
    expect(joined).toMatch(/boxShadow/)
    expect(joined).toMatch(/no native lowering yet/)
  })

  it('warns + drops a dynamic style VALUE (Phase-3 reactive emit)', () => {
    const { warnings } = swift(`<Stack style={dyn}><Text>x</Text></Stack>`)
    expect(warnings.join('\n')).toMatch(/only a static inline-style object literal/)
  })

  it('warns + drops a dynamic style FIELD value', () => {
    const { warnings } = swift(`<Stack style={{ padding: n() }}><Text>x</Text></Stack>`)
    expect(warnings.join('\n')).toMatch(/\[padding\].*not literal/)
  })

  it('warns + drops an unparseable color, never emitting a wrong one', () => {
    const { code, warnings } = swift(`<Stack style={{ backgroundColor: 'rebeccapurple' }}><Text>x</Text></Stack>`)
    expect(code).not.toContain('.background(')
    expect(warnings.join('\n')).toMatch(/\[backgroundColor\].*could not be parsed/)
  })

  it('lowers `color` on Swift (.foregroundColor) but warns on Compose (Text-layer concern)', () => {
    expect(swift(`<Stack style={{ color: '#ffffff' }}><Text>x</Text></Stack>`).code).toContain(
      '.foregroundColor(Color(.sRGB',
    )
    const k = kotlin(`<Stack style={{ color: '#ffffff' }}><Text>x</Text></Stack>`)
    expect(k.code).not.toContain('.foregroundColor')
    expect(k.warnings.join('\n')).toMatch(/color.*no Compose Modifier/)
  })

  it('carries an alpha channel through rgba() to both targets', () => {
    expect(
      styleToNativeModifiers(
        { kind: 'object', fields: [{ name: 'backgroundColor', value: { kind: 'literal', value: 'rgba(0,0,0,0.5)' } }] },
        'kotlin',
        'Stack',
      ).modifiers.join(''),
    ).toContain('.background(Color(0x80000000))')
  })
})

describe('CSS value parsers (pure)', () => {
  it('parseCssColor — hex / short-hex / rgb / rgba', () => {
    expect(parseCssColor('#2563eb', 'kotlin')).toBe('Color(0xFF2563EB)')
    expect(parseCssColor('#2563eb', 'swift')).toBe(
      'Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922, opacity: 1.000)',
    )
    expect(parseCssColor('#abc', 'kotlin')).toBe('Color(0xFFAABBCC)')
    expect(parseCssColor('rgb(255, 0, 0)', 'kotlin')).toBe('Color(0xFFFF0000)')
    expect(parseCssColor('rgba(0, 0, 0, 0.5)', 'kotlin')).toBe('Color(0x80000000)')
  })

  it('parseCssColor — rejects unsupported forms (null, so the caller drops+warns)', () => {
    expect(parseCssColor('rebeccapurple', 'kotlin')).toBeNull()
    expect(parseCssColor('hsl(0, 100%, 50%)', 'kotlin')).toBeNull()
    expect(parseCssColor('linear-gradient(red, blue)', 'swift')).toBeNull()
  })

  it('parseDimension — number, px, rejects other units', () => {
    expect(parseDimension(16)).toBe(16)
    expect(parseDimension('16px')).toBe(16)
    expect(parseDimension('16')).toBe(16)
    expect(parseDimension('50%')).toBeNull()
    expect(parseDimension('1.5rem')).toBeNull()
    expect(parseDimension('auto')).toBeNull()
  })
})

describe('inline style — swiftc -typecheck gate (real SwiftUI SDK)', () => {
  it('skips cleanly when SwiftUI is unavailable (non-macOS)', () => {
    if (isSwiftUIAvailable()) return
    expect(validateSwiftTypecheck('let _ = 0').skipped).toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())('the emitted inline-style modifiers typecheck', () => {
    const out = swift(
      `<Stack style={{ padding: 16, paddingX: 8, backgroundColor: '#2563eb', borderRadius: 8, opacity: 0.9, width: 200, height: 48 }}>
        <Text style={{ color: 'rgba(255,255,255,1)' }}>Styled</Text>
      </Stack>`,
    ).code
    const res = validateSwiftTypecheck(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('inline style — kotlinc gate (Compose stubs)', () => {
  it.skipIf(!isKotlincAvailable())('the emitted inline-style modifiers compile', () => {
    const out = kotlin(
      `<Stack style={{ padding: 16, paddingX: 8, backgroundColor: '#2563eb', borderRadius: 8, opacity: 0.9, width: 200, height: 48 }}>
        <Text>Styled</Text>
      </Stack>`,
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

// ── DYNAMIC — style={cond ? {A} : {B}} → reactive conditional modifiers ──────
const dynSwift = (jsx: string) =>
  transform(
    `import { Stack, Text } from '@pyreon/primitives'\nfunction App() {\n  const active = signal(false)\n  return (${jsx})\n}`,
    { target: 'swift' },
  )
const dynKotlin = (jsx: string) =>
  transform(
    `import { Stack, Text } from '@pyreon/primitives'\nfunction App() {\n  const active = signal(false)\n  return (${jsx})\n}`,
    { target: 'kotlin' },
  )

describe('dynamic inline style → reactive conditional modifiers (emit)', () => {
  const FLIP = `<Stack style={active() ? { backgroundColor: '#2563eb', padding: 8, borderRadius: 8, opacity: 1 } : { backgroundColor: '#6b7280', padding: 16, borderRadius: 4, opacity: 0.7 }}><Text>x</Text></Stack>`

  it('emits SwiftUI conditional VALUES (reactive on the @State read)', () => {
    const { code } = dynSwift(FLIP)
    expect(code).toContain('.padding(((active) ? 8 : 16))')
    expect(code).toContain('.cornerRadius(((active) ? 8 : 4))')
    expect(code).toMatch(/\.background\(\(\(active\) \? Color\(\.sRGB, red: 0\.145.*: Color\(\.sRGB, red: 0\.420/)
    expect(code).toContain('.opacity(((active) ? 1 : 0.7))')
  })

  it('emits Compose conditional VALUES with if-expressions', () => {
    const { code } = dynKotlin(FLIP)
    expect(code).toContain('.clip(RoundedCornerShape((if (active) 8 else 4).dp))')
    expect(code).toContain('.background((if (active) Color(0xFF2563EB) else Color(0xFF6B7280)))')
    expect(code).toContain('.padding((if (active) 8 else 16).dp)')
  })

  it('carries the Kotlin float `f` suffix on each opacity BRANCH, not after the parens', () => {
    // Regression: `.alpha((if (active) 1 else 0.7)f)` is a syntax error (`f` is a
    // literal suffix, not an extension on the expression). Must be `1f`/`0.7f`.
    const { code } = dynKotlin(FLIP)
    expect(code).toContain('.alpha((if (active) 1f else 0.7f))')
    expect(code).not.toMatch(/\)f\)/)
  })

  it('an ASYMMETRIC property (in one branch only) emits statically + warns, never silently', () => {
    const src = `<Stack style={active() ? { backgroundColor: '#2563eb', width: 200 } : { backgroundColor: '#6b7280' }}><Text>x</Text></Stack>`
    const { code, warnings } = dynSwift(src)
    // shared background flips; width (then-only) emitted statically
    expect(code).toContain('.background(((active) ? Color(.sRGB, red: 0.145')
    expect(code).toContain('.frame(width: 200)')
    expect(warnings.join('\n')).toMatch(/\[width\].*differ in shape or exist in only one branch/)
  })

  it('a non-ternary dynamic style still warns + drops (style={obj})', () => {
    const { warnings } = dynSwift(`<Stack style={someObj}><Text>x</Text></Stack>`)
    expect(warnings.join('\n')).toMatch(/only a static inline-style object literal, or a two-branch ternary/)
  })
})

describe('dynamic inline style — toolchain gates', () => {
  const FLIP = `<Press onPress={() => active.set(!active())}><Stack style={active() ? { backgroundColor: '#2563eb', padding: 8, borderRadius: 8, opacity: 1 } : { backgroundColor: '#6b7280', padding: 16, borderRadius: 4, opacity: 0.7 }}><Text>Toggle</Text></Stack></Press>`
  const withPress = (target: 'swift' | 'kotlin') =>
    transform(
      `import { Stack, Text, Press } from '@pyreon/primitives'\nfunction App() {\n  const active = signal(false)\n  return (${FLIP})\n}`,
      { target },
    ).code

  it.skipIf(!isSwiftUIAvailable())('the reactive conditional modifiers typecheck (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(withPress('swift'))
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the reactive conditional modifiers compile (Compose stubs)', () => {
    const res = validateKotlin(withPress('kotlin'))
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

// ── border — borderWidth/borderColor/border shorthand → one stroke modifier ──
describe('inline style — border (emit)', () => {
  it('emits a SwiftUI overlay stroke coordinated with the corner radius', () => {
    const { code } = swift(
      `<Stack style={{ borderWidth: 1, borderColor: '#2563eb', borderRadius: 8 }}><Text>x</Text></Stack>`,
    )
    expect(code).toContain('.cornerRadius(8)')
    expect(code).toContain(
      '.overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922, opacity: 1.000), lineWidth: 1))',
    )
  })

  it('emits a Compose .border(BorderStroke, shape) coordinated with the corner radius', () => {
    const { code } = kotlin(
      `<Stack style={{ borderWidth: 1, borderColor: '#2563eb', borderRadius: 8 }}><Text>x</Text></Stack>`,
    )
    expect(code).toContain('.border(BorderStroke(1.dp, Color(0xFF2563EB)), RoundedCornerShape(8.dp))')
  })

  it('parses the `border` shorthand (width / style / color, any order)', () => {
    expect(swift(`<Stack style={{ border: '2px solid #dc2626' }}><Text>x</Text></Stack>`).code).toContain(
      '.overlay(RoundedRectangle(cornerRadius: 0).stroke(Color(.sRGB, red: 0.863, green: 0.149, blue: 0.149, opacity: 1.000), lineWidth: 2))',
    )
    expect(kotlin(`<Stack style={{ border: '2px solid #dc2626' }}><Text>x</Text></Stack>`).code).toContain(
      '.border(BorderStroke(2.dp, Color(0xFFDC2626)), RoundedCornerShape(0.dp))',
    )
  })

  it('an incomplete border (width XOR color) emits nothing + warns, never silently', () => {
    const { code, warnings } = swift(`<Stack style={{ borderWidth: 1 }}><Text>x</Text></Stack>`)
    expect(code).not.toContain('.overlay(')
    expect(warnings.join('\n')).toMatch(/border needs BOTH borderWidth and borderColor/)
  })

  it('a non-solid borderStyle emits the border + warns (approximated as solid)', () => {
    const { code, warnings } = kotlin(
      `<Stack style={{ borderWidth: 1, borderColor: '#000000', borderStyle: 'dashed' }}><Text>x</Text></Stack>`,
    )
    expect(code).toContain('.border(BorderStroke(1.dp, Color(0xFF000000))')
    expect(warnings.join('\n')).toMatch(/only a solid border lowers/)
  })

  it('a dynamic border (ternary) emits the then-branch statically + warns', () => {
    const src = `<Stack style={active() ? { borderWidth: 2, borderColor: '#2563eb' } : { borderWidth: 1, borderColor: '#6b7280' }}><Text>x</Text></Stack>`
    const { code, warnings } = dynSwift(src)
    expect(code).toContain('.overlay(RoundedRectangle(cornerRadius: 0).stroke(Color(.sRGB, red: 0.145')
    expect(warnings.join('\n')).toMatch(/\[border\].*differ in shape or exist in only one branch/)
  })
})

describe('inline style — border toolchain gates', () => {
  const BORDER = `<Stack style={{ borderWidth: 2, borderColor: 'rgba(37,99,235,1)', borderRadius: 8, backgroundColor: '#ffffff', padding: 12 }}><Text>Bordered</Text></Stack>`
  it.skipIf(!isSwiftUIAvailable())('the border overlay stroke typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(BORDER).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the border modifier compiles (Compose stubs + new BorderStroke/.border)', () => {
    const res = validateKotlin(kotlin(BORDER).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

// ── sizing — min/max frame constraints, aspectRatio, margin-warn ─────────────
describe('inline style — sizing constraints (emit)', () => {
  it('combines min/max width into ONE frame (Swift) / widthIn (Compose)', () => {
    expect(swift(`<Stack style={{ minWidth: 100, maxWidth: 300 }}><Text>x</Text></Stack>`).code).toContain(
      '.frame(minWidth: 100, maxWidth: 300)',
    )
    expect(kotlin(`<Stack style={{ minWidth: 100, maxWidth: 300 }}><Text>x</Text></Stack>`).code).toContain(
      '.widthIn(min = 100.dp, max = 300.dp)',
    )
  })

  it('emits per-axis widthIn/heightIn on Compose, one .frame on Swift', () => {
    const src = `<Stack style={{ minWidth: 80, minHeight: 44, maxHeight: 200 }}><Text>x</Text></Stack>`
    expect(swift(src).code).toContain('.frame(minWidth: 80, minHeight: 44, maxHeight: 200)')
    const k = kotlin(src).code
    expect(k).toContain('.widthIn(min = 80.dp)')
    expect(k).toContain('.heightIn(min = 44.dp, max = 200.dp)')
  })

  it('lowers aspectRatio (number and `W / H` ratio)', () => {
    expect(swift(`<Stack style={{ aspectRatio: 1.5 }}><Text>x</Text></Stack>`).code).toContain(
      '.aspectRatio(1.5, contentMode: .fit)',
    )
    expect(kotlin(`<Stack style={{ aspectRatio: 1.5 }}><Text>x</Text></Stack>`).code).toContain(
      '.aspectRatio(1.5f)',
    )
    expect(kotlin(`<Stack style={{ aspectRatio: '16 / 9' }}><Text>x</Text></Stack>`).code).toContain(
      '.aspectRatio(1.7778f)',
    )
  })

  it('warns + drops margin (no native equivalent), never silently', () => {
    const { code, warnings } = swift(`<Stack style={{ margin: 8, marginTop: 4 }}><Text>x</Text></Stack>`)
    expect(code).not.toMatch(/\.frame\(|\.padding\(/)
    expect(warnings.join('\n')).toMatch(/margin.*no native equivalent/)
  })
})

describe('inline style — sizing toolchain gates', () => {
  const SIZED = `<Stack style={{ minWidth: 100, maxWidth: 300, minHeight: 44, aspectRatio: 1.5, backgroundColor: '#ffffff' }}><Text>Sized</Text></Stack>`
  it.skipIf(!isSwiftUIAvailable())('the frame constraints + aspectRatio typecheck (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(SIZED).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the widthIn/heightIn/aspectRatio compile (Compose stubs)', () => {
    const res = validateKotlin(kotlin(SIZED).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
