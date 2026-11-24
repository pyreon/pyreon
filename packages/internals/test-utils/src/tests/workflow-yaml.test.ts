// @vitest-environment node
// Contract for `scripts/workflow-yaml.ts`: the structural workflow reader the
// CI gates share, and the three-valued evaluator for `if:` / `${{ }}` values.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluate,
  parseWorkflowYaml,
  triggersOf,
  truthOf,
  UNKNOWN,
  type YamlValue,
} from '../../../../../scripts/workflow-yaml'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

/** Scalars as whitespace-collapsed strings, `on` read as YAML 1.1 `true` normalised back. */
function normalise(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(normalise)
  if (typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k === 'true' ? 'on' : k, normalise(x)]))
  }

  return String(v).replace(/\s+/g, ' ').trim()
}

describe('workflow-yaml — every workflow in the repository', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))

  it('reads each one the same as Bun’s YAML parser (whitespace-normalised scalars)', () => {
    // Bun's parser is the reference; vitest runs under node, so ask a bun process.
    const script = `const fs=require('node:fs');const out={};for(const f of JSON.parse(process.argv[1]))out[f]=Bun.YAML.parse(fs.readFileSync(${JSON.stringify(WORKFLOWS)}+'/'+f,'utf8'));console.log(JSON.stringify(out))`
    const r = spawnSync('bun', ['-e', script, JSON.stringify(files)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    expect(r.status, r.stderr).toBe(0)
    const reference = JSON.parse(r.stdout) as Record<string, unknown>
    expect(files.length).toBeGreaterThan(20)
    for (const f of files) {
      const mine = parseWorkflowYaml(readFileSync(join(WORKFLOWS, f), 'utf8'))
      expect(normalise(mine), f).toEqual(normalise(reference[f]))
    }
  })
})

describe('workflow-yaml — shapes', () => {
  it('reads flow and block lists, quoted keys, comments and block scalars', () => {
    const doc = parseWorkflowYaml(
      [
        "'on':",
        '  pull_request:',
        '    types:',
        '      - opened # first',
        "      - 'synchronize'",
        '  push: { branches: [main, "release/*"] }',
        'jobs:',
        '  a:',
        '    if: a &&',
        '      b',
        '    steps:',
        '      - uses: x@v1',
        '        with:',
        '          script: |',
        '            const a = 1 # not a comment',
        '',
        '            return a',
        '      - run: echo "#1"',
      ].join('\n'),
    ) as Record<string, YamlValue>
    expect(triggersOf(doc)).toEqual({
      pull_request: { types: ['opened', 'synchronize'] },
      push: { branches: ['main', 'release/*'] },
    })
    const job = (doc.jobs as Record<string, Record<string, YamlValue>>).a!
    expect(job.if).toBe('a && b')
    expect(job.steps).toEqual([
      { uses: 'x@v1', with: { script: 'const a = 1 # not a comment\n\nreturn a\n' } },
      { run: 'echo "#1"' },
    ])
  })

  it('normalises `on: push` and `on: [a, b]`', () => {
    expect(triggersOf(parseWorkflowYaml('on: push\njobs: {}\n'))).toEqual({ push: null })
    expect(triggersOf(parseWorkflowYaml('on: [push, pull_request]\njobs: {}\n'))).toEqual({ push: null, pull_request: null })
  })

  it('fails closed on anchors, aliases and bad indentation', () => {
    expect(() => parseWorkflowYaml('a: &x 1\nb: *x\n')).toThrow(/anchors/)
    expect(() => parseWorkflowYaml('a:\n    b: 1\n  c: 2\n')).toThrow(/indentation/)
  })
})

describe('workflow-yaml — expression evaluation', () => {
  const pr = { 'github.event_name': 'pull_request' }
  const mg = { 'github.event_name': 'merge_group' }

  it('decides event comparisons, case-insensitively, inside and outside ${{ }}', () => {
    expect(evaluate("${{ github.event_name == 'pull_request' }}", pr)).toBe(true)
    expect(evaluate("github.event_name == 'PULL_REQUEST'", pr, true)).toBe(true)
    expect(evaluate("${{ github.event_name != 'pull_request' }}", pr)).toBe(false)
    expect(evaluate("${{ github.event_name == 'pull_request' && true || false }}", mg)).toBe(false)
  })

  it('short-circuits through unknowns the three-valued way', () => {
    expect(evaluate("!cancelled() && github.event_name == 'pull_request'", mg, true)).toBe(false)
    expect(truthOf(evaluate("!cancelled() && github.event_name == 'pull_request'", pr, true))).toBe(UNKNOWN)
    expect(truthOf(evaluate("steps.x.outputs.run == 'true' || github.event_name == 'merge_group'", mg, true))).toBe(true)
    expect(truthOf(evaluate("steps.x.outputs.run == 'true' || github.event_name == 'merge_group'", pr, true))).toBe(UNKNOWN)
  })

  it('reads literals and string functions; leaves other values unknown', () => {
    expect(evaluate('true', {})).toBe(true)
    expect(evaluate('false', {})).toBe(false)
    expect(evaluate("${{ contains('pull_request merge_group', github.event_name) }}", mg)).toBe(true)
    expect(evaluate('${{ vars.X }}', pr)).toBe(UNKNOWN)
    expect(evaluate('x-${{ github.ref }}', pr)).toBe(UNKNOWN)
  })
})
