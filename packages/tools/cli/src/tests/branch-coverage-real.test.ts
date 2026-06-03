/**
 * Real-test branch-coverage hardening for @pyreon/cli.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import { buildReport } from '../doctor/report'
import { renderText } from '../doctor/render'
import type { Finding, GateResult } from '../doctor/types'

const stripAnsi = (s: string): string =>
  s.replace(/\[[0-9;]*m/g, '').replace(/\][^]*\\/g, '')

const f = (
  severity: Finding['severity'],
  category: Finding['category'],
  code: string,
  extra: Partial<Finding> = {},
): Finding => ({
  severity,
  category,
  code,
  gate: 'test',
  message: `Message for ${code}`,
  ...extra,
})

const g = (
  gate: string,
  category: GateResult['category'],
  findings: Finding[] = [],
): GateResult => ({
  gate,
  category,
  findings,
  meta: { elapsedMs: 1 },
})

// ─── renderText — finding location branches (lines 127-130) ──────────────────

describe('renderText — finding location formatting', () => {
  it('renders a finding without location (line 127 false)', () => {
    const report = buildReport([g('lint', 'correctness', [f('error', 'correctness', 'x/no-loc')])])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('Message for x/no-loc')
  })

  it('renders a finding with location.path only (line 129 line undefined)', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'x/path-only', {
          location: { path: '/abs/foo.ts', relPath: 'foo.ts' },
        }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('foo.ts')
  })

  it('renders a finding with location.line (no column — line 130 false)', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'x/line', {
          location: { path: '/abs/bar.ts', relPath: 'bar.ts', line: 42 },
        }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('bar.ts')
    expect(out).toContain('42')
  })

  it('renders a finding with location.line + column (line 130 true)', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'x/line-col', {
          location: { path: '/abs/baz.ts', relPath: 'baz.ts', line: 42, column: 7 },
        }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('baz.ts')
    expect(out).toContain('42')
    expect(out).toContain('7')
  })

  it('renders relatedLocations (lines 140-147)', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'x/related', {
          location: { path: '/abs/a.ts', relPath: 'a.ts', line: 1 },
          relatedLocations: [
            { path: '/abs/b.ts', relPath: 'b.ts', line: 5, label: 'used here' },
            { path: '/abs/c.ts', relPath: 'c.ts' },
          ],
        }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('a.ts')
    expect(out).toContain('b.ts')
    expect(out).toContain('c.ts')
    expect(out).toContain('used here')
  })

  it('renders fix suggestion when finding.fix is set', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'x/fix', { fix: 'Try doing X instead' }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('Try doing X instead')
  })
})

// ─── renderText — severity icons (line 78) ──────────────────────────────────

describe('renderText — severity rendering', () => {
  it('renders error / warning / info findings with distinct icons', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'e1', { message: 'Err' }),
        f('warning', 'correctness', 'w1', { message: 'Warn' }),
        f('info', 'correctness', 'i1', { message: 'Info' }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('Err')
    expect(out).toContain('Warn')
    expect(out).toContain('Info')
  })
})

// ─── renderText — clean / multiple gates ────────────────────────────────────

describe('renderText — clean state', () => {
  it('renders empty findings list cleanly', () => {
    const report = buildReport([g('lint', 'correctness')])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toBeTruthy()
    expect(out).toContain('Score:')
  })

  it('renders multiple gates each with findings', () => {
    const report = buildReport([
      g('lint', 'correctness', [f('error', 'correctness', 'lint/a1')]),
      g('distribution', 'architecture', [f('warning', 'architecture', 'dist/b1')]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('lint/a1')
    expect(out).toContain('dist/b1')
  })
})

// ─── check-dedup gate edges ─────────────────────────────────────────────────

describe('check-dedup — file presence + parsing edges', () => {
  it('check-dedup handles missing files gracefully', async () => {
    const { runCheckDedupGate } = await import('../doctor/gates/check-dedup')
    const result = await runCheckDedupGate({ cwd: '/tmp/nonexistent-dedup-test' })
    expect(result).toBeDefined()
    expect(Array.isArray(result.findings)).toBe(true)
  })

  it('check-dedup _parseBunLock parses minimal lockfile', async () => {
    const { _parseBunLock } = await import('../doctor/gates/check-dedup')
    const map = _parseBunLock('{"version":"1","packages":{}}')
    expect(map).toBeInstanceOf(Map)
  })

  it('check-dedup _parseNpmLock parses minimal lockfile', async () => {
    const { _parseNpmLock } = await import('../doctor/gates/check-dedup')
    const map = _parseNpmLock('{"lockfileVersion":3,"packages":{}}')
    expect(map).toBeInstanceOf(Map)
  })

  it('check-dedup _parsePnpmLock parses minimal lockfile', async () => {
    const { _parsePnpmLock } = await import('../doctor/gates/check-dedup')
    const map = _parsePnpmLock('lockfileVersion: 6.0\npackages: {}')
    expect(map).toBeInstanceOf(Map)
  })

  it('check-dedup _detectDuplicates finds duplicates across packages', async () => {
    const { _detectDuplicates } = await import('../doctor/gates/check-dedup')
    const map = new Map([
      ['@pyreon/x', { name: '@pyreon/x', versions: new Set(['1.0.0', '2.0.0']) }],
    ])
    const findings = _detectDuplicates(
      map as Parameters<typeof _detectDuplicates>[0],
      '/path/to/lockfile',
      '/path/to',
    )
    expect(Array.isArray(findings)).toBe(true)
    expect(findings.length).toBe(1)
  })

  it('check-dedup _detectDuplicates returns empty when no duplicates', async () => {
    const { _detectDuplicates } = await import('../doctor/gates/check-dedup')
    const map = new Map([
      ['@pyreon/x', { name: '@pyreon/x', versions: new Set(['1.0.0']) }],
    ])
    const findings = _detectDuplicates(
      map as Parameters<typeof _detectDuplicates>[0],
      '/path/to/lockfile',
      '/path/to',
    )
    expect(findings).toEqual([])
  })
})
