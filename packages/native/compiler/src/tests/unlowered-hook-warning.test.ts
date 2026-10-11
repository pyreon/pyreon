// A Pyreon hook with no native lowering emitted uncompilable code, silently.
//
// The parser lowers 28 hooks. Anything else imported from a `@pyreon/*` package
// and called as `useX()` fell through to the generic `const x = <call>` emit,
// which reproduces the call VERBATIM — and there is no `useWatch` (or
// `useHover`, or `useElementSize`) in the Swift or Kotlin runtime.
//
//   const value = useWatch('email')
//   →  let value = useWatch("email")      // cannot find … in scope
//
// with zero warnings. 38 of the 52 hooks `@pyreon/hooks` and `@pyreon/form`
// export behave this way, so the first sign of trouble was a device build
// failing — or nothing at all, for an app nobody type-checked.
//
// The fix is a NAMED warning, not 38 lowerings: the PMTC arc's stated direction
// is that the failure mode outside the supported subset should be a named
// warning rather than a silent drop. Implementing `useElementSize` on SwiftUI
// is a different project; telling the author it will not work is a compile
// away.

import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import { nativeLoweredHooks } from '../parse'
import { FIRST_PARTY_PLUGINS } from '../../../../../scripts/native-first-party-plugins'
import { transform } from './first-party-plugins'

const app = (imports: string, body: string) => `${imports}
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  ${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const warningsFor = (src: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(src, { target }).warnings ?? []

describe('a Pyreon hook with no native lowering', () => {
  it('warns, naming the hook and its package', () => {
    const w = warningsFor(
      app(`import { useWatch } from '@pyreon/form'`, `const value = useWatch('email')`),
    )
    const hit = w.find((x) => x.includes('useWatch'))
    expect(hit, `no warning for useWatch; got ${JSON.stringify(w)}`).toBeTruthy()
    expect(hit).toContain('@pyreon/form')
  })

  it('quotes the error the author would otherwise hit', () => {
    // The value is not "this is unsupported" — it is that the reader can match
    // the message to the compiler error they are about to see, or already saw.
    const w = warningsFor(
      // `useToggle` used to be the example here; it LOWERS now (pure state,
      // no platform dependency). `useHover` is genuinely DOM-bound.
      app(`import { useHover } from '@pyreon/hooks'`, `const h = useHover()`),
    )
    expect(w.some((x) => x.includes(`cannot find 'useHover' in scope`))).toBe(true)
  })

  it('offers a way out, not just a refusal', () => {
    const w = warningsFor(
      app(`import { useElementSize } from '@pyreon/hooks'`, `const size = useElementSize()`),
    )
    expect(w.some((x) => x.includes('<Web>'))).toBe(true)
  })

  it('warns on BOTH targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = warningsFor(
        app(`import { useWatch } from '@pyreon/form'`, `const value = useWatch('email')`),
        target,
      )
      expect(
        w.some((x) => x.includes('useWatch')),
        target,
      ).toBe(true)
    }
  })

  it('does NOT warn for a hook that IS lowered', () => {
    const w = warningsFor(
      app(`import { useClipboard } from '@pyreon/hooks'`, `const clip = useClipboard()`),
    )
    expect(w.filter((x) => x.includes('NO native lowering'))).toEqual([])
  })

  it('does NOT warn for a USER-DEFINED hook', () => {
    // A user's own `useThing()` is ordinary code the compiler may well handle.
    // Warning about it would be noise, and noise is how a warning gets ignored.
    const w = warningsFor(app(`import { useThing } from './my-hooks'`, `const t = useThing()`))
    expect(w.filter((x) => x.includes('NO native lowering'))).toEqual([])
  })

  it('warns once per hook, not once per usage', () => {
    const src = app(
      `import { useWatch } from '@pyreon/form'`,
      `const a = useWatch('one')\n  const b = useWatch('two')`,
    )
    expect(warningsFor(src).filter((x) => x.includes('useWatch'))).toHaveLength(1)
  })

  // Claims must follow the loaded owners, including statement and pattern calls.
  it('derives native hook claims from loaded plugins without compiler fallback claims', () => {
    const bare = nativeLoweredHooks(createCompiler().registries)
    const owned = nativeLoweredHooks(createCompiler({ plugins: FIRST_PARTY_PLUGINS }).registries)
    expect(bare.size).toBe(0)
    expect(owned.size).toBeGreaterThan(28)
    for (const hook of [
      'useForm',
      'useFieldArray',
      'useCounter',
      'useInterval',
      'useTimeout',
      'useParams',
      'useHotkey',
      'useColorMode',
      'useNativeModule',
    ]) {
      expect(bare.has(hook), hook).toBe(false)
      expect(owned.has(hook), hook).toBe(true)
    }
  })
})
