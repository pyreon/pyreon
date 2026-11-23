// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importDiagnostics } from '../../../../../scripts/check-script-imports'

/**
 * `scripts/` is not a package, so no per-package typecheck saw it: a script
 * importing a workspace export that was renamed or removed broke only when run
 * (`bench:loom` on the retired `detectPeerMismatch`, #4751 review).
 * `check-script-imports` typechecks `scripts/` and fails on the import class
 * of diagnostics only.
 */
describe('check-script-imports', () => {
  it('keeps the import-class diagnostics and drops ordinary type errors', () => {
    const out = [
      "scripts/bench/tools/loom.ts(36,3): error TS2305: Module '\"../core/detect\"' has no exported member 'detectPeerMismatch'.",
      "scripts/x.ts(1,20): error TS2307: Cannot find module './gone' or its corresponding type declarations.",
      "scripts/y.ts(2,3): error TS2724: '\"./m\"' has no exported member named 'fo'. Did you mean 'foo'?",
      "scripts/bench/core/sync.ts(168,16): error TS18048: 'mid' is possibly 'undefined'.",
      "scripts/verify-modes.ts(2277,7): error TS2412: Type 'string | undefined' is not assignable to type 'string'.",
    ].join('\n')
    expect(importDiagnostics(out).map((l) => l.split('(')[0])).toEqual([
      'scripts/bench/tools/loom.ts',
      'scripts/x.ts',
      'scripts/y.ts',
    ])
  })

  it('fails on what blinds tsc to import errors: syntax, config and missing type libraries', () => {
    const out = [
      "scripts/broken.ts(3,1): error TS1005: ',' expected.",
      'scripts/broken.ts(4,2): error TS1109: Expression expected.',
      "error TS2688: Cannot find type definition file for 'bun'.",
      "tsconfig.json(2,5): error TS5023: Unknown compiler option 'nope'.",
    ].join('\n')
    expect(importDiagnostics(out)).toHaveLength(4)
  })

  it('a syntax error elsewhere in scripts/ does not let a broken import pass (real tsc)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-script-imports-syntax-'))
    try {
      mkdirSync(join(dir, 'pkg'))
      writeFileSync(join(dir, 'pkg', 'detect.ts'), 'export function detectCycles(): number { return 1 }\n')
      writeFileSync(join(dir, 'bench.ts'), "import { detectGone } from './pkg/detect'\nconsole.log(detectGone())\n")
      writeFileSync(join(dir, 'other.ts'), 'const x = (1, \n')
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { noEmit: true, strict: true, module: 'esnext', moduleResolution: 'bundler', types: [] }, include: ['./**/*.ts'] }),
      )
      const r = spawnSync('bunx', ['tsc', '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' })
      const blocking = importDiagnostics(`${r.stdout}\n${r.stderr}`)
      expect(blocking.length).toBeGreaterThan(0)
      expect(blocking.some((l) => /error TS1\d{3}:/.test(l))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('catches a script importing a name its target module does not export (real tsc)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-script-imports-'))
    try {
      mkdirSync(join(dir, 'pkg'))
      writeFileSync(join(dir, 'pkg', 'detect.ts'), 'export function detectCycles(): number { return 1 }\n')
      writeFileSync(join(dir, 'bench.ts'), "import { detectCycles, detectGone } from './pkg/detect'\nconsole.log(detectCycles(), detectGone())\n")
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { noEmit: true, strict: true, module: 'esnext', moduleResolution: 'bundler', types: [] }, include: ['./**/*.ts'] }),
      )
      const r = spawnSync('bunx', ['tsc', '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' })
      const broken = importDiagnostics(`${r.stdout}\n${r.stderr}`)
      expect(broken).toHaveLength(1)
      expect(broken[0]).toContain("has no exported member 'detectGone'")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
