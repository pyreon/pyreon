import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { FAST_GATES, SLOW_GATES, resolveGates, runDoctor } from '../doctor/orchestrator'

describe('resolveGates', () => {
  it('default = 11 fast gates (no audit-types / bundle-budgets)', () => {
    const gates = resolveGates({ cwd: '/' })
    expect(gates).toEqual([
      'react-patterns',
      'pyreon-patterns',
      'lint',
      'distribution',
      'doc-claims',
      'islands-audit',
      'ssg-audit',
      'content-audit',
      'audit-tests',
      'check-dedup',
      'audit-leak-classes',
    ])
  })

  it('--full enables 13 gates total (adds the 2 slow ones)', () => {
    const gates = resolveGates({ cwd: '/', full: true })
    expect(gates).toContain('audit-types')
    expect(gates).toContain('bundle-budgets')
    expect(gates).toHaveLength(13)
  })

  it('--only restricts to the listed gates', () => {
    const gates = resolveGates({
      cwd: '/',
      only: ['lint', 'doc-claims'],
    })
    expect(gates).toEqual(['lint', 'doc-claims'])
  })

  it('--only overrides --full (only wins precedence)', () => {
    const gates = resolveGates({
      cwd: '/',
      full: true,
      only: ['lint'],
    })
    expect(gates).toEqual(['lint'])
  })

  it('--skip removes from the default set', () => {
    const gates = resolveGates({
      cwd: '/',
      skip: ['lint', 'pyreon-patterns'],
    })
    expect(gates).not.toContain('lint')
    expect(gates).not.toContain('pyreon-patterns')
    expect(gates).toContain('react-patterns')
  })

  it('--skip applies after --only (intersection)', () => {
    const gates = resolveGates({
      cwd: '/',
      only: ['lint', 'doc-claims', 'distribution'],
      skip: ['doc-claims'],
    })
    expect(gates).toEqual(['lint', 'distribution'])
  })

  it('empty --only falls through to default + --skip', () => {
    const gates = resolveGates({
      cwd: '/',
      only: [],
      skip: ['lint'],
    })
    expect(gates).not.toContain('lint')
    expect(gates).toContain('react-patterns')
  })
})

describe('runDoctor — runGate dispatch arms (L160-186)', () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-runDoctor-'))
  }

  it(
    'runs every dispatch arm so the runGate switch is fully covered',
    { timeout: 60_000 },
    async () => {
      const cwd = makeTmpDir()
      // Plant a minimal package + tsconfig so audit-types / bundle-budgets
      // and pure source-scanners don't crash on empty input.
      fs.mkdirSync(path.join(cwd, 'packages/core/foo/src'), {
        recursive: true,
      })
      fs.writeFileSync(
        path.join(cwd, 'packages/core/foo/src/index.ts'),
        `export const x = 1\n`,
      )
      fs.writeFileSync(
        path.join(cwd, 'packages/core/foo/package.json'),
        JSON.stringify({ name: '@pyreon/foo', version: '0.0.0' }),
      )

      const report = await runDoctor({
        cwd,
        full: true, // includes audit-types + bundle-budgets
      })
      // We don't care about the findings — only that runDoctor returns a
      // structured report and didn't throw. (Throw-isolation is covered
      // by its own describe below.)
      expect(report).toBeDefined()
      expect(Array.isArray(report.gates)).toBe(true)
      expect(report.gates.length).toBeGreaterThan(0)
      fs.rmSync(cwd, { recursive: true, force: true })
    },
  )
})

describe('gate set consistency', () => {
  it('check-dedup is in the default (fast) set — it must be a valid --only/--skip target', () => {
    // Regression: the CLI's VALID_GATES used to be a hand-kept duplicate
    // that dropped `check-dedup`, so a gate that RAN by default was
    // rejected by `--only`/`--skip`. VALID_GATES is now derived from
    // [...FAST_GATES, ...SLOW_GATES], so this lock keeps the gate in the set.
    expect(FAST_GATES).toContain('check-dedup')
  })

  it('FAST and SLOW gate sets are disjoint and non-empty', () => {
    expect(FAST_GATES.length).toBeGreaterThan(0)
    expect(SLOW_GATES.length).toBeGreaterThan(0)
    const overlap = FAST_GATES.filter((g) => (SLOW_GATES as string[]).includes(g))
    expect(overlap).toEqual([])
  })
})

describe('runDoctor — gate throw isolation', () => {
  it('isolates a throwing gate as a gate-failed ERROR finding instead of crashing the whole run', async () => {
    // A gate whose detector throws must NOT reject Promise.all and take
    // down the entire report (losing every other gate's findings + the
    // score). The orchestrator catches it and emits a `<gate>/gate-failed`
    // ERROR finding so the run degrades gracefully.
    vi.resetModules()
    vi.doMock('../doctor/gates', async () => {
      const actual =
        await vi.importActual<typeof import('../doctor/gates')>('../doctor/gates')
      return {
        ...actual,
        runReactPatternsGate: async () => {
          throw new Error('boom-from-gate')
        },
      }
    })
    try {
      const { runDoctor: isolatedRunDoctor } = await import('../doctor/orchestrator')
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-throw-iso-'))
      try {
        // Must RESOLVE (not reject) even though react-patterns throws.
        const report = await isolatedRunDoctor({ cwd, only: ['react-patterns'] })
        expect(report).toBeDefined()
        const failed = report.findings.find(
          (f) => f.code === 'react-patterns/gate-failed',
        )
        expect(failed).toBeDefined()
        expect(failed?.severity).toBe('error')
        expect(failed?.message).toContain('boom-from-gate')
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true })
      }
    } finally {
      vi.doUnmock('../doctor/gates')
      vi.resetModules()
    }
  })
})
