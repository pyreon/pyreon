import { h } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import { createHandler, REMOTE_ADDRESS } from '../handler'
import { buildScriptsFast } from '../html'
import type { Middleware } from '../middleware'

const App = () => h(RouterView, null)
const routes = [{ path: '/', component: () => h('p', null, 'page') }]

describe('createHandler — REMOTE_ADDRESS', () => {
  it('copies the adapter-supplied socket address onto ctx.locals.remoteAddress', async () => {
    let seen: unknown = 'unset'
    const probe: Middleware = (ctx) => {
      seen = ctx.locals.remoteAddress
    }
    const handler = createHandler({ App, routes, middleware: [probe] })
    const req = new Request('http://localhost/')
    ;(req as unknown as Record<symbol, unknown>)[REMOTE_ADDRESS] = '203.0.113.7'
    await handler(req)
    expect(seen).toBe('203.0.113.7')
  })

  it('leaves remoteAddress unset when no adapter supplied one (or it is empty)', async () => {
    const seen: unknown[] = []
    const probe: Middleware = (ctx) => {
      seen.push('remoteAddress' in ctx.locals)
    }
    const handler = createHandler({ App, routes, middleware: [probe] })
    await handler(new Request('http://localhost/'))
    const empty = new Request('http://localhost/')
    ;(empty as unknown as Record<symbol, unknown>)[REMOTE_ADDRESS] = ''
    await handler(empty)
    expect(seen).toEqual([false, false])
  })
})

describe('createHandler — a throwing middleware', () => {
  it('costs the request a 500 and logs it, instead of rejecting', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const boom: Middleware = () => {
        throw new Error('bad body')
      }
      const handler = createHandler({ App, routes, middleware: [boom] })
      const res = await handler(new Request('http://localhost/api/x'))
      expect(res.status).toBe(500)
      expect(await res.text()).toBe('Internal Server Error')
      expect(err).toHaveBeenCalledWith('[Pyreon] Middleware failed for /api/x:', expect.any(Error))
    } finally {
      err.mockRestore()
    }
  })
})

describe('buildScriptsFast — nonce', () => {
  it('puts a sanitized nonce on the loader-data script', () => {
    const out = buildScriptsFast('<script src="/e.js"></script>', { '/': { a: 1 } }, 'ab"c<d> e')
    expect(out).toContain('<script nonce="abcde">window.__PYREON_LOADER_DATA__=')
  })

  it('omits the attribute when the nonce sanitizes to empty or is absent', () => {
    expect(buildScriptsFast('X', { '/': 1 }, '"<>')).toContain('<script>window.__PYREON_LOADER_DATA__=')
    expect(buildScriptsFast('X', { '/': 1 })).toContain('<script>window.__PYREON_LOADER_DATA__=')
  })
})
