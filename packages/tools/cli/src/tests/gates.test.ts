import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  runAuditTypesGate,
  runBundleBudgetsGate,
  runDistributionGate,
  runDocClaimsGate,
} from '../doctor/gates'
import {
  _parseAuditLeakClassesOutput,
  runAuditLeakClassesGate,
} from '../doctor/gates/audit-leak-classes'
import { _parseAuditTypesOutput } from '../doctor/gates/audit-types'
import { _parseBundleBudgetsOutput } from '../doctor/gates/bundle-budgets'
import { _detectMapsInPackOutput } from '../doctor/gates/distribution'
import type { Finding, GateResult, Severity } from '../doctor/types'
import { finding } from '../doctor/types'

/**
 * Shape contract for every doctor gate. These tests assert the
 * `GateResult` invariants so the PR 2 aggregator can rely on them
 * without per-gate special-casing.
 */
function assertGateResultShape(result: GateResult, gate: string): void {
  expect(result.gate).toBe(gate)
  expect(typeof result.category).toBe('string')
  expect(Array.isArray(result.findings)).toBe(true)
  expect(typeof result.meta.elapsedMs).toBe('number')
  expect(result.meta.elapsedMs).toBeGreaterThanOrEqual(0)
  for (const f of result.findings) {
    assertFindingShape(f, gate)
  }
}

function assertFindingShape(f: Finding, gate: string): void {
  expect(f.gate).toBe(gate)
  expect(typeof f.code).toBe('string')
  expect(f.code).toMatch(new RegExp(`^${gate}/`))
  expect(typeof f.message).toBe('string')
  expect(f.message.length).toBeGreaterThan(0)
  const sev: Severity[] = ['error', 'warning', 'info']
  expect(sev).toContain(f.severity)
}

// Vitest runs the file without `import.meta.dir`; resolve from the
// known package location relative to the workspace root via a stable
// anchor (`packages/tools/cli` -> 3 levels up to repo root).
const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  '..',
  '..',
)

describe('runDistributionGate', () => {
  it('returns clean GateResult shape against real repo', async () => {
    // skipPackProbe: true — the live `npm pack --dry-run` is slow
    // under CI parallel load (100s+ vs ~5s standalone). The probe's
    // .map-detection logic is covered separately by the
    // _detectMapsInPackOutput unit tests below; coverage for the
    // execFileSync invocation itself isn't worth the timeout risk.
    const result = await runDistributionGate({
      cwd: REPO_ROOT,
      skipPackProbe: true,
    })
    assertGateResultShape(result, 'distribution')
    expect(result.category).toBe('architecture')
    expect(result.meta.scanned).toBeGreaterThan(0)
  })

  it('runs the probe block but no-ops when probePackage is missing', async () => {
    // skipPackProbe: false (default-on path) + probePackage that
    // doesn't exist in the synthetic repo → `packages.find(...)`
    // returns undefined → the inner try block is skipped without
    // spawning npm. Covers the `if (!opts.skipPackProbe)` +
    // `const probe = packages.find(...)` + `if (probe)` branches
    // without depending on the npm subprocess (which times out on
    // CI parallel load).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-dist-probe-'))
    fs.mkdirSync(path.join(tmp, 'packages', 'fundamentals', 'ok'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tmp, 'packages', 'fundamentals', 'ok', 'package.json'),
      JSON.stringify({
        name: '@pyreon/ok',
        sideEffects: false,
        files: ['lib'],
      }),
    )

    const result = await runDistributionGate({
      cwd: tmp,
      probePackage: '@pyreon/does-not-exist',
      // skipPackProbe omitted → defaults to false
    })
    assertGateResultShape(result, 'distribution')
    expect(result.findings).toEqual([])

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('emits findings with the expected code prefixes when invariants fail', async () => {
    // Create a synthetic broken package: published (no `private`),
    // missing sideEffects AND excludes source maps (regressed back to
    // the pre-inversion shape).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-dist-gate-'))
    fs.mkdirSync(path.join(tmp, 'packages', 'fundamentals', 'broken'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tmp, 'packages', 'fundamentals', 'broken', 'package.json'),
      JSON.stringify({
        name: '@pyreon/broken',
        files: ['lib', '!lib/**/*.map'],
      }),
    )

    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    assertGateResultShape(result, 'distribution')

    const codes = result.findings.map((f) => f.code).sort()
    expect(codes).toContain('distribution/missing-sideEffects')
    expect(codes).toContain('distribution/excludes-source-maps')
    for (const f of result.findings) {
      expect(f.severity).toBe('error')
      expect(f.message).toContain('@pyreon/broken')
    }

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('runDocClaimsGate', () => {
  it('returns GateResult against real repo with expected shape', async () => {
    const result = await runDocClaimsGate({ cwd: REPO_ROOT })
    assertGateResultShape(result, 'doc-claims')
    expect(result.category).toBe('documentation')
    // The real repo has 19 claim sites configured today (7 hook/doc +
    // 6 lint-rule + 4 lint-category + 2 detector-code); verify the
    // scanner found them all (any missing files would surface as
    // file-missing findings, scanned count stays stable).
    expect(result.meta.scanned).toBe(19)
    // The real repo must be drift-free — this gate runs in CI; if a
    // count claim drifts, EVERY PR's doctor run fails until it's fixed.
    const errs = result.findings.filter((f) => f.severity === 'error')
    expect(errs).toHaveLength(0)
  })

  // Helpers to build a tmp repo with the hooks claim sources the
  // doc-claims gate walks. Used by the drift / hedged / pattern-miss
  // path-covering tests below.
  function buildHooksRepo(
    tmp: string,
    opts: {
      hookCount: number
      readmeClaim?: string | null
      manifestTagline?: string | null
      claudeMdRow?: string | null
      claudeMdArch?: string | null
      docsIndex?: string | null
    },
  ): void {
    const hooksDir = path.join(tmp, 'packages', 'fundamentals', 'hooks')
    fs.mkdirSync(path.join(hooksDir, 'src'), { recursive: true })

    // Generate an index.ts with N `export { useX }` lines so the
    // gate's countHookExports() returns hookCount. The regex requires
    // `use[A-Z][a-zA-Z]+` so use letter-only suffixes (no digits).
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    const exports = Array.from(
      { length: opts.hookCount },
      (_, i) => {
        const name = (letters[i] ?? `Z${i}`).toUpperCase() + letters[i] + 'ook'
        return `export { useH${name} }`
      },
    ).join('\n')
    fs.writeFileSync(
      path.join(hooksDir, 'src', 'index.ts'),
      exports + '\n',
    )

    if (opts.readmeClaim !== null) {
      fs.writeFileSync(
        path.join(hooksDir, 'README.md'),
        opts.readmeClaim ?? `${opts.hookCount} signal-based reactive utilities\n`,
      )
    }

    if (opts.manifestTagline !== null) {
      fs.writeFileSync(
        path.join(hooksDir, 'src', 'manifest.ts'),
        opts.manifestTagline ??
          `tagline: '${opts.hookCount} signal-based hooks: foo'\nSignal-based hooks for Pyreon — ${opts.hookCount} reactive primitives\n`,
      )
    }

    // CLAUDE.md carries TWO claim sites (table row + arch section)
    fs.writeFileSync(
      path.join(tmp, 'CLAUDE.md'),
      `${opts.claudeMdRow ?? `| \`@pyreon/hooks\` | ${opts.hookCount} signal-based hooks for stuff |`}\n${
        opts.claudeMdArch ?? `- ${opts.hookCount} signal-based hooks across 6 categories`
      }\n3 doc pages covering all packages\n`,
    )

    // docs/src/content/docs/index.md carries one
    fs.mkdirSync(path.join(tmp, 'docs', 'docs'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'docs', 'docs', 'index.md'),
      opts.docsIndex ?? `| ${opts.hookCount} signal-based hooks for common UI patterns\n`,
    )
  }

  it('emits drift finding when claim count diverges from actual', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-drift-'))
    // Actual export count is 3, but the README hard-codes 99.
    buildHooksRepo(tmp, {
      hookCount: 3,
      readmeClaim: '99 signal-based reactive utilities\n',
    })

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
    const drift = result.findings.find((f) =>
      f.code.endsWith('-drift'),
    )!
    expect(drift).toBeDefined()
    expect(drift.severity).toBe('error')
    expect(drift.message).toContain('claims 99')
    expect(drift.message).toContain('actual 3')
    expect(drift.fix).toContain('99 to 3')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('emits hedged finding when CLAUDE.md uses "N+" form', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-hedged-'))
    // 3 actual exports; CLAUDE.md row uses the rejected hedged form.
    buildHooksRepo(tmp, {
      hookCount: 3,
      claudeMdRow:
        '| `@pyreon/hooks` | 3+ signal-based hooks for stuff |',
    })

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
    const hedged = result.findings.find((f) =>
      f.code.endsWith('-hedged'),
    )!
    expect(hedged).toBeDefined()
    expect(hedged.severity).toBe('error')
    expect(hedged.message).toContain('hedged claim')
    expect(hedged.fix).toContain('"3+"')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('emits pattern-miss warning when the claim file lost its pattern', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-miss-'))
    // Build a repo where the README exists but doesn't contain the
    // pattern at all — claim was rephrased / removed.
    buildHooksRepo(tmp, {
      hookCount: 3,
      readmeClaim: 'Hooks library for Pyreon. No numeric claim here.\n',
    })

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
    const miss = result.findings.find((f) =>
      f.code === 'doc-claims/hook-count-pattern-miss',
    )!
    expect(miss).toBeDefined()
    expect(miss.severity).toBe('warning')
    expect(miss.message).toContain('pattern not found')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('emits file-missing finding when a claim file is absent (but at least one exists)', async () => {
    // Build a minimal fake repo with the source-of-truth file AND at
    // least one claim file present — that's the "this IS a Pyreon
    // project, but some claim sites have been deleted/moved" shape.
    // Gate walks claims[] and emits file-missing for each absent one.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-gate-'))
    fs.mkdirSync(
      path.join(tmp, 'packages', 'fundamentals', 'hooks', 'src'),
      { recursive: true },
    )
    fs.writeFileSync(
      path.join(tmp, 'packages', 'fundamentals', 'hooks', 'src', 'index.ts'),
      '',
    )
    // Plant one claim file (CLAUDE.md) so the gate doesn't skip.
    // Content is empty so its claims trigger pattern-miss (warning),
    // not file-missing. All OTHER claim files remain absent and
    // produce file-missing (error) findings.
    fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '')

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
    expect(result.meta.skipped).not.toBe(true)
    const fileMissing = result.findings.filter((f) =>
      f.code.endsWith('-file-missing'),
    )
    expect(fileMissing.length).toBeGreaterThan(0)
    for (const f of fileMissing) {
      expect(f.severity).toBe('error')
      expect(f.location?.relPath).toBeTruthy()
    }

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('lint-rule-count: drift when CLAUDE.md hard-codes the wrong allRules length', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-lr-'))
    const rulesDir = path.join(tmp, 'packages', 'tools', 'lint', 'src', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    // 4 real rule entries; the doc will lie and say 99.
    fs.writeFileSync(
      path.join(rulesDir, 'index.ts'),
      'export const allRules: Rule[] = [\n' +
        '  // Reactivity (2)\n  ruleA,\n  ruleB,\n' +
        '  // JSX (2)\n  ruleC,\n  ruleD,\n]\n',
    )
    fs.writeFileSync(
      path.join(tmp, 'CLAUDE.md'),
      'See `listRules()` — returns metadata for all 99 rules in the set.\n',
    )

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
    const drift = result.findings.find(
      (f) => f.code === 'doc-claims/lint-rule-count-drift',
    )!
    expect(drift).toBeDefined()
    expect(drift.severity).toBe('error')
    expect(drift.message).toContain('claims 99')
    expect(drift.message).toContain('actual 4')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('lint-rule-count `all`: flags ONE wrong occurrence among many in manifest.ts', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-all-'))
    const rulesDir = path.join(tmp, 'packages', 'tools', 'lint', 'src', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(
      path.join(rulesDir, 'index.ts'),
      'export const allRules: Rule[] = [\n  ruleA,\n  ruleB,\n  ruleC,\n]\n',
    )
    // manifest carries the count 3×: two correct (3), one stale (9).
    fs.writeFileSync(
      path.join(rulesDir, '..', 'manifest.ts'),
      "summary: '3 rules across 1 categories. foo'\n" +
        "// pyreon-lint --list  # list all 3 rules\n" +
        "desc: 'covers stuff — 9 rules total. bar'\n",
    )
    // Plant CLAUDE.md so the gate doesn't skip (no rule claim in it).
    fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), 'nothing here\n')

    const result = await runDocClaimsGate({ cwd: tmp })
    const drifts = result.findings.filter(
      (f) =>
        f.code === 'doc-claims/lint-rule-count-drift' &&
        f.location?.relPath === 'packages/tools/lint/src/manifest.ts',
    )
    // Exactly the single stale "9" occurrence — the two correct "3"s pass.
    expect(drifts).toHaveLength(1)
    expect(drifts[0]!.message).toContain('claims 9')
    expect(drifts[0]!.message).toContain('actual 3')
    expect(drifts[0]!.message).toContain('occurrences')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('detector-code-count: drift when anti-patterns.md mis-states the union size', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-dc-'))
    const compilerDir = path.join(tmp, 'packages', 'core', 'compiler', 'src')
    fs.mkdirSync(compilerDir, { recursive: true })
    fs.writeFileSync(
      path.join(compilerDir, 'pyreon-intercept.ts'),
      "export type PyreonDiagnosticCode =\n  | 'a-b'\n  | 'c-d'\n  | 'e-f'\n\nexport interface X {}\n",
    )
    const rulesDir = path.join(tmp, '.claude', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(
      path.join(rulesDir, 'anti-patterns.md'),
      'the detector flags 12 of the patterns below statically, and more.\n',
    )
    fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), 'no detector claim here\n')

    const result = await runDocClaimsGate({ cwd: tmp })
    const drift = result.findings.find(
      (f) => f.code === 'doc-claims/detector-code-count-drift',
    )!
    expect(drift).toBeDefined()
    expect(drift.message).toContain('claims 12')
    expect(drift.message).toContain('actual 3')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('skips the gate when no claim files exist (non-Pyreon project)', async () => {
    // A downstream consumer app has none of the Pyreon-monorepo claim
    // sites (CLAUDE.md, hooks README, docs/src/content/docs/index.md, …). The gate
    // recognises this and returns skipped:true rather than flooding
    // findings with spurious file-missing errors for paths that don't
    // apply to the user's project.
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pyreon-claims-gate-skip-'),
    )
    // Tmp dir is empty — no Pyreon-shaped files anywhere.

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
    expect(result.meta.skipped).toBe(true)
    expect(result.meta.skipReason).toContain('no claim sites')
    expect(result.findings).toHaveLength(0)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('runAuditLeakClassesGate', () => {
  // The live invocation against the real repo is intentionally NOT
  // here — `scripts/audit-leak-classes.ts` has its own CI workflow
  // (`audit-leak-classes.yml`). The unit-level shape contract is
  // covered via the gate-failed spec below (assertGateResultShape()
  // fires either way) + the `_parseAuditLeakClassesOutput` unit
  // tests above cover the success-path JSON → Finding[] mapping.

  it('surfaces gate-failed finding when script is unreachable', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-leak-gate-'))
    const result = await runAuditLeakClassesGate({ cwd: tmp })
    assertGateResultShape(result, 'audit-leak-classes')
    const failed = result.findings.find(
      (f) => f.code === 'audit-leak-classes/gate-failed',
    )
    expect(failed).toBeDefined()
    expect(failed?.severity).toBe('error')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('runAuditTypesGate', () => {
  // The live invocation against the real repo is intentionally NOT
  // a unit test — the subprocess walks every public interface across
  // 6 high-risk packages via the TS compiler API; even with warm
  // caches it runs ~1s locally but ~30s+ under CI parallel load,
  // tripping the test timeout. The standalone script
  // `scripts/audit-types.ts` has its own CI gate (`Audit Types`)
  // which exercises the live path; this test layer locks the
  // GateResult shape contract via the failure-path spec below
  // (the assertGateResultShape() helper fires either way).

  it('surfaces gate-failed finding when script is unreachable', async () => {
    // Point cwd at a directory with no scripts/audit-types.ts. The
    // subprocess fails; the gate emits a single gate-failed finding
    // rather than throwing.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-audit-gate-'))
    const result = await runAuditTypesGate({ cwd: tmp })
    assertGateResultShape(result, 'audit-types')
    const failed = result.findings.find(
      (f) => f.code === 'audit-types/gate-failed',
    )
    expect(failed).toBeDefined()
    expect(failed?.severity).toBe('error')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('finding() helper', () => {
  it('returns the passed Finding unchanged (identity helper for readability)', () => {
    const f = finding({
      category: 'correctness',
      severity: 'error',
      code: 'test/example',
      gate: 'test',
      message: 'example',
    })
    expect(f.category).toBe('correctness')
    expect(f.severity).toBe('error')
    expect(f.code).toBe('test/example')
  })
})

describe('runDistributionGate — findPackages error paths', () => {
  it('tolerates non-directory entries under packages/* (unreadable catDir)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-dist-dirread-'))
    fs.mkdirSync(path.join(tmp, 'packages'), { recursive: true })
    // Put a regular file where readdirSync(packages/file) would fail.
    fs.writeFileSync(path.join(tmp, 'packages', 'notadir'), '')

    // Should NOT throw — the catch wraps readdirSync(catDir) so the
    // walker just skips the non-directory entry.
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    assertGateResultShape(result, 'distribution')
    expect(result.meta.scanned).toBe(0)

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('skips packages with invalid JSON package.json', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-dist-badpj-'))
    fs.mkdirSync(path.join(tmp, 'packages', 'fundamentals', 'bad'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tmp, 'packages', 'fundamentals', 'bad', 'package.json'),
      'NOT JSON{{{',
    )

    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    assertGateResultShape(result, 'distribution')
    expect(result.meta.scanned).toBe(0)

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('skips private packages', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-dist-private-'))
    fs.mkdirSync(path.join(tmp, 'packages', 'internals', 'priv'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tmp, 'packages', 'internals', 'priv', 'package.json'),
      JSON.stringify({ name: '@pyreon/priv', private: true }),
    )

    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    assertGateResultShape(result, 'distribution')
    // Private package is excluded from the scanned count + emits no
    // findings (the gate only walks published packages).
    expect(result.meta.scanned).toBe(0)
    expect(result.findings).toEqual([])

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('_detectMapsInPackOutput', () => {
  const probe = { dir: '/repo/packages/core/reactivity' }
  const cwd = '/repo'

  it('emits tarball-missing-maps finding when the tarball has no .map files', () => {
    const raw = JSON.stringify([
      {
        files: [
          { path: 'package.json' },
          { path: 'lib/index.js' },
          { path: 'lib/index.d.ts' },
        ],
      },
    ])
    const result = _detectMapsInPackOutput(
      raw,
      cwd,
      probe,
      '@pyreon/reactivity',
    )
    expect(result).not.toBeNull()
    expect(result!.code).toBe('distribution/tarball-missing-maps')
    expect(result!.severity).toBe('error')
    expect(result!.gate).toBe('distribution')
    expect(result!.message).toContain('@pyreon/reactivity')
    expect(result!.message).toContain('0 .map files')
    expect(result!.location?.relPath).toBe(
      'packages/core/reactivity/package.json',
    )
  })

  it('returns null when .map files are present in the tarball', () => {
    const raw = JSON.stringify([
      {
        files: [
          { path: 'lib/index.js' },
          { path: 'lib/index.js.map' },
          { path: 'lib/types/index.d.ts.map' },
        ],
      },
    ])
    const result = _detectMapsInPackOutput(
      raw,
      cwd,
      probe,
      '@pyreon/reactivity',
    )
    expect(result).toBeNull()
  })

  it('handles npm pack output with no files entry gracefully', () => {
    // Some npm versions / edge cases emit an empty array; the gate
    // shouldn't crash. The static `files`-array check is the
    // authoritative source of truth, so the live probe stays silent
    // on malformed output instead of false-positiving.
    const result = _detectMapsInPackOutput('[]', cwd, probe, '@pyreon/x')
    expect(result).toBeNull()
  })
})

describe('_parseAuditTypesOutput', () => {
  it('maps HIGH/MEDIUM/LOW to error/warning/info and suppresses OK', () => {
    const raw = JSON.stringify([
      {
        package: '@pyreon/zero',
        packageDir: '/repo/packages/zero/zero',
        findings: [
          {
            package: '@pyreon/zero',
            interface: 'ZeroConfig',
            field: 'mode',
            declaredIn: 'packages/zero/zero/src/types.ts',
            declaredLine: 42,
            refCount: 0,
            severity: 'HIGH',
          },
          {
            package: '@pyreon/zero',
            interface: 'ZeroConfig',
            field: 'maybeUsed',
            declaredIn: 'packages/zero/zero/src/types.ts',
            declaredLine: 50,
            refCount: 1,
            severity: 'MEDIUM',
          },
          {
            package: '@pyreon/zero',
            interface: 'ZeroConfig',
            field: 'rarelyUsed',
            declaredIn: 'packages/zero/zero/src/types.ts',
            declaredLine: 55,
            refCount: 2,
            severity: 'LOW',
          },
          {
            package: '@pyreon/zero',
            interface: 'ZeroConfig',
            field: 'reallyUsed',
            declaredIn: 'packages/zero/zero/src/types.ts',
            declaredLine: 60,
            refCount: 20,
            severity: 'OK',
          },
        ],
      },
    ])
    const { findings, scanned } = _parseAuditTypesOutput(raw, '/repo')
    expect(scanned).toBe(1)
    // OK is suppressed → 3 findings, not 4
    expect(findings).toHaveLength(3)
    expect(findings.map((f) => f.severity).sort()).toEqual([
      'error',
      'info',
      'warning',
    ])
    const high = findings.find((f) => f.severity === 'error')!
    expect(high.code).toBe('audit-types/typed-but-unimplemented-high')
    expect(high.gate).toBe('audit-types')
    expect(high.category).toBe('architecture')
    expect(high.message).toContain('@pyreon/zero')
    expect(high.message).toContain('ZeroConfig.mode')
    expect(high.location?.line).toBe(42)
    expect(high.location?.relPath).toBe(
      'packages/zero/zero/src/types.ts',
    )
    expect(high.location?.path).toBe(
      '/repo/packages/zero/zero/src/types.ts',
    )
  })

  it('handles empty results array', () => {
    const { findings, scanned } = _parseAuditTypesOutput('[]', '/repo')
    expect(findings).toEqual([])
    expect(scanned).toBe(0)
  })

  it('handles a package with no findings', () => {
    const raw = JSON.stringify([
      { package: '@pyreon/router', packageDir: '/repo/p', findings: [] },
    ])
    const { findings, scanned } = _parseAuditTypesOutput(raw, '/repo')
    expect(findings).toEqual([])
    expect(scanned).toBe(1)
  })
})

describe('_parseAuditLeakClassesOutput', () => {
  it('maps every leak class to severity=info with the class label baked into the code', () => {
    const raw = JSON.stringify({
      total: 4,
      findings: [
        {
          detector: 'unbounded-cache',
          file: '/repo/packages/x/src/cache.ts',
          line: 10,
          leakClass: 'C',
          message: 'Module-level Map "foo" — unbounded growth risk.',
          context: 'const foo = new Map()',
        },
        {
          detector: 'unbalanced-listeners',
          file: '/repo/packages/y/src/dom.ts',
          line: 1,
          leakClass: 'D',
          message: '2 addEventListener vs 0 removeEventListener',
          context: 'add=2 remove=0',
        },
        {
          detector: 'position-based-pop',
          file: '/repo/packages/z/src/stack.ts',
          line: 42,
          leakClass: 'A',
          message: 'Module-level stack uses .pop() — Class A risk.',
          context: 'stack.pop()',
        },
        {
          detector: 'promise-race-no-clear',
          file: '/repo/packages/w/src/race.ts',
          line: 50,
          leakClass: 'I',
          message: 'Promise.race + setTimeout without clearTimeout.',
          context: 'Promise.race([…])',
        },
      ],
    })
    const { findings, total } = _parseAuditLeakClassesOutput(raw, '/repo')
    expect(total).toBe(4)
    expect(findings).toHaveLength(4)
    for (const f of findings) {
      // Every finding is INFO + the ADVISORY `best-practices` category —
      // the audit is advisory by design (info alone still counts 1pt each
      // in the score, so the category must be advisory to be excluded from
      // the grade + --ci; see the gate's JSDoc).
      expect(f.severity).toBe('info')
      expect(f.gate).toBe('audit-leak-classes')
      expect(f.category).toBe('best-practices')
    }
    // Class label baked into the code so downstream renderers can
    // group by class without re-parsing the message.
    expect(findings[0]!.code).toBe('audit-leak-classes/class-c-unbounded-cache')
    expect(findings[1]!.code).toBe('audit-leak-classes/class-d-unbalanced-listeners')
    expect(findings[2]!.code).toBe('audit-leak-classes/class-a-position-based-pop')
    expect(findings[3]!.code).toBe('audit-leak-classes/class-i-promise-race-no-clear')
    // Message gets the `[Class X]` prefix for at-a-glance triage.
    expect(findings[0]!.message).toMatch(/^\[Class C\]/)
    expect(findings[2]!.message).toMatch(/^\[Class A\]/)
  })

  it('relativizes file paths against cwd', () => {
    const raw = JSON.stringify({
      total: 1,
      findings: [
        {
          detector: 'unbounded-cache',
          file: '/repo/packages/x/src/cache.ts',
          line: 10,
          leakClass: 'C',
          message: 'msg',
          context: 'ctx',
        },
      ],
    })
    const { findings } = _parseAuditLeakClassesOutput(raw, '/repo')
    expect(findings[0]!.location?.relPath).toBe('packages/x/src/cache.ts')
    expect(findings[0]!.location?.line).toBe(10)
  })

  it('handles empty findings array', () => {
    const raw = JSON.stringify({ total: 0, findings: [] })
    const { findings, total } = _parseAuditLeakClassesOutput(raw, '/repo')
    expect(findings).toEqual([])
    expect(total).toBe(0)
  })
})

describe('_parseBundleBudgetsOutput', () => {
  it('emits over-budget, missing-budget, bundle-failed findings', () => {
    const raw = JSON.stringify({
      violations: [
        {
          name: '@pyreon/big',
          current: 5120,
          budget: 4096,
          overBy: 1024,
          overByPct: 25,
        },
      ],
      missing: [{ name: '@pyreon/new', current: 2048 }],
      failures: [{ name: '@pyreon/broken', error: 'cannot resolve foo\nstack' }],
      measured: [
        { name: '@pyreon/big', raw: 10240, gzip: 5120 },
        { name: '@pyreon/new', raw: 4096, gzip: 2048 },
        { name: '@pyreon/fine', raw: 1024, gzip: 512 },
      ],
    })
    const { findings, scanned } = _parseBundleBudgetsOutput(raw, '/repo')

    // 3 measured + 1 failure → 4 scanned
    expect(scanned).toBe(4)
    expect(findings).toHaveLength(3)

    const over = findings.find((f) => f.code === 'bundle-budgets/over-budget')!
    expect(over.severity).toBe('error')
    expect(over.message).toContain('@pyreon/big')
    expect(over.message).toContain('+25.0%')
    expect(over.location?.relPath).toBe('scripts/bundle-budgets.json')
    expect(over.fix).toContain('--update')

    const missing = findings.find(
      (f) => f.code === 'bundle-budgets/missing-budget',
    )!
    expect(missing.severity).toBe('warning')
    expect(missing.message).toContain('@pyreon/new')

    const failed = findings.find(
      (f) => f.code === 'bundle-budgets/bundle-failed',
    )!
    expect(failed.severity).toBe('error')
    expect(failed.message).toContain('@pyreon/broken')
    // Only the FIRST line of the error message is surfaced — the
    // stack trace below the first \n is dropped.
    expect(failed.message).toContain('cannot resolve foo')
    expect(failed.message).not.toContain('stack')
  })

  it('returns empty findings on clean output', () => {
    const raw = JSON.stringify({
      violations: [],
      missing: [],
      failures: [],
      measured: [{ name: '@pyreon/fine', raw: 1024, gzip: 512 }],
    })
    const { findings, scanned } = _parseBundleBudgetsOutput(raw, '/repo')
    expect(findings).toEqual([])
    expect(scanned).toBe(1)
  })
})

describe('runBundleBudgetsGate', () => {
  // The full real-repo bundle measurement takes 15-30s and is the
  // slowest gate by a wide margin — it lives behind doctor's --full
  // flag for the same reason. Skip the live measurement in unit
  // tests; lock the shape via the gate-failed path (cheap subprocess
  // failure) and let the standalone script's existing tests cover
  // the live bundler behaviour.

  it('surfaces gate-failed finding when script is unreachable', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-bb-gate-'))
    const result = await runBundleBudgetsGate({ cwd: tmp })
    assertGateResultShape(result, 'bundle-budgets')
    expect(result.category).toBe('performance')
    const failed = result.findings.find(
      (f) => f.code === 'bundle-budgets/gate-failed',
    )
    expect(failed).toBeDefined()
    expect(failed?.severity).toBe('error')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
