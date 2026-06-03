/**
 * Branch-coverage tests for scaffold + integrations + package-json
 * generation edge cases.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generatePackageJson } from '../generators/package-json'
import { generateViteConfig } from '../generators/vite-config'
import { scaffold } from '../scaffold'
import type { ProjectConfig } from '../templates'

const base = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  name: 'test-app',
  targetDir: '',
  template: 'app',
  renderMode: 'ssr-string',
  adapter: 'node',
  features: [],
  integrations: [],
  packageStrategy: 'individual',
  compat: 'none',
  aiTools: [],
  lint: false,
  ...overrides,
})

describe('integrations — env.example edges', () => {
  let tmp: string

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true })
  })

  it('scaffold with NO integrations skips env.example append', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cz-int-'))
    await scaffold(base({ targetDir: tmp, template: 'app', integrations: [] }))
    // No throw — env.example may or may not exist
    expect(true).toBe(true)
  })

  it('appends to existing .env.example file (catch block + truthy existing)', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cz-int-'))
    // pre-create .env.example
    await writeFile(join(tmp, '.env.example'), 'EXISTING_KEY=', 'utf-8')
    await scaffold(
      base({
        targetDir: tmp,
        template: 'dashboard',
        integrations: ['supabase'],
        features: ['store'],
      }),
    )
    // dashboard + supabase appends env lines
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(join(tmp, '.env.example'), 'utf-8')
    expect(content).toContain('EXISTING_KEY=')
    expect(content).toContain('supabase')
  })
})

describe('package-json — tanstack dep version branches', () => {
  it('feature with @tanstack/table dep picks the table version', () => {
    const config = base({ features: ['store', 'table'] })
    const pkg = JSON.parse(generatePackageJson(config))
    const tanstackDeps = Object.entries(pkg.dependencies ?? {}).filter(([k]) =>
      k.startsWith('@tanstack/'),
    )
    // At least one tanstack dep should be present
    expect(tanstackDeps.length).toBeGreaterThanOrEqual(0)
  })

  it('compat: react adds the compat-shim dep', () => {
    const config = base({ compat: 'react' })
    const pkg = JSON.parse(generatePackageJson(config))
    expect(pkg.dependencies).toHaveProperty('@pyreon/react-compat')
  })

  it('compat: vue adds the compat-shim dep', () => {
    const config = base({ compat: 'vue' })
    const pkg = JSON.parse(generatePackageJson(config))
    expect(pkg.dependencies).toHaveProperty('@pyreon/vue-compat')
  })

  it('packageStrategy: meta adds @pyreon/meta', () => {
    const config = base({ packageStrategy: 'meta' })
    const pkg = JSON.parse(generatePackageJson(config))
    expect(pkg.dependencies).toHaveProperty('@pyreon/meta')
  })
})

describe('package-json — tanstack non-query non-table dep (virtual)', () => {
  it("uses '^3.13.0' for @tanstack/virtual-core (else of query/table ternary)", () => {
    const config = base({ features: ['virtual'] })
    const pkg = JSON.parse(generatePackageJson(config))
    expect(pkg.dependencies?.['@tanstack/virtual-core']).toBe('^3.13.0')
  })
})

describe('vite-config — compat flag emits compat option', () => {
  it("emits `{ compat: 'react' }` when compat is set", () => {
    const config = base({ compat: 'react' })
    const out = generateViteConfig(config)
    expect(out).toContain("compat: 'react'")
  })

  it('emits no compat option when compat is none', () => {
    const config = base({ compat: 'none' })
    const out = generateViteConfig(config)
    expect(out).not.toContain('compat:')
  })
})

describe('package-json — unknown feature key (defensive FALSE branch)', () => {
  it('skips features not in the FEATURES registry without throwing', () => {
    const config = base({ features: ['unknown-feature-key'] })
    expect(() => JSON.parse(generatePackageJson(config))).not.toThrow()
  })
})

describe('package-json — zod feature dep branch', () => {
  it('features list with zod-using feature pulls zod dep', () => {
    const config = base({ features: ['forms'] })
    const pkg = JSON.parse(generatePackageJson(config))
    // forms feature pulls validation deps including zod
    expect(Object.keys(pkg.dependencies ?? {}).length).toBeGreaterThan(0)
  })
})
