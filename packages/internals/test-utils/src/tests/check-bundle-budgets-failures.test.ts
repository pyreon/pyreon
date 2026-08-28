import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Subprocess regression test for `scripts/check-bundle-budgets.ts`
 * failure surfacing — gap #7 closure.
 *
 * Policy (post gap #2 closure — see PR #434):
 *
 * When a package fails to bundle (unresolvable third-party dep,
 * malformed entry point, etc.), it MUST appear in the JSON output's
 * `failures[]` array AND MUST NOT appear in `measured[]`. Pre-fix the
 * script silently filtered failed builds out of `results` and reported
 * "All N within budget" with N undercounting the real eligible-package
 * set — silent gate erosion that hid the very failure mode the gate
 * exists to catch.
 *
 * This test points the script at a temp directory containing a fake
 * package whose `lib/index.js` imports an unresolvable specifier, then
 * asserts the JSON output's shape. Without the failure-surfacing fix,
 * the test fails because `failures` is empty (or missing) — exactly
 * the regression we want to lock out.
 *
 * Implementation note: the script accepts `--packages-root=<dir>` to
 * override the default `<REPO_ROOT>/packages` discovery. Production
 * runs never pass this flag; the test uses it to drive a controlled
 * fixture without perturbing the real repo state.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'check-bundle-budgets.ts')

interface JsonOutput {
  measured: Array<{ name: string; raw: number; gzip: number }>
  failures: Array<{ name: string; error: string }>
  violations: unknown[]
  missing: unknown[]
}

function setupFixturePackagesDir(opts: {
  badPackage?: boolean
  goodPackage?: boolean
  /** Declares a JS entry, but was never built — a build that did not happen. */
  unbuiltPackage?: boolean
  /** Publishes no JS at all (the `native-*` / `typescript` shape). */
  noJsEntryPackage?: boolean
}): string {
  // realpathSync canonicalises macOS `/var/folders` → `/private/var/...`
  // so any internal path comparison the script does sees the same form.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-budgets-test-')))
  // Mimic the real `packages/<category>/<pkg>/` layout — the script
  // walks two levels deep.
  if (opts.badPackage) {
    const dir = join(root, 'failing-cat', 'bad-fixture')
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/bad-fixture',
          version: '0.0.0-test',
          exports: { '.': { import: './lib/index.js' } },
        },
        null,
        2,
      ),
    )
    // Deliberately malformed JS — Bun.build returns success: false
    // with parse errors in the logs. The exact shape of the failure
    // doesn't matter for this test; we're asserting that ANY bundle
    // failure surfaces in the JSON output's `failures[]` field
    // instead of being silently filtered.
    writeFileSync(join(dir, 'lib', 'index.js'), `this is not { valid javascript ;;;\n`)
  }
  if (opts.goodPackage) {
    const dir = join(root, 'good-cat', 'good-fixture')
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/good-fixture',
          version: '0.0.0-test',
          exports: { '.': { import: './lib/index.js' } },
        },
        null,
        2,
      ),
    )
    writeFileSync(join(dir, 'lib', 'index.js'), `export const hello = 'world'\n`)
  }
  if (opts.unbuiltPackage) {
    // Declares a JS entry and has NO `lib/` — the shape a package takes when
    // its build failed or never ran. It used to be skipped, which dropped it
    // from the count while the gate still printed "All N within budget".
    const dir = join(root, 'unbuilt-cat', 'unbuilt-fixture')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/unbuilt-fixture',
          version: '0.0.0-test',
          exports: { '.': { import: './lib/index.js' } },
        },
        null,
        2,
      ),
    )
  }
  if (opts.noJsEntryPackage) {
    // Published, no `lib/`, and promises no JavaScript — the real shape of the
    // four `native-*` runtime/router packages (Swift/Kotlin SOURCE) and of
    // `@pyreon/typescript` (tsconfig JSON). Skipping these is CORRECT, and the
    // distinction is derived from the manifest rather than a list that rots.
    const dir = join(root, 'nojs-cat', 'nojs-fixture')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/nojs-fixture',
          version: '0.0.0-test',
          files: ['Sources', 'README.md'],
          exports: { '.': './base.json' },
        },
        null,
        2,
      ),
    )
  }
  return root
}

function runCheck(packagesRoot: string): {
  status: number | null
  json: JsonOutput | null
  stderr: string
} {
  const result = spawnSync(
    'bun',
    [SCRIPT, '--json', `--packages-root=${packagesRoot}`],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      },
    },
  )
  let json: JsonOutput | null = null
  try {
    // The script emits the bun-run preamble (`$ bun scripts/...`) on
    // stdout BEFORE the JSON in some shell configurations; strip lines
    // until we find the opening `{`.
    const out = result.stdout ?? ''
    const start = out.indexOf('{')
    json = start >= 0 ? (JSON.parse(out.slice(start)) as JsonOutput) : null
  } catch {
    json = null
  }
  return { status: result.status, json, stderr: result.stderr ?? '' }
}

describe('scripts/check-bundle-budgets.ts failure surfacing', () => {
  let testDir: string | null = null

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true })
      testDir = null
    }
  })

  it('surfaces unbuildable package in failures[], not measured[]', () => {
    testDir = setupFixturePackagesDir({
      badPackage: true,
      goodPackage: true,
    })
    const result = runCheck(testDir)
    expect(result.json).not.toBeNull()
    const json = result.json as JsonOutput

    const failedNames = json.failures.map((f) => f.name)
    const measuredNames = json.measured.map((m) => m.name)

    // The failing fixture appears in failures[]…
    expect(failedNames).toContain('@pyreon-test/bad-fixture')
    // …and NOT in measured[]. Pre-fix, it was silently filtered out
    // of results entirely — neither array contained it, so the gate
    // reported "All N within budget" with the failure invisible.
    expect(measuredNames).not.toContain('@pyreon-test/bad-fixture')
    // The good fixture still measures correctly — a single failure
    // doesn't poison the whole run.
    expect(measuredNames).toContain('@pyreon-test/good-fixture')
    // Exit non-zero because at least one package is in failures[].
    expect(result.status).toBe(1)
  })

  it('exits 0 with empty failures[] when all packages bundle successfully', () => {
    testDir = setupFixturePackagesDir({ goodPackage: true })
    const result = runCheck(testDir)
    expect(result.json).not.toBeNull()
    const json = result.json as JsonOutput

    expect(json.failures).toEqual([])
    expect(json.measured.map((m) => m.name)).toContain('@pyreon-test/good-fixture')
    // Good fixture has no budget entry → appears in `missing[]` →
    // script exits 1. Test only the failures-empty contract here;
    // the missing-budget exit-code is locked in by the script's own
    // logic, not relevant to the failure-surfacing regression we
    // care about.
    expect(json.missing.length).toBeGreaterThan(0)
  })

  it('produces measured[] entries with non-zero gzip size for buildable fixtures', () => {
    testDir = setupFixturePackagesDir({ goodPackage: true })
    const result = runCheck(testDir)
    const json = result.json as JsonOutput
    const good = json.measured.find((m) => m.name === '@pyreon-test/good-fixture')
    expect(good).toBeDefined()
    expect(good!.gzip).toBeGreaterThan(0)
    expect(good!.raw).toBeGreaterThan(0)
  })

  it('reports a package that declares a JS entry but was never BUILT', () => {
    // The hole this closes: `if (!fileExists(entry)) continue` dropped such a
    // package from the run entirely, so the count fell (measured 71 -> 70 on
    // the real repo) while the gate still printed "All 70 package(s) within
    // budget". A package whose build failed is precisely the one whose size
    // nobody is checking.
    testDir = setupFixturePackagesDir({ unbuiltPackage: true })
    const result = runCheck(testDir)
    const json = result.json as JsonOutput

    expect(json.failures.map((f) => f.name)).toContain('@pyreon-test/unbuilt-fixture')
    expect(json.measured.map((m) => m.name)).not.toContain('@pyreon-test/unbuilt-fixture')
    expect(result.status).toBe(1)
  })

  it('names the remedy in the failure, so the message is actionable', () => {
    testDir = setupFixturePackagesDir({ unbuiltPackage: true })
    const json = runCheck(testDir).json as JsonOutput
    const entry = json.failures.find((f) => f.name === '@pyreon-test/unbuilt-fixture')
    expect(entry?.error).toContain('lib/index.js')
    expect(entry?.error).toContain('bootstrap')
  })

  it('does NOT report a published package that promises no JavaScript', () => {
    // The four `native-*` runtime/router packages ship Swift and Kotlin SOURCE
    // and `@pyreon/typescript` ships tsconfig JSON. None has `lib/index.js`,
    // and none should. Reporting them would make the gate cry wolf on five
    // packages permanently, which is how a gate stops being read.
    testDir = setupFixturePackagesDir({ noJsEntryPackage: true, goodPackage: true })
    const json = runCheck(testDir).json as JsonOutput
    expect(json.failures.map((f) => f.name)).not.toContain('@pyreon-test/nojs-fixture')
    expect(json.measured.map((m) => m.name)).not.toContain('@pyreon-test/nojs-fixture')
  })
})
