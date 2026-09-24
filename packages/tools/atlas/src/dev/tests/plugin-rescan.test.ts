import { describe, expect, it, vi } from 'vitest'
import type { ComponentIntelligence } from '../../core'
import type { CatalogEntrySource } from '../catalog-module'
import { atlasDevPlugin } from '../plugin'

const ci = (name: string): ComponentIntelligence => ({ name, controls: [], axes: [], scenarios: [], tags: [] })
const entry = (name: string): CatalogEntrySource => ({ component: ci(name), file: `/p/src/${name}.tsx` })

/** A Vite-shaped server: a watcher that records listeners so a test can fire them. */
function fakeServer() {
  const listeners = new Map<string, ((file: string) => void)[]>()
  const invalidated: unknown[] = []
  const sent: unknown[] = []
  const added: string[] = []
  return {
    server: {
      middlewares: { use: () => {} },
      watcher: {
        on: (event: string, listener: (file: string) => void) => {
          listeners.set(event, [...(listeners.get(event) ?? []), listener])
        },
        add: (paths: string | readonly string[]) => {
          added.push(...(typeof paths === 'string' ? [paths] : paths))
        },
      },
      moduleGraph: {
        getModuleById: (id: string) => ({ id }),
        invalidateModule: (mod: never) => {
          invalidated.push(mod)
        },
      },
      ws: { send: (payload: unknown) => sent.push(payload) },
    },
    fire: (event: string, file: string) => {
      for (const l of listeners.get(event) ?? []) l(file)
    },
    invalidated,
    sent,
    added,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 200))

describe('atlas dev — live rescan', () => {
  it('re-derives the catalog, invalidates the virtual module and reloads when a scanned file changes', async () => {
    const rescan = vi.fn(async () => [entry('Button'), entry('Card')])
    const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [entry('Button')], rescan })
    const fake = fakeServer()
    plugin.configureServer(fake.server)

    expect(plugin.load('\0virtual:atlas/catalog')).toContain('"button"')
    expect(plugin.load('\0virtual:atlas/catalog')).not.toContain('"card"')

    fake.fire('change', '/p/src/Card.tsx')
    await settle()

    expect(rescan).toHaveBeenCalledTimes(1)
    expect(fake.invalidated).toHaveLength(1)
    expect(fake.sent).toEqual([{ type: 'full-reload', path: '*' }])
    // The catalog module now reads the fresh entries.
    expect(plugin.load('\0virtual:atlas/catalog')).toContain('"card"')
  })

  it('debounces a burst of saves into one rescan, and ignores files outside the scan root', async () => {
    const rescan = vi.fn(async () => [entry('Button')])
    const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [entry('Button')], rescan })
    const fake = fakeServer()
    plugin.configureServer(fake.server)

    fake.fire('change', '/p/src/A.tsx')
    fake.fire('add', '/p/src/B.tsx')
    fake.fire('unlink', '/p/src/C.ts')
    fake.fire('change', '/p/README.md')
    fake.fire('change', '/elsewhere/src/D.tsx')
    await settle()
    expect(rescan).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous catalog and says so when a rescan throws', async () => {
    const rescan = vi.fn(async () => {
      throw new Error('boom')
    })
    const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [entry('Button')], rescan })
    const fake = fakeServer()
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      plugin.configureServer(fake.server)
      fake.fire('change', '/p/src/Button.tsx')
      await settle()
      expect(plugin.load('\0virtual:atlas/catalog')).toContain('"button"')
      expect(fake.sent).toEqual([])
      expect(err.mock.calls.flat().join('')).toContain('rescan failed')
    } finally {
      err.mockRestore()
    }
  })

  it('does nothing without a rescan hook or without a watcher — the static-build shape', () => {
    const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [entry('Button')] })
    expect(() => plugin.configureServer({ middlewares: { use: () => {} } })).not.toThrow()
  })

  it('rescans on a save in ANY project directory and on a config edit (monorepo / config)', async () => {
    // Regression: only `<root>/src` was watched, so with `projects` no save
    // rescanned, and editing atlas.config.ts never did.
    const rescan = vi.fn(async () => [entry('Button')])
    const plugin = atlasDevPlugin({
      root: '/p',
      scanRoot: '/p/src',
      entries: [entry('Button')],
      rescan,
      watch: { dirs: ['/p/src', '/p/packages/core', '/p/packages/admin'], files: ['/p/atlas.config.ts'] },
    })
    const fake = fakeServer()
    plugin.configureServer(fake.server)
    // Every target is registered, so a directory outside the Vite root is watched at all.
    expect(fake.added).toEqual(['/p/src', '/p/packages/core', '/p/packages/admin', '/p/atlas.config.ts'])

    fake.fire('change', '/p/packages/admin/src/Card.tsx')
    await settle()
    expect(rescan).toHaveBeenCalledTimes(1)

    fake.fire('change', '/p/atlas.config.ts')
    await settle()
    expect(rescan).toHaveBeenCalledTimes(2)

    // A sibling whose name merely STARTS with a watched dir is not inside it.
    fake.fire('change', '/p/packages/core-legacy/Card.tsx')
    await settle()
    expect(rescan).toHaveBeenCalledTimes(2)
  })

  it('a rescan result replaces the config-derived options and the watch targets', async () => {
    const rescan = vi.fn(async () => ({
      entries: [entry('Button')],
      pages: { Button: { title: 'Fresh Title' } },
      watch: { dirs: ['/p/src', '/p/packages/new'], files: ['/p/atlas.config.ts'] },
    }))
    const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [entry('Button')], rescan })
    const fake = fakeServer()
    plugin.configureServer(fake.server)
    expect(plugin.load('\0virtual:atlas/catalog')).not.toContain('Fresh Title')

    fake.fire('change', '/p/src/Button.tsx')
    await settle()
    expect(plugin.load('\0virtual:atlas/catalog')).toContain('Fresh Title')

    // The new project dir now triggers a rescan too.
    fake.fire('change', '/p/packages/new/X.tsx')
    await settle()
    expect(rescan).toHaveBeenCalledTimes(2)
  })
})
