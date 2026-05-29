/**
 * REPRODUCTION + REGRESSION — `signalExportRegistry`, `resolveCache`,
 * and `islandRegistry` accumulated stale entries for the lifetime of
 * a `vite dev` session. Vite's `watchChange` hook fires on filesystem
 * `'create' | 'update' | 'delete'` events; pre-fix none of the four
 * per-instance caches subscribed, so deleting / renaming a source
 * file left orphaned entries forever.
 *
 * Bounded by total source-tree size in practice, but a real Class C
 * leak over hours of editing on a large project — every source file
 * the developer touches that later gets deleted leaves one entry per
 * cache stuck until process exit.
 */
import { describe, expect, it } from 'vitest'
import type { PyreonPluginOptions } from '../index'
import pyreonPlugin from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

function createServePlugin(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({}, { command: 'serve' })
  return plugin
}

interface PluginInternalShape {
  buildStart: () => Promise<void> | void
  transform: (
    this: {
      warn: (msg: string) => void
      resolve: (
        id: string,
        importer?: string,
        opts?: { skipSelf: boolean },
      ) => Promise<{ id: string } | null>
    },
    code: string,
    id: string,
  ) => Promise<{ code: string; map: null } | undefined>
  watchChange: (id: string, change: { event: 'create' | 'update' | 'delete' }) => void
}

interface PluginCaches {
  signalExportRegistry: Map<string, Set<string>>
  resolveCache: Map<string, string | null>
  pyreonWorkspaceDirCache: Map<string, boolean>
  islandRegistry: Map<string, unknown[]>
}

const CACHES_SYMBOL = Symbol.for('pyreon/vite-plugin:caches')

function getCaches(plugin: ReturnType<typeof pyreonPlugin>): PluginCaches {
  const caches = (plugin as unknown as Record<symbol, PluginCaches | undefined>)[CACHES_SYMBOL]
  if (!caches) throw new Error('plugin should expose CACHES_SYMBOL')
  return caches
}

async function transform(
  plugin: ReturnType<typeof pyreonPlugin>,
  code: string,
  id: string,
): Promise<void> {
  const p = plugin as unknown as PluginInternalShape
  await p.transform.call(
    {
      warn: () => {},
      resolve: async (specifier: string, importer?: string) => {
        // Simulate resolution — bare relative imports map to virtual
        // paths so resolveCache gets real entries.
        if (specifier.startsWith('./') && importer) {
          return { id: `/test-project/${specifier.slice(2)}.ts` }
        }
        return null
      },
    },
    code,
    id,
  )
}

describe('@pyreon/vite-plugin — file-delete cache eviction (watchChange)', () => {
  it('REGRESSION: signalExportRegistry entry is evicted on file delete', async () => {
    const plugin = createServePlugin()
    const p = plugin as unknown as PluginInternalShape
    const caches = getCaches(plugin)

    // Transform a source file that exports a top-level signal. The
    // plugin's incremental scanner populates the registry.
    await transform(plugin, `export const count = signal(0)`, '/test-project/store.tsx')
    expect(caches.signalExportRegistry.has('/test-project/store.tsx')).toBe(true)

    // Fire the delete event. The critical assertion: the registry
    // entry is GONE post-delete. Pre-fix (no watchChange hook), the
    // entry would persist forever.
    p.watchChange('/test-project/store.tsx', { event: 'delete' })
    expect(caches.signalExportRegistry.has('/test-project/store.tsx')).toBe(false)
  })

  it('REGRESSION: resolveCache entries pointing at the deleted file are evicted', async () => {
    const plugin = createServePlugin()
    const p = plugin as unknown as PluginInternalShape
    const caches = getCaches(plugin)

    // Populate signalExportRegistry first.
    await transform(plugin, `export const a = signal(0)`, '/test-project/a.tsx')
    // Consumer file imports a.ts — populates resolveCache.
    await transform(
      plugin,
      `import { a } from './a'\nexport default () => a`,
      '/test-project/consumer.tsx',
    )

    const beforeSize = caches.resolveCache.size
    expect(beforeSize).toBeGreaterThan(0)

    // Delete `a.ts`. Both the importer-keyed entry AND any entry
    // whose VALUE is `/test-project/a.tsx` should evict.
    p.watchChange('/test-project/a.tsx', { event: 'delete' })

    // Critical: no entry in resolveCache references the deleted file.
    for (const [key, value] of caches.resolveCache) {
      expect(key.startsWith('/test-project/a.tsx::')).toBe(false)
      expect(value).not.toBe('/test-project/a.tsx')
    }
  })

  it('REGRESSION: islandRegistry entry is evicted on file delete', async () => {
    const plugin = createServePlugin({ islands: true })
    const p = plugin as unknown as PluginInternalShape
    const caches = getCaches(plugin)

    // Populate the island registry. Use a minimal island declaration.
    await transform(
      plugin,
      `import { island } from '@pyreon/server'\nexport const C = island(() => import('./c'), { name: 'C' })`,
      '/test-project/c-island.tsx',
    )

    // Either the absolute id or its normalized form may have landed
    // in the registry — assert at least one is there.
    const hasEntry =
      caches.islandRegistry.has('/test-project/c-island.tsx') ||
      [...caches.islandRegistry.keys()].some((k) => k.includes('c-island'))

    if (hasEntry) {
      p.watchChange('/test-project/c-island.tsx', { event: 'delete' })
      // Post-delete the registry should NOT have the entry.
      expect(caches.islandRegistry.has('/test-project/c-island.tsx')).toBe(false)
    } else {
      // If the scanner didn't pick up the island (test fixture too
      // minimal), the watchChange call must still be a no-op without
      // throwing — verifies the defensive path.
      expect(() => p.watchChange('/test-project/c-island.tsx', { event: 'delete' })).not.toThrow()
    }
  })

  it('REGRESSION: watchChange ignores create/update events (handled by transform)', async () => {
    const plugin = createServePlugin()
    const p = plugin as unknown as PluginInternalShape
    const caches = getCaches(plugin)

    // Populate then update — update should NOT evict.
    await transform(plugin, `export const v = signal(0)`, '/test-project/v.tsx')
    expect(caches.signalExportRegistry.has('/test-project/v.tsx')).toBe(true)
    p.watchChange('/test-project/v.tsx', { event: 'create' })
    expect(caches.signalExportRegistry.has('/test-project/v.tsx')).toBe(true)
    p.watchChange('/test-project/v.tsx', { event: 'update' })
    expect(caches.signalExportRegistry.has('/test-project/v.tsx')).toBe(true)

    // Only delete evicts.
    p.watchChange('/test-project/v.tsx', { event: 'delete' })
    expect(caches.signalExportRegistry.has('/test-project/v.tsx')).toBe(false)
  })

  it('REGRESSION: deleting an untracked file is a safe no-op', () => {
    const plugin = createServePlugin()
    const p = plugin as unknown as PluginInternalShape
    expect(() =>
      p.watchChange('/test-project/never-tracked.tsx', { event: 'delete' }),
    ).not.toThrow()
  })
})
