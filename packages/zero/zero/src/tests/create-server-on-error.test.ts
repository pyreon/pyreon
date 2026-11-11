import type { ServerErrorInfo } from '@pyreon/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _defineActionWithId, _resetActions } from '../actions'
import { createServer } from '../entry-server'

// `createServer({ onError })` reaches every server error site zero owns:
// API routes / middleware, the SSR render, and server actions — which catch
// their own errors, so without the forwarding in `runActionHandler` the hook
// never saw a failed action.
describe('createServer — onError', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
    _resetActions()
  })

  const home = () => 'home' as unknown as ReturnType<typeof import('@pyreon/core').h>

  function server(seen: Array<{ error: unknown; info: ServerErrorInfo }>) {
    return createServer({
      routes: [
        { path: '/', component: home },
      ],
      config: { mode: 'ssr', ssr: { mode: 'string' } },
      apiRoutes: [
        {
          pattern: '/api/fail',
          module: {
            GET: () => {
              throw new Error('api failed')
            },
          },
        },
      ],
      onError: (error, info) => void seen.push({ error, info }),
    })
  }

  it('reports a throwing server action with phase "action"', async () => {
    const seen: Array<{ error: unknown; info: ServerErrorInfo }> = []
    const handler = server(seen)
    _defineActionWithId('action_boom', async () => {
      throw new Error('action failed')
    })
    const res = await handler(
      new Request('http://localhost/_zero/actions/action_boom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(500)
    expect(seen.map((s) => [s.info.phase, (s.error as Error).message])).toEqual([['action', 'action failed']])
  })

  it('reports a throwing API route with phase "middleware"', async () => {
    const seen: Array<{ error: unknown; info: ServerErrorInfo }> = []
    const res = await server(seen)(new Request('http://localhost/api/fail'))
    expect(res.status).toBe(500)
    expect(seen.map((s) => [s.info.phase, (s.error as Error).message])).toEqual([['middleware', 'api failed']])
  })

  it('does not report a successful request', async () => {
    const seen: Array<{ error: unknown; info: ServerErrorInfo }> = []
    const res = await server(seen)(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    expect(seen).toEqual([])
  })
})
