/**
 * What the scan summary adds beyond the counts: framework warnings (findings
 * that do not fail a check, so they never reached the terminal), and the
 * install command when the project cannot resolve the framework at all.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '../../core'
import { formatFrameworkWarnings, frameworkWarningsOf, runScan } from '../run'

const scenario = (id: string, messages: string[]): Scenario =>
  ({
    id,
    component: 'X',
    name: id,
    args: {},
    source: 'auto-default',
    verify: {
      ok: true,
      checked: 1,
      interaction: {
        status: 'pass',
        findings: messages.map((message) => ({ code: 'framework-warning', message })),
      },
      ssrParity: { status: 'pass', findings: [{ code: 'something-else', message: 'ignored' }] },
    },
  }) as unknown as Scenario

describe('frameworkWarningsOf', () => {
  it('groups by message and lists each scenario once', () => {
    const result = frameworkWarningsOf([
      scenario('a--default', ['W1']),
      scenario('b--default', ['W1', 'W2']),
      scenario('c--default', []),
    ])
    expect(result.frameworkWarnings).toEqual([
      { message: 'W1', scenarios: ['a--default', 'b--default'] },
      { message: 'W2', scenarios: ['b--default'] },
    ])
  })

  it('adds nothing when there are no warnings', () => {
    expect(frameworkWarningsOf([scenario('a', [])])).toEqual({})
  })

  it('caps the scenario list in the printed summary', () => {
    const lines = formatFrameworkWarnings([{ message: 'W', scenarios: ['a', 'b', 'c', 'd', 'e'] }])
    expect(lines.join('\n')).toContain('in a, b, c +2 more')
  })
})

describe('a project without the framework installed', () => {
  it('reports the install command instead of only per-file import errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-noruntime-'))
    try {
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'no-runtime', type: 'module' }))
      writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button(props: { label: string }) { return <button>{props.label}</button> }\n')
      const result = await runScan({ cwd: dir, write: false })
      expect(result.runtimeError).toContain('does not resolve @pyreon/core')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
