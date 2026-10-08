// `Pet.safeParse(x)` on a FILE-SCOPE `@pyreon/validate` schema binding.
//
// `const Pet = s.object({ … })` lowers to a struct `PyreonZodSchema_Pet` with
// STATIC parse methods plus a module-scope INSTANCE `let Pet = …()`. The call
// used to be emitted verbatim — `Pet.safeParse(__Obj0(name: "x", age: 3))`:
// a static method called through an instance, with an object literal lowered
// to a synthesized struct where the method takes a dictionary. Neither target
// compiled it, and PMTC said nothing. It now lowers the way the inline
// `s.object({ … }).safeParse(x)` form already did.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable } from '../validate'

const BOUND = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string(), age: s.number() })
export function App() {
  const ok = computed(() => Pet.safeParse({ name: 'x', age: 3 }).success)
  const name = computed(() => Pet.safeParse({ name: 'x', age: 3 }).data?.name ?? 'none')
  return <Text>{ok() ? name() : 'invalid'}</Text>
}`

// The lathe shape: the schema is DECLARED BELOW the component that uses it,
// and a same-named TYPE forces the value rename (#3717) — the call must follow
// the renamed binding.
const NAMESAKE = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export type Pet = { name: string; age: number }
export function App() {
  const ok = computed(() => Pet.safeParse({ name: 'x', age: 3 }).success)
  return <Text>{ok() ? 'valid' : 'invalid'}</Text>
}
export const Pet = s.object({ name: s.string(), age: s.number() })
`

describe('`Binding.safeParse(x)` on a file-scope @pyreon/validate schema', () => {
  it('Swift: a static safeParseResult call on the binding struct, argument as a dictionary', () => {
    const { code, warnings } = transform(BOUND, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain(
      'PyreonZodSchema_Pet.safeParseResult(["name": "x", "age": 3] as [String: Any]).success',
    )
    expect(code).toContain(
      'static func safeParseResult(_ input: [String: Any]) -> PyreonParseResult<Self>',
    )
    // The result type is the runtime's, never declared per file.
    expect(code).not.toMatch(/struct PyreonParseResult\b/)
    // The broken verbatim form is gone.
    expect(code).not.toMatch(/\bPet\.safeParse\(/)
    expect(code).not.toContain('__Obj0(name:')
    // The named binding keeps its instance (other code may reference it).
    expect(code).toContain('let Pet = PyreonZodSchema_Pet()')
    expect(code).toContain('private var ok: Bool')
  })

  it('Kotlin: a companion safeParseResult call, argument as a Map', () => {
    const { code, warnings } = transform(BOUND, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).toContain(
      'PyreonZodSchema_Pet.safeParseResult(mapOf<String, Any?>("name" to "x", "age" to 3L)).success',
    )
    expect(code).toContain(
      'fun safeParseResult(input: Map<String, Any?>): PyreonParseResult<PyreonZodSchema_Pet>',
    )
    expect(code).not.toMatch(/\bPet\.safeParse\(/)
  })

  it('resolves a schema declared BELOW its use, through the value/type rename', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = transform(NAMESAKE, { target })
      expect(warnings).toEqual([])
      expect(code).toContain('PyreonZodSchema_PetValue.safeParseResult(')
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

  it('`.parse(x)` WARNS by name (it throws; no native error model yet) instead of emitting it broken', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string() })
export function App() {
  const n = computed(() => Pet.parse({ name: 'x' }).name)
  return <Text>{n()}</Text>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = transform(src, { target })
      expect(warnings.some((w) => w.includes('`Pet.parse(…)`') && w.includes('try/throw'))).toBe(
        true,
      )
      expect(code).not.toMatch(/\bPet\.parse\(/)
    }
  })

  it('`.safeParse` on a discriminatedUnion binding WARNS by name', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Shape = s.discriminatedUnion('kind', [
  s.object({ kind: s.literal('a'), n: s.number() }),
  s.object({ kind: s.literal('b'), t: s.string() }),
])
export function App() {
  const ok = computed(() => Shape.safeParse({ kind: 'a', n: 1 }).success)
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
      const REPO = resolve(import.meta.dirname, '../../../../..')
      const sources: string[] = []
      const walk = (dir: string): void => {
        let entries: string[]
        try {
          entries = readdirSync(dir)
        } catch {
          return
        }
        for (const e of entries) {
          if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift')
            continue
          if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
          const p = join(dir, e)
          if (statSync(p).isDirectory()) walk(p)
          else if (p.endsWith('.swift')) sources.push(p)
        }
      }
      for (const r of [
        'packages/fundamentals',
        'packages/core',
        'packages/native/runtime-swift',
        'packages/native/router-swift',
      ]) {
        walk(join(REPO, r))
      }
      expect(sources.length).toBeGreaterThan(40)
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-bound-safeparse-'))
      try {
        const file = join(dir, 'BoundSafeParse.swift')
        writeFileSync(
          file,
          `import SwiftUI\nimport Foundation\n${transform(BOUND, { target: 'swift' }).code}`,
          'utf8',
        )
        const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {
          encoding: 'utf8',
        }).trim()
        try {
          execFileSync(
            'xcrun',
            [
              '--sdk',
              'iphonesimulator',
              'swiftc',
              '-typecheck',
              '-target',
              'arm64-apple-ios17.0-simulator',
              '-sdk',
              sdk,
              file,
              ...sources,
            ],
            { encoding: 'utf8', stdio: 'pipe' },
          )
        } catch (err) {
          const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
          const out = [e.stderr, e.stdout]
            .map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '')
            .join('\n')
          expect.fail(
            `swiftc -typecheck failed:\n${out
              .split('\n')
              .filter((l) => l.includes('error:'))
              .slice(0, 12)
              .join('\n')}`,
          )
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    900_000,
  )
})
