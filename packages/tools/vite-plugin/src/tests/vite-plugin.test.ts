/**
 * Tests for @pyreon/vite-plugin — HMR injection, signal rewriting,
 * compat alias resolution, and helper functions.
 *
 * These test the plugin's transform logic directly (no Vite required).
 */

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

function transform(plugin: ReturnType<typeof pyreonPlugin>, code: string, id: string) {
  const transformHook = plugin.transform as (
    this: { warn: (msg: string) => void },
    code: string,
    id: string,
  ) => { code: string; map: null } | undefined
  const warnings: string[] = []
  return transformHook.call({ warn: (msg: string) => warnings.push(msg) }, code, id)
}

// ─── HMR injection ──────────────────────────────────────────────────────────

describe('HMR injection', () => {
  it('injects HMR accept for modules with component exports', () => {
    const plugin = createPlugin()
    const code = `
import { h } from "@pyreon/core"
export function App() { return h("div", null, "hello") }
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('import.meta.hot.accept()')
  })

  it('injects HMR for exported const components', () => {
    const plugin = createPlugin()
    const code = `
import { h } from "@pyreon/core"
export const Header = () => h("header", null, "nav")
`
    const result = transform(plugin, code, '/src/Header.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('import.meta.hot')
  })

  it('does not inject HMR for modules without component exports or signals', () => {
    const plugin = createPlugin()
    // Only lowercase exports — no component-like names (uppercase first letter)
    const code = `
export const formatDate = (d) => d.toISOString()
export const maxItems = 100
`
    const result = transform(plugin, code, '/src/utils.tsx')
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('import.meta.hot')
  })

  it('does not inject HMR in build mode', () => {
    const plugin = createBuildPlugin()
    const code = `
import { h } from "@pyreon/core"
export function App() { return h("div", null, "hello") }
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('import.meta.hot')
  })
})

// ─── Signal rewriting ────────────────────────────────────────────────────────

describe('signal rewriting', () => {
  it('rewrites module-scope signal() to __hmr_signal()', () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
import { h } from "@pyreon/core"
const count = signal(0)
export function Counter() { return h("div", null, count()) }
`
    const result = transform(plugin, code, '/src/Counter.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__hmr_signal(')
    expect(result!.code).toContain('"count"')
    expect(result!.code).toContain('"/src/Counter.tsx"')
    expect(result!.code).toContain('__hmr_dispose')
  })

  it('rewrites exported signals', () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
export const theme = signal("light")
export function App() { return null }
`
    const result = transform(plugin, code, '/src/theme.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__hmr_signal("/src/theme.tsx", "theme", signal, "light")')
  })

  it('does not rewrite signal() inside functions to __hmr_signal (but injects name)', () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
import { h } from "@pyreon/core"
export function Counter() {
  const local = signal(0)
  return h("div", null, local())
}
`
    const result = transform(plugin, code, '/src/Counter.tsx')
    expect(result).toBeDefined()
    // The signal inside the function body should NOT be rewritten to __hmr_signal
    expect(result!.code).not.toContain('__hmr_signal')
    // But should get a debug name injected
    expect(result!.code).toContain('signal(0, { name: "local" })')
  })

  it('rewrites multiple module-scope signals', () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
const count = signal(0)
const name = signal("world")
export function App() { return null }
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('"count"')
    expect(result!.code).toContain('"name"')
  })

  it('handles signal with complex initial values', () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
const items = signal([1, 2, 3])
const config = signal({ theme: "dark", size: 14 })
export function App() { return null }
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__hmr_signal')
    expect(result!.code).toContain('[1, 2, 3]')
    expect(result!.code).toContain('{ theme: "dark", size: 14 }')
  })

  it('does not rewrite signal in build mode', () => {
    const plugin = createBuildPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
const count = signal(0)
export function App() { return null }
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    expect(result!.code).not.toContain('__hmr_signal')
    // No signal names in production builds
    expect(result!.code).toContain('signal(0)')
    expect(result!.code).not.toContain('{ name:')
  })

  it('skips signal naming when options already provided', () => {
    const plugin = createPlugin()
    const code = `
import { signal } from "@pyreon/reactivity"
export function App() {
  const count = signal(0, { name: "custom" })
  return null
}
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
    // Should not double-inject name
    expect(result!.code).toContain('signal(0, { name: "custom" })')
  })
})

// ─── File extension filtering ────────────────────────────────────────────────

describe('file extension filtering', () => {
  it('transforms .tsx files', () => {
    const plugin = createPlugin()
    const code = `export function App() { return null }`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeDefined()
  })

  it('transforms .jsx files', () => {
    const plugin = createPlugin()
    const code = `export function App() { return null }`
    const result = transform(plugin, code, '/src/App.jsx')
    expect(result).toBeDefined()
  })

  it('ignores .ts files', () => {
    const plugin = createPlugin()
    const code = `export const x = 1`
    const result = transform(plugin, code, '/src/utils.ts')
    expect(result).toBeUndefined()
  })

  it('ignores .js files', () => {
    const plugin = createPlugin()
    const code = `export const x = 1`
    const result = transform(plugin, code, '/src/utils.js')
    expect(result).toBeUndefined()
  })

  it('handles query strings in file paths', () => {
    const plugin = createPlugin()
    const code = `export function App() { return null }`
    const result = transform(plugin, code, '/src/App.tsx?v=123')
    expect(result).toBeDefined()
  })
})

// ─── Compat mode ─────────────────────────────────────────────────────────────

describe('compat mode', () => {
  it('skips Pyreon JSX transform in react compat mode', () => {
    const plugin = createPlugin({ compat: 'react' })
    const code = `
import { useState } from "react"
export function App() { const [x] = useState(0); return null }
`
    const result = transform(plugin, code, '/src/App.tsx')
    expect(result).toBeUndefined()
  })

  it('skips transform in preact compat mode', () => {
    const plugin = createPlugin({ compat: 'preact' })
    const result = transform(plugin, 'export function App() { return null }', '/src/App.tsx')
    expect(result).toBeUndefined()
  })

  it('skips transform in vue compat mode', () => {
    const plugin = createPlugin({ compat: 'vue' })
    const result = transform(plugin, 'export function App() { return null }', '/src/App.tsx')
    expect(result).toBeUndefined()
  })

  it('skips transform in solid compat mode', () => {
    const plugin = createPlugin({ compat: 'solid' })
    const result = transform(plugin, 'export function App() { return null }', '/src/App.tsx')
    expect(result).toBeUndefined()
  })
})

// ─── Plugin config ───────────────────────────────────────────────────────────

describe('plugin config', () => {
  it('does not set resolve.conditions for client/dev (prevents node:fs leak)', () => {
    const plugin = pyreonPlugin()
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as Record<string, unknown>
    expect(config.resolve).toBeUndefined()
  })

  it('does not set resolve.conditions for client build', () => {
    const plugin = pyreonPlugin()
    const config = getConfigHook(plugin)({}, { command: 'build' }) as Record<string, unknown>
    expect(config.resolve).toBeUndefined()
  })

  it('sets resolve.conditions: ["bun"] for SSR build only', () => {
    const plugin = pyreonPlugin({ ssr: { entry: './src/entry-server.ts' } })
    const config = getConfigHook(plugin)({}, { command: 'build', isSsrBuild: true }) as Record<string, any>
    expect(config.resolve?.conditions).toEqual(['bun'])
  })

  it('sets JSX import source to @pyreon/core by default', () => {
    const plugin = pyreonPlugin()
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as {
      oxc: { jsx: { importSource: string } }
    }
    expect(config.oxc.jsx.importSource).toBe('@pyreon/core')
  })

  it('sets JSX import source to compat package in compat mode', () => {
    const plugin = pyreonPlugin({ compat: 'react' })
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as {
      oxc: { jsx: { importSource: string } }
    }
    expect(config.oxc.jsx.importSource).toBe('@pyreon/react-compat')
  })

  it('excludes compat packages from optimizeDeps', () => {
    const plugin = pyreonPlugin({ compat: 'react' })
    const config = getConfigHook(plugin)({}, { command: 'serve' }) as {
      optimizeDeps: { exclude: string[] }
    }
    expect(config.optimizeDeps.exclude).toContain('react')
    expect(config.optimizeDeps.exclude).toContain('react-dom')
  })

  it('adds SSR build config when isSsrBuild', () => {
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

  it('loads HMR runtime source for internal ID', () => {
    const plugin = createPlugin()
    const load = plugin.load as (id: string) => string | undefined
    const source = load('\0pyreon/hmr-runtime')
    expect(source).toBeDefined()
    expect(source).toContain('__hmr_signal')
    expect(source).toContain('__hmr_dispose')
    expect(source).toContain('__pyreon_hmr_registry__')
  })

  it('returns undefined for non-virtual IDs', () => {
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

  it('configureServer returns middleware function when SSR enabled', () => {
    const plugin = pyreonPlugin({ ssr: { entry: './src/entry-server.ts' } })
    expect(plugin.configureServer).toBeDefined()
  })

  it('configureServer is defined even without SSR (for context generation)', () => {
    const plugin = pyreonPlugin()
    expect(plugin.configureServer).toBeDefined()
  })
})
