import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLoomArgs, runLoom } from '../loom'

describe('buildLoomArgs', () => {
  it('delegates to @pyreon/loom WITHOUT @latest (prefer project-local version)', () => {
    expect(buildLoomArgs([])).toEqual(['--yes', '@pyreon/loom'])
  })
  it('forwards the subcommand + args', () => {
    expect(buildLoomArgs(['scan', '.', '--strict'])).toEqual(['--yes', '@pyreon/loom', 'scan', '.', '--strict'])
  })
  it('never pins @latest', () => {
    expect(buildLoomArgs([]).join(' ')).not.toContain('@latest')
  })
})

describe('runLoom --dry-run', () => {
  let logs: string[]
  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints the npx command and does NOT spawn (returns 0)', () => {
    const code = runLoom({ args: [], dryRun: true })
    expect(code).toBe(0)
    expect(logs.join('\n')).toBe('npx --yes @pyreon/loom')
  })
  it('dry-run reflects passthrough args', () => {
    runLoom({ args: ['dev', '.', '--port=5230'], dryRun: true })
    expect(logs.join('\n')).toBe('npx --yes @pyreon/loom dev . --port=5230')
  })
})
