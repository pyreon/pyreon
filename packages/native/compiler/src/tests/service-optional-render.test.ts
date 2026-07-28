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
