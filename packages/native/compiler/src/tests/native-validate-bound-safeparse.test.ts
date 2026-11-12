// `Pet.safeParse(x)` on a FILE-SCOPE `@pyreon/validate` schema binding.
//
// `const Pet = s.object({ … })` lowers to a struct `PyreonZodSchema_Pet` with
// STATIC parse methods plus a module-scope INSTANCE `let Pet = …()`. The call
// used to be emitted verbatim — `Pet.safeParse(__Obj0(name: "x", age: 3))`:
// a static method called through an instance, with an object literal lowered
// to a synthesized struct where the method takes a dictionary. Neither target
// compiled it, and PMTC said nothing. It now lowers the way the inline
// `s.object({ … }).safeParse(x)` form already did.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable } from '../validate'
import { runtimeSwiftSources, swiftErrorLines, typecheckAgainstRealRuntime } from './real-runtime-swift'

const BOUND = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string(), age: s.number() })
export function App() {
  const ok = computed(() => Pet.safeParse({ name: 'x', age: 3 }).ok)
  const name = computed(() => { const r = Pet.parse({ name: 'x', age: 3 }); return r.ok ? r.value.name : 'none' })
  const firstIssue = computed(() => { const r = Pet.safeParse({ age: 3 }); return r.ok ? '' : r.issues[0]!.path.join('.') })
  return <Stack><Text>{ok() ? name() : 'invalid'}</Text><Text>{firstIssue()}</Text></Stack>
}`

// The lathe shape: the schema is DECLARED BELOW the component that uses it,
// and a same-named TYPE forces the value rename (#3717) — the call must follow
// the renamed binding.
const NAMESAKE = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export type Pet = { name: string; age: number }
export function App() {
  const ok = computed(() => Pet.safeParse({ name: 'x', age: 3 }).ok)
  return <Text>{ok() ? 'valid' : 'invalid'}</Text>
}
export const Pet = s.object({ name: s.string(), age: s.number() })
`

describe('`Binding.safeParse(x)` on a file-scope @pyreon/validate schema', () => {
  it('Swift: the library\'s own non-throwing result over the struct\'s parse, argument as a dictionary', () => {
    const { code, warnings } = transform(BOUND, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain(
      'pyreonValidateResult { try PyreonZodSchema_Pet.parse(["name": "x", "age": 3] as [String: Any]) }.ok',
    )
    // `.parse` and `.safeParse` are ONE method on the web, so they lower identically.
    expect(code).toContain('let r = pyreonValidateResult { try PyreonZodSchema_Pet.parse(')
    expect(code).toContain('r.ok ? r.value.name : "none"')
    expect(code).toContain('r.issues[0].path.joined(separator: ".")')
    // zod's `{ success, data }` is not this library's shape.
    expect(code).not.toContain('safeParseResult')
    // The result type is the runtime's, never declared per file.
    expect(code).not.toMatch(/struct PyreonValidateResult\b/)
    // The broken verbatim form is gone.
    expect(code).not.toMatch(/\bPet\.safeParse\(/)
    expect(code).not.toContain('__Obj0(name:')
    // The named binding keeps its instance (other code may reference it).
    expect(code).toContain('let Pet = PyreonZodSchema_Pet()')
    expect(code).toContain('private var ok: Bool')
  })

  it('Kotlin: the same result over the companion parse, argument as a Map', () => {
    const { code, warnings } = transform(BOUND, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).toContain(
      'pyreonValidateResult { PyreonZodSchema_Pet.parse(mapOf<String, Any?>("name" to "x", "age" to 3L)) }.ok',
    )
    expect(code).not.toContain('safeParseResult')
    expect(code).not.toMatch(/\bPet\.safeParse\(/)
  })

  it('resolves a schema declared BELOW its use, through the value/type rename', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = transform(NAMESAKE, { target })
      expect(warnings).toEqual([])
      expect(code).toContain('PyreonZodSchema_PetValue.parse(')
      expect(code).not.toContain('PyreonZodSchema_Pet.')
    }
  })

  it('a schema that does NOT call safeParse gets no safeParseResult (bytes unchanged)', () => {
    const src = `import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string() })
export function App() { return null }`
    const { code } = transform(src, { target: 'swift' })
    expect(code).not.toContain('safeParseResult')
    expect(code).not.toContain('PyreonParseResult')
  })

  it('`.parse(x)` NEVER throws — on the web it returns `{ ok, value | issues }`, so natively it does too', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string() })
export function App() {
  const n = computed(() => { const r = Pet.parse({ name: 'x' }); return r.ok ? r.value.name : '-' })
  return <Text>{n()}</Text>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = transform(src, { target })
      expect(code).toContain('pyreonValidateResult {')
      expect(code).not.toMatch(/(?<!PyreonZodSchema_)\bPet\.parse\(/)
      expect(warnings).toEqual([])
    }
    expect(transform(src, { target: 'swift' }).code).not.toContain('try!')
  })

  it('`.safeParse` on a discriminatedUnion binding WARNS by name', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Shape = s.discriminatedUnion('kind', [
  s.object({ kind: s.literal('a'), n: s.number() }),
  s.object({ kind: s.literal('b'), t: s.string() }),
])
export function App() {
  const ok = computed(() => Shape.safeParse({ kind: 'a', n: 1 }).ok)
  return <Text>{ok() ? 'y' : 'n'}</Text>
}`
    const { warnings } = transform(src, { target: 'swift' })
    expect(
      warnings.some((w) => w.includes('`Shape.safeParse(…)`') && w.includes('discriminatedUnion')),
    ).toBe(true)
  })

  it('leaves an unrelated `.parse` / `.safeParse` alone', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string() })
const other = { parse: (x: number) => x + 1 }
export function App() {
  const n = computed(() => other.parse(2))
  return <Text>{n()}</Text>
}`
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain('other.parse(2)')
  })
})

describe('bound `.safeParse` compiles on both toolchains', () => {
  for (const [name, src] of Object.entries({ bound: BOUND, namesake: NAMESAKE })) {
    it.skipIf(!isSwiftcAvailable())(`${name}: Swift against the stubs`, () => {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(
      `${name}: Kotlin on kotlinc`,
      () => {
        const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(r.ok, r.error).toBe(true)
      },
      300_000,
    )
  }

  // The REAL iOS SDK with the REAL runtime sources linked in — a stub cannot
  // mask a missing `Result`/`Codable` conformance here.
  it.runIf(isSwiftUIAvailable())(
    'Swift: against the real iOS SDK + runtime',
    () => {
      const sources = runtimeSwiftSources()
      expect(sources.length).toBeGreaterThan(40)
      const diagnostics = typecheckAgainstRealRuntime(
        [{ name: 'BoundSafeParse.swift', code: transform(BOUND, { target: 'swift' }).code }],
        { sources },
      )
      if (diagnostics !== null) expect.fail(`swiftc -typecheck failed:\n${swiftErrorLines(diagnostics)}`)
    },
    900_000,
  )
})
