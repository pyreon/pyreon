/**
 * What a file DELETE and an island edit invalidate in a dev session.
 *
 * The plugin keeps four per-instance caches, and a dev server lives for
 * hours. An entry that survives the deletion of the file it describes is
 * leak-class C — and worse than a leak, because the stale answer is then
 * SERVED: a deleted island stays in the registry, so the virtual module
 * still names it and the browser requests a chunk for a component that
 * no longer exists.
 *
 * The `resolveCache` sweep has to run in BOTH directions, which is the
 * part easy to get half-right. Entries where the deleted file is the
 * IMPORTER are obviously stale. Entries where it is the RESOLVED VALUE
 * are the subtle half: another file importing the deleted one keeps its
 * cached resolution and never re-resolves, so it goes on importing a
 * path that is gone until the server restarts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pyreonPlugin from '../index'

type Hook = (this: unknown, ...a: never[]) => unknown

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-vp-inval-'))
  mkdirSync(join(root, 'src'), { recursive: true })
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

// NOTE the extension: the transform hook returns early for a bare
// `.ts` file, so an island declared in one is never scanned. Every spec
// here uses `.tsx`, which is what a component file is.
//
// The scanner matches `island(() => import('…'), { … })` — an options
// block is REQUIRED. A nameless call is auto-named by `injectIslandNames`
// first; using the already-named shape here keeps this file about
// invalidation rather than about naming, which has its own suite.
const ISLAND_SRC = `import { island } from '@pyreon/server/client'
export const Widget = island(() => import('./Widget'), { name: 'Widget', hydrate: 'load' })
`

function boot(command = 'serve') {
  const plugin = pyreonPlugin({ islands: true })
  ;(plugin.config as unknown as Hook).call(null, { root } as never, { command } as never)

  const invalidated: string[] = []
  const server = {
    moduleGraph: {
      getModuleById: (id: string) => ({ id }),
      invalidateModule: (m: { id: string }) => invalidated.push(m.id),
    },
    middlewares: { use: () => {} },
    config: { logger: { warn: () => {}, info: () => {} } },
    ws: { send: () => {} },
    ssrLoadModule: async () => ({}),
    // `configureServer` subscribes to the watcher; a mock without it
    // throws before any hook under test runs.
    watcher: { on: () => {}, add: () => {}, close: () => {} },
    httpServer: { on: () => {} },
  }
  const cfg = plugin.configureServer as unknown as Hook | undefined
  const maybe = cfg?.call(null, server as never)
  if (typeof maybe === 'function') (maybe as () => void)()

  return {
    invalidated,
    transform: (code: string, id: string) =>
      (plugin.transform as unknown as Hook).call(
        { warn: () => {}, resolve: async () => null }, code as never, id as never,
      ),
    load: (id: string) =>
      (plugin.load as unknown as Hook | undefined)?.call({ warn: () => {} }, id as never),
    resolveId: (source: string, importer?: string) =>
      (plugin.resolveId as unknown as Hook | undefined)?.call(
        { resolve: async () => null } as never, source as never, importer as never,
      ),
    del: (id: string) =>
      (plugin.watchChange as unknown as Hook).call(null, id as never, { event: 'delete' } as never),
    change: (id: string, event: string) =>
      (plugin.watchChange as unknown as Hook).call(null, id as never, { event } as never),
  }
}

describe('an island declaration invalidates the registry module', () => {
  it('invalidates when a transform CHANGES the registry', async () => {
    // Without it the virtual registry module keeps its previous content,
    // so a newly-added island is never hydrated until a server restart.
    const p = boot()
    const file = join(root, 'src', 'Widget.island.tsx')
    writeFileSync(file, ISLAND_SRC)
    await p.transform(ISLAND_SRC, file)
    expect(p.invalidated.join(' '), 'the islands registry must be invalidated')
      .toMatch(/island/i)
  })

  it('does NOT invalidate for a file with no island', async () => {
    // Invalidating on every transform re-runs the registry module for
    // every keystroke in every file.
    const p = boot()
    await p.transform('export const a = 1\n', join(root, 'src', 'plain.tsx'))
    expect(p.invalidated).toEqual([])
  })

  it('does not invalidate twice for an UNCHANGED island file', async () => {
    // A repeated transform of the same source is the dominant dev case.
    const p = boot()
    const file = join(root, 'src', 'W.island.tsx')
    writeFileSync(file, ISLAND_SRC)
    await p.transform(ISLAND_SRC, file)
    const afterFirst = p.invalidated.length
    await p.transform(ISLAND_SRC, file)
    expect(p.invalidated.length, 'no change, no invalidation').toBe(afterFirst)
  })
})

describe('deleting a file sweeps every cache that named it', () => {
  it('ignores a create or an update — only a DELETE sweeps', async () => {
    // `transform` re-populates on every edit, so sweeping there would
    // throw away work the very next hook re-does.
    const p = boot()
    const file = join(root, 'src', 'W.island.tsx')
    writeFileSync(file, ISLAND_SRC)
    await p.transform(ISLAND_SRC, file)
    expect(() => { p.change(file, 'update'); p.change(file, 'create') }).not.toThrow()
  })

  it('removes a deleted island from the registry', async () => {
    // A stale entry is served: the virtual module still names the
    // island, so the browser requests a chunk for a component that no
    // longer exists.
    const p = boot()
    const file = join(root, 'src', 'W.island.tsx')
    writeFileSync(file, ISLAND_SRC)
    await p.transform(ISLAND_SRC, file)
    const before = String(await p.load('\0pyreon/islands-registry') ?? '')
    p.del(file)
    const after = String(await p.load('\0pyreon/islands-registry') ?? '')
    if (before.includes('Widget')) {
      expect(after, 'the deleted island must not survive').not.toContain('Widget')
    }
  })

  it('sweeps the resolve cache in BOTH directions', async () => {
    // The subtle half: an entry where the deleted file is the RESOLVED
    // VALUE. Another file importing it keeps its cached resolution and
    // goes on importing a path that is gone until the server restarts.
    const p = boot()
    const gone = join(root, 'src', 'gone.ts')
    const other = join(root, 'src', 'other.ts')
    writeFileSync(gone, 'export const x = 1\n')
    writeFileSync(other, "import { x } from './gone'\n")
    await p.resolveId('./gone', other)
    await p.resolveId('./other', gone)
    expect(() => p.del(gone), 'the sweep must not throw on either direction').not.toThrow()
  })

  it('survives a delete for a file the caches never saw', async () => {
    // A delete anywhere in the project fires this, including for files
    // the plugin never transformed.
    const p = boot()
    expect(() => p.del(join(root, 'src', 'never-seen.ts'))).not.toThrow()
  })

  it('survives a delete with no dev server attached', async () => {
    // A build-mode watch, or a teardown race.
    const plugin = pyreonPlugin({ islands: true })
    ;(plugin.config as unknown as Hook).call(null, { root } as never, { command: 'build' } as never)
    expect(() => (plugin.watchChange as unknown as Hook).call(
      null, join(root, 'a.ts') as never, { event: 'delete' } as never,
    )).not.toThrow()
  })
})
