// Several emitted modules, compiled TOGETHER — the way an app builds them.
//
// PMTC compiles one file at a time and every other gate checks one file at a
// time, so none of them can see a collision BETWEEN files. That is not a
// theoretical gap: every schema-bearing module declared its own
// `enum PyreonSchemaError` (and, once `safeParse` lowered, its own
// `struct PyreonParseResult`). `books.native.tsx` and `authors.native.tsx`
// from `@pyreon/lathe`'s bookshelf each compiled cleanly on their own, and in
// one Xcode target failed with `invalid redeclaration of 'PyreonSchemaError'`
// — the same in one Gradle source set, which is one Kotlin package. The two
// types now live in the runtime (`PyreonSchema.swift` / `PyreonSchema.kt`),
// declared once.
//
// Three compiles, each asking the question a real build asks:
//   - swiftc, all files as one module, against the stubs (runs on Linux)
//   - kotlinc, all files together, against the stubs
//   - swiftc against the REAL iOS SDK with the REAL runtime sources linked
//     in (macOS + Xcode only) — the stubs cannot hide a missing runtime type
//     here, which is the other half of moving a type OUT of the emit.

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
  validateKotlinFiles,
  validateSwiftFilesWithStubs,
} from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')
const BOOKSHELF = join(REPO, 'examples/lathe-bookshelf/src/gen')

// Two hand-written modules that each VALIDATE with `safeParse`, so both emit
// the `PyreonParseResult` path as well as the error type.
const PETS = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string().min(1), age: s.number() })
export function PetBadge() {
  const ok = computed(() => Pet.safeParse({ name: 'x', age: 3 }).success)
  return <Text>{ok() ? 'valid pet' : 'invalid pet'}</Text>
}`

const OWNERS = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Owner = s.object({ email: s.string().email() })
export function OwnerBadge() {
  const ok = computed(() => Owner.safeParse({ email: 'a@b.co' }).success)
  return <Text>{ok() ? 'valid owner' : 'invalid owner'}</Text>
}`

function sources(): { name: string; source: string }[] {
  return [
    { name: 'books', source: readFileSync(join(BOOKSHELF, 'books.native.tsx'), 'utf8') },
    { name: 'authors', source: readFileSync(join(BOOKSHELF, 'authors.native.tsx'), 'utf8') },
    { name: 'pets', source: PETS },
    { name: 'owners', source: OWNERS },
  ]
}

function emitAll(target: 'swift' | 'kotlin'): string[] {
  return sources().map(({ name, source }) => {
    const { code, warnings } = transform(source, { target })
    // A warning would mean a module fell out of the supported subset, which
    // makes the compile below prove less than it appears to.
    expect(warnings, `${name} (${target})`).toEqual([])
    return code
  })
}

const PER_FILE_SHARED = [
  /^enum PyreonSchemaError\b/m,
  /^struct PyreonParseResult\b/m,
  /^sealed class PyreonSchemaError\b/m,
  /^data class PyreonParseResult\b/m,
]

describe('schema-bearing modules compile TOGETHER', () => {
  it('no emitted file declares the shared schema types itself', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const codes = emitAll(target)
      // The fixture must actually reach the shared types, or the compiles
      // below are vacuous.
      expect(codes.join('\n')).toContain('PyreonSchemaError')
      expect(codes.join('\n')).toContain('PyreonParseResult')
      for (const code of codes) {
        for (const re of PER_FILE_SHARED) expect(code).not.toMatch(re)
      }
    }
  })

  it.runIf(isSwiftcAvailable())('swiftc: all four files as one module, against the stubs', () => {
    const r = validateSwiftFilesWithStubs(emitAll('swift'))
    if (r.skipped) return
    expect(r.error ?? '').toBe('')
    expect(r.ok).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc: all four files together, against the stubs', () => {
    const r = validateKotlinFiles(emitAll('kotlin'))
    expect(r.error ?? '').toBe('')
    expect(r.ok).toBe(true)
  }, 300_000)
})

/** Every Swift file the runtime actually ships (see real-runtime-typecheck.test.ts). */
function runtimeSwiftSources(): string[] {
  const roots = [
    join(REPO, 'packages/fundamentals'),
    join(REPO, 'packages/core'),
    join(REPO, 'packages/native/runtime-swift'),
    join(REPO, 'packages/native/router-swift'),
  ]
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'lib' || e === '.build') continue
      if (e === 'Package.swift') continue
      if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift')) out.push(p)
    }
  }
  roots.forEach(walk)
  return out
}

describe.runIf(isSwiftUIAvailable())('schema-bearing modules against the REAL SDK + runtime', () => {
  it('all four files in one target typecheck', () => {
    const runtime = runtimeSwiftSources()
    expect(runtime.length).toBeGreaterThan(40)
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-multi-module-'))
    try {
      const files = emitAll('swift').map((code, i) => {
        const p = join(dir, `Module${i}.swift`)
        // The CLI adds these; the raw emit carries no imports.
        writeFileSync(p, `import SwiftUI\nimport Foundation\n${code}`, 'utf8')
        return p
      })
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {
        encoding: 'utf8',
      }).trim()
      execFileSync(
        'xcrun',
        [
          '--sdk',
          'iphonesimulator',
          'swiftc',
          '-typecheck',
          '-module-cache-path',
          join(dir, 'ModuleCache'),
          '-target',
          'arm64-apple-ios17.0-simulator',
          '-sdk',
          sdk,
          ...files,
          ...runtime,
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      )
    } catch (err) {
      const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
      const out = [e.stderr, e.stdout]
        .map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '')
        .join('\n')
      const errors = out
        .split('\n')
        .filter((l) => l.includes('error:'))
        .slice(0, 12)
        .join('\n')
      expect.fail(`swiftc -typecheck failed for the multi-module target:\n${errors || out.slice(0, 2000)}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)
})
