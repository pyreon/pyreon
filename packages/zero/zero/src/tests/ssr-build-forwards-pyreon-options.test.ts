/**
 * The SHIPPED call site forwards the options — not just the helper.
 *
 * `inner-pyreon-options.test.ts` covers the pure pick/read functions. That is
 * not enough on its own: the bug was never in a helper, it was a call site
 * written as a bare `pyreon()`, and a suite that only tests the helper would
 * pass with the call site still broken. So this file drives the real
 * `buildSsrBundle`, stubs ONLY vite's `build` to capture the config it is
 * handed, and reads the options back off the plugin instance that call site
 * actually constructed — via the same `api` field the outer plugin publishes.
 *
 * That round-trip is what makes the assertion load-bearing: the value has to
 * survive being read off the outer chain, filtered, passed to a fresh
 * `pyreon()`, and re-published by it.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PyreonPluginApi } from '@pyreon/vite-plugin'
import type { InlineConfig, Plugin } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Configs handed to vite's `build` during the test. */
const captured: InlineConfig[] = []

vi.mock('vite', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    build: async (config: InlineConfig) => {
      captured.push(config)
      return undefined
    },
  }
})

const ENV_FLAG = '__ZERO_TEST_FORWARD_OPTS__'
let root: string

beforeEach(() => {
  captured.length = 0
  root = mkdtempSync(join(tmpdir(), 'zero-forward-opts-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env[ENV_FLAG]
})

/** The plugin the inner chain constructed, found the same way zero finds it. */
function innerPyreon(config: InlineConfig): Plugin | undefined {
  const plugins = (config.plugins ?? []).flat(2) as Plugin[]
  return plugins.find((p) => typeof p === 'object' && p !== null && p.name === 'pyreon')
}

function optionsOf(config: InlineConfig): PyreonPluginApi['pyreonOptions'] | undefined {
  const api = innerPyreon(config)?.api as Partial<PyreonPluginApi> | undefined
  return api?.pyreonOptions
}

/** Run buildSsrBundle with a stub outer chain carrying `pyreonOptions`. */
async function run(pyreonOptions: PyreonPluginApi['pyreonOptions']): Promise<InlineConfig> {
  const { buildSsrBundle, materializeEntry } = await import('../ssr-build-shared')
  const entryPath = join(root, '.zero-entry.js')
  await materializeEntry(entryPath, 'export default {}\n')
  await buildSsrBundle({
    root,
    entryPath,
    outDir: join(root, 'out'),
    outputFilename: 'entry-server.js',
    envFlag: ENV_FLAG,
    userConfig: {},
    userPlugins: [{ name: 'pyreon', api: { pyreonOptions } }] as Plugin[],
  })
  const config = captured[0]
  expect(config, 'vite build was never called').toBeDefined()
  return config!
}

describe('buildSsrBundle — the inner pyreon plugin inherits the user options', () => {
  it('constructs a pyreon plugin at all', async () => {
    const config = await run({})
    expect(innerPyreon(config)).toBeDefined()
  })

  it('forwards ssrTemplate to the SSR pass — the one place it does anything', async () => {
    // Against the bare `pyreon()` this reads `{}` and fails: the option the
    // user set to shape the SSR emit never reached the SSR build.
    const config = await run({ ssrTemplate: false })
    expect(optionsOf(config)).toMatchObject({ ssrTemplate: false })
  })

  it('forwards compat, so aliased imports resolve in the SSR graph too', async () => {
    const config = await run({ compat: 'react' })
    expect(optionsOf(config)).toMatchObject({ compat: 'react' })
  })

  it('does NOT forward ssr.entry — it would replace the synthetic entry', async () => {
    const config = await run({ ssr: { entry: './src/entry-server.ts' }, compat: 'vue' })
    const opts = optionsOf(config)
    expect(opts).not.toHaveProperty('ssr')
    expect(opts).toMatchObject({ compat: 'vue' })
  })

  it('still builds the SYNTHETIC entry, which is the reason ssr is withheld', async () => {
    const config = await run({ ssr: { entry: './src/entry-server.ts' } })
    expect(config.build?.ssr).toBe(join(root, '.zero-entry.js'))
  })

  it('passes no options when the user set none', async () => {
    const config = await run({})
    expect(optionsOf(config)).toEqual({})
  })

  it('drops the outer pyreon INSTANCE from the forwarded chain', async () => {
    // Re-adding it would double-register hooks; the options cross, the object
    // does not. Exactly one pyreon plugin must be present.
    const config = await run({ compat: 'preact' })
    const all = (config.plugins ?? []).flat(2) as Plugin[]
    expect(all.filter((p) => typeof p === 'object' && p?.name === 'pyreon')).toHaveLength(1)
  })
})
