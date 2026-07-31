import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAtlasArgs, runAtlas } from '../atlas'

describe('buildAtlasArgs', () => {
  it('delegates to @pyreon/atlas WITHOUT @latest (prefer project-local version)', () => {
    expect(buildAtlasArgs([])).toEqual(['--yes', '@pyreon/atlas'])
  })
  it('forwards the subcommand + args to the workbench CLI', () => {
    expect(buildAtlasArgs(['scan', '.', '--no-mount'])).toEqual([
      '--yes',
      '@pyreon/atlas',
      'scan',
      '.',
      '--no-mount',
    ])
  })
  it('never pins @latest (the catalog must match the installed pyreon)', () => {
    expect(buildAtlasArgs([]).join(' ')).not.toContain('@latest')
  })
})

describe('runAtlas --dry-run', () => {
  let logs: string[]
  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints the npx command and does NOT spawn (returns 0)', () => {
    const code = runAtlas({ args: [], dryRun: true })
    expect(code).toBe(0)
    expect(logs.join('\n')).toBe('npx --yes @pyreon/atlas')
  })
  it('dry-run reflects passthrough args', () => {
    runAtlas({ args: ['dev', '.', '--port=5210'], dryRun: true })
    expect(logs.join('\n')).toBe('npx --yes @pyreon/atlas dev . --port=5210')
  })
})
