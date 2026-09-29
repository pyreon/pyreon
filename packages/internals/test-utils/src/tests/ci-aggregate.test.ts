// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SUITES } from '../../../../../scripts/e2e-affected'
import {
  aggregateKind,
  aggregateWithDiagnostics,
  decideNeeds,
  reproductionCommand,
  workflowCommandValue,
  type JobInfo,
} from '../../../../../scripts/ci-aggregate'

const families = [
  ['typecheck-cell', 'typecheck'],
  ['test-cell', 'test'],
  ['e2e-suite', 'e2e'],
  ['scaffold-smoke-cell', 'scaffold'],
] as const
type Needs = Record<string, { result: string; outputs: Record<string, string> }>

function healthyNeeds(selected = true): Needs {
  const outputs: Record<string, string> = {}
  const needs: Needs = {
    install: { result: 'success', outputs },
    'fast-gates': { result: 'success', outputs: {} },
  }
  for (const [id, family] of families) {
    outputs[`${family}-has`] = String(selected)
    outputs[`${family}-matrix`] = JSON.stringify(
      selected ? [{ name: 'core', members: 'core' }] : [],
    )
    needs[id] = { result: selected ? 'success' : 'skipped', outputs: {} }
  }
  return needs
}

describe('scheduler verdict', () => {
  it('passes full validation and correctly unselected docs-only matrices', () => {
    expect(decideNeeds(healthyNeeds()).ok).toBe(true)
    expect(decideNeeds(healthyNeeds(false)).ok).toBe(true)
  })

  it.each(['install', 'fast-gates'])('requires %s success even when all matrices skip', (id) => {
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
      const needs = healthyNeeds(false)
      needs[id]!.result = result
      expect(decideNeeds(needs).ok, result).toBe(false)
    }
    const needs = healthyNeeds()
    delete needs[id]
    expect(decideNeeds(needs).ok).toBe(false)
  })

  it.each(families)('fails closed for every selected %s matrix', (id, family) => {
    for (const result of ['failure', 'cancelled', 'skipped', 'pending', '']) {
      const needs = healthyNeeds()
      needs[id]!.result = result
      const verdict = decideNeeds(needs)
      expect(verdict.ok, result).toBe(false)
      expect(verdict.lines.join('\n')).toContain(family)
    }
    const needs = healthyNeeds()
    delete needs[id]
    expect(decideNeeds(needs).ok).toBe(false)
  })

  it.each(families)('rejects missing, malformed or contradictory %s selection', (_id, family) => {
    for (const has of ['', 'TRUE', 'false']) {
      const needs = healthyNeeds()
      needs.install!.outputs[`${family}-has`] = has
      expect(decideNeeds(needs).ok, has).toBe(false)
    }
    for (const matrix of [
      '',
      '{',
      'null',
      '{}',
      '[]',
      '["core"]',
      '[{}]',
      '[{"name":"x","members":""}]',
    ]) {
      const needs = healthyNeeds()
      needs.install!.outputs[`${family}-matrix`] = matrix
      expect(decideNeeds(needs).ok, matrix).toBe(false)
    }
  })

  it('rejects absent or structurally invalid scheduler data', () => {
    for (const needs of [null, undefined, [], {}, 'success', 1])
      expect(decideNeeds(needs).ok).toBe(false)
  })

  it('does not let unrelated required checks change its scope', () => {
    const needs = healthyNeeds()
    needs.build = { result: 'failure', outputs: {} }
    expect(decideNeeds(needs).ok).toBe(true)
  })
})

describe('failure diagnostics', () => {
  it('does not contact the API at all on a green run', async () => {
    const api = vi.fn(async () => {
      throw new Error('API unavailable')
    })
    expect((await aggregateWithDiagnostics(healthyNeeds(), api)).ok).toBe(true)
    expect(api).not.toHaveBeenCalled()
  })

  it('keeps failures red through API outage, empty or stale job listings', async () => {
    const needs = healthyNeeds()
    needs['test-cell']!.result = 'failure'
    for (const api of [
      async () => {
        throw new Error('API unavailable')
      },
      async () => [],
      async () => [{ name: 'test (core)', status: 'completed', conclusion: 'success' }],
    ])
      expect((await aggregateWithDiagnostics(needs, api)).ok).toBe(false)
  })

  it('adds failed job URLs and local commands without another polling loop', async () => {
    const needs = healthyNeeds()
    needs['test-cell']!.result = 'failure'
    const failed: JobInfo = {
      name: 'test (core)',
      status: 'completed',
      conclusion: 'failure',
      html_url: 'https://github.test/job/42',
    }
    const api = vi.fn(async () => [failed])
    const verdict = await aggregateWithDiagnostics(needs, api)
    expect(verdict.ok).toBe(false)
    expect(verdict.lines.join('\n')).toContain('job log: https://github.test/job/42')
    expect(verdict.lines.join('\n')).toContain('bun run test')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('classifies only aggregated job families', () => {
    expect(aggregateKind('Install')).toBe('install')
    expect(aggregateKind('Fast Gates')).toBe('preflight')
    expect(aggregateKind('typecheck (core)')).toBe('typecheck')
    expect(aggregateKind('test (tools)')).toBe('test')
    expect(aggregateKind('e2e (core)')).toBe('e2e')
    expect(aggregateKind('Scaffold Smoke (app)')).toBe('scaffold')
    expect(aggregateKind('Test (browser)')).toBeNull()
    expect(aggregateKind('Build')).toBeNull()
  })

  it('maps failures to commands and encodes untrusted workflow-command text', () => {
    expect(reproductionCommand('Fast Gates')).toBe('bun run validate-fast')
    expect(reproductionCommand('e2e (core)')).toBe('bun run test:e2e')
    expect(reproductionCommand('e2e (docs)')).toBe('bun run test:e2e:docs')
    expect(reproductionCommand('e2e (docs+2 more)')).toContain('job log')
    expect(workflowCommandValue('bad%name\r\n::warning::')).toBe('bad%25name%0D%0A::warning::')
  })

  it('reproduces every E2E suite using its registered script, including aliases', () => {
    for (const suite of SUITES)
      expect(reproductionCommand(`e2e (${suite.name})`)).toBe(`bun run ${suite.script}`)
  })
})

describe('aggregate CLI exit status', () => {
  it('passes without API credentials and fails on malformed/missing scheduler output', () => {
    const script = fileURLToPath(new URL('../../../../../scripts/ci-aggregate.ts', import.meta.url))
    for (const [input, expected] of [
      [JSON.stringify(healthyNeeds()), 0],
      ['{', 1],
      ['{}', 1],
    ] as const) {
      const result = spawnSync('bun', [script], {
        env: { ...process.env, NEEDS_JSON: input, GITHUB_TOKEN: '', GITHUB_RUN_ID: '' },
        timeout: 10_000,
        stdio: 'pipe',
      })
      expect(result.status).toBe(expected)
    }
  })
})
