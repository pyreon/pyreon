/**
 * Every page islands-only (#4371), on the BUILT output of a real SSG build of
 * `fixture-islands-only` with `routeRules: { '/**': { hydrate: 'islands' } }`.
 * Its own file: two SSG builds of the fixture in one process register two
 * `@pyreon/runtime-dom` instances (the second prerender then refuses to run).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildIslandsOnlyFixture, FIXTURE } from './fixture-islands-only/build'

/**
 * Every page islands-only (here by `routeRules: { '/**': { hydrate:
 * 'islands' } }`): no page ever starts the app, so the client build carries
 * none of it. `__ZERO_APP_PAGES__` compiles `startClientLazy`'s app path out
 * and the client routes module is empty; kept, the router stayed alive in the
 * build and islands that import from `@pyreon/router` shared a chunk with all
 * of it (about 9 KB gzip per page on pyreon.dev).
 */
describe('every page islands-only — built SSG output', () => {
  let allDist = ''
  const allChunks = new Map<string, string>()
  beforeAll(async () => {
    allDist = await mkdtemp(join(tmpdir(), 'pyreon-islands-only-all-'))
    await buildIslandsOnlyFixture(allDist, undefined, { '/**': { hydrate: 'islands' } })
    for (const file of readdirSync(join(allDist, 'assets'))) {
      if (file.endsWith('.js')) allChunks.set(file, readFileSync(join(allDist, 'assets', file), 'utf8'))
    }
  }, 180_000)
  afterAll(async () => {
    await rm(allDist, { recursive: true, force: true })
    await rm(join(FIXTURE, '__pyreon-zero-ssg-entry.js'), { force: true })
  })
  const anyChunk = (needle: string) => [...allChunks].filter(([, code]) => code.includes(needle)).map(([f]) => f)

  it('every page is marked, including the ones only the rule covers', () => {
    for (const path of ['', 'about', 'static']) {
      expect(readFileSync(join(allDist, path, 'index.html'), 'utf8'), path || '/').toContain(
        '<meta name="pyreon-hydrate" content="islands">',
      )
    }
  })

  it('the client build holds no router, no route code and no app start', () => {
    expect(anyChunk('popstate')).toEqual([])
    expect(anyChunk('STATIC_ROUTE_MODULE_MARKER')).toEqual([])
    expect(anyChunk('Could not load the app')).toEqual([])
  })

  it('the island still has its runtime and its component', () => {
    expect(allChunks.size).toBeGreaterThan(0)
    expect(anyChunk('islands registry').length + anyChunk('pyreon-island').length).toBeGreaterThan(0)
    expect(anyChunk('data-testid="counter"').length + anyChunk('"counter"').length).toBeGreaterThan(0)
  })
})
