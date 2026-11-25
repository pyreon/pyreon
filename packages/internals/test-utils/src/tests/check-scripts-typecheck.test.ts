// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tscDiagnostics } from '../../../../../scripts/check-scripts-typecheck'

/**
 * `scripts/` is not a package, so no per-package typecheck saw it: a script
 * importing a workspace export that was renamed or removed broke only when run
 * (`bench:loom` on the retired `detectPeerMismatch`, #4751 review).
 * `check-scripts-typecheck` typechecks `scripts/` and fails on every
 * diagnostic: an ordinary type error counts as much as a broken import.
 */

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    noEmit: true,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    types: [],
  },
  include: ['./**/*.ts'],
})

/** Run the real tsc over a throwaway project of `files`. */
function tscOver(files: Record<string, string>): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-scripts-typecheck-'))
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, content)
    }
    writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG)
    const r = spawnSync('bunx', ['tsc', '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' })
    return tscDiagnostics(`${r.stdout}\n${r.stderr}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('check-scripts-typecheck', () => {
  it('keeps every diagnostic line: imports, type errors, syntax, config', () => {
    const out = [
      "scripts/bench/tools/loom.ts(36,3): error TS2305: Module '\"../core/detect\"' has no exported member 'detectPeerMismatch'.",
      "scripts/bench/core/sync.ts(168,16): error TS18048: 'mid' is possibly 'undefined'.",
      "scripts/verify-modes.ts(2277,7): error TS2412: Type 'string | undefined' is not assignable to type 'string'.",
      "scripts/broken.ts(3,1): error TS1005: ',' expected.",
      "error TS2688: Cannot find type definition file for 'bun'.",
      '  Type of property x is incompatible.',
      'Found 5 errors in 5 files.',
    ].join('\n')
    expect(tscDiagnostics(out)).toHaveLength(5)
    expect(tscDiagnostics('')).toEqual([])
  })

  it('fails on an ordinary type error, not just a broken import (real tsc)', () => {
    const d = tscOver({
      'bench.ts': 'const xs: number[] = []\nconst mid = xs[0]\nexport const n: number = mid\n',
    })
    expect(d.length).toBeGreaterThan(0)
    expect(d.some((l) => /error TS2322:/.test(l))).toBe(true)
  }, 60_000)

  it('catches a script importing a name its target module does not export (real tsc)', () => {
    const d = tscOver({
      'pkg/detect.ts': 'export function detectCycles(): number { return 1 }\n',
      'bench.ts': "import { detectCycles, detectGone } from './pkg/detect'\nconsole.log(detectCycles(), detectGone())\n",
    })
    expect(d).toHaveLength(1)
    expect(d[0]).toContain("has no exported member 'detectGone'")
  }, 60_000)

  it('a clean project has no diagnostics (real tsc)', () => {
    expect(tscOver({ 'ok.ts': 'export const n: number = 1\n' })).toEqual([])
  }, 60_000)
})
