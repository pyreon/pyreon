import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveGates, runDoctor } from '../doctor/orchestrator'

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
      // structured report and didn't throw. The catch-and-record path is
      // a separate concern; this test pins the dispatch shape.
      expect(report).toBeDefined()
      expect(Array.isArray(report.gates)).toBe(true)
      expect(report.gates.length).toBeGreaterThan(0)
      fs.rmSync(cwd, { recursive: true, force: true })
    },
  )
})
