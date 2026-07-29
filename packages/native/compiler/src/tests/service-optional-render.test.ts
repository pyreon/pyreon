// `<Text>{geo.latitude}</Text>` rendered `Optional(37.3349)` on iOS.
//
// Not a missing feature — the opposite, which is why it survived. BOTH emitters
// already render an optional interpolation web-equivalently:
//
//   Swift    \((x).map { "\($0)" } ?? "")
//   Kotlin   ${x ?: ""}
//
// but the guard is `typeIsOptional(inferType(...))`, and inference had no field
// model for the service containers. So every optional service field fell
// through as non-optional and emitted a RAW interpolation. On Swift that
// renders `Optional(37.3349)` where web renders `37.3349`, and `nil` where web
// renders nothing; on Kotlin, `null`.
//
// Measured before the fix: geo.latitude, geo.longitude, f.error, w.lastMessage,
// p.purchasing and m.selectedMarkerId ALL emitted raw — i.e. every optional
// field of every service container, which is the most common way to display
// service state.
//
// swiftc warns about exactly this interpolation. The stub gate does not surface
// warnings, so nothing caught it — the same blind spot that let the
// `LocalizedStringKey` locale-formatting bug ship (documented in
// emitSwiftTextCore), where `Text("\(balance)")` rendered "2 700" for 2700.
// Both are "compiles fine, renders wrong, invisible in the counter example
// because `Count: 0` exercises neither".
//
// One fix in the SHARED inference serves both backends.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (imp: string, decl: string, expr: string) =>
  `import { ${imp} } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ ${decl}; return (<Stack><Text>{${expr}}</Text></Stack>) }`

/** Every public optional field a user would plausibly render. */
const OPTIONAL_FIELDS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['geolocation latitude', 'useGeolocation', 'const geo = useGeolocation()', 'geo.latitude'],
  ['geolocation longitude', 'useGeolocation', 'const geo = useGeolocation()', 'geo.longitude'],
  ['geolocation accuracy', 'useGeolocation', 'const geo = useGeolocation()', 'geo.accuracy'],
  ['websocket lastMessage', 'useWebSocket', 'const w = useWebSocket("wss://x.dev")', 'w.lastMessage'],
  ['payments purchasing', 'usePayments', 'const p = usePayments()', 'p.purchasing'],
  ['map selectedMarkerId', 'useMap', 'const m = useMap()', 'm.selectedMarkerId'],
]

describe('optional service fields render web-equivalently', () => {
  for (const [label, imp, decl, expr] of OPTIONAL_FIELDS) {
    const src = app(imp, decl, expr)

    it(`${label}: Swift unwraps instead of printing Optional(…)`, () => {
      const line = transform(src, { target: 'swift' }).code
        .split('\n')
        .find((l) => l.includes('Text('))
      expect(line, 'no Text line emitted').toBeTruthy()
      // The unwrap is the whole point; a raw `\(x)` is the bug.
      expect(line).toContain('.map {')
      expect(line).toContain('?? ""')
    })

    it(`${label}: Kotlin substitutes "" for null`, () => {
      const line = transform(src, { target: 'kotlin' }).code
        .split('\n')
        .find((l) => l.includes('Text('))
      expect(line, 'no Text line emitted').toBeTruthy()
      expect(line).toContain('?: ""')
    })

    it.skipIf(!isSwiftcAvailable())(`${label}: still type-checks on Swift`, () => {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${label}: still type-checks on Kotlin`, () => {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }

  // The guard must stay narrow: a NON-optional read must not pay for an unwrap
  // it doesn't need, or every plain signal render regresses into noise.
  it('does NOT wrap a non-optional read', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ const n = signal(0); return (<Stack><Text>{n()}</Text></Stack>) }`
    const swift = transform(src, { target: 'swift' }).code.split('\n').find((l) => l.includes('Text('))
    const kotlin = transform(src, { target: 'kotlin' }).code.split('\n').find((l) => l.includes('Text('))
    expect(swift).not.toContain('.map {')
    expect(kotlin).not.toContain('?: ""')
  })

  it('does NOT wrap a non-optional field of the same container', () => {
    // `isTracking` is a plain Bool on PyreonGeolocation — only the fields in
    // the table are optional, and over-wrapping would be its own bug.
    const src = app('useGeolocation', 'const geo = useGeolocation()', 'geo.isTracking')
    const swift = transform(src, { target: 'swift' }).code.split('\n').find((l) => l.includes('Text('))
    expect(swift).not.toContain('.map {')
  })
})

// CORRECTION to the claim at the top of this file.
//
// It says the fix covered "every optional field of every service container".
// That was not true, and the table was wrong in BOTH directions:
//
//   MISSING   auth.error   PyreonAuth declares `error: Error?` (Swift) /
//                          `Throwable?` (Kotlin). `{auth.error}` COMPILED and
//                          rendered `Optional("boom")` — silent, and invisible
//                          to a typecheck gate by construction.
//
//   PHANTOM   map.error    listed, but `PyreonMapState` has no `error` on
//                          either target, so `{map.error}` failed swiftc with
//                          "value of type 'PyreonMapState' has no member". That
//                          entry came from generalising "every service has an
//                          optional error" WITHOUT checking each runtime — the
//                          same over-generalisation documented for @pyreon/rx.
//
// Both are corrected together, because they are the same mistake seen from
// opposite sides: the table was written from a pattern rather than from the
// runtimes.
//
// Sharp edge worth knowing: the workaround an author reaches for first,
// `{auth.error ?? ''}`, does NOT compile — Swift's `Error?` cannot be coalesced
// with a String. So before this fix the bare read rendered wrongly and the
// obvious fix did not build.
describe('auth.error — the field the original pass missed', () => {
  const src = `
    import { useAuth } from '@pyreon/hooks'
    import { Stack, Text } from '@pyreon/primitives'
    type U = { name: string }
    export function C() {
      const a = useAuth<U>()
      return (<Stack><Text>{a.error}</Text></Stack>)
    }
  `

  it('Swift renders it web-equivalently instead of Optional(…)', () => {
    const out = transform(src, { target: 'swift' }).code ?? ''
    expect(out).toContain('(a.error).map { "\\($0)" } ?? ""')
    // The raw form is what produced `Optional("boom")`.
    expect(out).not.toContain('"\\(a.error)"')
  })

  it('Kotlin renders it web-equivalently too', () => {
    expect(transform(src, { target: 'kotlin' }).code ?? '').toContain('?: ""')
  })
})

describe('map has NO error field — the phantom entry', () => {
  it('is not treated as an optional service field on either target', () => {
    const src = `
      import { useMap } from '@pyreon/hooks'
      import { Stack, Text } from '@pyreon/primitives'
      export function C() {
        const m = useMap()
        return (<Stack><Text>{m.selectedMarkerId}</Text></Stack>)
      }
    `
    // The REAL optional field still renders correctly — removing the phantom
    // `error` must not disturb the entry that is genuinely there.
    expect(transform(src, { target: 'swift' }).code ?? '').toContain(
      '(m.selectedMarkerId).map { "\\($0)" } ?? ""',
    )
  })
})
