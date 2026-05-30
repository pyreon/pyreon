// Phase 4 follow-up — `useColorScheme()` native emit.
//
// Reads the platform-native dark-mode preference. NO runtime port
// needed (both SwiftUI's `@Environment(\.colorScheme)` and Compose's
// `isSystemInDarkTheme()` ship the primitive). Emit returns the same
// `"light" | "dark"` string shape the web `@pyreon/hooks` hook uses
// so cross-platform code reading `scheme === 'dark'` works on all
// three targets.
//
// Per-target emit:
//   Swift  → @Environment(\.colorScheme) private var pyreonColorScheme
//            + private var ${name}: String { pyreonColorScheme == .dark
//              ? "dark" : "light" }
//          (computed property — @Environment isn't readable at
//           stored-let init time; same constraint the router hooks
//           document.)
//   Kotlin → val ${name} = if (isSystemInDarkTheme()) "dark" else "light"
//          (isSystemInDarkTheme is `@Composable Boolean` from
//           androidx.compose.foundation.)

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Phase 4 follow-up — useColorScheme() native emit', () => {
  describe('Swift', () => {
    it('emits @Environment(\\.colorScheme) injection on the View struct', () => {
      const out = transform(
        `export function App() { const scheme = useColorScheme(); return <Text>{scheme}</Text> }`,
        { target: 'swift' },
      ).code
      expect(out).toContain('@Environment(\\.colorScheme) private var pyreonColorScheme: ColorScheme')
    })

    it('emits a computed property returning "light" | "dark" string', () => {
      const out = transform(
        `export function App() { const scheme = useColorScheme(); return <Text>{scheme}</Text> }`,
        { target: 'swift' },
      ).code
      expect(out).toContain(
        'private var scheme: String { pyreonColorScheme == .dark ? "dark" : "light" }',
      )
    })

    it('skips the @Environment injection when useColorScheme is NOT declared (no env pollution)', () => {
      const out = transform(
        `export function App() { return <Text>plain</Text> }`,
        { target: 'swift' },
      ).code
      expect(out).not.toContain('@Environment(\\.colorScheme)')
      expect(out).not.toContain('pyreonColorScheme')
    })

    it('multiple useColorScheme bindings emit independent computeds (rare but supported)', () => {
      const out = transform(
        `
        export function App() {
          const a = useColorScheme()
          const b = useColorScheme()
          return <Text>{a + b}</Text>
        }
        `,
        { target: 'swift' },
      ).code
      // Both computeds present (separate names).
      expect(out).toContain('private var a: String {')
      expect(out).toContain('private var b: String {')
      // ONE @Environment injection (idempotent — flag is set per-component, not per-decl).
      const envCount = (out.match(/@Environment\(\\\.colorScheme\)/g) ?? []).length
      expect(envCount).toBe(1)
    })
  })

  describe('Kotlin', () => {
    it('emits isSystemInDarkTheme() → "dark"/"light" ternary', () => {
      const out = transform(
        `export function App() { const scheme = useColorScheme(); return <Text>{scheme}</Text> }`,
        { target: 'kotlin' },
      ).code
      expect(out).toContain('val scheme = if (isSystemInDarkTheme()) "dark" else "light"')
    })

    it('does NOT inject a remember/LocalContext for the no-runtime-port case', () => {
      const out = transform(
        `export function App() { const scheme = useColorScheme(); return <Text>{scheme}</Text> }`,
        { target: 'kotlin' },
      ).code
      // Should be a plain val — no remember wrapper, no LocalContext hoisting.
      expect(out).not.toContain('remember { PyreonColorScheme(')
      expect(out).not.toContain('LocalContext.current')
    })
  })

  it('cross-platform: both targets return the same "light" | "dark" string contract', () => {
    const src = `export function App() {
      const scheme = useColorScheme()
      return <Show when={() => scheme === 'dark'}><Text>dark</Text></Show>
    }`
    const swift = transform(src, { target: 'swift' }).code
    const kotlin = transform(src, { target: 'kotlin' }).code
    // Both targets emit string literals "dark" and "light" — the
    // shape that lets the same source `scheme === 'dark'` comparison
    // work on web (string) + Swift (string) + Kotlin (string).
    for (const out of [swift, kotlin]) {
      expect(out).toContain('"dark"')
      expect(out).toContain('"light"')
    }
  })
})
