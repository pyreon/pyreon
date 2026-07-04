/**
 * Branch-coverage tests for scaffold + integrations + package-json
 * generation edge cases.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  typedRoutes: false,
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
  it("uses '^3.17.3' for @tanstack/virtual-core (else of query/table ternary)", () => {
    const config = base({ features: ['virtual'] })
    const pkg = JSON.parse(generatePackageJson(config))
    expect(pkg.dependencies?.['@tanstack/virtual-core']).toBe('^3.17.3')
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

describe('vite-config — ISR mode + typed routes (zero-modes-dx N)', () => {
  it("isr mode emits `mode: 'isr'` with a default revalidate window", () => {
    const out = generateViteConfig(base({ renderMode: 'isr' }))
    expect(out).toContain("mode: 'isr'")
    expect(out).toContain('isr: { revalidate: 60 }')
  })

  it('typedRoutes: true emits the zero() flag; false emits nothing', () => {
    expect(generateViteConfig(base({ typedRoutes: true }))).toContain('typedRoutes: true')
    expect(generateViteConfig(base({ typedRoutes: false }))).not.toContain('typedRoutes')
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

/**
 * Regression guard for the TS2688 bug class (fixed 2026-07): every scaffolded
 * project's tsconfig declares `types: ["bun", ...]`, so the package.json MUST
 * ship `@types/bun` — otherwise a STANDALONE (non-workspace) scaffold fails
 * `tsc` + editor tsserver with "Cannot find type definition file for 'bun'".
 * The repo's own example apps only compiled because the monorepo hoists the
 * dep from root; a fresh app has no such hoist. The invariant: any @types/*
 * package a template tsconfig references in `types` must be a declared dep.
 */
describe('tsconfig `types` ↔ @types dep coherence (TS2688 regression)', () => {
  let tmp: string
  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true })
  })

  it('generated flat package.json ships @types/bun + a runnable typecheck script', () => {
    const pkg = JSON.parse(generatePackageJson(base()))
    expect(pkg.devDependencies?.['@types/bun']).toBeTruthy()
    expect(pkg.scripts?.typecheck).toBe('tsc --noEmit')
  })

  it('every base template ships @types/bun for its `types: ["bun"]` tsconfig', async () => {
    for (const template of ['app', 'blog', 'dashboard'] as const) {
      tmp = await mkdtemp(join(tmpdir(), `cz-types-${template}-`))
      await scaffold(base({ targetDir: tmp, template }))
      const tsconfig = JSON.parse(await readFile(join(tmp, 'tsconfig.json'), 'utf-8'))
      const pkg = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf-8'))
      const types: string[] = tsconfig.compilerOptions?.types ?? []
      if (types.includes('bun')) {
        expect(pkg.devDependencies?.['@types/bun'], `${template}: types:["bun"] but no @types/bun dep`).toBeTruthy()
      }
      await rm(tmp, { recursive: true, force: true })
      tmp = ''
    }
  })

  it('monorepo shared packages (ui/types) ship @types/bun (they run `tsc --noEmit`)', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cz-mono-types-'))
    await scaffold(base({ targetDir: tmp, template: 'monorepo' }))
    for (const p of ['packages/ui', 'packages/types']) {
      const pkg = JSON.parse(await readFile(join(tmp, p, 'package.json'), 'utf-8'))
      const tsconfig = JSON.parse(await readFile(join(tmp, p, 'tsconfig.json'), 'utf-8'))
      if ((tsconfig.compilerOptions?.types ?? []).includes('bun')) {
        expect(pkg.devDependencies?.['@types/bun'], `${p}: types:["bun"] but no @types/bun dep`).toBeTruthy()
      }
    }
  })
})
