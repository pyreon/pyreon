/**
 * The published `pyreon-lint` bin must actually INVOKE the CLI.
 *
 * Shipped-bug background (0.43.0): `bin/pyreon-lint.js` was a bare
 * `import('../lib/cli.js')` — but the built `lib/cli.js` is a pure re-export
 * (rolldown drops `src/cli.ts`'s `if (import.meta.main) main()` self-run guard,
 * and inside a chunk `import.meta.main` is never true anyway), so the bin
 * loaded a module, ran nothing, and exited 0. `pyreon-lint <anything>` was a
 * complete no-op. The unit tests masked it because they call `runCli()`
 * directly — only executing the real bin catches it.
 *
 * Per the subprocess-testing discipline (anti-patterns: "Subprocess testing as
 * a default"), assertions are on EXIT CODES only (deterministic under parallel
 * load), never captured stdout. The load-bearing case: a fixture with a
 * guaranteed error-severity finding must exit 1 — the broken no-op bin exits 0.
 *
 * Bisect: revert `bin/pyreon-lint.js` to the bare `import('../lib/cli.js')` →
 * the findings-fixture spec fails (`expected 0 to be 1`); restore → passes.
 *
 * Requires `lib/` to be built (bootstrap guarantees it; CI test cells run
 * after Bootstrap) — the guard below skips with a clear message if not.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const PKG_ROOT = resolve(__dirname, '..', '..')
const BIN = join(PKG_ROOT, 'bin', 'pyreon-lint.js')
const LIB_CLI = join(PKG_ROOT, 'lib', 'cli.js')

/** Run the real bin; return the exit code (execFileSync throws on non-zero). */
function runBin(args: string[]): number {
  try {
    execFileSync('node', [BIN, ...args], { stdio: 'pipe' })
    return 0
  } catch (err) {
    return (err as { status?: number }).status ?? -1
  }
}

const tempDirs: string[] = []
function fixture(name: string, source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-bin-'))
  tempDirs.push(dir)
  const file = join(dir, name)
  writeFileSync(file, source)
  return file
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe('pyreon-lint bin invokes the CLI (not a no-op)', () => {
  it.skipIf(!existsSync(LIB_CLI))(
    'exits 1 on a file with an error-severity finding (the no-op bin exits 0)',
    () => {
      // `pyreon/no-signal-call-write` is error-severity by default; this is
      // its canonical FIRES shape (mirrors runner.test.ts).
      const file = fixture(
        'bad.ts',
        `const count = signal(0)\nfunction inc() { count(5) }\nexport { inc }\n`,
      )
      expect(runBin([file])).toBe(1)
    },
  )

  it.skipIf(!existsSync(LIB_CLI))('exits 0 on a clean file', () => {
    const file = fixture(
      'clean.ts',
      `const count = signal(0)\nfunction inc() { count.set(5) }\nexport { inc }\n`,
    )
    expect(runBin([file])).toBe(0)
  })

  it('lib/cli.js is built in this environment (the specs above are NOT skipped)', () => {
    // Fail loudly if the bin's target is missing — a skipped suite must not
    // masquerade as coverage. Bootstrap builds lib/; if this fires, run
    // `bun scripts/bootstrap.ts`.
    expect(existsSync(LIB_CLI)).toBe(true)
  })
})
