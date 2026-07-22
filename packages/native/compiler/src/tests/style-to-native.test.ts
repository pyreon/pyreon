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
