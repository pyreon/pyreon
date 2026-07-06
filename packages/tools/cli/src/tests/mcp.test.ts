import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMcpArgs, runMcp } from '../mcp'

describe('buildMcpArgs', () => {
  it('delegates to @pyreon/mcp WITHOUT @latest (prefer project-local version)', () => {
    expect(buildMcpArgs([])).toEqual(['--yes', '@pyreon/mcp'])
  })
  it('forwards extra args to the server', () => {
    expect(buildMcpArgs(['--port', '9000'])).toEqual(['--yes', '@pyreon/mcp', '--port', '9000'])
  })
  it('never pins @latest (version-consistency with the installed pyreon)', () => {
    expect(buildMcpArgs([]).join(' ')).not.toContain('@latest')
  })
})

describe('runMcp --dry-run', () => {
  let logs: string[]
  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints the npx command and does NOT spawn (returns 0)', () => {
    const code = runMcp({ args: [], dryRun: true })
    expect(code).toBe(0)
    expect(logs.join('\n')).toBe('npx --yes @pyreon/mcp')
  })
  it('dry-run reflects passthrough args', () => {
    runMcp({ args: ['--foo'], dryRun: true })
    expect(logs.join('\n')).toBe('npx --yes @pyreon/mcp --foo')
  })
})
