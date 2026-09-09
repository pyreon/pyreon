// @vitest-environment node
/**
 * `prerender` when a route handler misbehaves.
 *
 * A static build renders every route through one handler. If a single bad
 * route can abort the run, a CMS slug that trips a component takes the
 * whole site's build down with it and the operator gets one stack trace
 * instead of "these three pages failed". The driver's per-path try/catch
 * is what turns that into a partial build plus a named error list, and the
 * existing tests only ever cover a handler that returns a non-ok RESPONSE
 * — never one that throws.
 *
 * The timer guard is the other half. Each render races the handler against
 * a 30s timeout, and the timer id is captured OUTSIDE the race so the
 * success path can clear it (leak class I — without it every successful
 * prerender leaks a pending 30s timer plus its reject closure, and a
 * 10,000-page build holds 10,000 of them). A handler that throws
 * SYNCHRONOUSLY is the one shape where the timer was never created at all,
 * because `handler(req)` is evaluated before the timeout promise is
 * constructed — so the cleanup has to tolerate an id that does not exist.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { prerender } from '../ssg'

let outDir: string
const tmp = async (): Promise<string> => {
  outDir = await mkdtemp(join(tmpdir(), 'pyreon-prerender-'))
  return outDir
}

afterEach(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true })
})

const okPage = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })

describe('one bad route does not sink the build', () => {
  test('a handler that throws SYNCHRONOUSLY is recorded, and the other pages still render', async () => {
    // The shape where the timeout timer is never constructed: `handler(req)`
    // is evaluated before the racing promise, so the cleanup runs with no
    // id. What this pins is the driver's per-path catch — without it the
    // synchronous throw escapes `Promise.all` and abandons the rest of the
    // build with one stack trace instead of a named error list.
    const dir = await tmp()
    const handler = (req: Request): Promise<Response> => {
      if (new URL(req.url).pathname === '/boom') throw new Error('component blew up at import')
      return Promise.resolve(okPage('<h1>fine</h1>'))
    }

    const result = await prerender({ handler, paths: ['/', '/boom', '/about'], outDir: dir })

    expect(result.pages, 'the healthy pages must still be written').toBe(2)
    expect(result.errors, 'and the bad one recorded, not thrown').toHaveLength(1)
    expect(result.errors[0]!.path).toBe('/boom')
    expect((result.errors[0]!.error as Error).message).toContain('component blew up')
  })

  test('a handler that REJECTS is recorded the same way', async () => {
    // The async twin — here the timer DOES exist and must be cleared on
    // the rejection path too, which is why the clear lives in `finally`
    // rather than after the await.
    const dir = await tmp()
    const handler = async (req: Request): Promise<Response> => {
      if (new URL(req.url).pathname === '/db') throw new Error('db unreachable')
      return okPage('<h1>fine</h1>')
    }

    const result = await prerender({ handler, paths: ['/', '/db'], outDir: dir })
    expect(result.pages).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect((result.errors[0]!.error as Error).message).toContain('db unreachable')
  })

  test('every failing path is reported, not just the first', async () => {
    // A build that stops naming failures after the first one costs the
    // operator a full rebuild per bad route.
    const dir = await tmp()
    const handler = async (req: Request): Promise<Response> => {
      const p = new URL(req.url).pathname
      if (p.startsWith('/bad')) throw new Error(`nope ${p}`)
      return okPage('<h1>ok</h1>')
    }

    const result = await prerender({
      handler,
      paths: ['/bad1', '/good', '/bad2', '/bad3'],
      outDir: dir,
    })
    expect(result.pages).toBe(1)
    expect(result.errors.map((e) => e.path).sort()).toEqual(['/bad1', '/bad2', '/bad3'])
  })

  test('failures SPANNING the concurrency batch boundary are all recorded', async () => {
    // Paths run in batches of 10 with an `await Promise.all` between them.
    // A rejection that escaped its batch would reject that `Promise.all`
    // and abandon every later batch — so the per-path catch has to sit
    // INSIDE the map, and a 12-path run with a thrower in each batch is
    // what distinguishes the two placements.
    const dir = await tmp()
    const paths = Array.from({ length: 12 }, (_, i) => `/p${i}`)
    const handler = async (req: Request): Promise<Response> => {
      const p = new URL(req.url).pathname
      if (p === '/p0' || p === '/p11') throw new Error(`bad ${p}`)
      return okPage('<h1>ok</h1>')
    }

    const result = await prerender({ handler, paths, outDir: dir })
    expect(result.pages, 'the second batch must still run').toBe(10)
    expect(result.errors.map((e) => e.path).sort()).toEqual(['/p0', '/p11'])
  })
})

describe('the prerender timer is cleared on every exit path', () => {
  const liveTimers = (): number =>
    process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length

  test('a successful run leaves no pending 30s timer per page', async () => {
    // Leak class I. `clearTimeout` on success is not visible in the result,
    // so this observes the runtime directly. NOTE the API matters:
    // `process._getActiveHandles()` does NOT report timers at all, so a
    // version of this spec written against it passes with the clear
    // removed — vacuous. `getActiveResourcesInfo()` does report them, and
    // dropping the clear fails this spec with 3 extra live timers.
    const dir = await tmp()
    const handler = async (): Promise<Response> => okPage('<h1>ok</h1>')

    const before = liveTimers()
    await prerender({ handler, paths: ['/a', '/b', '/c'], outDir: dir })

    expect(liveTimers(), 'three renders must not leave three live timers').toBe(before)
  })

  test('a REJECTING handler clears its timer too', async () => {
    // The clear lives in `finally` rather than after the await precisely
    // so the failure path is covered — and a build full of failing routes
    // is exactly when the pending timers would pile up.
    const dir = await tmp()
    const handler = async (): Promise<Response> => {
      throw new Error('always fails')
    }

    const before = liveTimers()
    const result = await prerender({ handler, paths: ['/a', '/b'], outDir: dir })

    expect(result.errors).toHaveLength(2)
    expect(liveTimers(), 'a failed render must not leak its timeout').toBe(before)
  })
})
