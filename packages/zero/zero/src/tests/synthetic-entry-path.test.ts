/**
 * The synthetic SSG/SSR entry gets a per-build name.
 *
 * Both plugins write a generated entry into the Vite root and remove it in
 * `finally`. With one fixed name, two builds of the SAME root at once (a
 * tool that ships its own app — two `atlas build` runs, or test files
 * building it in parallel) shared the file, and the first to finish deleted
 * it under the other: `Cannot resolve entry module
 * app/__pyreon-zero-ssg-entry.js`, seen in a pre-push run. The race window is
 * too narrow to reproduce on demand, so the property is asserted directly:
 * two builds never name the same file.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syntheticEntryPath, syntheticEntryResolvePlugin } from '../ssr-build-shared'

describe('syntheticEntryPath', () => {
  it('names a different file for every build, in the root, under the same stem', () => {
    const a = syntheticEntryPath('/app', '__pyreon-zero-ssg-entry.js')
    const b = syntheticEntryPath('/app', '__pyreon-zero-ssg-entry.js')
    expect(a).not.toBe(b)
    for (const p of [a, b]) {
      expect(p.startsWith(join('/app', '__pyreon-zero-ssg-entry-'))).toBe(true)
      expect(p.endsWith('.js')).toBe(true)
    }
  })

  it('matches the scaffolded .gitignore glob, so an interrupted build leaves nothing tracked', () => {
    const name = syntheticEntryPath('/app', '__pyreon-zero-ssr-entry.js').split('/').at(-1)!
    // `__pyreon-zero-ssr-entry*.js` in create-zero / create-multiplatform.
    expect(name).toMatch(/^__pyreon-zero-ssr-entry.*\.js$/)
    expect(name).not.toBe('__pyreon-zero-ssr-entry.js')
  })
})

describe('syntheticEntryResolvePlugin', () => {
  // The entry now lives in the cache dir; its bare imports must still resolve
  // as if from the app root, where every other module resolves them.
  const plugin = syntheticEntryResolvePlugin('/cache/__pyreon-zero-ssg-entry-1-a.js', '/app')
  const calls: { id: string; importer: string | undefined }[] = []
  const ctx = {
    resolve: async (id: string, importer?: string) => {
      calls.push({ id, importer })
      return { id: `/resolved/${id}` }
    },
  }
  const run = (id: string, importer: string) =>
    (plugin.resolveId as unknown as (this: typeof ctx, i: string, im: string, o: object) => unknown).call(
      ctx,
      id,
      importer,
      {},
    )

  it("resolves the entry's bare imports from the app root", async () => {
    calls.length = 0
    await run('@pyreon/head/ssr', '/cache/__pyreon-zero-ssg-entry-1-a.js')
    expect(calls).toEqual([{ id: '@pyreon/head/ssr', importer: '/app/__pyreon-zero-entry.js' }])
  })

  it('leaves every other importer, and relative / virtual ids, alone', async () => {
    calls.length = 0
    expect(await run('@pyreon/core', '/app/src/page.tsx')).toBeNull()
    expect(await run('virtual:zero/routes', '/cache/__pyreon-zero-ssg-entry-1-a.js')).toBeNull()
    expect(await run('./x', '/cache/__pyreon-zero-ssg-entry-1-a.js')).toBeNull()
    expect(calls).toEqual([])
  })
})
