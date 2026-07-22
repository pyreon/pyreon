// `@pyreon` theme native frontend — compile-time theme-token resolution.
//
// The mainline styler/rocketstyle style is a theme TOKEN, not a literal. This
// suite locks the FUNDAMENTALLY-CORRECT contract: a token resolves against the
// APP's own `defineTheme({ … })` (parsed from the compiled source) merged over
// the bundled defaults — so a native build emits the app's real color, not a
// hardcoded guess — and the `defineTheme(…)` declaration itself is consumed at
// compile time, never emitted (there is no native `defineTheme`).

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  mergeTheme,
  parseThemeDefinition,
  resolveThemeToken,
} from '../theme-native'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'
import { parseSync } from 'oxc-parser'

const swift = (src: string) => transform(src, { target: 'swift' })

// Parse a single expression's AST node (the init of `const _ = <expr>`).
function exprNode(code: string): unknown {
  const ast = parseSync('t.tsx', `const _ = ${code}`, { sourceType: 'module', lang: 'tsx' })
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  return ((ast.program.body[0] as any).declarations[0] as any).init
}

describe('theme-native — resolveThemeToken (against defaults)', () => {
  it('resolves a color token to a #hex string', () => {
    expect(resolveThemeToken(exprNode('t.color.primary'))).toBe('#2563eb')
    expect(resolveThemeToken(exprNode('t.color.danger'))).toBe('#dc2626')
  })
  it('resolves spacing + radius tokens to numbers', () => {
    expect(resolveThemeToken(exprNode('t.spacing.md'))).toBe(12)
    expect(resolveThemeToken(exprNode('t.radius.sm'))).toBe(4)
  })
  it('accepts the arrow forms — rocketstyle `(t) => t.color.primary` + styler `(p) => p.theme.color.primary`', () => {
    expect(resolveThemeToken(exprNode('(t) => t.color.primary'))).toBe('#2563eb')
    expect(resolveThemeToken(exprNode('(p) => p.theme.color.primary'))).toBe('#2563eb')
  })
  it('accepts group aliases (colors / space / borderRadius)', () => {
    expect(resolveThemeToken(exprNode('t.colors.primary'))).toBe('#2563eb')
    expect(resolveThemeToken(exprNode('t.space.lg'))).toBe(16)
    expect(resolveThemeToken(exprNode('t.borderRadius.md'))).toBe(8)
  })
  it('resolves a nested path by scanning for a known entry', () => {
    // `t.color.system.primary` → the first known token entry under the group.
    expect(resolveThemeToken(exprNode('t.color.system.primary'))).toBe('#2563eb')
  })
  it('returns null for an unknown token / non-token expression', () => {
    expect(resolveThemeToken(exprNode('t.color.nope'))).toBeNull()
    expect(resolveThemeToken(exprNode('t.unknownGroup.x'))).toBeNull()
    expect(resolveThemeToken(exprNode('someFn()'))).toBeNull()
    expect(resolveThemeToken(exprNode('props.title'))).toBeNull()
  })
})

describe('theme-native — parseThemeDefinition + mergeTheme', () => {
  it('parses a defineTheme({…}) marker into literal leaves', () => {
    const parsed = parseThemeDefinition(
      exprNode(`defineTheme({ color: { primary: '#ff0000' }, spacing: { md: 20 }, radius: { sm: 6 } })`),
    )
    expect(parsed).toEqual({ color: { primary: '#ff0000' }, spacing: { md: 20 }, radius: { sm: 6 } })
  })
  it('requires the marker — a bare object literal is NOT a theme', () => {
    expect(parseThemeDefinition(exprNode(`{ color: { primary: '#ff0000' } }`))).toBeNull()
  })
  it('skips non-literal leaves (a native theme must be static)', () => {
    const parsed = parseThemeDefinition(
      exprNode(`defineTheme({ color: { primary: '#ff0000', dynamic: getColor() } })`),
    )
    expect(parsed).toEqual({ color: { primary: '#ff0000' } })
  })
  it('mergeTheme overrides per-entry, keeping every un-overridden default', () => {
    const merged = mergeTheme({ color: { primary: '#ff0000' } })
    expect(merged.color.primary).toBe('#ff0000') // overridden
    expect(merged.color.danger).toBe(DEFAULT_THEME.color.danger) // kept
    expect(merged.spacing.md).toBe(DEFAULT_THEME.spacing.md) // kept
  })
  it('mergeTheme(null) is the pure defaults', () => {
    expect(mergeTheme(null)).toEqual(DEFAULT_THEME)
  })
})

describe('theme-native — end-to-end (app theme overrides defaults)', () => {
  const APP = (extra: string) => `import { Stack, Text } from '@pyreon/primitives'
const theme = defineTheme({ color: { primary: '#ff3b30' }, spacing: { md: 20 } })
const Card = styled(Stack)\`background: \${(t) => t.color.primary}; padding: \${(t) => t.spacing.md}\`
${extra}
function App() { return (<Card><Text>x</Text></Card>) }`

  it('resolves styler tokens to the APP theme value, not the default', () => {
    const { code } = swift(APP(''))
    // #ff3b30 = red 1.000, green 0.231, blue 0.188 (NOT the default #2563eb).
    expect(code).toContain('.background(Color(.sRGB, red: 1.000, green: 0.231, blue: 0.188')
    expect(code).toContain('.padding(20)')
  })

  it('keeps an un-overridden token at its default (per-entry merge)', () => {
    // The app overrides only color.primary + spacing.md; radius.sm stays default 4.
    const src = `import { Stack, Text } from '@pyreon/primitives'
const theme = defineTheme({ color: { primary: '#ff3b30' } })
const Card = styled(Stack)\`border-radius: \${(t) => t.radius.sm}\`
function App() { return (<Card><Text>x</Text></Card>) }`
    expect(swift(src).code).toContain('.cornerRadius(4)')
  })

  it('a zero-config app (no defineTheme) resolves to the defaults', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
const Card = styled(Stack)\`background: \${(t) => t.color.primary}\`
function App() { return (<Card><Text>x</Text></Card>) }`
    expect(swift(src).code).toContain('.background(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922')
  })

  it('the defineTheme(…) declaration is consumed, NOT emitted natively', () => {
    const { code } = swift(APP(''))
    expect(code).not.toContain('defineTheme')
  })

  it('resolves against the app theme in a rocketstyle dimension value too', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
const theme = defineTheme({ color: { primary: '#ff3b30' } })
const Btn = rocketstyle()({ name: 'Btn', component: Stack }).states({ primary: { backgroundColor: t.color.primary } })
function App() { return (<Btn state="primary"><Text>x</Text></Btn>) }`
    expect(swift(src).code).toContain('.background(Color(.sRGB, red: 1.000, green: 0.231, blue: 0.188')
  })
})

describe('theme-native — toolchain gates (real SDKs)', () => {
  const SRC = `import { Stack, Text } from '@pyreon/primitives'
const theme = defineTheme({ color: { primary: '#ff3b30' }, spacing: { md: 20 }, radius: { sm: 6 } })
const Card = styled(Stack)\`background: \${(t) => t.color.primary}; padding: \${(t) => t.spacing.md}; border-radius: \${(t) => t.radius.sm}\`
const Btn = rocketstyle()({ name: 'Btn', component: Stack }).states({ primary: { backgroundColor: t.color.primary, padding: t.spacing.lg } })
function App() { return (<Card><Btn state="primary"><Text>x</Text></Btn></Card>) }`

  it.skipIf(!isSwiftUIAvailable())('the app-themed styler + rocketstyle output typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the app-themed output compiles (real kotlinc)', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error).toBe(true)
  })
})
