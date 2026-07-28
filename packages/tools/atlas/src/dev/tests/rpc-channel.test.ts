/**
 * The `atlas dev` RPC channel.
 *
 * Tested through the plugin's own middleware with fake req/res objects, because
 * the bug worth guarding is in the RESPONSE path, not in any method: an async
 * method's Promise was stringified directly, so the channel answered
 * `{"ok":true,"result":{}}` — a successful-looking response carrying nothing.
 */
import { describe, expect, it } from 'vitest'
import { atlasDevPlugin, RPC_PATH } from '../plugin'

/** Minimal req/res doubles matching what the middleware touches. */
function invoke(
  methods: Record<string, (p: Record<string, unknown>) => unknown | Promise<unknown>>,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [], methods })
  let handler: ((req: unknown, res: unknown, next: () => void) => void) | undefined
  plugin.configureServer({
    middlewares: {
      use: (path, fn) => {
        if (path === RPC_PATH) handler = fn
      },
    },
  })
  if (!handler) throw new Error('middleware not registered')

  return new Promise((resolveOuter) => {
    const listeners: Record<string, (chunk?: unknown) => void> = {}
    const req = {
      method: 'POST',
      on: (event: string, cb: (chunk?: unknown) => void) => {
        listeners[event] = cb
      },
    }
    const res = {
      statusCode: 0,
      setHeader: () => {},
      end: (payload: string) => resolveOuter({ status: res.statusCode, body: JSON.parse(payload) }),
    }
    handler!(req, res, () => resolveOuter({ status: 0, body: null }))
    listeners.data?.(JSON.stringify(body))
    listeners.end?.()
  })
}

describe('async methods', () => {
  it('AWAITS an async method rather than serialising its Promise', async () => {
    // The regression: `JSON.stringify({ result: fn(params) })` on a Promise
    // yields `{}`, so the caller receives `ok: true` with an empty result and
    // no indication anything went wrong. The Lens was the first async method
    // and surfaced it immediately.
    const out = await invoke(
      { slow: async () => ({ real: 'data' }) },
      { method: 'slow' },
    )
    expect(out.body).toEqual({ ok: true, result: { real: 'data' } })
  })

  it('still handles a synchronous method', async () => {
    const out = await invoke({ quick: () => 42 }, { method: 'quick' })
    expect(out.body).toEqual({ ok: true, result: 42 })
  })

  it('reports a REJECTED async method instead of taking the server down', async () => {
    const out = await invoke(
      {
        boom: async () => {
          throw new Error('nope')
        },
      },
      { method: 'boom' },
    )
    expect(out.status).toBe(500)
    expect((out.body as { ok: boolean; error: string }).ok).toBe(false)
    expect((out.body as { error: string }).error).toContain('nope')
  })

  it('names the known methods when one is misspelled', async () => {
    const out = await invoke({ alpha: () => 1 }, { method: 'alfa' })
    expect(out.status).toBe(404)
    const error = (out.body as { error: string }).error
    // A typo should be a one-step fix, not a hunt through the source.
    expect(error).toContain('alpha')
    expect(error).toContain('Known:')
  })

  it('survives a malformed body', async () => {
    const plugin = atlasDevPlugin({ root: '/p', scanRoot: '/p/src', entries: [] })
    let handler: ((req: unknown, res: unknown, next: () => void) => void) | undefined
    plugin.configureServer({
      middlewares: {
        use: (path, fn) => {
          if (path === RPC_PATH) handler = fn
        },
      },
    })
    const result = await new Promise<{ status: number }>((resolveOuter) => {
      const listeners: Record<string, (chunk?: unknown) => void> = {}
      const req = { method: 'POST', on: (e: string, cb: (c?: unknown) => void) => { listeners[e] = cb } }
      const res = {
        statusCode: 0,
        setHeader: () => {},
        end: () => resolveOuter({ status: res.statusCode }),
      }
      handler!(req, res, () => resolveOuter({ status: 0 }))
      listeners.data?.('{ not json')
      listeners.end?.()
    })
    expect(result.status).toBe(500)
  })
})
