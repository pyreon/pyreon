// `Pet.safeParse(pet())` where the argument holds a TYPED value.
//
// An emitted schema's `parse` reads a `[String: Any]` / `Map<String, Any?>`,
// which is what an object LITERAL lowers to. Any other argument — a signal
// holding a struct, a variable, a call — was passed through as-is:
//
//   PyreonZodSchema_Pet.safeParseResult(pet)
//   // cannot convert value of type 'P' to expected argument type '[String : Any]'
//
// and a typed value nested INSIDE a literal (`{ …, owner: owner() }`)
// compiled but reached the schema as a struct, which `as? [String: Any]`
// rejects — an invalid result for valid data, with nothing said.
//
// Both now go through the runtime's `pyreonSchemaInput` / `pyreonSchemaValue`,
// which convert the value through its own Codable / @Serializable encoding.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')

const TYPED = `import { computed, signal } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
type O = { email: string }
type P = { name: string; age: number; ok: boolean; tags: string[]; owner: O }
const Pet = s.object({
  name: s.string().min(2),
  age: s.number(),
  ok: s.boolean(),
  tags: s.array(s.string()),
  owner: s.object({ email: s.string().email() }),
})
export function App() {
  const pet = signal<P>({ name: 'Rex', age: 3, ok: true, tags: ['a'], owner: { email: 'a@b.co' } })
  const owner = signal<O>({ email: 'b@c.io' })
  const whole = computed(() => Pet.safeParse(pet()).success)
  const nested = computed(() => Pet.safeParse({ name: 'Mo', age: 1, ok: false, tags: [], owner: owner() }).success)
  return <Text>{whole() && nested() ? 'valid' : 'invalid'}</Text>
}`

describe('a typed value as a safeParse argument', () => {
  it('Swift: the whole-value argument goes through pyreonSchemaInput', () => {
    const { code, warnings } = transform(TYPED, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain('PyreonZodSchema_Pet.safeParseResult(pyreonSchemaInput(pet)).success')
    // A typed value NESTED in a literal is converted; the scalars beside it are not.
    expect(code).toContain('"owner": pyreonSchemaValue(owner)')
    expect(code).toContain('"name": "Mo"')
    expect(code).not.toMatch(/safeParseResult\(pet\)/)
  })

  it('Kotlin: the same, through the serializer', () => {
    const { code, warnings } = transform(TYPED, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).toContain('PyreonZodSchema_Pet.safeParseResult(pyreonSchemaInput(pet)).success')
    expect(code).toContain('"owner" to pyreonSchemaValue(owner)')
    expect(code).not.toMatch(/safeParseResult\(pet\)/)
  })

  it('an object literal of scalars is emitted exactly as before', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string() })
export function App() {
  const ok = computed(() => Pet.safeParse({ name: 'x' }).success)
  return <Text>{ok() ? 'y' : 'n'}</Text>
}`
    const { code } = transform(src, { target: 'swift' })
    expect(code).toContain('PyreonZodSchema_Pet.safeParseResult(["name": "x"] as [String: Any]).success')
    expect(code).not.toContain('pyreonSchema')
  })

  it.skipIf(!isSwiftcAvailable())('Swift compiles against the stubs', () => {
    const r = validateSwiftWithStubs(transform(TYPED, { target: 'swift' }).code)
    expect(r.error ?? '').toBe('')
    expect(r.ok).toBe(true)
  }, 300_000)

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(TYPED, { target: 'kotlin' }).code)
    expect(r.error ?? '').toBe('')
    expect(r.ok).toBe(true)
  }, 300_000)
})

/** The brace-matched declaration starting at each match of `head`. */
function blocks(code: string, head: RegExp): string[] {
  const out: string[] = []
  for (const m of code.matchAll(head)) {
    let depth = 0
    let j = code.indexOf('{', m.index)
    for (; j < code.length; j++) {
      if (code[j] === '{') depth++
      else if (code[j] === '}' && --depth === 0) break
    }
    out.push(code.slice(m.index, j + 1))
  }
  return out
}

function runtimeSwiftSources(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift') continue
      if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift')) out.push(p)
    }
  }
  for (const r of ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']) {
    walk(join(REPO, r))
  }
  return out
}

function failWith(err: unknown, what: string): never {
  const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
  const out = [e.stderr, e.stdout].map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '').join('\n')
  const errors = out.split('\n').filter((l) => l.includes('error:')).slice(0, 12).join('\n')
  expect.fail(`${what}:\n${errors || out.slice(0, 2000)}`)
}

describe.runIf(isSwiftUIAvailable())('typed safeParse against the REAL runtime (macOS)', () => {
  it('typechecks against the real iOS SDK + runtime', () => {
    const sources = runtimeSwiftSources()
    expect(sources.length).toBeGreaterThan(40)
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-typed-safeparse-'))
    try {
      const file = join(dir, 'TypedSafeParse.swift')
      writeFileSync(file, `import SwiftUI\nimport Foundation\n${transform(TYPED, { target: 'swift' }).code}`, 'utf8')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      try {
        execFileSync(
          'xcrun',
          ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-module-cache-path', join(dir, 'mc'), '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, file, ...sources],
          { encoding: 'utf8', stdio: 'pipe' },
        )
      } catch (err) {
        failWith(err, 'swiftc -typecheck failed')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 900_000)

  // A compile proves the call is well-typed, not that the conversion is
  // RIGHT. This builds the emitted schema structs with the real runtime file
  // and RUNS them: valid data must pass, each broken constraint must fail.
  it('the emitted schema accepts the valid value and rejects each invalid one', () => {
    const code = transform(TYPED, { target: 'swift' }).code
    const decls = blocks(code, /^struct (?:P|O|PyreonZodSchema_\w+)\b[^\n]*\{/gm)
    expect(decls.length).toBe(4)
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-typed-safeparse-run-'))
    try {
      writeFileSync(join(dir, 'Schemas.swift'), `import Foundation\n${decls.join('\n\n')}`, 'utf8')
      writeFileSync(
        join(dir, 'main.swift'),
        `func check(_ p: P) -> Bool { PyreonZodSchema_Pet.safeParseResult(pyreonSchemaInput(p)).success }
let owner = O(email: "a@b.co")
let good = P(name: "Rex", age: 3, ok: true, tags: ["a"], owner: owner)
let parsed = PyreonZodSchema_Pet.safeParseResult(pyreonSchemaInput(good))
print("good=\\(parsed.success) email=\\(parsed.data?.owner.email ?? "-") tags=\\(parsed.data?.tags ?? [])")
print("shortName=\\(check(P(name: "R", age: 3, ok: true, tags: [], owner: owner)))")
print("badEmail=\\(check(P(name: "Rex", age: 3, ok: true, tags: [], owner: O(email: "nope"))))")
print("nestedValue=\\(PyreonZodSchema_Pet.safeParseResult(["name": "Mo", "age": 1, "ok": false, "tags": [String](), "owner": pyreonSchemaValue(owner)] as [String: Any]).success)")
// What the emit produced before: the struct itself in the dictionary. It
// compiles (the value is Any) and is rejected — valid data, invalid result.
print("nestedRaw=\\(PyreonZodSchema_Pet.safeParseResult(["name": "Mo", "age": 1, "ok": false, "tags": [String](), "owner": owner] as [String: Any]).success)")
`,
        'utf8',
      )
      const bin = join(dir, 'typed-safeparse')
      try {
        execFileSync(
          'swiftc',
          ['-module-cache-path', join(dir, 'mc'), '-o', bin, join(REPO, 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonSchema.swift'), join(dir, 'Schemas.swift'), join(dir, 'main.swift')],
          { encoding: 'utf8', stdio: 'pipe' },
        )
      } catch (err) {
        failWith(err, 'swiftc build failed')
      }
      const out = execFileSync(bin, { encoding: 'utf8' }).trim().split('\n')
      expect(out).toEqual([
        'good=true email=a@b.co tags=["a"]',
        'shortName=false',
        'badEmail=false',
        'nestedValue=true',
        'nestedRaw=false',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 900_000)
})

// The run test builds from this path; a moved file must fail loudly, not skip.
it('the runtime schema file exists where the run test builds it from', () => {
  expect(readFileSync(join(REPO, 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonSchema.swift'), 'utf8')).toContain(
    'public func pyreonSchemaInput',
  )
})
