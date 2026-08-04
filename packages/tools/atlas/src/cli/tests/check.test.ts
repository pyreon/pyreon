/**
 * `atlas check` — the CLI half of the guardrail.
 *
 * Reads the catalog rather than rescanning, so the answer is the SAME one the
 * workbench and the agent guide give. A guardrail that disagrees with the
 * document it guards is worse than neither.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findCatalog, runCheck } from '../check'

let root: string

const catalog = (components: unknown[]): string =>
  JSON.stringify({ version: 1, components })

const component = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  controls: [
    { name: 'label', kind: 'text', reactive: false, required: true },
    {
      name: 'state',
      kind: 'select',
      options: ['primary', 'secondary'],
      reactive: false,
      required: false,
    },
  ],
  axes: [],
  scenarios: [],
  tags: [],
  ...extra,
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-check-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('findCatalog', () => {
  it('walks UP to find it', () => {
    // A monorepo scans at the root and edits anywhere; requiring the exact
    // directory would make the command useless from inside a package.
    writeFileSync(join(root, 'atlas-catalog.json'), catalog([]))
    mkdirSync(join(root, 'packages/ui/src'), { recursive: true })
    expect(findCatalog(join(root, 'packages/ui/src'))).toBe(join(root, 'atlas-catalog.json'))
  })

  it('is undefined when there is none', () => {
    expect(findCatalog(root)).toBeUndefined()
  })
})

describe('runCheck', () => {
  beforeEach(() => {
    writeFileSync(join(root, 'atlas-catalog.json'), catalog([component('Button')]))
  })

  it('accepts a valid usage', () => {
    const result = runCheck({ cwd: root, component: 'Button', argsJson: '{"label":"Save"}' })
    expect(result).toMatchObject({ kind: 'ok', ok: true })
  })

  it('rejects an invalid value and suggests the real one', () => {
    const result = runCheck({
      cwd: root,
      component: 'Button',
      argsJson: '{"label":"Save","state":"primry"}',
    })
    expect(result.kind === 'ok' && result.ok).toBe(false)
    expect(result.kind === 'ok' && result.text).toContain('did you mean `primary`?')
  })

  it('names the known components when the name is wrong', () => {
    // A typo'd component name is the same class of mistake as a typo'd prop,
    // and the catalog knows every real one.
    const result = runCheck({ cwd: root, component: 'Buton' })
    expect(result.kind).toBe('unknown-component')
    expect(result.kind === 'unknown-component' && result.message).toContain('Button')
  })

  it('REFUSES an ambiguous name across projects', () => {
    writeFileSync(
      join(root, 'atlas-catalog.json'),
      catalog([component('Button', { project: 'Core' }), component('Button', { project: 'Admin' })]),
    )
    const result = runCheck({ cwd: root, component: 'Button' })
    expect(result.kind).toBe('unknown-component')
    expect(result.kind === 'unknown-component' && result.message).toContain('Core/Button')
  })

  it('resolves a project-qualified key', () => {
    writeFileSync(
      join(root, 'atlas-catalog.json'),
      catalog([component('Button', { project: 'Core' }), component('Button', { project: 'Admin' })]),
    )
    const result = runCheck({
      cwd: root,
      component: 'Core/Button',
      argsJson: '{"label":"x"}',
    })
    expect(result).toMatchObject({ kind: 'ok', ok: true })
  })

  it('reports a missing catalog rather than silently passing', () => {
    // The dangerous failure: no catalog and a green answer would tell an agent
    // its usage was checked when nothing looked at it.
    rmSync(join(root, 'atlas-catalog.json'))
    expect(runCheck({ cwd: root, component: 'Button' }).kind).toBe('no-catalog')
  })

  it('reports malformed args', () => {
    expect(runCheck({ cwd: root, component: 'Button', argsJson: '{oops' }).kind).toBe('bad-json')
  })

  it('rejects a non-object args payload', () => {
    expect(runCheck({ cwd: root, component: 'Button', argsJson: '["a"]' }).kind).toBe('bad-json')
  })

  it('with NO args, still reports what is required', () => {
    const result = runCheck({ cwd: root, component: 'Button' })
    expect(result.kind === 'ok' && result.ok).toBe(false)
    expect(result.kind === 'ok' && result.text).toContain('`label` is required')
  })
})
