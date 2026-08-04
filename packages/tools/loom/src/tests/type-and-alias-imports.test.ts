/**
 * TYPE-ONLY imports and tsconfig PATH ALIASES — the two classes that made
 * loom's import-driven detectors fire on correct code.
 *
 * Both were found by running `loom scan` against a real foreign 87-package
 * TypeScript monorepo, not against this repo. That distinction is the point
 * of this file: loom's whole job is reading workspaces it has never seen, so
 * the shapes it must survive are other people's conventions — `~/*` path
 * aliases, `.d.ts` module augmentation, and prettier-wrapped multi-line type
 * imports — none of which the pyreon monorepo happens to use.
 *
 * Measured on that repo, the fix took gating warnings from 4 (two of them
 * false) to 2 (both real) and `prod-import-of-dev-dep` from 12 to 1, while
 * leaving all 75 `unused-dep` findings byte-identically intact.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildReport } from '../core'
import { readTsconfigAliases, scanPackageImports, specifierToPackage } from '../core/imports'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-typealias-'))
  roots.push(root)
  return root
}

/** A one-package workspace with the given files under `p/a/`. */
function workspace(files: Record<string, string>, pkgJson: Record<string, unknown> = {}): string {
  const root = tempRoot()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'r', workspaces: ['p/*'] }))
  mkdirSync(join(root, 'p/a/src'), { recursive: true })
  writeFileSync(
    join(root, 'p/a/package.json'),
    JSON.stringify({ name: 'a', version: '1.0.0', private: true, ...pkgJson }),
  )
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, 'p/a', rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

describe('tsconfig path aliases are not packages', () => {
  it('`~` is outside the npm name grammar, so `~/x` never scans as a package', () => {
    // The shipped bug: NAME_RE admitted `~`, so every `import '~/components/X'`
    // became a phantom dep — a WARNING, which failed `--strict` on correct code.
    expect(specifierToPackage('~/components/X')).toBeNull()
    expect(specifierToPackage('~alias/x')).toBeNull()
    // Real packages are unaffected.
    expect(specifierToPackage('react')).toBe('react')
    expect(specifierToPackage('@scope/pkg/sub')).toBe('@scope/pkg')
  })

  it('a declared `paths` prefix wins over the package-name grammar', () => {
    const aliases = new Set(['@app', 'src'])
    // Both are valid npm name shapes; only the tsconfig knows they are internal.
    expect(specifierToPackage('@app/widgets/Button', aliases)).toBeNull()
    expect(specifierToPackage('src/lib/x', aliases)).toBeNull()
    // …and the same names without the alias set stay packages.
    expect(specifierToPackage('@app/widgets/Button')).toBe('@app/widgets')
    expect(specifierToPackage('src/lib/x')).toBe('src')
  })

  it('reads paths from the package tsconfig, the root tsconfig, and one `extends` hop', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'p/a'), { recursive: true })
    writeFileSync(
      join(root, 'tsconfig.json'),
      // JSONC: comments and a trailing comma are legal here and common.
      `{
        // root-level alias
        "compilerOptions": { "paths": { "@root/*": ["./x/*"], } }
      }`,
    )
    writeFileSync(
      join(root, 'p/a/base.json'),
      JSON.stringify({ compilerOptions: { paths: { '@inherited/*': ['./y/*'] } } }),
    )
    writeFileSync(
      join(root, 'p/a/tsconfig.json'),
      JSON.stringify({ extends: './base.json', compilerOptions: { paths: { '~/*': ['./src/*'] } } }),
    )
    const aliases = readTsconfigAliases(join(root, 'p/a'), root)
    expect([...aliases].sort()).toEqual(['@inherited', '@root', '~'])
  })

  it('an unparseable tsconfig degrades to no aliases instead of throwing', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'p/a'), { recursive: true })
    writeFileSync(join(root, 'p/a/tsconfig.json'), '{ this is not json')
    expect(() => readTsconfigAliases(join(root, 'p/a'))).not.toThrow()
    expect(readTsconfigAliases(join(root, 'p/a')).size).toBe(0)
  })

  it('end to end: an aliased import produces no phantom-dep', () => {
    const root = workspace({
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~/*': ['./src/*'] } } }),
      'src/i.ts': `import { X } from '~/components/X'\nexport const y = X`,
    })
    const r = buildReport(root)
    expect(r.issues.filter((i) => i.code === 'phantom-dep')).toHaveLength(0)
    expect(r.issues.filter((i) => i.code === 'phantom-type-dep')).toHaveLength(0)
  })
})

describe('type-only imports are erased, so they are not runtime dependencies', () => {
  it('splits statement-level `import type` / `export type` out of the runtime buckets', () => {
    const root = workspace({
      'src/i.ts': [
        `import type { A } from 'type-pkg'`,
        `export type { B } from 'reexport-pkg'`,
        `import { real } from 'runtime-pkg'`,
      ].join('\n'),
    })
    const scan = scanPackageImports(join(root, 'p/a'))
    expect([...scan.type.keys()].sort()).toEqual(['reexport-pkg', 'type-pkg'])
    expect([...scan.prod.keys()]).toEqual(['runtime-pkg'])
  })

  it('handles the prettier-wrapped MULTI-LINE type import', () => {
    // The first cut of this fix used a `[^'"\n]*?` forward regex and missed
    // exactly this shape — the dominant one in real formatted code. Two
    // packages in the foreign repo still false-positived until it was found.
    const root = workspace({
      'src/i.ts': `import type {\n  ExtractProps,\n  HigherOrderComponent,\n} from '@scope/types'\nimport { real } from 'runtime-pkg'`,
    })
    const scan = scanPackageImports(join(root, 'p/a'))
    expect([...scan.type.keys()]).toEqual(['@scope/types'])
    expect([...scan.prod.keys()]).toEqual(['runtime-pkg'])
  })

  it('every import inside a `.d.ts` is type-only, including a bare augmentation', () => {
    const root = workspace({
      'typings.d.ts': `import 'augmented-pkg'\ndeclare module 'augmented-pkg' { interface X { y: string } }`,
    })
    const scan = scanPackageImports(join(root, 'p/a'))
    expect([...scan.type.keys()]).toEqual(['augmented-pkg'])
    expect(scan.prod.size).toBe(0)
  })

  it('does NOT treat require / dynamic import as type-only after a type statement', () => {
    // Walking back to the nearest statement head must not attribute a
    // `require(…)` to an unrelated `import type` sitting above it.
    const root = workspace({
      'src/i.ts': `import type { A } from 'type-pkg'\nconst b = require('required-pkg')\nconst c = import('dynamic-pkg')`,
    })
    const scan = scanPackageImports(join(root, 'p/a'))
    expect([...scan.type.keys()]).toEqual(['type-pkg'])
    expect([...scan.prod.keys()].sort()).toEqual(['dynamic-pkg', 'required-pkg'])
  })

  it('an INLINE type modifier still emits a runtime import (verbatimModuleSyntax)', () => {
    const root = workspace({
      'src/i.ts': `import { type A, b } from 'mixed-pkg'\nimport { type C } from 'inline-only-pkg'`,
    })
    const scan = scanPackageImports(join(root, 'p/a'))
    expect([...scan.prod.keys()].sort()).toEqual(['inline-only-pkg', 'mixed-pkg'])
    expect(scan.type.size).toBe(0)
  })

  it('a type-only import of a devDependency is CORRECT — no prod-import-of-dev-dep', () => {
    const root = workspace(
      { 'src/i.ts': `import type { ExtractProps } from '@scope/types'` },
      { devDependencies: { '@scope/types': '^1.0.0' } },
    )
    const r = buildReport(root)
    expect(r.issues.filter((i) => i.code === 'prod-import-of-dev-dep')).toHaveLength(0)
  })

  it('a RUNTIME import of a devDependency is still reported', () => {
    const root = workspace(
      { 'src/i.ts': `import { thing } from '@scope/types'\nexport const x = thing` },
      { devDependencies: { '@scope/types': '^1.0.0' } },
    )
    const r = buildReport(root)
    expect(r.issues.filter((i) => i.code === 'prod-import-of-dev-dep')).toHaveLength(1)
  })

  it('an undeclared type-only import is info-level phantom-TYPE-dep, not a runtime phantom', () => {
    const root = workspace({ 'src/i.ts': `import type { A } from 'never-declared'` })
    const r = buildReport(root)
    expect(r.issues.filter((i) => i.code === 'phantom-dep')).toHaveLength(0)
    const typed = r.issues.filter((i) => i.code === 'phantom-type-dep')
    expect(typed).toHaveLength(1)
    expect(typed[0]!.severity).toBe('info')
    expect(typed[0]!.dep).toBe('never-declared')
  })

  it('a dependency used ONLY through a type import is not "unused"', () => {
    // The regression this fix could most easily have introduced: moving type
    // imports out of `prod` without teaching `unused-dep` about the new bucket
    // would accuse every type-only dependency of being dead.
    const root = workspace(
      { 'src/i.ts': `import type { A } from '@scope/types'` },
      { dependencies: { '@scope/types': '^1.0.0' } },
    )
    const r = buildReport(root)
    expect(r.issues.filter((i) => i.code === 'unused-dep')).toHaveLength(0)
  })
})
