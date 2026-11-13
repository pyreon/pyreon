import { describe, expect, it } from 'vitest'
import { zeroRemoveViteOption } from '../codemods/zero-remove-vite-option'
import { renderText } from '../doctor/render'
import { buildReport } from '../doctor/report'
import type { DoctorReport, GateResult } from '../doctor/types'

const stripAnsi = (s: string): string => s.replace(/\[[0-9;]*m/g, '')

const gate = (name: string, meta: Partial<GateResult['meta']> = {}): GateResult => ({
  gate: name,
  category: 'correctness',
  findings: [],
  meta: { elapsedMs: 1, ...meta },
})

const withWorkspace = (
  report: DoctorReport,
  source: NonNullable<DoctorReport['workspace']>['source'],
  globs: string[],
  excluded: string[] = [],
): DoctorReport => ({
  ...report,
  workspace: { repoRoot: '/r', source, globs, excluded, packageCount: 3 },
})

describe('doctor text report: long header blocks wrap instead of running off the line', () => {
  const base = buildReport([gate('lint', { scanned: 12 })])

  it('wraps a long scope line onto indented continuation lines, naming where the globs came from', () => {
    const globs = Array.from({ length: 14 }, (_, i) => `packages/category-${i}/*`)
    const out = stripAnsi(
      renderText(withWorkspace(base, 'workspaces', globs, ['packages/legacy/*']), { cwd: '/r' }),
    )
    const lines = out.split('\n')
    const at = lines.findIndex((l) => l.includes('Scope:'))
    expect(at).toBeGreaterThan(-1)
    expect(lines[at]).toContain('3 package root(s)')
    expect(lines[at + 1]?.startsWith('          ')).toBe(true)
    expect(out.replace(/\s+/g, ' ')).toContain('excluded: packages/legacy/*')
    expect(out).toContain('from workspaces')
    for (const l of lines.slice(at, at + 4)) expect(l.length).toBeLessThanOrEqual(104)
  })

  it('names each way a scope can be resolved', () => {
    const scope = (s: Parameters<typeof withWorkspace>[1]) =>
      stripAnsi(renderText(withWorkspace(base, s, ['.']), { cwd: '/r' }))
    expect(scope('flag')).toContain('from --roots')
    expect(scope('pnpm-workspace')).toContain('from pnpm-workspace.yaml')
    expect(scope('single-package')).toContain('from single package')
  })

  it('wraps the Scanned line when many gates report how much they scanned', () => {
    const gates = Array.from({ length: 16 }, (_, i) =>
      gate(`a-long-gate-name-${i}`, { scanned: 100 + i }),
    )
    const out = stripAnsi(renderText(buildReport(gates), { cwd: '/r' }))
    const lines = out.split('\n')
    const at = lines.findIndex((l) => l.includes('Scanned:'))
    expect(at).toBeGreaterThan(-1)
    expect(lines[at + 1]?.trim()).toMatch(/^a-long-gate-name-\d+ \d+/)
    // A gate name and its count never split across lines.
    expect(out).not.toMatch(/a-long-gate-name-\d+\n\s+\d+/)
  })

  it('wraps a long skip reason under the gate name', () => {
    const reason = 'the workspace has no ' + 'matching package roots to scan '.repeat(6)
    const out = stripAnsi(
      renderText(
        buildReport([gate('lint'), gate('audit-types', { skipped: true, skipReason: reason })]),
        { cwd: '/r' },
      ),
    )
    const lines = out.split('\n')
    const at = lines.findIndex((l) => l.includes('audit-types'))
    expect(at).toBeGreaterThan(-1)
    expect(lines[at + 1]?.trim().length).toBeGreaterThan(0)
    expect(lines[at + 1]).not.toContain('audit-types')
  })
})

describe('zero-remove-vite-option with several zero() calls', () => {
  it('removes the option from every call, applying the edits back to front', () => {
    const src =
      "const a = zero({ vite: { a: 1 }, mode: 'ssg' })\nconst b = zero({ mode: 'ssr', vite: { b: 2 } })\n"
    const out = zeroRemoveViteOption.transform(src, 'vite.config.ts') as string
    expect(out.match(/Removed by `pyreon upgrade`/g)).toHaveLength(2)
    expect(out).toContain('// vite: { a: 1 }')
    expect(out).toContain('// vite: { b: 2 }')
    expect(out).toContain("mode: 'ssg'")
    expect(out).toContain("mode: 'ssr'")
    // A shorthand `vite` and a string-keyed `'vite'` are the same option.
    const shorthand = zeroRemoveViteOption.transform(
      "const vite = {}\nzero({ vite, 'vite': 1 })\n",
      'vite.config.ts',
    ) as string
    expect(shorthand.match(/Removed by `pyreon upgrade`/g)).toHaveLength(2)
  })
})

describe('countRepo', () => {
  it('counts every claim the gate checks prose against, as zero for a repo with none of them', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { countRepo } = await import('../doctor/gates/doc-claims')
    const d = mkdtempSync(join(tmpdir(), 'pyreon-count-repo-'))
    try {
      expect(countRepo(d)).toEqual({
        publishedPackages: 0,
        manifests: 0,
        lintRules: 0,
        lintCategories: 0,
        mcpTools: 0,
        docPages: 0,
        hookExports: 0,
        detectorCodes: 0,
      })
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})
