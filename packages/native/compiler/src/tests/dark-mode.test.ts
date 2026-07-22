// Dark mode on native — by COMPOSITION, not a new mechanism.
//
// `useColorScheme()` already lowers to `@Environment(\.colorScheme)` (Swift) /
// `isSystemInDarkTheme()` (Kotlin) as a reactive `"dark"`/`"light"` string. A
// rocketstyle DYNAMIC dimension flip (this stack) keyed on it —
// `state={scheme === 'dark' ? 'onDark' : 'onLight'}` — therefore lowers a
// dark-mode-reactive style: `.background((scheme == "dark") ? dark : light)`.
// No `mode()` primitive needed; the two features compose.
//
// This suite also locks the stub fix: the validate-kotlin gate was missing
// `isSystemInDarkTheme`, so ANY useColorScheme Kotlin emit failed kotlinc.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const CARD = `import { Stack, Text } from '@pyreon/primitives'
const Card = rocketstyle()({ name: 'Card', component: Stack })
  .theme(() => ({ padding: '16px' }))
  .states({ onLight: { backgroundColor: '#ffffff' }, onDark: { backgroundColor: '#111827' } })
export function App() {
  const scheme = useColorScheme()
  return (<Card state={scheme === 'dark' ? 'onDark' : 'onLight'}><Text>Hi</Text></Card>)
}`

describe('dark mode — useColorScheme + dynamic dimension composition', () => {
  it('lowers a dark-mode dimension flip to a colorScheme-conditional background (Swift)', () => {
    const { code } = transform(CARD, { target: 'swift' })
    expect(code).toContain('@Environment(\\.colorScheme) private var pyreonColorScheme: ColorScheme')
    expect(code).toContain('private var scheme: String { pyreonColorScheme == .dark ? "dark" : "light" }')
    // #111827 (onDark) when dark, #ffffff (onLight) otherwise.
    expect(code).toContain('.background(((scheme == "dark") ? Color(.sRGB, red: 0.067')
    expect(code).toContain(': Color(.sRGB, red: 1.000, green: 1.000, blue: 1.000')
  })

  it('lowers the same flip to an isSystemInDarkTheme-derived conditional (Kotlin)', () => {
    const { code } = transform(CARD, { target: 'kotlin' })
    expect(code).toContain('val scheme = if (isSystemInDarkTheme()) "dark" else "light"')
    expect(code).toContain('.background((if (scheme == "dark") Color(0xFF111827) else Color(0xFFFFFFFF)))')
  })
})

describe('dark mode — toolchain gates (real SDKs)', () => {
  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the dark-mode composition typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(transform(CARD, { target: 'swift' }).code)
    expect(res.ok, res.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the dark-mode composition compiles (real kotlinc)', () => {
    const res = validateKotlin(transform(CARD, { target: 'kotlin' }).code)
    expect(res.ok, res.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')(
    'a bare useColorScheme() Kotlin emit compiles — the isSystemInDarkTheme stub is present',
    () => {
      // Isolates the stub fix: previously the validate-kotlin stub omitted
      // isSystemInDarkTheme, so this failed with `unresolved reference`.
      const src = `import { Text } from '@pyreon/primitives'
export function App() { const scheme = useColorScheme(); return (<Text>{scheme}</Text>) }`
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error).toBe(true)
    },
  )
})
