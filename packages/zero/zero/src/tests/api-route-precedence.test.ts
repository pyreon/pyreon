/**
 * API route precedence. The dispatcher (`createApiMiddleware`) takes the
 * FIRST matching entry, so the order `generateApiRouteModule` emits IS
 * precedence. It used to emit in directory-read order, so a catch-all
 * `api/[...path].ts` shadowed every sibling and `api/posts/[id].ts`
 * captured `/api/posts/new`.
 *
 * This test writes real route files, generates the real virtual module,
 * IMPORTS it, and dispatches real requests through the real middleware.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MiddlewareContext } from '@pyreon/server'
import {
  type ApiRouteEntry,
  compareApiRoutePatterns,
  createApiMiddleware,
  generateApiRouteModule,
} from '../api-routes'

// Deliberately the WORST order: catch-all first, dynamic before static.
const FILES = [
  'api/[...path].ts',
  'api/posts/[id].ts',
  'api/posts/new.ts',
  'api/posts/index.ts',
  'api/users/[id]/[...rest].ts',
  'api/users/[id]/profile.ts',
  'api/health.ts',
]

let dir: string
let routes: ApiRouteEntry[]

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'zero-api-order-'))
  for (const f of FILES) {
    const full = join(dir, f)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, `export const GET = () => new Response(${JSON.stringify(f)})\n`)
  }
  const mod = join(dir, 'api-routes.mjs')
  writeFileSync(mod, generateApiRouteModule(FILES, dir))
  routes = (await import(/* @vite-ignore */ mod)).apiRoutes
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function dispatch(path: string): Promise<string | undefined> {
  const req = new Request(`http://localhost${path}`)
  const ctx = { req, url: new URL(req.url), path, headers: req.headers, locals: {} }
  const res = await createApiMiddleware(routes)(ctx as unknown as MiddlewareContext)
  return res ? await (res as Response).text() : undefined
}

describe('API route precedence', () => {
  it.each([
    ['/api/health', 'api/health.ts'],
    ['/api/posts', 'api/posts/index.ts'],
    ['/api/posts/new', 'api/posts/new.ts'],
    ['/api/posts/42', 'api/posts/[id].ts'],
    ['/api/users/7/profile', 'api/users/[id]/profile.ts'],
    ['/api/users/7/a/b', 'api/users/[id]/[...rest].ts'],
    ['/api/anything/else', 'api/[...path].ts'],
  ])('%s → %s', async (path, file) => {
    expect(await dispatch(path)).toBe(file)
  })

  it('emits the same order regardless of input order', () => {
    const forward = generateApiRouteModule(FILES, '/r')
    const reversed = generateApiRouteModule([...FILES].reverse(), '/r')
    const patterns = (code: string) => [...code.matchAll(/pattern: "([^"]+)"/g)].map((m) => m[1])
    expect(patterns(reversed)).toEqual(patterns(forward))
  })

  it('an exact static route precedes a catch-all that also matches it', () => {
    expect(compareApiRoutePatterns('/api/a', '/api/a/:rest*')).toBeLessThan(0)
    expect(compareApiRoutePatterns('/api/:id', '/api/new')).toBeGreaterThan(0)
  })
})
