// Does `incremental` ever hide an error a clean typecheck would report?
//
// `@pyreon/tsconfig`'s base preset turns on `incremental`, and the CI typecheck
// cells restore the resulting `.tsbuildinfo` from an earlier commit. Both rest
// on one property: TypeScript versions every file in the program by CONTENT, so
// a cache built against a different tree re-checks whatever actually changed.
//
// That property is load-bearing in the worst possible place. A stale cache that
// skipped a real error would produce a GREEN required check on a broken commit —
// and unlike a red gate, nothing would ever surface it. So it is proven here
// rather than asserted, and proven DIFFERENTIALLY: every mutation is checked
// twice, once against a warm cache and once from scratch, and the two runs must
// agree exactly. If incremental ever starts lying, the two columns diverge.
//
// The mutations are chosen to span the ways a dependency can break a dependent,
// because "it caught the one case I tried" is how this kind of guarantee gets
// over-claimed:
//
//   - a type error inside the package's OWN source
//   - a dependency's function ARITY changing
//   - a dependency's exported TYPE changing shape
//   - a dependency REMOVING an export entirely
//   - a dependency changing only a TYPE-ONLY export
//
// Fixtures are synthetic and hermetic. The real workspace would be a truer
// subject but takes minutes per case; the property under test is TypeScript's,
// not this repo's, so a two-package fixture exercises it exactly.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A dependent package (`app`) importing a dependency (`dep`) by path alias. */
function scaffold(depSource: string): string {
  const root = mkdtempSync(join(tmpdir(), 'inc-safety-'))
  dirs.push(root)
  mkdirSync(join(root, 'dep'), { recursive: true })
  mkdirSync(join(root, 'app'), { recursive: true })
  writeFileSync(join(root, 'dep/index.ts'), depSource)
  writeFileSync(
    join(root, 'app/main.ts'),
    [
      "import { makeThing, type Thing } from 'dep'",
      'const t: Thing = makeThing(1)',
      'export const id: number = t.id',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(root, 'app/tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        types: [],
        incremental: true,
        tsBuildInfoFile: './.cache/tsbuildinfo',
        // No `baseUrl` — TypeScript 6 deprecates it (TS5101), and under
        // `moduleResolution: Bundler` a `paths` entry already resolves relative
        // to the tsconfig. Suppressing the warning with `ignoreDeprecations`
        // would have worked too, but a fixture that carries a deprecated option
        // is one more thing to fix later.
        paths: { dep: ['../dep/index.ts'] },
      },
      include: ['main.ts'],
    }),
  )
  return root
}

const DEP_OK = [
  'export interface Thing { id: number }',
  'export const makeThing = (id: number): Thing => ({ id })',
  '',
].join('\n')

/** Error codes tsc reports for `app`, sorted. `[]` means a clean typecheck. */
function typecheck(root: string): number[] {
  const r = spawnSync('bunx', ['tsc', '--project', 'tsconfig.json'], {
    cwd: join(root, 'app'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  return [...out.matchAll(/error TS(\d+)/g)].map((m) => Number(m[1])).sort((a, b) => a - b)
}

/** Same check with no cache present — the ground truth to compare against. */
function typecheckClean(root: string): number[] {
  rmSync(join(root, 'app/.cache'), { recursive: true, force: true })
  return typecheck(root)
}

interface Mutation {
  name: string
  /** Rewrites the dependency, or undefined to mutate the app instead. */
  dep?: string
  app?: string
}

const MUTATIONS: Mutation[] = [
  {
    name: "an error in the package's OWN source",
    app: [
      "import { makeThing, type Thing } from 'dep'",
      'const t: Thing = makeThing(1)',
      'export const id: string = t.id', // number -> string
      '',
    ].join('\n'),
  },
  {
    name: "a dependency's function ARITY changing",
    dep: [
      'export interface Thing { id: number }',
      'export const makeThing = (id: number, label: string): Thing => ({ id })',
      '',
    ].join('\n'),
  },
  {
    name: "a dependency's exported TYPE changing shape",
    dep: [
      'export interface Thing { identifier: number }', // id -> identifier
      'export const makeThing = (id: number): Thing => ({ identifier: id })',
      '',
    ].join('\n'),
  },
  {
    name: 'a dependency REMOVING an export',
    dep: ['export interface Thing { id: number }', ''].join('\n'),
  },
  {
    name: 'a dependency changing only a TYPE-ONLY export',
    dep: [
      'export type Thing = { id: string }', // number -> string, type-only change
      'export const makeThing = (id: number): Thing => ({ id: String(id) })',
      '',
    ].join('\n'),
  },
]

describe('incremental typecheck never hides an error a clean run reports', () => {
  it.each(MUTATIONS)('$name', ({ dep, app }) => {
    const root = scaffold(DEP_OK)

    // Warm the cache against a HEALTHY tree — this is the CI shape: a
    // tsbuildinfo restored from a commit where everything passed.
    expect(typecheck(root)).toEqual([])
    expect(existsSync(join(root, 'app/.cache/tsbuildinfo'))).toBe(true)

    if (dep) writeFileSync(join(root, 'dep/index.ts'), dep)
    if (app) writeFileSync(join(root, 'app/main.ts'), app)

    const withCache = typecheck(root)
    const fromScratch = typecheckClean(root)

    // The mutation must actually break something, or the comparison below is
    // vacuous — two clean runs agree trivially and prove nothing.
    expect(fromScratch.length).toBeGreaterThan(0)
    // The claim: identical verdicts. Not "the cached run also failed" — the
    // SAME diagnostics, so a cache cannot quietly report fewer.
    expect(withCache).toEqual(fromScratch)
  })

  it('reports clean again once the dependency is restored', () => {
    const root = scaffold(DEP_OK)
    expect(typecheck(root)).toEqual([])

    writeFileSync(join(root, 'dep/index.ts'), 'export interface Thing { id: number }\n')
    expect(typecheck(root).length).toBeGreaterThan(0)

    // The mirror of the property above, and the one a purely "does it still
    // fail?" test would miss: a cache must not pin a STALE FAILURE either, or
    // it would red a commit that is fine.
    writeFileSync(join(root, 'dep/index.ts'), DEP_OK)
    expect(typecheck(root)).toEqual([])
  })
})
