/**
 * Compat aliases vs. what the compat packages actually ship (#4334).
 *
 * `pyreon({ compat })` redirects a framework's import specifiers to the
 * matching `@pyreon/*-compat` package. The table was hand-maintained and had
 * gaps: `preact/compat` — the most common Preact import after `preact` — was
 * not aliased, nor `solid-js/web` / `solid-js/store` (whose APIs solid-compat
 * ships in its main entry), so they silently resolved to the REAL framework.
 *
 * Locks, per framework:
 *   1. every entry the compat package exports is reachable through an alias,
 *   2. every alias target is an entry the compat package really exports,
 *   3. every alias key is recognised as a framework specifier, and an
 *      unaliased framework specifier warns once instead of resolving silently.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import pyreonPlugin, {
  _compatAliasTable,
  _getCompatTarget,
  _isUnaliasedFrameworkImport,
  _unaliasedImportWarning,
  type PyreonPluginOptions,
} from '../index'

type Framework = 'react' | 'preact' | 'vue' | 'solid' | 'svelte'
const FRAMEWORKS: Framework[] = ['react', 'preact', 'vue', 'solid', 'svelte']

function compatExports(fw: Framework): string[] {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, `../../../${fw}-compat/package.json`), 'utf8'),
  ) as { exports: Record<string, unknown> }

  return Object.keys(pkg.exports).map((k) =>
    k === '.' ? `@pyreon/${fw}-compat` : `@pyreon/${fw}-compat/${k.slice(2)}`,
  )
}

describe.each(FRAMEWORKS)('compat aliases — %s', (fw) => {
  const table = _compatAliasTable(fw)
  const targets = new Set(Object.values(table))

  it('every alias target is an entry the compat package exports', () => {
    const shipped = new Set(compatExports(fw))
    for (const target of targets) expect(shipped, target).toContain(target)
  })

  it('every entry the compat package exports is reachable through an alias', () => {
    // `jsx-dev-runtime` is reached through the dev JSX transform, which the
    // plugin points at `jsx-runtime` (see #4284 for the dev-runtime entries).
    const reachable = compatExports(fw).filter((e) => !e.endsWith('/jsx-dev-runtime'))
    for (const entry of reachable) expect(targets, entry).toContain(entry)
  })

  it('every alias key is a recognised framework specifier', () => {
    for (const key of Object.keys(table)) {
      expect(_getCompatTarget(fw, key)).toBe(table[key])
      expect(_isUnaliasedFrameworkImport(fw, key)).toBe(false)
    }
  })
})

describe('the subpaths reported missing are aliased', () => {
  it.each([
    ['preact', 'preact/compat', '@pyreon/preact-compat/compat'],
    ['preact', 'preact/compat/jsx-runtime', '@pyreon/preact-compat/jsx-runtime'],
    ['preact', '@preact/signals-core', '@pyreon/preact-compat/signals'],
    ['preact', 'preact/hooks', '@pyreon/preact-compat/hooks'],
    ['preact', 'preact/jsx-runtime', '@pyreon/preact-compat/jsx-runtime'],
    ['solid', 'solid-js/web', '@pyreon/solid-compat'],
    ['solid', 'solid-js/store', '@pyreon/solid-compat'],
    ['vue', '@vue/reactivity', '@pyreon/vue-compat'],
    ['vue', '@vue/runtime-dom', '@pyreon/vue-compat'],
  ] as const)('%s: %s → %s', (fw, id, target) => {
    expect(_getCompatTarget(fw, id)).toBe(target)
  })
})

type ResolveIdHook = (
  this: { resolve: () => Promise<null>; warn: (m: string) => void },
  id: string,
  importer?: string,
) => Promise<string | undefined>

describe('an unaliased framework specifier warns once', () => {
  it('warns for svelte/transition (not provided), once, and still lets it resolve', async () => {
    const plugin = pyreonPlugin({ compat: 'svelte' } as PyreonPluginOptions)
    ;(plugin.config as unknown as (c: object, e: object) => void)({}, { command: 'serve' })
    const warnings: string[] = []
    const ctx = { resolve: async () => null, warn: (m: string) => void warnings.push(m) }
    const hook = plugin.resolveId as unknown as ResolveIdHook
    expect(await hook.call(ctx, 'svelte/transition', '/app/src/a.ts')).toBeUndefined()
    await hook.call(ctx, 'svelte/transition', '/app/src/b.ts')
    await hook.call(ctx, 'lodash', '/app/src/a.ts') // not a framework import: silent
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(
      /^\[Pyreon\] compat "svelte": "svelte\/transition" is not provided by @pyreon\/svelte-compat/,
    )
  })

  it('does not warn without compat mode', () => {
    expect(_isUnaliasedFrameworkImport('react', 'lodash')).toBe(false)
    expect(_isUnaliasedFrameworkImport('react', 'react-dom/server')).toBe(true)
    expect(_isUnaliasedFrameworkImport('react', 'reactive-lib')).toBe(false)
  })
})

// #4331: `react-dom/server` falls through to the real package in compat mode,
// and the once-per-specifier warning only said "import the equivalent from
// @pyreon/react-compat", which has no server renderer. A framework's server
// renderer cannot render Pyreon vnodes; the warning must name the replacement.
describe('an unaliased server renderer names @pyreon/runtime-server (#4331)', () => {
  it('react-dom/server: the resolveId warning names renderToString from @pyreon/runtime-server', async () => {
    const plugin = pyreonPlugin({ compat: 'react' } as PyreonPluginOptions)
    ;(plugin.config as unknown as (c: object, e: object) => void)({}, { command: 'serve' })
    const warnings: string[] = []
    const ctx = { resolve: async () => null, warn: (m: string) => void warnings.push(m) }
    const hook = plugin.resolveId as unknown as ResolveIdHook
    expect(await hook.call(ctx, 'react-dom/server', '/app/src/entry-server.ts')).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^\[Pyreon\] compat "react": "react-dom\/server" is not provided/)
    expect(warnings[0]).toContain('`renderToString` (or `renderToStream`) from "@pyreon/runtime-server"')
    expect(warnings[0]).toContain('async')
    expect(warnings[0]).not.toContain('Import the equivalent from "@pyreon/react-compat"')
  })

  it.each([
    ['react', 'react-dom/server.node'],
    ['react', 'react-dom/server.browser'],
    ['react', 'react-dom/server.edge'],
    ['react', 'react-dom/static'],
    ['vue', 'vue/server-renderer'],
    ['vue', '@vue/server-renderer'],
    ['svelte', 'svelte/server'],
  ] as const)('%s: %s gets the same guidance', (fw, id) => {
    expect(_isUnaliasedFrameworkImport(fw, id)).toBe(true)
    expect(_unaliasedImportWarning(fw, id)).toContain('"@pyreon/runtime-server"')
  })

  it('any other unaliased specifier keeps the compat-package advice', () => {
    for (const [fw, id] of [['react', 'react-dom/test-utils'], ['svelte', 'svelte/transition'], ['vue', 'vue/macros']] as const) {
      const msg = _unaliasedImportWarning(fw, id)
      expect(msg).toContain(`Import the equivalent from "@pyreon/${fw}-compat"`)
      expect(msg).not.toContain('@pyreon/runtime-server')
    }
  })
})
