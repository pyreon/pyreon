import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { add, detectPackageManager, normalizePackageName } from '../add'

let tmp: string
let logs: string[]
let errs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-add-'))
  logs = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errs.push(a.map(String).join(' ')))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})
const out = () => logs.join('\n')

describe('normalizePackageName', () => {
  it('prefixes a bare name with @pyreon/', () => {
    expect(normalizePackageName('query')).toBe('@pyreon/query')
  })
  it('passes a scoped name through', () => {
    expect(normalizePackageName('@pyreon/toast')).toBe('@pyreon/toast')
    expect(normalizePackageName('@tanstack/query-core')).toBe('@tanstack/query-core')
  })
})

describe('detectPackageManager', () => {
  const withLock = (file: string) => {
    writeFileSync(join(tmp, file), '')
    return detectPackageManager(tmp).name
  }
  it('bun.lock → bun', () => expect(withLock('bun.lock')).toBe('bun'))
  it('pnpm-lock.yaml → pnpm', () => expect(withLock('pnpm-lock.yaml')).toBe('pnpm'))
  it('yarn.lock → yarn', () => expect(withLock('yarn.lock')).toBe('yarn'))
  it('package-lock.json → npm', () => expect(withLock('package-lock.json')).toBe('npm'))
  it('no lockfile → npm (default)', () => expect(detectPackageManager(tmp).name).toBe('npm'))
  it('walks UP to the nearest lockfile from a subdir', () => {
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), '')
    const sub = join(tmp, 'apps', 'web')
    mkdirSync(sub, { recursive: true })
    expect(detectPackageManager(sub).name).toBe('pnpm')
  })
})

describe('pyreon add', () => {
  const opts = (packages: string[], over: Partial<Parameters<typeof add>[0]> = {}) =>
    add({ packages, cwd: tmp, dryRun: true, json: false, ...over })

  it('dry-run prints the tailored setup recipe (provider + usage + docs)', () => {
    const code = opts(['query'])
    expect(code).toBe(0)
    expect(out()).toContain('QueryClientProvider')
    expect(out()).toContain('useQuery')
    expect(out()).toContain('/docs/query')
    expect(out()).toContain('(--dry-run — not installed)') // did NOT install
  })

  it('accepts a bare name and normalizes it', () => {
    opts(['toast'])
    expect(out()).toContain('@pyreon/toast')
    expect(out()).toContain('Toaster')
  })

  it('--json emits a machine-readable plan', () => {
    const code = add({ packages: ['query', 'toast'], cwd: tmp, dryRun: true, json: true })
    expect(code).toBe(0)
    const plan = JSON.parse(out())
    expect(plan.packages).toEqual(['@pyreon/query', '@pyreon/toast'])
    expect(plan.command).toContain('@pyreon/query')
    expect(plan.recipes[0].recipe.summary).toBeTruthy()
  })

  it('rejects explicitly-scoped non-@pyreon packages (exit 1)', () => {
    // A bare `react` would normalize to `@pyreon/react`; the rejection is for
    // names that carry a DIFFERENT scope (nothing pyreon-shaped to install).
    const code = opts(['@types/node'])
    expect(code).toBe(1)
    expect(errs.join('\n')).toContain('@pyreon/*')
  })

  it('errors on no packages (exit 1)', () => {
    expect(opts([])).toBe(1)
  })

  it('an @pyreon package without a recipe still installs (generic pointer)', () => {
    const code = opts(['sync']) // real pkg, no curated recipe
    expect(code).toBe(0)
    expect(out()).toContain('@pyreon/sync')
    expect(out().toLowerCase()).toContain('docs')
  })
})
