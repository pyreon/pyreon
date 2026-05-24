import { describe, expect, it } from 'vitest'

import { resolveGates } from '../doctor/orchestrator'

describe('resolveGates', () => {
  it('default = 10 fast gates (no audit-types / bundle-budgets)', () => {
    const gates = resolveGates({ cwd: '/' })
    expect(gates).toEqual([
      'react-patterns',
      'pyreon-patterns',
      'lint',
      'distribution',
      'doc-claims',
      'islands-audit',
      'ssg-audit',
      'audit-tests',
      'check-dedup',
      'audit-leak-classes',
    ])
  })

  it('--full enables 12 gates total (adds the 2 slow ones)', () => {
    const gates = resolveGates({ cwd: '/', full: true })
    expect(gates).toContain('audit-types')
    expect(gates).toContain('bundle-budgets')
    expect(gates).toHaveLength(12)
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
