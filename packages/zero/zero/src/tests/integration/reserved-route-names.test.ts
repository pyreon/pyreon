/**
 * Real-build regression (#4259): a prerendered route whose first URL segment
 * is a name the build or the deploy adapter writes into `dist/` must fail the
 * build, never ship listed-as-prerendered with its HTML gone.
 *
 * In a hybrid build the SSG pass writes `/server` to `dist/server/index.html`;
 * the SSR sub-build then empties `dist/server`, and staging excludes that dir
 * from the client copy. `/client` (node adapter) was written to
 * `dist/client/index.html` and then overwritten by the `/` page as staging
 * copied `dist/index.html` into `dist/client/`. Both stayed in
 * `_pyreon-ssg-paths.json`, the mode table printed `○ ssg`, and the runtime
 * silently server-rendered them.
 *
 * Runs actual `vite build`s of `fixture-reserved-route` with the zero plugin
 * built inline from src (`configFile: false`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zeroPlugin, type ZeroUserConfig } from '../../vite-plugin'

const FIXTURE = resolve(import.meta.dirname, 'fixture-reserved-route')
const DIST = join(FIXTURE, 'dist')

async function buildFixture(zeroConfig: ZeroUserConfig): Promise<void> {
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(FIXTURE)
  let plugins: ReturnType<typeof zeroPlugin>
  try {
    plugins = zeroPlugin(zeroConfig)
  } finally {
    cwd.mockRestore()
  }
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'silent',
    plugins,
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist', emptyOutDir: true },
  })
}

/** Every prerendered page a deploy would serve, by URL, from the node layout. */
function manifestAndPages(): { paths: string[]; missing: string[] } {
  const manifest = join(DIST, 'client', '_pyreon-ssg-paths.json')
  const paths = existsSync(manifest)
    ? (JSON.parse(readFileSync(manifest, 'utf-8')) as { paths: string[] }).paths
    : []
  const missing = paths.filter((p) => {
    const file = join(DIST, 'client', ...p.split('/').filter(Boolean), 'index.html')
    return !existsSync(file)
  })
  return { paths, missing }
}

beforeEach(async () => {
  await rm(DIST, { recursive: true, force: true })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssr-entry.js'), { force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssg-entry.js'), { force: true })
})

describe('a prerendered route may not be named after a build output (#4259)', () => {
  it("fails the hybrid build for '/server' (the SSR bundle's directory)", async () => {
    await expect(
      buildFixture({ mode: 'ssr', routeRules: { '/server': { renderMode: 'ssg' } } }),
    ).rejects.toThrow(/\[Pyreon\].*'\/server'.*"server"/s)
  }, 180_000)

  it("fails the hybrid build for '/client' under the node adapter (its staged client directory)", async () => {
    await expect(
      buildFixture({ mode: 'ssr', routeRules: { '/client': { renderMode: 'ssg' } } }),
    ).rejects.toThrow(/\[Pyreon\].*'\/client'.*"client".*node/s)
  }, 180_000)

  it('still builds when no prerendered route collides, and every listed page exists', async () => {
    await buildFixture({ mode: 'ssr', routeRules: { '/': { renderMode: 'ssg' } } })
    const { paths, missing } = manifestAndPages()
    expect(paths).toEqual(['/'])
    expect(missing).toEqual([])
  }, 180_000)
})
