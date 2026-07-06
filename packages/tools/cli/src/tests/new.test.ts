import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildScaffolderArgs, runNew } from '../new'

describe('buildScaffolderArgs', () => {
  it('web → create-zero@latest, args forwarded', () => {
    expect(buildScaffolderArgs({ native: false, args: ['my-app', '--template', 'blog'] })).toEqual([
      '--yes',
      '@pyreon/create-zero@latest',
      'my-app',
      '--template',
      'blog',
    ])
  })
  it('native → create-multiplatform@latest', () => {
    expect(buildScaffolderArgs({ native: true, args: ['my-app'] })).toEqual([
      '--yes',
      '@pyreon/create-multiplatform@latest',
      'my-app',
    ])
  })
  it('no name still produces a valid scaffolder invocation', () => {
    expect(buildScaffolderArgs({ native: false, args: [] })).toEqual(['--yes', '@pyreon/create-zero@latest'])
  })
})

describe('runNew --dry-run', () => {
  let logs: string[]
  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  it('prints the npx command and does NOT spawn (returns 0)', () => {
    const code = runNew({ args: ['my-app'], native: false, dryRun: true })
    expect(code).toBe(0)
    expect(logs.join('\n')).toBe('npx --yes @pyreon/create-zero@latest my-app')
  })
  it('dry-run reflects --native', () => {
    runNew({ args: ['x'], native: true, dryRun: true })
    expect(logs.join('\n')).toContain('@pyreon/create-multiplatform@latest')
  })
})
