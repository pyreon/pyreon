/**
 * Islands-only pages (#4371), on the BUILT output of a real SSG build.
 *
 * The fixture (`fixture-islands-only`) has app pages (`/`, `/about`: a loader,
 * a router-driven button) and islands-only pages (`/static`: a loader and a
 * `load` island; `/empty`: no islands), with the client entry an app with
 * islands-only routes writes (`startClientLazy` + the islands registry + an
 * island root).
 *
 * What the HTML declares is what the browser fetches before the client runs:
 * the entry `<script>`, its static imports, and every `<link rel=modulepreload>`.
 * For an islands-only page that set must hold no router and no route code;
 * the bytes of both kinds of page are printed for the PR.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildIslandsOnlyFixture, FIXTURE } from './fixture-islands-only/build'

let dist = ''
const chunks = new Map<string, string>()

const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*"\.\/([^"]+\.js)"/g

function page(path: string): string {
  return readFileSync(join(dist, path === '/' ? '' : path, 'index.html'), 'utf8')
}

function preloads(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g)].map(
    (m) => /href="\/assets\/([^"]+)"/.exec(m[0])![1]!,
  )
}

function entryOf(html: string): string {
  return /<script type="module"[^>]*src="\/assets\/([^"]+)"/.exec(html)![1]!
}

/** Static-import closure of `start` (chunk file names under assets/). */
function closure(start: Iterable<string>): Set<string> {
  const seen = new Set<string>()
  const queue = [...start]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const m of (chunks.get(file) ?? '').matchAll(STATIC_IMPORT)) queue.push(m[1]!)
  }

  return seen
}

/** What a page's HTML makes the browser fetch before any client code runs. */
function declared(html: string): Set<string> {
  return closure([entryOf(html), ...preloads(html)])
}

const gz = (files: Iterable<string>): number =>
  [...files].reduce((n, f) => n + gzipSync(chunks.get(f) ?? '', { level: 9 }).length, 0)

const holding = (needle: string): string[] =>
  [...chunks].filter(([, code]) => code.includes(needle)).map(([file]) => file)

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'pyreon-islands-only-'))
  await buildIslandsOnlyFixture(dist)
  for (const file of readdirSync(join(dist, 'assets'))) {
    if (file.endsWith('.js')) chunks.set(file, readFileSync(join(dist, 'assets', file), 'utf8'))
  }
}, 180_000)

afterAll(async () => {
  await rm(dist, { recursive: true, force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssg-entry.js'), { force: true })
})

describe('islands-only pages — built SSG output', () => {
  it('premise: the fixture has a router chunk and a route chunk to keep off the page', () => {
    // `popstate` is the router's history listener; the marker is in the
    // islands-only route's own module.
    expect(holding('popstate')).toHaveLength(1)
    expect(holding('STATIC_ROUTE_MODULE_MARKER')).toHaveLength(1)
  })

  it('an islands-only page is marked, has its loader output, and ships no loader data', () => {
    const html = page('/static')
    expect(html).toContain('<meta name="pyreon-hydrate" content="islands">')
    expect(html).toContain('STATIC_LOADER_TITLE')
    expect(html).not.toContain('__PYREON_LOADER_DATA__')
  })

  it('an islands-only page declares no router, no routes module and no route code', () => {
    const files = declared(page('/static'))
    for (const router of holding('popstate')) expect(files).not.toContain(router)
    for (const route of holding('STATIC_ROUTE_MODULE_MARKER')) expect(files).not.toContain(route)
    // The routes module is the chunk that lazy-loads the route components.
    const routeChunk = holding('STATIC_ROUTE_MODULE_MARKER')[0]!
    for (const routes of holding(`import("./${routeChunk}")`)) expect(files).not.toContain(routes)
  })

  it('an islands-only page preloads the islands runtime it starts from', () => {
    const files = declared(page('/static'))
    expect([...files].some((f) => f.startsWith('client-islands-'))).toBe(true)
  })

  it('an islands-only page with no islands declares nothing but the entry', () => {
    const html = page('/empty')
    expect(html).toContain('<meta name="pyreon-hydrate" content="islands">')
    expect(preloads(html).filter((f) => !closure([entryOf(html)]).has(f))).toEqual([])
    expect([...declared(html)].some((f) => f.startsWith('client-islands-'))).toBe(false)
  })

  it('an app page is unchanged: loader data, its route, the router and the app it starts', () => {
    const html = page('/')
    expect(html).not.toContain('pyreon-hydrate')
    expect(html).toContain('__PYREON_LOADER_DATA__')
    const files = declared(html)
    for (const router of holding('popstate')) expect(files).toContain(router)
    // the lazy entry's app: zero's client and the routes module are preloaded
    const routeChunk = holding('STATIC_ROUTE_MODULE_MARKER')[0]!
    for (const routes of holding(`import("./${routeChunk}")`)) expect(files).toContain(routes)
  })

  it('reports the bytes each kind of page declares (gzip -9)', () => {
    const report = {
      '/': { files: declared(page('/')).size, gzip: gz(declared(page('/'))) },
      '/static': { files: declared(page('/static')).size, gzip: gz(declared(page('/static'))) },
      '/empty': { files: declared(page('/empty')).size, gzip: gz(declared(page('/empty'))) },
    }
    // oxlint-disable-next-line no-console
    console.log(`[islands-only bytes] ${JSON.stringify(report)}`)
    expect(report['/static'].gzip).toBeLessThan(report['/'].gzip)
    expect(report['/empty'].gzip).toBeLessThan(report['/static'].gzip)
  })
})
