// M2.2 — `const sizeClass = useSizeClass()` horizontal size-class read.
//
// The cross-platform analog of `useColorScheme` — a reactive
// platform-native environment read with NO runtime port. Returns the
// same `"compact" | "regular"` string on all three targets so shared
// code reading `sizeClass === 'regular'` works identically. `'regular'`
// = an expanded (tablet / landscape / split) width; `'compact'` = phone.
//
// Per-target emit:
//   Swift  → @Environment(\.horizontalSizeClass) private var pyreonSizeClass
//            + private var ${name}: String { pyreonSizeClass == .regular
//              ? "regular" : "compact" }
//          (computed property — @Environment isn't readable at
//           stored-let init time; same constraint color-scheme documents.)
//   Kotlin → val ${name} = if (LocalConfiguration.current.screenWidthDp >= 600)
//              "regular" else "compact"
//          (LocalConfiguration recomposes on configuration change, so the
//           read is reactive — no runtime port.)
//
// This spec locks the EMIT SHAPE + is the bisect target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('M2.2 — useSizeClass() native emit', () => {
  describe('Swift', () => {
    it('emits @Environment(\\.horizontalSizeClass) injection on the View struct', () => {
      const out = transform(
        `export function App() { const sizeClass = useSizeClass(); return <Text>{sizeClass}</Text> }`,
        { target: 'swift' },
      ).code
      expect(out).toContain(
        '@Environment(\\.horizontalSizeClass) private var pyreonSizeClass: UserInterfaceSizeClass?',
      )
    })

    it('emits a computed property returning "compact" | "regular" string', () => {
      const out = transform(
        `export function App() { const sizeClass = useSizeClass(); return <Text>{sizeClass}</Text> }`,
        { target: 'swift' },
      ).code
      expect(out).toContain(
        'private var sizeClass: String { pyreonSizeClass == .regular ? "regular" : "compact" }',
      )
    })

    it('skips the @Environment injection when useSizeClass is NOT declared (no env pollution)', () => {
      const out = transform(
        `export function App() { return <Text>plain</Text> }`,
        { target: 'swift' },
      ).code
      expect(out).not.toContain('@Environment(\\.horizontalSizeClass)')
      expect(out).not.toContain('pyreonSizeClass')
    })

    it('multiple useSizeClass bindings emit independent computeds with ONE injection', () => {
      const out = transform(
        `
        export function App() {
          const a = useSizeClass()
          const b = useSizeClass()
          return <Text>{a + b}</Text>
        }
        `,
        { target: 'swift' },
      ).code
      expect(out).toContain('private var a: String {')
      expect(out).toContain('private var b: String {')
      // ONE @Environment injection (flag is per-component, not per-decl).
      const envCount = (out.match(/@Environment\(\\\.horizontalSizeClass\)/g) ?? []).length
      expect(envCount).toBe(1)
    })
  })

  describe('Kotlin', () => {
    it('emits a LocalConfiguration width read → "regular"/"compact" ternary', () => {
      const out = transform(
        `export function App() { const sizeClass = useSizeClass(); return <Text>{sizeClass}</Text> }`,
        { target: 'kotlin' },
      ).code
      expect(out).toContain(
        'val sizeClass = if (LocalConfiguration.current.screenWidthDp >= 600) "regular" else "compact"',
      )
    })

    it('does NOT inject a remember/LocalContext for the no-runtime-port case', () => {
      const out = transform(
        `export function App() { const sizeClass = useSizeClass(); return <Text>{sizeClass}</Text> }`,
        { target: 'kotlin' },
      ).code
      // A plain val — no runtime-port wrapper, no Context hoisting.
      expect(out).not.toContain('remember { PyreonSizeClass(')
      expect(out).not.toContain('LocalContext.current')
    })
  })

  it('cross-platform: both targets return the same "compact" | "regular" contract', () => {
    const src = `export function App() {
      const sizeClass = useSizeClass()
      return <Show when={() => sizeClass === 'regular'}><Text>wide</Text></Show>
    }`
    const swift = transform(src, { target: 'swift' }).code
    const kotlin = transform(src, { target: 'kotlin' }).code
    for (const out of [swift, kotlin]) {
      expect(out).toContain('"regular"')
      expect(out).toContain('"compact"')
    }
  })
})
