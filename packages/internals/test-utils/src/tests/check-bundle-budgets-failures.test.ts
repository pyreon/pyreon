import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// The delta the check inflates an off-gating measurement by. Imported rather
// than re-typed as `0.011`: a hand-copied literal is a second source of truth
// that silently stops matching the thing it describes.
import { GZIP_PLATFORM_DELTA } from '../../../../../scripts/check-bundle-budgets'

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

interface ThinEntry {
  name: string
  current: number
  budget: number
  headroom: number
  required: number
}

interface JsonOutput {
  thinNew: ThinEntry[]
  thinKnown: ThinEntry[]
  recovered: string[]
  measured: Array<{ name: string; raw: number; gzip: number }>
  failures: Array<{ name: string; error: string }>
  unmeasurable: Array<{ name: string; raw: number; reason: string }>
  repaired: string[]
  violations: unknown[]
  missing: Array<{ name: string; current: number }>
}

function setupFixturePackagesDir(opts: {
  badPackage?: boolean
  goodPackage?: boolean
  /** Declares a JS entry, but was never built — a build that did not happen. */
  unbuiltPackage?: boolean
  /** Publishes no JS at all (the `native-*` / `typescript` shape). */
  noJsEntryPackage?: boolean
  /** A pure re-export barrel over a chunk — the shape that measured ~0 bytes. */
  barrelPackage?: boolean
  /** A real package that is simply SMALL — must not be mistaken for a broken one. */
  tinyPackage?: boolean
  /** A VALID bundle that nonetheless lost its implementation — the ratio branch. */
  guttedPackage?: boolean
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
  if (opts.barrelPackage) {
    // The exact shape of the class this locks: the built entry only IMPORTS
    // bindings from a sibling chunk and re-exports them. Nothing in its body
    // references them, so the bundler drops the bindings as unused and emits
    // `export { a as alpha }` with no `a` in scope — an un-importable module
    // whose size (a couple hundred bytes) is not the package's size.
    //
    // This mirrors `@pyreon/charts`, `@pyreon/lint` and five others verbatim:
    // rolldown emits `lib/index.js` as `import { t as x } from './_chunks/…'`
    // plus an export clause, and the implementation lives in the chunk.
    //
    // `sideEffects: false` is LOAD-BEARING here, and it is what makes the shape
    // reachable at all: it is the package's own promise that dropping an unused
    // module is safe, so the bundler takes it. Isolated in pristine fixtures,
    // the identical barrel measures 246 B and imports cleanly with the field
    // absent or `true`, and 38 B and un-importable with it `false`. All seven
    // real packages that measured a stub declare `sideEffects: false` — as do
    // many healthy ones, so it is necessary and not sufficient: the second
    // condition is that the entry's body is a PURE barrel, with nothing
    // referencing the imported bindings except the export clause.
    // `@pyreon/reactivity` has the same chunk layout and the same
    // `sideEffects: false`, and measures correctly because its entry carries
    // real code of its own.
    const dir = join(root, 'barrel-cat', 'barrel-fixture')
    mkdirSync(join(dir, 'lib', '_chunks'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/barrel-fixture',
          version: '0.0.0-test',
          sideEffects: false,
          exports: { '.': { import: './lib/index.js' } },
        },
        null,
        2,
      ),
    )
    // A chunk with enough real implementation that losing it is unmistakable.
    const body = Array.from(
      { length: 60 },
      (_unused, i) =>
        `function helper${i}(input) { return String(input).repeat(${i + 1}).padStart(${i + 3}, 'x') }`,
    ).join('\n')
    writeFileSync(
      join(dir, 'lib', '_chunks', 'impl.js'),
      `${body}\nconst a = (v) => helper0(v) + helper59(v)\nconst b = (v) => helper30(v)\nexport { a, b }\n`,
    )
    writeFileSync(
      join(dir, 'lib', 'index.js'),
      `import { a, b } from "./_chunks/impl.js"\nexport { a as alpha, b as beta }\n`,
    )
  }
  if (opts.tinyPackage) {
    // The INVERSE error guard. A package can be legitimately tiny — a thin
    // wrapper, a couple of constants — and must not be forced to fail merely
    // for being small. The discriminator is scale-free: this package's bundle
    // is small BECAUSE its source is small, so its reach ratio is healthy.
    const dir = join(root, 'tiny-cat', 'tiny-fixture')
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/tiny-fixture',
          version: '0.0.0-test',
          exports: { '.': { import: './lib/index.js' } },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(dir, 'lib', 'index.js'),
      `export const VERSION = '0.0.0-test'\nexport const ok = () => true\n`,
    )
  }
  if (opts.guttedPackage) {
    // The second detector's reproducer, and a real bug shape rather than a
    // contrived one: a package that pulls its implementation in for its SIDE
    // EFFECTS while declaring `sideEffects: false`. The bundler takes the
    // package at its word and drops the import, leaving a VALID module that
    // weighs 35 B against ~35 KB of reachable code. The invalid-module detector
    // cannot see this — the output imports cleanly — so without the reach ratio
    // the branch would be a number nobody could distinguish from a real one.
    // (This is the registration-seam hazard the anti-pattern catalog documents:
    // `@pyreon/unistyle` ships an explicit `sideEffects` array precisely so its
    // module-scope registration survives a consumer's tree-shaking.)
    const dir = join(root, 'gutted-cat', 'gutted-fixture')
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: '@pyreon-test/gutted-fixture',
          version: '0.0.0-test',
          sideEffects: false,
          exports: { '.': { import: './lib/index.js' } },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(dir, 'lib', 'impl.js'),
      Array.from(
        { length: 400 },
        (_unused, i) =>
          `export function helper${i}(input) { return String(input).repeat(${i + 1}).padStart(${i + 3}, 'x') }`,
      ).join('\n') + '\n',
    )
    writeFileSync(join(dir, 'lib', 'index.js'), `import './impl.js'\nexport const tiny = 1\n`)
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

function runCheck(
  packagesRoot: string,
  extraEnv: Record<string, string> = {},
  budgetsPath?: string,
): {
  status: number | null
  json: JsonOutput | null
  stderr: string
} {
  const args = [SCRIPT, '--json', `--packages-root=${packagesRoot}`]
  if (budgetsPath) args.push(`--budgets=${budgetsPath}`)
  const result = spawnSync('bun', args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 60_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...extraEnv,
    },
  })
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
  let budgetsDir: string | null = null

  afterEach(() => {
    if (budgetsDir) {
      rmSync(budgetsDir, { recursive: true, force: true })
      budgetsDir = null
    }
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

  it('MEASURES a pure re-export barrel instead of reporting it as ~0 bytes', () => {
    // The class: a built entry that only imports bindings and re-exports them
    // bundles to an un-importable stub, because nothing in its body uses the
    // imported bindings and the bundler drops them. Seven real packages were
    // measuring a few hundred bytes this way — `@pyreon/lint` had a 512-byte
    // budget over a 513 KB package.
    testDir = setupFixturePackagesDir({ barrelPackage: true })
    const json = runCheck(testDir).json as JsonOutput
    const barrel = json.measured.find((m) => m.name === '@pyreon-test/barrel-fixture')
    expect(barrel).toBeDefined()
    expect(json.repaired).toContain('@pyreon-test/barrel-fixture')
    expect(json.unmeasurable).toHaveLength(0)

    // Calibrate against the BROKEN measurement rather than a hand-typed
    // threshold: the same fixture, measured the old way, is the stub this gate
    // used to report. Asserting a multiple of it survives the fixture being
    // resized later, which a literal byte count would not.
    const brokenJson = runCheck(testDir, { PYREON_BUDGETS_NO_REPAIR: '1' }).json as JsonOutput
    const broken = brokenJson.unmeasurable.find((u) => u.name === '@pyreon-test/barrel-fixture')
    expect(broken).toBeDefined()
    expect(barrel!.raw).toBeGreaterThan(broken!.raw * 4)
  })

  it('reports an unmeasurable bundle as a FAILURE, never as a small size', () => {
    // The load-bearing half. If the repair above ever stops working, the gate
    // must go red and say why — not quietly report a fictional few hundred
    // bytes that any budget trivially satisfies. `PYREON_BUDGETS_NO_REPAIR`
    // simulates that state so the detector can be asserted directly.
    testDir = setupFixturePackagesDir({ barrelPackage: true })
    const { status, json } = runCheck(testDir, { PYREON_BUDGETS_NO_REPAIR: '1' })
    const entry = (json as JsonOutput).unmeasurable.find(
      (u) => u.name === '@pyreon-test/barrel-fixture',
    )
    expect(entry).toBeDefined()
    expect(entry!.reason).toContain('not a valid module')
    expect(entry!.reason).toContain('re-export barrel')
    // Excluded from `measured`, so no budget can be compared against it.
    expect((json as JsonOutput).measured.map((m) => m.name)).not.toContain(
      '@pyreon-test/barrel-fixture',
    )
    expect(status).toBe(1)
  })

  it('reports a VALID bundle that nevertheless lost its implementation', () => {
    // Exercises the second detector on its own. The invalid-module proof cannot
    // fire here (the output imports cleanly), so if the reach ratio were
    // removed this package would report 35 B and any budget would pass it.
    testDir = setupFixturePackagesDir({ guttedPackage: true })
    const { status, json } = runCheck(testDir)
    const entry = (json as JsonOutput).unmeasurable.find(
      (u) => u.name === '@pyreon-test/gutted-fixture',
    )
    expect(entry).toBeDefined()
    expect(entry!.reason).toContain('statically-reachable built code')
    expect((json as JsonOutput).measured.map((m) => m.name)).not.toContain(
      '@pyreon-test/gutted-fixture',
    )
    expect(status).toBe(1)
  })

  it('does NOT flag a package that is legitimately SMALL', () => {
    // The inverse error. The discriminator is scale-free — a bundle is judged
    // against the code ITS OWN entry statically reaches, never against an
    // absolute floor — so a genuinely tiny package passes for the same reason
    // a large one does, with no exemption list to maintain.
    testDir = setupFixturePackagesDir({ tinyPackage: true })
    const json = runCheck(testDir).json as JsonOutput
    expect(json.unmeasurable).toHaveLength(0)
    expect(json.repaired).toHaveLength(0)
    const tiny = json.missing.find((m) => m.name === '@pyreon-test/tiny-fixture')
    expect(tiny).toBeDefined()
    expect(tiny!.current).toBeLessThan(200)
  })

  describe('un-satisfiable budgets (headroom below the platform gzip variance)', () => {
    // gzip output differs by ~1.1% between macOS and the ubuntu runner. A budget
    // with less headroom than that is not strict, it is un-satisfiable: the same
    // commit passes locally and fails CI, and re-running locally only reconfirms
    // the wrong answer. Three PRs paid a CI round trip to this in one day.
    //
    // The budgets FILE is the thing under test, so these drive the script's
    // `--budgets=` seam — the companion to `--packages-root=`.
    // Deliberately NOT inside the packages root — that directory is walked as
    // `<root>/<category>/<package>`, so a stray file there is not a fixture.
    function writeBudgets(budgets: Record<string, unknown>): string {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-budgets-file-')))
      budgetsDir = dir
      const file = join(dir, 'budgets.json')
      writeFileSync(file, JSON.stringify(budgets, null, 2))
      return file
    }

    /** Measures the fixture first, so the thin budget is calibrated, not guessed. */
    function measureFixture(root: string): number {
      const json = runCheck(root).json as JsonOutput
      const entry = json.missing.find((m) => m.name === '@pyreon-test/good-fixture')
      expect(entry).toBeDefined()
      return entry!.current
    }

    it('FAILS on a budget too tight to be measured reliably', () => {
      testDir = setupFixturePackagesDir({ goodPackage: true })
      const measured = measureFixture(testDir)
      const budgets = writeBudgets({ '@pyreon-test/good-fixture': measured + 1 })
      const { status, json } = runCheck(testDir, {}, budgets)

      const thin = (json as JsonOutput).thinNew.find((t) => t.name === '@pyreon-test/good-fixture')
      expect(thin).toBeDefined()
      // Headroom is measured against the WORST-CASE gating figure, not this
      // machine's — that IS the platform-independence fix. `runCheck` spawns
      // with a minimal env carrying no `CI`, so the subprocess is always the
      // off-gating arm and inflates by the delta. A budget one byte above the
      // LOCAL measurement therefore leaves `1 - measured * delta`, which is
      // fractional by construction.
      //
      // The literal `toBe(1)` here was asserting the OLD definition of
      // headroom. The INVARIANT it was protecting is untouched and still
      // asserted below: one byte of nominal slack is not enough, so `required`
      // exceeds it and the check fails. Only the arithmetic is restated.
      expect(thin!.headroom).toBeCloseTo(1 - measured * GZIP_PLATFORM_DELTA, 6)
      // …and the inflation is load-bearing, not decorative: without it the
      // headroom would be exactly the byte the budget was set above.
      expect(thin!.headroom).toBeLessThan(1)
      // The remedy travels WITH the finding — the operator should not have to
      // work out what "enough headroom" is.
      expect(thin!.required).toBeGreaterThan(thin!.headroom)
      expect(status).toBe(1)
    })

    it('does NOT fail for a budget with real headroom', () => {
      testDir = setupFixturePackagesDir({ goodPackage: true })
      const measured = measureFixture(testDir)
      const budgets = writeBudgets({
        '@pyreon-test/good-fixture': Math.ceil(measured * 1.3) + 128,
      })
      const { status, json } = runCheck(testDir, {}, budgets)
      expect((json as JsonOutput).thinNew).toHaveLength(0)
      expect((json as JsonOutput).thinKnown).toHaveLength(0)
      expect(status).toBe(0)
    })

    it('GRANDFATHERS a listed thin budget but keeps reporting it', () => {
      // Existing thin entries must not redden unrelated PRs — a gate that is
      // red on arrival is one nobody reads. They stay visible instead.
      testDir = setupFixturePackagesDir({ goodPackage: true })
      const measured = measureFixture(testDir)
      const budgets = writeBudgets({
        '@pyreon-test/good-fixture': measured + 1,
        _thinHeadroom: { '@pyreon-test/good-fixture': 'known debt, retired by <reason>' },
      })
      const { status, json } = runCheck(testDir, {}, budgets)
      expect((json as JsonOutput).thinNew).toHaveLength(0)
      expect((json as JsonOutput).thinKnown.map((t) => t.name)).toContain(
        '@pyreon-test/good-fixture',
      )
      expect(status).toBe(0)
    })

    it('reports a grandfathered entry that no longer needs the exemption', () => {
      // The ratchet half: the list may only shrink, so an entry that recovered
      // is named for removal rather than left to accumulate.
      testDir = setupFixturePackagesDir({ goodPackage: true })
      const measured = measureFixture(testDir)
      const budgets = writeBudgets({
        '@pyreon-test/good-fixture': Math.ceil(measured * 1.3) + 128,
        _thinHeadroom: { '@pyreon-test/good-fixture': 'stale entry' },
      })
      const json = runCheck(testDir, {}, budgets).json as JsonOutput
      expect(json.recovered).toContain('@pyreon-test/good-fixture')
      expect(json.thinKnown).toHaveLength(0)
    })
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
