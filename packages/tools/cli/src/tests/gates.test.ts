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
import type { Finding, GateResult, Severity } from '../doctor/types'

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
    const result = await runDistributionGate({
      cwd: REPO_ROOT,
      // Skip the live npm pack probe in tests — slow and depends on
      // npm being on PATH. The static rule checks (sideEffects +
      // !lib/**/*.map exclusion) still fire and exercise the gate.
      skipPackProbe: true,
    })
    assertGateResultShape(result, 'distribution')
    expect(result.category).toBe('architecture')
    expect(result.meta.scanned).toBeGreaterThan(0)
  })

  it('emits findings with the expected code prefixes when invariants fail', async () => {
    // Create a synthetic broken package: published (no `private`),
    // missing both sideEffects AND files-array map exclusion.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-dist-gate-'))
    fs.mkdirSync(path.join(tmp, 'packages', 'fundamentals', 'broken'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tmp, 'packages', 'fundamentals', 'broken', 'package.json'),
      JSON.stringify({ name: '@pyreon/broken', files: ['lib'] }),
    )

    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    assertGateResultShape(result, 'distribution')

    const codes = result.findings.map((f) => f.code).sort()
    expect(codes).toContain('distribution/missing-sideEffects')
    expect(codes).toContain('distribution/missing-map-exclusion')
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
    // The real repo has 7 claim sites configured today; verify the
    // scanner found them all (any missing files would surface as
    // file-missing findings, scanned count stays stable).
    expect(result.meta.scanned).toBe(7)
  })

  it('emits file-missing finding when a claim file is absent', async () => {
    // Build a minimal fake repo without the claim files. The gate
    // walks the configured claims[] and emits file-missing for each.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-claims-gate-'))
    fs.mkdirSync(
      path.join(tmp, 'packages', 'fundamentals', 'hooks', 'src'),
      { recursive: true },
    )
    fs.writeFileSync(
      path.join(tmp, 'packages', 'fundamentals', 'hooks', 'src', 'index.ts'),
      '',
    )

    const result = await runDocClaimsGate({ cwd: tmp })
    assertGateResultShape(result, 'doc-claims')
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
})

describe('runAuditTypesGate', () => {
  it('returns GateResult against real repo with expected shape', async () => {
    const result = await runAuditTypesGate({ cwd: REPO_ROOT })
    assertGateResultShape(result, 'audit-types')
    expect(result.category).toBe('architecture')
    expect(result.meta.scanned).toBeGreaterThan(0)
    // The gate reports MEDIUM/LOW as warning/info — these exist as
    // baseline noise in the high-risk packages. HIGH findings would
    // bubble up via severity: 'error'. PR 2's aggregator handles
    // the per-severity score weighting.
  }, 30_000)

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
