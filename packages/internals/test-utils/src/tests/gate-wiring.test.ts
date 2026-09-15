/**
 * `scripts/gate-wiring.ts` — the set `validate-fast --ci-complement` runs.
 * The complement must be HONEST in both directions: a gate a workflow runs
 * through a root `package.json` alias (`bun run check-distribution`) is
 * wired and must not be re-run; a gate mentioned only in a comment is not.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ciComplementGates,
  ciComplementIsWired,
  gateNeedle,
  scriptAliases,
} from '../../../../../scripts/gate-wiring'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gate-wiring-'))
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const wf = (name: string, text: string) =>
  writeFileSync(join(root, '.github', 'workflows', name), text)
const GATES = [
  { name: 'a', cmd: 'bun scripts/check-a.ts' },
  { name: 'b', cmd: 'bun scripts/check-b.ts' },
  { name: 'c', cmd: 'bun run check-c' },
  { name: 'd', cmd: 'bun scripts/check-d.ts' },
]

describe('gateNeedle', () => {
  it('strips the runner word only', () => {
    expect(gateNeedle('bun scripts/check-a.ts')).toBe('scripts/check-a.ts')
    expect(gateNeedle('bun run gen-docs --check')).toBe('gen-docs --check')
  })
})

describe('ciComplementGates', () => {
  it('excludes gates a workflow runs directly, through an alias, and keeps the rest', () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { 'check-d': 'bun scripts/check-d.ts' } }),
    )
    wf(
      'ci.yml',
      'jobs:\n  x:\n    steps:\n      - run: bun scripts/check-a.ts\n      - run: bun run check-d\n      # - run: bun scripts/check-b.ts\n',
    )
    const complement = ciComplementGates(
      GATES,
      join(root, '.github', 'workflows'),
      join(root, 'package.json'),
    )
    expect(complement.map((g) => g.name)).toEqual(['b', 'c'])
  })
  it('with no workflows every gate is in the complement', () => {
    expect(ciComplementGates(GATES, join(root, 'nope'), join(root, 'package.json')).length).toBe(4)
  })
})

describe('ciComplementIsWired', () => {
  it('needs the invocation outside a comment', () => {
    wf('ci.yml', '      # run: bun scripts/validate-fast.ts --ci-complement\n')
    expect(ciComplementIsWired(join(root, '.github', 'workflows'))).toBe(false)
    wf('ci.yml', '      - run: bun scripts/validate-fast.ts --ci-complement\n')
    expect(ciComplementIsWired(join(root, '.github', 'workflows'))).toBe(true)
  })
  it('scriptAliases maps needle → alias names', () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { lint: 'oxlint .', 'check-d': 'bun scripts/check-d.ts' } }),
    )
    expect(scriptAliases(join(root, 'package.json')).get('scripts/check-d.ts')).toEqual(['check-d'])
  })
})

import { gateIsWiredInWorkflows, runBlockText } from '../../../../../scripts/gate-wiring'

describe('gateIsWiredInWorkflows — whole-COMMAND match over run blocks only', () => {
  // A substring test over the whole workflow read `bun run lint:pyreon`, a
  // step NAME and `bunx oxlint --version` as running `lint`, so the `lint`
  // gate fell out of the complement and nobody enforced it.
  const aliases = new Map<string, string[]>([['oxlint .', ['lint']]])
  it('a sibling command sharing the needle as a prefix does NOT count', () => {
    const text = 'steps:\n  - name: lint everything\n    run: bun run lint:pyreon\n'
    expect(gateIsWiredInWorkflows('bun run lint', [text], aliases)).toBe(false)
  })
  it('a step name or a comment mentioning the needle does NOT count', () => {
    const text = 'steps:\n  - name: run lint\n    # run: bun run lint\n    run: echo hi\n'
    expect(gateIsWiredInWorkflows('bun run lint', [text], aliases)).toBe(false)
  })
  it('the exact command, chained with && or in a block scalar, counts', () => {
    expect(gateIsWiredInWorkflows('bun run lint', ['    run: bun install && bun run lint\n'], aliases)).toBe(true)
    expect(gateIsWiredInWorkflows('bun run lint', ['    run: |\n      bun install\n      bun run lint\n'], aliases)).toBe(true)
  })
  it('runBlockText keeps only run values', () => {
    expect(runBlockText('  - name: x\n    run: |\n      a\n      b\n  - run: c\n')).toBe('a\nb\nc')
  })
})
