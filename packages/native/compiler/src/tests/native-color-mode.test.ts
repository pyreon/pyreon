// `useColorMode()` (@pyreon/core, the framework-wide mode) lowers to the
// platform scheme read, exactly as `useColorScheme()` (@pyreon/hooks) does —
// same `'light' | 'dark'` string, same emit.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const app = (imp: string, hook: string) => `import { Text } from '@pyreon/primitives'
${imp}
export function Badge() {
  const mode = ${hook}()
  return <Text>{mode() === 'dark' ? 'night' : 'day'}</Text>
}`

describe('useColorMode on native', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: emits exactly what useColorScheme emits, with no warning`, () => {
      const mode = transform(app("import { useColorMode } from '@pyreon/core'", 'useColorMode'), { target })
      const scheme = transform(app("import { useColorScheme } from '@pyreon/hooks'", 'useColorScheme'), { target })
      expect(mode.warnings).toEqual([])
      expect(mode.code).toBe(scheme.code)
      expect(mode.code).toContain(target === 'swift' ? 'colorScheme' : 'isSystemInDarkTheme()')
    })
  }
})

import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const PINNED = `import { Text } from '@pyreon/primitives'
import { ColorModeProvider, useColorMode } from '@pyreon/core'
function Badge() {
  const mode = useColorMode()
  return <Text>{mode() === 'dark' ? 'night' : 'day'}</Text>
}
export function App() {
  return (
    <ColorModeProvider mode="dark">
      <Badge />
    </ColorModeProvider>
  )
}`

describe('a literal <ColorModeProvider mode> pins the platform scheme for its subtree', () => {
  it("swift: the subtree's colour scheme is set, so useColorMode below reads it", () => {
    const r = transform(PINNED, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.environment(\\.colorScheme, .dark)')
  })
  it("kotlin: the subtree's configuration night bit is set, which isSystemInDarkTheme reads", () => {
    const r = transform(PINNED, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('CompositionLocalProvider(LocalConfiguration provides')
    expect(r.code).toContain('UI_MODE_NIGHT_YES')
  })
  it("'system' pins nothing", () => {
    const sys = PINNED.replace('mode="dark"', 'mode="system"')
    expect(transform(sys, { target: 'swift' }).code).not.toContain('.environment(\\.colorScheme')
    expect(transform(sys, { target: 'kotlin' }).code).not.toContain('CompositionLocalProvider(LocalConfiguration')
  })
  it('swiftc accepts it', { skip: !isSwiftcAvailable() }, () => {
    const r = validateSwiftWithStubs(transform(PINNED, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it('kotlinc accepts it', { skip: !isKotlincAvailable() }, () => {
    const r = validateKotlin(transform(PINNED, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
