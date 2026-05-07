/**
 * Auto-discovered island-registry tests for @pyreon/vite-plugin.
 *
 * Exercises the `pyreon({ islands: true })` path:
 *   1. Materialize synthetic source files containing `island()` calls
 *   2. Drive plugin.config() + plugin.buildStart() to populate the registry
 *   3. Drive plugin.load('\0pyreon/islands-registry') + assert the emitted
 *      source contains the expected loader entries (and excludes
 *      hydrate: 'never' islands)
 *
 * Companion to `cross-module-signals.test.ts` — same harness shape.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

type BuildStartHook = (this: unknown) => Promise<void>
type LoadHook = (id: string) => string | undefined
type ResolveIdHook = (
  this: unknown,
  id: string,
  importer?: string,
) => Promise<string | null | undefined>

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-islands-registry-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})
beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
})

function writeFile(rel: string, contents: string): string {
  const full = join(root, rel)
  const dir = full.slice(0, full.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(full, contents)
  return full
}

function bootstrap(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'build' })
  return plugin
}

async function runBuildStart(plugin: ReturnType<typeof pyreonPlugin>) {
  const buildStart = plugin.buildStart as BuildStartHook
  await buildStart.call({})
}

function runLoad(plugin: ReturnType<typeof pyreonPlugin>, id: string): string {
  const result = (plugin.load as LoadHook)(id)
  if (typeof result !== 'string') {
    throw new Error(`load('${id}') returned ${typeof result}, expected string`)
  }
  return result
}

async function runResolveId(
  plugin: ReturnType<typeof pyreonPlugin>,
  id: string,
): Promise<string | null | undefined> {
  return (plugin.resolveId as ResolveIdHook).call({}, id)
}

const ISLANDS_REGISTRY_IMPORT = 'virtual:pyreon/islands-registry'
const ISLANDS_REGISTRY_ID = '\0pyreon/islands-registry'

describe('vite-plugin — islands virtual module', () => {
  it('resolveId redirects virtual:pyreon/islands-registry to the \\0-prefixed id', async () => {
    const plugin = bootstrap()
    expect(await runResolveId(plugin, ISLANDS_REGISTRY_IMPORT)).toBe(ISLANDS_REGISTRY_ID)
  })

  it('emits an empty registry when no island() calls exist', async () => {
    writeFile('src/App.tsx', `export const App = () => null`)
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('__pyreonIslandsEnabled = true')
    expect(source).toContain('__pyreonIslandRegistry = {')
    // No entries beyond the opening and closing braces
    expect(source).not.toMatch(/import\(.+\)/)
  })

  it('discovers `island(() => import("./X"), { name, hydrate: "load" })` calls', async () => {
    writeFile(
      'src/islands.ts',
      `import { island } from '@pyreon/server'
export const Counter = island(() => import('./components/Counter'), {
  name: 'Counter',
  hydrate: 'load',
})`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('"Counter":')
    // Loader path was resolved relative to the file where the call lives
    expect(source).toContain(`/components/Counter`)
  })

  it('omits hydrate: "never" islands from the registry', async () => {
    writeFile(
      'src/islands.ts',
      `import { island } from '@pyreon/server'
export const Counter = island(() => import('./Counter'), { name: 'Counter', hydrate: 'load' })
export const StaticBadge = island(() => import('./StaticBadge'), { name: 'StaticBadge', hydrate: 'never' })`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('"Counter":')
    expect(source).not.toContain('"StaticBadge":')
    expect(source).not.toContain('StaticBadge')
  })

  it('handles `media(...)` and `interaction` strategy strings without omitting them', async () => {
    writeFile(
      'src/islands.ts',
      `import { island } from '@pyreon/server'
export const Mobile = island(() => import('./Mobile'), { name: 'Mobile', hydrate: 'media((max-width: 768px))' })
export const Idle = island(() => import('./Idle'), { name: 'Idle', hydrate: 'idle' })
export const Visible = island(() => import('./Visible'), { name: 'Visible', hydrate: 'visible' })`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('"Mobile":')
    expect(source).toContain('"Idle":')
    expect(source).toContain('"Visible":')
  })

  it('discovers island() calls across multiple source files', async () => {
    writeFile(
      'src/foo/A.ts',
      `import { island } from '@pyreon/server'
export const A = island(() => import('./component'), { name: 'A', hydrate: 'load' })`,
    )
    writeFile(
      'src/bar/B.ts',
      `import { island } from '@pyreon/server'
export const B = island(() => import('./component'), { name: 'B', hydrate: 'idle' })`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('"A":')
    expect(source).toContain('"B":')
  })

  it('skips node_modules / dist / lib / build during the prescan walk', async () => {
    writeFile(
      'node_modules/some-pkg/island.ts',
      `island(() => import('./X'), { name: 'IgnoreMe', hydrate: 'load' })`,
    )
    writeFile(
      'dist/build-output.ts',
      `island(() => import('./X'), { name: 'AlsoIgnoreMe', hydrate: 'load' })`,
    )
    writeFile(
      'src/Real.ts',
      `import { island } from '@pyreon/server'
export const Real = island(() => import('./X'), { name: 'Real', hydrate: 'load' })`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('"Real":')
    expect(source).not.toContain('"IgnoreMe":')
    expect(source).not.toContain('"AlsoIgnoreMe":')
  })

  it('emits a stub registry when islands: false is set', async () => {
    writeFile(
      'src/islands.ts',
      `import { island } from '@pyreon/server'
export const Counter = island(() => import('./Counter'), { name: 'Counter', hydrate: 'load' })`,
    )
    const plugin = bootstrap({ islands: false })
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    // Stub flips the enabled flag so hydrateIslandsAuto() throws at runtime
    // with a clear message — better than a silent empty registry.
    expect(source).toContain('__pyreonIslandsEnabled = false')
    expect(source).not.toContain('"Counter":')
  })

  it('deduplicates duplicate names (last-wins order)', async () => {
    writeFile(
      'src/a.ts',
      `import { island } from '@pyreon/server'
export const A = island(() => import('./a-comp'), { name: 'Same', hydrate: 'load' })`,
    )
    writeFile(
      'src/b.ts',
      `import { island } from '@pyreon/server'
export const B = island(() => import('./b-comp'), { name: 'Same', hydrate: 'load' })`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    // Only one entry for "Same" emitted — registry can't have duplicate keys.
    const matches = source.match(/"Same":/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('skips island() calls without a name field (auto-registry has nothing to key on)', async () => {
    writeFile(
      'src/islands.ts',
      `import { island } from '@pyreon/server'
// Anomaly: island() without a name option. Auto-registry can't include this.
export const Bad = island(() => import('./X'), { hydrate: 'load' } as any)
export const Good = island(() => import('./Y'), { name: 'Good', hydrate: 'load' })`,
    )
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const source = runLoad(plugin, ISLANDS_REGISTRY_ID)
    expect(source).toContain('"Good":')
    expect(source).not.toContain('"Bad":')
  })
})
