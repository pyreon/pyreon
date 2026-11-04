// A schema's `.parse(x)` returns EACH LIBRARY'S OWN web result natively — never zod's shapes.
//
// - `@pyreon/validate`: `s.object(…).parse(x)` and `.safeParse(x)` are ONE method on the web. Both return
//   `{ ok: true, value } | { ok: false, issues }` (an issue's `path` an array of keys) and NEITHER throws.
// - `@pyreon/validation`: an adapter is `{ _infer, validator, parse }`; its `parse` returns the same, with a
//   dot-string `path`, never throws, and the adapter has NO `safeParse`.
//
// Before this, the native lowering THREW from `.parse` (#4102) and gave `.safeParse` zod's `{ success, data }`
// (since 0.53.0) — shapes neither library has, so web code reading `r.ok` / `r.value` did not compile natively and
// native code catching `parse` behaved differently from the web. These specs pin the shape on both targets, compile
// it on both toolchains, and RUN the Swift emit against the real runtime next to the real web libraries.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { s } from '@pyreon/validate'
// By path, like first-party-plugins.ts: a devDependency back to @pyreon/validation would be a package cycle.
import { zodSchema } from '../../../../fundamentals/validation/src/index'
import { z } from 'zod'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')

const ui = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'`

// The web-shaped source: branch on `ok`, read `value` / `issues` — no try/catch, because nothing throws.
const body = (path: string) => `
function check(name: string): string {
  const r = Pet.parse({ name, age: 1 })
  if (!r.ok) return 'bad ' + ${path}
  return 'ok ' + r.value.name
}
function App() {
  const out = signal('')
  return (<Stack><Text>{out()}</Text><Button onPress={() => out.set(check(''))}>Go</Button></Stack>)
}`

const validate = `${ui}
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string().min(1), age: s.number() })
${body("r.issues[0]!.path.join('.')")}`

const validateSafe = validate.replace('Pet.parse(', 'Pet.safeParse(')

const zod = `${ui}
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const Pet = zodSchema(z.object({ name: z.string().min(1), age: z.number() }))
${body('r.issues[0]!.path')}`

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })
const code = (src: string, target: 'swift' | 'kotlin') => emit(src, target).code

describe('the web libraries really have these shapes (the oracle this lowering follows)', () => {
  it('@pyreon/validate: parse === safeParse, `{ ok, issues }` with an array path, no throw', () => {
    const Pet = s.object({ name: s.string().min(1), age: s.number() })
    const bad = Pet.parse({ name: '', age: 1 })
    expect(Object.keys(bad)).toEqual(['ok', 'issues'])
    expect(bad.ok ? null : bad.issues[0]!.path).toEqual(['name'])
    expect(Pet.safeParse({ name: '', age: 1 })).toEqual(bad)
    expect(Pet.parse({ name: 'Rex', age: 1 })).toEqual({ ok: true, value: { name: 'Rex', age: 1 } })
  })
  it('@pyreon/validation: an adapter has parse (dot-string path, no throw) and NO safeParse', () => {
    const Pet = zodSchema(z.object({ name: z.string().min(1), age: z.number() }))
    // `parse` is optional on the adapter TYPE (TypedSchemaAdapter); every shipped adapter defines it.
    const bad = Pet.parse!({ name: '', age: 1 })
    expect(bad.ok).toBe(false)
    expect(bad.ok ? null : bad.issues[0]!.path).toBe('name')
    expect((Pet as unknown as { safeParse?: unknown }).safeParse).toBeUndefined()
  })
})

describe('schema .parse(x) lowers to the library’s own non-throwing result', () => {
  for (const [name, src, fn] of [
    ['validate .parse', validate, 'pyreonValidateResult'],
    ['validate .safeParse', validateSafe, 'pyreonValidateResult'],
    ['validation adapter .parse', zod, 'pyreonValidationResult'],
  ] as const) {
    it(`Swift (${name}): no throws, no try!, the result wraps the struct's parse`, () => {
      const swift = code(src, 'swift')
      expect(swift).toContain(`let r = ${fn} { try PyreonZodSchema_Pet.parse(["name": name, "age": 1] as [String: Any]) }`)
      expect(swift).toContain('func check(_ name: String) -> String {')
      expect(swift).toContain('return "ok " + r.value.name')
      expect(swift).not.toContain('try!')
      expect(swift).not.toContain('safeParseResult')
    })
    it(`Kotlin (${name}): the same`, () => {
      const kotlin = code(src, 'kotlin')
      expect(kotlin).toContain(`val r = ${fn} { PyreonZodSchema_Pet.parse(mapOf<String, Any?>("name" to name, "age" to 1L)) }`)
      expect(kotlin).toContain('return "ok " + r.value.name')
    })
    it(`${name}: no warning on either target`, () => {
      for (const target of ['swift', 'kotlin'] as const) expect(emit(src, target).warnings).toEqual([])
    })
  }

  it('a discriminatedUnion binding still names why its .parse does not lower', () => {
    const src = `${ui}
import { s } from '@pyreon/validate'
const Shape = s.discriminatedUnion('kind', [s.object({ kind: s.literal('a'), n: s.number() })])
function App() {
  const out = signal('')
  const go = () => { out.set(Shape.parse({ kind: 'a', n: 1 }).ok ? 'ok' : 'bad') }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`
    expect(emit(src, 'swift').warnings.join('\n')).toContain('`discriminatedUnion` schema lowers to a native enum')
  })
})

describe('schema .parse(x) survives the real toolchains', () => {
  for (const [name, src] of Object.entries({ validate, validateSafe, zod })) {
    it.skipIf(!isSwiftcAvailable())(`Swift: ${name} type-checks against the stub`, () => {
      const r = validateSwiftWithStubs(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isSwiftUIAvailable())(`Swift: ${name} type-checks against the real SwiftUI SDK`, () => {
      const r = validateSwiftTypecheck(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`Kotlin: ${name} compiles on kotlinc`, () => {
      const r = validateKotlin(code(src, 'kotlin'))
      expect(r.ok, r.error ?? '').toBe(true)
    }, 300_000)
  }
})

// A compile proves the shape is well-typed, not that it BEHAVES like the web. This builds the emitted helper with the
// real `PyreonSchema.swift` and runs it, next to the same call through the real web library.
describe('the Swift emit RUNS like the web library', () => {
  const helperAndStruct = (swift: string): string => {
    const start = swift.indexOf('func check(')
    const end = swift.indexOf('struct App:')
    return swift.slice(start, end)
  }
  for (const [name, src, web] of [
    ['validate', validate, (n: string) => {
      const r = s.object({ name: s.string().min(1), age: s.number() }).parse({ name: n, age: 1 })
      return r.ok ? `ok ${r.value.name}` : `bad ${r.issues[0]!.path?.join('.')}`
    }],
    ['validation', zod, (n: string) => {
      const r = zodSchema(z.object({ name: z.string().min(1), age: z.number() })).parse!({ name: n, age: 1 })
      return r.ok ? `ok ${r.value.name}` : `bad ${r.issues[0]!.path}`
    }],
  ] as const) {
    it.skipIf(!isSwiftcAvailable() || process.platform !== 'darwin')(`${name}: same output for a valid and an invalid input`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-schema-parse-run-'))
      try {
        writeFileSync(join(dir, 'main.swift'), `import Foundation\n${helperAndStruct(code(src, 'swift'))}\nprint(check("Rex"))\nprint(check(""))\n`)
        const bin = join(dir, 'run')
        execFileSync('swiftc', ['-module-cache-path', join(dir, 'mc'), '-o', bin,
          join(REPO, 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonSchema.swift'), join(dir, 'main.swift')], { stdio: 'pipe' })
        const out = execFileSync(bin, { encoding: 'utf8' }).trim().split('\n')
        expect(out).toEqual([web('Rex'), web('')])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }, 300_000)
  }
})
