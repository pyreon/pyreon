// @vitest-environment node
/**
 * Phase 2 — `wirePerRouteModes` runtime dispatch. Locks the contract:
 *
 *   - NO divergent declarations → returns the plain app-level handler
 *     (the zero-change path; under app 'isr' that's the SWR cache wrap).
 *   - 'spa' route → CSR shell (built template, placeholders blanked),
 *     GET-only, no server render; falls back to SSR without a template.
 *   - 'isr' route under app 'ssr' → SWR-cached (second hit served from
 *     cache, base handler invoked once).
 *   - 'ssr' route under app 'isr' → cache BYPASS (every hit renders).
 *   - 'ssg' route → base handler (the static layer upstream owns the
 *     fast path; the handler is the graceful fallback).
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { describe, expect, it } from 'vitest'
import { wirePerRouteModes } from '../entry-server'

const C: ComponentFn = () => h('div', null, 'x')

const TEMPLATE = `<!doctype html><html><head><!--pyreon-head--></head><body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--><script type="module" src="/assets/index-abc.js"></script></body></html>`

function makeBase() {
  let calls = 0
  const handler = async (req: Request) => {
    calls++
    return new Response(`rendered:${new URL(req.url).pathname}:${calls}`, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  }
  return { handler, count: () => calls }
}

function routesWith(modes: Record<string, string | undefined>): RouteRecord[] {
  return Object.entries(modes).map(
    ([path, mode]) =>
      ({
        path,
        component: C,
        ...(mode ? { meta: { renderMode: mode } } : {}),
      }) as RouteRecord,
  )
}

describe('wirePerRouteModes', () => {
  it('no divergent declarations → app-level behavior unchanged (ssr passthrough)', async () => {
    const { handler, count } = makeBase()
    const wired = wirePerRouteModes('ssr', handler, {}, routesWith({ '/a': undefined }), TEMPLATE)
    const res = await wired(new Request('http://x/a'))
    expect(await res.text()).toBe('rendered:/a:1')
    expect(count()).toBe(1)
  })

  it("'spa' route gets the CSR shell — no server render, placeholders blanked", async () => {
    const { handler, count } = makeBase()
    const wired = wirePerRouteModes(
      'ssr',
      handler,
      {},
      routesWith({ '/dash': 'spa', '/a': undefined }),
      TEMPLATE,
    )
    const res = await wired(new Request('http://x/dash'))
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body).not.toContain('<!--pyreon-app-->')
    expect(body).not.toContain('rendered:')
    expect(body).toContain('/assets/index-abc.js') // hashed entry survives
    expect(count()).toBe(0) // base handler never invoked
    // Non-'spa' routes still render.
    const other = await wired(new Request('http://x/a'))
    expect(await other.text()).toContain('rendered:/a')
  })

  it("'spa' route WITHOUT a built template falls back to SSR (graceful)", async () => {
    const { handler, count } = makeBase()
    const wired = wirePerRouteModes(
      'ssr',
      handler,
      {},
      routesWith({ '/dash': 'spa' }),
      undefined,
    )
    const res = await wired(new Request('http://x/dash'))
    expect(await res.text()).toContain('rendered:/dash')
    expect(count()).toBe(1)
  })

  it("'spa' shell is GET-only — POST falls through to the handler chain", async () => {
    const { handler } = makeBase()
    const wired = wirePerRouteModes(
      'ssr',
      handler,
      {},
      routesWith({ '/dash': 'spa' }),
      TEMPLATE,
    )
    const res = await wired(new Request('http://x/dash', { method: 'POST' }))
    // The base handler decides what POST means (405 in production; the
    // stub renders) — the point is the shell didn't swallow it.
    expect(await res.text()).toContain('rendered:/dash')
  })

  it("'isr' route under app 'ssr' is SWR-cached (one render, second hit cached)", async () => {
    const { handler, count } = makeBase()
    const wired = wirePerRouteModes(
      'ssr',
      handler,
      { isr: { revalidate: 60 } },
      routesWith({ '/pricing': 'isr', '/a': undefined }),
      TEMPLATE,
    )
    const first = await (await wired(new Request('http://x/pricing'))).text()
    const second = await (await wired(new Request('http://x/pricing'))).text()
    expect(first).toBe(second) // cache hit — same body
    expect(count()).toBe(1) // rendered exactly once
    // Undeclared route stays uncached SSR.
    await wired(new Request('http://x/a'))
    await wired(new Request('http://x/a'))
    expect(count()).toBe(3)
  })

  it("'ssr' route under app 'isr' BYPASSES the cache (every hit renders)", async () => {
    const { handler, count } = makeBase()
    const wired = wirePerRouteModes(
      'isr',
      handler,
      { isr: { revalidate: 60 } },
      routesWith({ '/live': 'ssr', '/a': undefined }),
      TEMPLATE,
    )
    const a = await (await wired(new Request('http://x/live'))).text()
    const b = await (await wired(new Request('http://x/live'))).text()
    expect(a).not.toBe(b) // fresh render each time
    expect(count()).toBe(2)
    // Undeclared route under app 'isr' IS cached.
    const c1 = await (await wired(new Request('http://x/a'))).text()
    const c2 = await (await wired(new Request('http://x/a'))).text()
    expect(c1).toBe(c2)
    expect(count()).toBe(3)
  })

  it("'ssg' route reaching the handler falls back to SSR (file-missing grace)", async () => {
    const { handler, count } = makeBase()
    const wired = wirePerRouteModes(
      'ssr',
      handler,
      {},
      routesWith({ '/about': 'ssg' }),
      TEMPLATE,
    )
    const res = await wired(new Request('http://x/about'))
    expect(await res.text()).toContain('rendered:/about')
    expect(count()).toBe(1)
  })
})
