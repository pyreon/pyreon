/**
 * Tests for @pyreon/vite-plugin — HMR injection, signal rewriting,
 * compat alias resolution, and helper functions.
 *
 * These test the plugin's transform logic directly (no Vite required).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join as pathJoin } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── Import internals ─────────────────────────────────────────────────────────
// We import the default export and call it to get the plugin object,
// then invoke its hooks directly.

import type { PyreonPluginOptions } from '../index'
import pyreonPlugin from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

function getConfigHook(plugin: ReturnType<typeof pyreonPlugin>): ConfigHook {
  return plugin.config as unknown as ConfigHook
}

function createPlugin(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  // Simulate Vite calling config() so isBuild / projectRoot are set
  getConfigHook(plugin)({}, { command: 'serve' })
  return plugin
}

function createBuildPlugin(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  getConfigHook(plugin)({}, { command: 'build' })
  return plugin
}

async function transform(plugin: ReturnType<typeof pyreonPlugin>, code: string, id: string) {
  const transformHook = plugin.transform as (
    this: { warn: (msg: string) => void; resolve: (id: string, importer?: string, options?: { skipSelf: boolean }) => Promise<{ id: string } | null> },
    code: string,
    id: string,
  ) => Promise<{ code: string; map: null } | undefined>
  const warnings: string[] = []
  return transformHook.call(
    {
      warn: (msg: string) => warnings.push(msg),
      resolve: async () => null, // no cross-module resolution in unit tests
    },
    code,
    id,
  )
}

// ─── HMR injection ──────────────────────────────────────────────────────────

describe('HMR injection', () => {
  it('injects a coordinator-driven HMR accept for modules with component exports', async () => {
    const plugin = createPlugin()
    const code = `
import { h } from "@pyreon/core"
export function App() { return h("div", null, "hello") }
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    // Self-accept WITH a callback receiving the fresh module (the bare
    // `accept()` was the bug — it suppressed Vite's reload fallback while
    // re-rendering nothing).
    expect(result!.code).toContain('import.meta.hot.accept((__m) => {')
    expect(result!.code).not.toContain('import.meta.hot.accept();')
    // Hands the fresh module to the router-registered HMR coordinator,
    // keyed by THIS module's id (zero import coupling).
    expect(result!.code).toContain('globalThis.__pyreon_hmr_swap__')
    expect(result!.code).toContain('__s("/src/App.tsx", __m)')
    // Falls back to an automatic full reload when the edit was outside the
    // active route tree or no coordinator is registered.
    expect(result!.code).toContain('import.meta.hot.invalidate()')
  })

  it('injects HMR for exported const components', async () => {
    const plugin = createPlugin()
    const code = `
import { h } from "@pyreon/core"
export const Header = () => h("header", null, "nav")
`
    const result = await transform(plugin, code, '/src/Header.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('import.meta.hot')
  })

  it('does not inject HMR for modules without component exports or signals', async () => {
    const plugin = createPlugin()
    // Only lowercase exports — no component-like names (uppercase first letter)
    const code = `
export const formatDate = (d) => d.toISOString()
export const maxItems = 100
`
    const result = await transform(plugin, code, '/src/utils.tsx')
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('import.meta.hot')
  })

  it('does not inject HMR in build mode', async () => {
    const plugin = createBuildPlugin()
    const code = `
import { h } from "@pyreon/core"
export function App() { return h("div", null, "hello") }
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('import.meta.hot')
  })
})

// ─── Signal rewriting ────────────────────────────────────────────────────────

describe('signal rewriting', () => {
  it('rewrites module-scope signal() to __hmr_signal()', async () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
import { h } from "@pyreon/core"
const count = signal(0)
export function Counter() { return h("div", null, count()) }
`
    const result = await transform(plugin, code, '/src/Counter.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__hmr_signal(')
    expect(result!.code).toContain('"count"')
    expect(result!.code).toContain('"/src/Counter.tsx"')
    expect(result!.code).toContain('__hmr_dispose')
  })

  it('rewrites exported signals', async () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
export const theme = signal("light")
export function App() { return null }
`
    const result = await transform(plugin, code, '/src/theme.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__hmr_signal("/src/theme.tsx", "theme", signal, "light")')
  })

  it('rewrites generic-typed signals (signal<T>(value))', async () => {
    // Regression for the silent-skip bug: SIGNAL_PREFIX_RE used to match
    // `signal(` but not `signal<T>(`. Pre-rewrite TypeScript still has type
    // parameters; declarations like `signal<string>('')` would skip HMR
    // preservation silently and produce an empty-string-valued signal that
    // — under a separate `__hmr_signal` interaction — could read as
    // undefined. Discovered via PR #329 (perf-dashboard form section).
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
export const password = signal<string>("")
export const items = signal<Array<{ id: number }>>([])
export const count = signal<number>(0)
export function App() { return null }
`
    const result = await transform(plugin, code, '/src/state.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain(
      '__hmr_signal("/src/state.tsx", "password", signal, "")',
    )
    expect(result!.code).toContain(
      '__hmr_signal("/src/state.tsx", "items", signal, [])',
    )
    expect(result!.code).toContain('__hmr_signal("/src/state.tsx", "count", signal, 0)')
  })

  it('does not rewrite signal() inside functions to __hmr_signal (but injects name)', async () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
import { h } from "@pyreon/core"
export function Counter() {
  const local = signal(0)
  return h("div", null, local())
}
`
    const result = await transform(plugin, code, '/src/Counter.tsx')
    expect(result).toBeDefined()
    // The signal inside the function body should NOT be rewritten to __hmr_signal
    expect(result!.code).not.toContain('__hmr_signal')
    // But should get a debug name + source location injected (the LPIH
    // build-time injection, R4 follow-up — see lpih.md docs).
    expect(result!.code).toMatch(
      /signal\(0, \{ name: "local", __sourceLocation: \{ file: "\/src\/Counter\.tsx", line: \d+, col: \d+ \} \}\)/,
    )
  })

  it('rewrites multiple module-scope signals', async () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
const count = signal(0)
const name = signal("world")
export function App() { return null }
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('"count"')
    expect(result!.code).toContain('"name"')
  })

  it('handles signal with complex initial values', async () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
const items = signal([1, 2, 3])
const config = signal({ theme: "dark", size: 14 })
export function App() { return null }
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__hmr_signal')
    expect(result!.code).toContain('[1, 2, 3]')
    expect(result!.code).toContain('{ theme: "dark", size: 14 }')
  })

  it('does not rewrite signal in build mode', async () => {
    const plugin = createBuildPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
const count = signal(0)
export function App() { return null }
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('__hmr_signal')
    // No signal names in production builds
    expect(result!.code).toContain('signal(0)')
    expect(result!.code).not.toContain('{ name:')
  })

  it('skips signal naming when options already provided', async () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
export function App() {
  const count = signal(0, { name: "custom" })
  return null
}
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    // Should not double-inject name
    expect(result!.code).toContain('signal(0, { name: "custom" })')
  })
})

// ─── File extension filtering ────────────────────────────────────────────────

describe('file extension filtering', () => {
  it('transforms .tsx files', async () => {
    const plugin = createPlugin()
    const code = `export function App() { return null }`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
  })

  it('transforms .jsx files', async () => {
    const plugin = createPlugin()
    const code = `export function App() { return null }`
    const result = await transform(plugin, code, '/src/App.jsx')
    expect(result).toBeDefined()
  })

  it('ignores .ts files', async () => {
    const plugin = createPlugin()
    const code = `export const x = 1`
    const result = await transform(plugin, code, '/src/utils.ts')
    expect(result).toBeUndefined()
  })

  it('ignores .js files', async () => {
    const plugin = createPlugin()
    const code = `export const x = 1`
    const result = await transform(plugin, code, '/src/utils.js')
    expect(result).toBeUndefined()
  })

  it('handles query strings in file paths', async () => {
    const plugin = createPlugin()
    const code = `export function App() { return null }`
    const result = await transform(plugin, code, '/src/App.tsx?v=123')
    expect(result).toBeDefined()
  })
})

// ─── Compat mode ─────────────────────────────────────────────────────────────

describe('compat mode', () => {
  it('skips Pyreon JSX transform in react compat mode', async () => {
    const plugin = createPlugin({ compat: 'react' })
    const code = `
import { useState } from "react"
export function App() { const [x] = useState(0); return null }
`
    const result = await transform(plugin, code, '/src/App.tsx')
    expect(result).toBeUndefined()
  })

  it('skips transform in preact compat mode', async () => {
    const plugin = createPlugin({ compat: 'preact' })
    const result = await transform(plugin, 'export function App() { return null }', '/src/App.tsx')
    expect(result).toBeUndefined()
  })

  it('skips transform in vue compat mode', async () => {
    const plugin = createPlugin({ compat: 'vue' })
    const result = await transform(plugin, 'export function App() { return null }', '/src/App.tsx')
    expect(result).toBeUndefined()
  })

  it('skips transform in solid compat mode', async () => {
    const plugin = createPlugin({ compat: 'solid' })
    const result = await transform(plugin, 'export function App() { return null }', '/src/App.tsx')
    expect(result).toBeUndefined()
  })
})

// ─── Plugin config ───────────────────────────────────────────────────────────

describe('plugin config', () => {
  it('sets resolve.conditions: ["bun"] for workspace source resolution', async () => {
    const plugin = pyreonPlugin()
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as Record<string, any>
    expect(config.resolve.conditions).toEqual(['bun'])
  })

  it('sets JSX import source to @pyreon/core by default', async () => {
    const plugin = pyreonPlugin()
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as {
      oxc: { jsx: { importSource: string } }
    }
    expect(config.oxc.jsx.importSource).toBe('@pyreon/core')
  })

  it('keeps JSX import source as @pyreon/core in compat mode', async () => {
    // OXC's `importSource` is project-wide (one setting for the whole build),
    // so pointing it at the compat package would force the compat runtime
    // on `@pyreon/*` framework files too — which they cannot handle. Instead
    // the plugin keeps OXC at `@pyreon/core` and redirects the resulting
    // `@pyreon/core/jsx-runtime` import to the compat package via `resolveId`,
    // gated on the importer (user code only). See `compat-resolve.test.ts`
    // "framework-importer carve-out". Caught by `cpa-smoke-app-*-compat`.
    const plugin = pyreonPlugin({ compat: 'react' })
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as {
      oxc: { jsx: { importSource: string } }
    }
    expect(config.oxc.jsx.importSource).toBe('@pyreon/core')
  })

  it('excludes compat packages from optimizeDeps', async () => {
    const plugin = pyreonPlugin({ compat: 'react' })
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as {
      optimizeDeps: { exclude: string[] }
    }
    expect(config.optimizeDeps.exclude).toContain('react')
    expect(config.optimizeDeps.exclude).toContain('react-dom')
  })

  // Regression: pre-fix, the plugin's `bun` resolve condition redirected
  // every `@pyreon/*` import to source `.ts(x)` files. In a non-monorepo
  // consumer app, Vite's deps optimizer (esbuild) tried to pre-bundle
  // those packages from `node_modules` and silently produced broken
  // bundles in `.vite/deps/`, surfacing as
  //   `File does not exist at .../node_modules/.vite/deps/@pyreon_styler.js`
  // at runtime. Fix scans the consumer's package.json for `@pyreon/*`
  // deps and adds them to optimizeDeps.exclude so the optimizer skips
  // them (resolution then goes through the plugin's own resolveId hook
  // and Vite's normal source pipeline).
  it("auto-excludes consumer's @pyreon/* deps from optimizeDeps (Vite optimizer fix)", async () => {
    // Build a fake consumer package.json with a few @pyreon/* deps.
    const tmpRoot = pathJoin(import.meta.dirname, 'fixtures', 'pyreon-deps-consumer')
    rmSync(tmpRoot, { recursive: true, force: true })
    mkdirSync(tmpRoot, { recursive: true })
    writeFileSync(
      pathJoin(tmpRoot, 'package.json'),
      JSON.stringify({
        name: 'fake-consumer',
        dependencies: {
          '@pyreon/core': '^0.15.0',
          '@pyreon/styler': '^0.15.0',
          '@pyreon/runtime-dom': '^0.15.0',
          // Non-@pyreon dep MUST NOT leak into the exclude list.
          react: '^19.0.0',
        },
        devDependencies: {
          '@pyreon/vite-plugin': '^0.15.0',
        },
      }),
    )

    const plugin = pyreonPlugin()
    const config = getConfigHook(plugin)({ root: tmpRoot }, { command: 'serve' }) as {
      optimizeDeps: { exclude: string[] }
    }
    expect(config.optimizeDeps.exclude).toContain('@pyreon/core')
    expect(config.optimizeDeps.exclude).toContain('@pyreon/styler')
    expect(config.optimizeDeps.exclude).toContain('@pyreon/runtime-dom')
    expect(config.optimizeDeps.exclude).toContain('@pyreon/vite-plugin')
    expect(config.optimizeDeps.exclude).not.toContain('react')

    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it("merges @pyreon/* deps with compat aliases without dup'ing", async () => {
    const tmpRoot = pathJoin(import.meta.dirname, 'fixtures', 'pyreon-deps-compat')
    rmSync(tmpRoot, { recursive: true, force: true })
    mkdirSync(tmpRoot, { recursive: true })
    writeFileSync(
      pathJoin(tmpRoot, 'package.json'),
      JSON.stringify({ dependencies: { '@pyreon/core': '^0.15.0' } }),
    )

    const plugin = pyreonPlugin({ compat: 'react' })
    const config = getConfigHook(plugin)({ root: tmpRoot }, { command: 'serve' }) as {
      optimizeDeps: { exclude: string[] }
    }
    // Compat list still present
    expect(config.optimizeDeps.exclude).toContain('react')
    // Pyreon list also present
    expect(config.optimizeDeps.exclude).toContain('@pyreon/core')
    // Deduplicated (Set)
    const occurrences = config.optimizeDeps.exclude.filter((d) => d === 'react').length
    expect(occurrences).toBe(1)

    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('handles missing/malformed consumer package.json gracefully', async () => {
    const plugin = pyreonPlugin()
    // Point at a directory that doesn't exist — should not throw.
    const config = getConfigHook(plugin)(
      { root: '/nonexistent/path/that/does/not/exist' },
      { command: 'serve' },
    ) as { optimizeDeps: { exclude: string[] } }
    expect(config.optimizeDeps.exclude).toEqual([])
  })

  it('adds SSR build config when isSsrBuild', async () => {
    const plugin = pyreonPlugin({ ssr: { entry: './src/entry-server.ts' } })
    const config = getConfigHook(plugin)({}, { command: 'build', isSsrBuild: true }) as {
      build: { ssr: boolean; rollupOptions: { input: string } }
    }
    expect(config.build.ssr).toBe(true)
    expect(config.build.rollupOptions.input).toBe('./src/entry-server.ts')
  })
})

// ─── Virtual module (HMR runtime) ────────────────────────────────────────────

describe('virtual module resolution', () => {
  it('resolves virtual:pyreon/hmr-runtime to internal ID', async () => {
    const plugin = createPlugin()
    const resolveId = plugin.resolveId as (
      id: string,
    ) => string | undefined | Promise<string | undefined>
    const resolved = await resolveId('virtual:pyreon/hmr-runtime')
    expect(resolved).toBe('\0pyreon/hmr-runtime')
  })

  it('loads HMR runtime source for internal ID', async () => {
    const plugin = createPlugin()
    const load = plugin.load as (id: string) => string | undefined
    const source = load('\0pyreon/hmr-runtime')
    expect(source).toBeDefined()
    expect(source).toContain('__hmr_signal')
    expect(source).toContain('__hmr_dispose')
    expect(source).toContain('__pyreon_hmr_registry__')
  })

  it('returns undefined for non-virtual IDs', async () => {
    const plugin = createPlugin()
    const load = plugin.load as (id: string) => string | undefined
    expect(load('/src/App.tsx')).toBeUndefined()
  })
})

// ─── Asset request detection ────────────────────────────────────────────────

describe('asset request filtering', () => {
  // The SSR middleware uses isAssetRequest internally.
  // We test it via the configureServer middleware behavior.
  // For direct testing, we'd need to export it — instead we verify
  // the plugin's SSR middleware config exists when ssr option is set.

  it('configureServer returns middleware function when SSR enabled', async () => {
    const plugin = pyreonPlugin({ ssr: { entry: './src/entry-server.ts' } })
    expect(plugin.configureServer).toBeDefined()
  })

  it('configureServer is defined even without SSR (for context generation)', async () => {
    const plugin = pyreonPlugin()
    expect(plugin.configureServer).toBeDefined()
  })
})
