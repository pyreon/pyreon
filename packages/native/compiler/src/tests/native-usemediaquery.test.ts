// `useMediaQuery('(prefers-color-scheme: dark | light)')` native emit — a boolean read of the system appearance.
//
// Only the literal colour-scheme queries lower: the platforms answer them directly (`@Environment(\.colorScheme)` /
// `isSystemInDarkTheme()`). A width or orientation query is a NAMED warning that drops the hook, because natively those
// questions are answered in window size classes, not CSS pixels, and an approximation would change what the app shows.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const src = (query: string) => `
import { Stack, Text } from '@pyreon/primitives'
import { useMediaQuery } from '@pyreon/hooks'
export function Themed() {
  const dark = useMediaQuery('${query}')
  return (
    <Stack>
      <Text>{dark() ? 'night' : 'day'}</Text>
    </Stack>
  )
}
`
const DARK = src('(prefers-color-scheme: dark)')
const LIGHT = src('(prefers-color-scheme: light)')
const swiftOf = (s: string) => transform(s, { target: 'swift' })
const kotlinOf = (s: string) => transform(s, { target: 'kotlin' })

describe('useMediaQuery() prefers-color-scheme emit', () => {
  it('Swift: a computed Bool over the injected colour scheme, read bare', () => {
    const r = swiftOf(DARK)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('private var dark: Bool { pyreonColorScheme == .dark }')
    expect(r.code).toContain('dark ?')
    expect(r.code).not.toContain('dark()')
    expect(swiftOf(LIGHT).code).toContain('pyreonColorScheme == .light')
  })

  it('Kotlin: isSystemInDarkTheme(), negated for the light query', () => {
    const r = kotlinOf(DARK)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val dark = isSystemInDarkTheme()')
    expect(kotlinOf(LIGHT).code).toContain('val dark = !isSystemInDarkTheme()')
  })

  it.each([
    ['a width query', '(min-width: 768px)'],
    ['an orientation query', '(orientation: portrait)'],
    ['reduced motion', '(prefers-reduced-motion: reduce)'],
  ])('%s is a named warning that drops the hook', (_label, query) => {
    for (const r of [swiftOf(src(query)), kotlinOf(src(query))]) {
      expect(r.warnings.join('\n')).toContain('useMediaQuery()')
      expect(r.code).not.toContain('isSystemInDarkTheme')
      expect(r.code).not.toContain('pyreonColorScheme ==')
    }
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    for (const s of [DARK, LIGHT]) {
      const v = validateSwiftWithStubs(swiftOf(s).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    for (const s of [DARK, LIGHT]) {
      const v = validateKotlin(kotlinOf(s).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})
