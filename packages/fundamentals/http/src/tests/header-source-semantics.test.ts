import { describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import type { Transport } from '../types'

/**
 * The client folds its leading run of STATIC header sources once and memoizes
 * the result. That is a real, observable semantic — a caller passing a mutable
 * record sees the captured value, not the current one — and it shipped with no
 * test in either direction. These specs pin it so the behaviour is a decision
 * rather than an artefact of the fold, and so nobody "fixes" the fold into an
 * eager or a per-request one without deciding to change the contract.
 *
 * The semantic is the module's own immutability rule (see the `client.ts`
 * docblock: no `client.defaults.headers.common.X = …`, because a shared
 * mutable default leaks one request's header into a concurrent one under SSR).
 * A FUNCTION source is the supported seam for a per-request value.
 */
function recorder(): { seen: string[]; transport: Transport } {
  const seen: string[] = []
  const transport = (async (req: { headers: Headers }) => {
    seen.push(req.headers.get('x-token') ?? '(none)')
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as Transport
  return { seen, transport }
}

describe('header sources — static is captured, function is per-request', () => {
  it('a STATIC record is captured: mutating it after the first request changes nothing', async () => {
    const { seen, transport } = recorder()
    const mutable: Record<string, string> = { 'x-token': 'first' }
    const http = createHttp({ baseUrl: 'https://x.test', headers: mutable, transport })

    await http.get('/a')
    mutable['x-token'] = 'second'
    await http.get('/b')
    mutable['x-token'] = 'third'
    await http.get('/c')

    expect(seen).toEqual(['first', 'first', 'first'])
  })

  it('a FUNCTION source IS re-evaluated per request — the documented seam', async () => {
    const { seen, transport } = recorder()
    let token = 'first'
    const http = createHttp({
      baseUrl: 'https://x.test',
      headers: () => ({ 'x-token': token }),
      transport,
    })

    await http.get('/a')
    token = 'second'
    await http.get('/b')

    expect(seen).toEqual(['first', 'second'])
  })

  it('the capture point is the FIRST REQUEST, not createHttp (the fold is lazy)', async () => {
    const { seen, transport } = recorder()
    const mutable: Record<string, string> = { 'x-token': 'at-construction' }
    const http = createHttp({ baseUrl: 'https://x.test', headers: mutable, transport })

    // Nothing has been sent yet, so this mutation IS still picked up.
    mutable['x-token'] = 'before-first-request'
    await http.get('/a')
    // This one is not — the fold has run.
    mutable['x-token'] = 'after-first-request'
    await http.get('/b')

    expect(seen).toEqual(['before-first-request', 'before-first-request'])
  })

  it('a per-call `options.headers` always wins, and is never captured', async () => {
    const { seen, transport } = recorder()
    const http = createHttp({
      baseUrl: 'https://x.test',
      headers: { 'x-token': 'client-level' },
      transport,
    })

    await http.get('/a')
    await http.get('/b', { headers: { 'x-token': 'per-call' } })
    await http.get('/c')

    expect(seen).toEqual(['client-level', 'per-call', 'client-level'])
  })

  it('extend() re-folds: a static source added by the child is captured on its own first request', async () => {
    const { seen, transport } = recorder()
    const parent = createHttp({ baseUrl: 'https://x.test', headers: { 'x-token': 'parent' }, transport })
    const child = parent.extend({ headers: { 'x-token': 'child' } })

    await parent.get('/a')
    await child.get('/b')
    await parent.get('/c')

    // Later sources override earlier keys; the two clients fold independently.
    expect(seen).toEqual(['parent', 'child', 'parent'])
  })

  it('a function source after a static one still applies LAST (fold order is preserved)', async () => {
    const { seen, transport } = recorder()
    let dyn = 'dynamic-1'
    const http = createHttp({ baseUrl: 'https://x.test', headers: { 'x-token': 'static' }, transport })
      .extend({ headers: () => ({ 'x-token': dyn }) })

    await http.get('/a')
    dyn = 'dynamic-2'
    await http.get('/b')

    expect(seen).toEqual(['dynamic-1', 'dynamic-2'])
  })
})
