// TypeScript keeps values and types in separate namespaces; Swift and Kotlin
// do not. `const Book = s.object(…)` beside `type Book = {…}` emitted
// `let Book` beside `struct Book` — swiftc `invalid redeclaration of 'Book'`,
// kotlinc `conflicting declarations` — with ZERO warnings, so the idiom never
// built on either target and `@pyreon/lathe` had to rename its schema bindings
// (`book_schema`) to dodge it.
//
// PMTC now renames the VALUE (`Book` → `BookValue`) and every reference to it
// in the file; the type keeps its name, since it is what other files annotate
// with and what a fetch decodes into.
//
// Bisect-load-bearing: dropping the `disambiguateValueTypeNames(result)` call
// in parse.ts fails the rename specs and every compile below with the original
// redeclaration errors.

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

const FIXTURE = readFileSync(join(import.meta.dirname, '../fixtures/value-type-namespaces.tsx'), 'utf8')

describe('a value and a type of the same name', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    describe(target, () => {
      const out = transform(FIXTURE, { target })
      const bind = target === 'swift' ? 'let' : 'val'

      it('compiles with no warnings', () => {
        expect(out.warnings).toEqual([])
      })

      it('keeps the TYPE name, renames the VALUE', () => {
        expect(out.code).toMatch(target === 'swift' ? /^struct Book: Codable \{/m : /^data class Book\(/m)
        expect(out.code).toContain(`${bind} BookValue = PyreonZodSchema_BookValue()`)
        expect(out.code).toContain(`private ${bind} ShelfValue = "reading"`)
        expect(out.code).toContain(`private ${bind} LimitsValue = 10`)
        // No value binding keeps a type's name.
        for (const name of ['Book', 'NewBook', 'Shelf', 'Limits']) {
          expect(out.code).not.toMatch(new RegExp(`^(private )?${bind} ${name} =`, 'm'))
        }
      })

      it('references follow the rename; type positions do not', () => {
        expect(out.code).toContain(`${bind} shelf = ShelfValue`)
        expect(out.code).toContain('LimitsValue')
        expect(out.code).toContain(target === 'swift' ? 'PyreonQuery<Book>' : 'PyreonQuery<Book>(')
      })
    })
  }

  it('a local binding of the same name makes the rename unsafe — named, not guessed', () => {
    const src = `import { Text } from '@pyreon/primitives'
type Mode = { dark: boolean }
const Mode = 1
export function App() { const Mode = 2; return <Text>{Mode}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect(out.warnings.join('\n')).toContain('`Mode` names both a type and a value in this file')
    }
  })

  // A schema's NESTED structs are named after it (`Book_Author`). They follow
  // the renamed parent, so the emit never mixes `BookValue` with `Book_…`.
  it('nested schema structs follow the renamed parent', () => {
    const src = `import { s } from '@pyreon/validate'
export type Book = { title: string; author: { name: string }; items: { n: number }[] }
export const Book = s.object({
  title: s.string(),
  author: s.object({ name: s.string() }),
  items: s.array(s.object({ n: s.number() })),
})`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect(out.warnings).toEqual([])
      expect(out.code).toContain('PyreonZodSchema_BookValue_Author')
      expect(out.code).toContain('PyreonZodSchema_BookValue_Items_Item')
      expect(out.code).not.toMatch(/PyreonZodSchema_Book_/)
      expect(out.code).not.toMatch(/\b(?:let|val) Book_/)
    }
    const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    if (!r.skipped) expect(r.error ?? '').toBe('')
    const k = validateKotlin(transform(src, { target: 'kotlin' }).code)
    if (!k.skipped) expect(k.error ?? '').toBe('')
  }, 300_000)

  it('a file with no clash is untouched', () => {
    const src = `import { Text } from '@pyreon/primitives'
type Pet = { name: string }
const petDefault = 'rex'
export function App() { return <Text>{petDefault}</Text> }`
    const out = transform(src, { target: 'swift' })
    expect(out.code).toContain('private let petDefault = "rex"')
    expect(out.code).not.toContain('Value')
  })
})

describe('the emit compiles', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: against the stubs', () => {
    const r = validateSwiftWithStubs(transform(FIXTURE, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 120_000)

  it.skipIf(!isKotlincAvailable())('Kotlin: on kotlinc', () => {
    const r = validateKotlin(transform(FIXTURE, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 300_000)

  // `PyreonQuery` / `PyreonURL` from the REAL runtime, on the real iOS SDK.
  it.runIf(isSwiftUIAvailable())('Swift: against the real iOS SDK + runtime', () => {
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
        if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift') continue
        if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
        const p = join(dir, e)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.swift')) sources.push(p)
      }
    }
    for (const r of ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']) {
      walk(join(REPO, r))
    }
    // An empty list would make the compile vacuously succeed.
    expect(sources.length).toBeGreaterThan(40)
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-value-type-ns-'))
    try {
      const file = join(dir, 'ValueTypeNamespaces.swift')
      writeFileSync(file, `import SwiftUI\nimport Foundation\n${transform(FIXTURE, { target: 'swift' }).code}`, 'utf8')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      try {
        execFileSync(
          'xcrun',
          ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, file, ...sources],
          { encoding: 'utf8', stdio: 'pipe' },
        )
      } catch (err) {
        const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
        const out = [e.stderr, e.stdout].map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '').join('\n')
        expect.fail(`swiftc -typecheck failed:\n${out.split('\n').filter((l) => l.includes('error:')).slice(0, 12).join('\n')}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 900_000)
})
