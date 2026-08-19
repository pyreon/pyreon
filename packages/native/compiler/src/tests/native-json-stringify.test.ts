// `JSON.stringify(x)` lowers to native — the SAFE half of the JSON gap.
//
// The emitted structs are already Codable (Swift) / @Serializable (Kotlin), so
// serialization has a target on both platforms: Swift `JSONEncoder().encode`,
// Kotlin `Json.encodeToString`. `try!` is safe (a Codable value never throws on
// encode). `JSON.parse` stays a NAMED WARNING: it throws on malformed input,
// which needs a native error model (try/throw lowering) PMTC does not carry —
// a tracked follow-up.
//
// Verified END-TO-END against real swiftc + kotlinc.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'
const OBJ = `
import { Stack, Text } from '${P}'
function App() {
  const user = signal({ id: 1, name: "a" })
  const payload = computed(() => JSON.stringify(user()))
  return (<Stack><Text>{payload()}</Text></Stack>)
}
`
const ARR = `
import { Stack, Text } from '${P}'
function App() {
  const rows = signal([{ id: 1, name: "a" }])
  const dump = computed(() => JSON.stringify(rows()))
  return (<Stack><Text>{dump()}</Text></Stack>)
}
`
const PARSE = `
import { Stack, Text } from '${P}'
function App() {
  const raw = signal("[]")
  const items = computed(() => JSON.parse(raw()))
  return (<Stack><Text>x</Text></Stack>)
}
`

describe('JSON.stringify → native serialization', () => {
  it('Swift: emits JSONEncoder().encode, typed String, no warning', () => {
    const r = transform(OBJ, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('try! JSONEncoder().encode(user)')
    expect(r.code).toContain('private var payload: String')
  })

  it('Kotlin: emits Json.encodeToString, no warning', () => {
    const r = transform(OBJ, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Json.encodeToString(user)')
  })

  it('JSON.parse still WARNS by name (throws — coupled to the exceptions gap)', () => {
    const r = transform(PARSE, { target: 'swift' })
    const warn = r.warnings.find((w) => w.includes('JSON.parse'))
    expect(warn, 'JSON.parse must warn, not lower').toBeTruthy()
    expect(warn).toContain('native error model')
    // …and JSON.stringify in the same corpus does NOT warn.
    expect(transform(OBJ, { target: 'swift' }).warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('typechecks against real SwiftUI stubs (object + array)', () => {
    for (const src of [OBJ, ARR]) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error).toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('compiles against real Compose + kotlinx stubs (object + array)', () => {
    for (const src of [OBJ, ARR]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error).toBe(true)
    }
  })
})
