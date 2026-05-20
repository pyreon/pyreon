import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetActions,
  createActionMiddleware,
  defineAction,
  getRegisteredActions,
} from '../actions'

beforeEach(() => {
  _resetActions()
})

describe('defineAction', () => {
  it('registers an action in the registry', () => {
    defineAction(async () => ({ ok: true }))
    expect(getRegisteredActions().size).toBe(1)
  })

  it('assigns unique IDs', () => {
    const a = defineAction(async () => 'a')
    const b = defineAction(async () => 'b')
    expect(a.actionId).not.toBe(b.actionId)
  })

  it('returns a callable with actionId', () => {
    const action = defineAction(async () => 42)
    expect(typeof action).toBe('function')
    expect(action.actionId).toMatch(/^action_[a-f0-9]+$/)
  })
})

describe('createActionMiddleware', () => {
  it('returns undefined for non-action paths', async () => {
    const mw = createActionMiddleware()
    const ctx = mockCtx('/about', 'GET')
    const result = await mw(ctx)
    expect(result).toBeUndefined()
  })

  it('returns 404 for unknown action ID', async () => {
    const mw = createActionMiddleware()
    const ctx = mockCtx('/_zero/actions/unknown', 'POST')
    const result = await mw(ctx)
    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(404)
  })

  it('returns 405 for non-POST requests', async () => {
    defineAction(async () => 'ok')
    const mw = createActionMiddleware()
    const actionId = getRegisteredActions().keys().next().value
    const ctx = mockCtx(`/_zero/actions/${actionId}`, 'GET')
    const result = await mw(ctx)
    expect(result?.status).toBe(405)
  })

  it('executes action and returns JSON result', async () => {
    const action = defineAction(async (ctx) => {
      const data = ctx.json as { x: number }
      return { doubled: data.x * 2 }
    })
    const mw = createActionMiddleware()
    const ctx = mockCtx(`/_zero/actions/${action.actionId}`, 'POST', JSON.stringify({ x: 5 }))
    const result = await mw(ctx)
    expect(result?.status).toBe(200)
    const body = await result?.json()
    expect(body).toEqual({ doubled: 10 })
  })

  it('returns 500 on action error', async () => {
    const action = defineAction(async () => {
      throw new Error('boom')
    })
    const mw = createActionMiddleware()
    const ctx = mockCtx(`/_zero/actions/${action.actionId}`, 'POST', 'null')
    const result = await mw(ctx)
    expect(result?.status).toBe(500)
    const body = await result?.json()
    expect(body.error).toBe('boom')
  })

  it('logs action runtime errors to console.error with prefix', async () => {
    // Pre-fix the executeAction catch returned 500 to the client but
    // emitted NOTHING to the server logs — operators had no diagnostic
    // info for production crashes inside user-supplied action handlers.
    // Same swallow-error shape as the cloud adapter audit (PR #755).
    const action = defineAction(async () => {
      throw new Error('boom-with-stack')
    })
    const mw = createActionMiddleware()
    const ctx = mockCtx(`/_zero/actions/${action.actionId}`, 'POST', 'null')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await mw(ctx)
      expect(result?.status).toBe(500)
      // Server-side log MUST contain the prefix + the error
      expect(errorSpy).toHaveBeenCalledWith(
        '[Pyreon Action] handler failed:',
        expect.objectContaining({ message: 'boom-with-stack' }),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('returns 400 (not 500) on malformed JSON request body', async () => {
    // Pre-fix `await req.json()` throwing inside the executeAction
    // try-catch returned 500 — conflating client errors (bad payload)
    // with server errors (handler crashed). Now the parse step has its
    // own try-catch and returns 400 with a generic 'Invalid request
    // body' message (not the parser's internal error string — that
    // could leak internals like "Unexpected token ... at position N").
    const action = defineAction(async (ctx) => ctx.json)
    const mw = createActionMiddleware()
    // Build a request with Content-Type: application/json but a body
    // that isn't valid JSON.
    const url = new URL(`http://localhost/_zero/actions/${action.actionId}`)
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const ctx = { req, url, path: url.pathname, headers: new Headers(), locals: {} }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await mw(ctx)
      expect(result?.status).toBe(400)
      const body = await result?.json()
      expect(body.error).toBe('Invalid request body')
      // Server-side log captures the parse error for ops diagnostics
      expect(errorSpy).toHaveBeenCalledWith(
        '[Pyreon Action] failed to parse request body:',
        expect.anything(),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('does NOT leak internal parser error messages to the client', async () => {
    // Defense-in-depth: even if the parser's error message contains
    // sensitive info (e.g. "Unexpected token X in JSON at position
    // <internal offset>" leaks server-side parser state), the
    // client-facing response stays generic.
    const action = defineAction(async () => 'ok')
    const mw = createActionMiddleware()
    const url = new URL(`http://localhost/_zero/actions/${action.actionId}`)
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '\x00\x01\x02junk',
    })
    const ctx = { req, url, path: url.pathname, headers: new Headers(), locals: {} }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await mw(ctx)
      expect(result?.status).toBe(400)
      const body = await result?.json()
      // Generic error message — no parser internals leaked
      expect(body.error).toBe('Invalid request body')
      expect(body.error).not.toMatch(/position|token|offset/i)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('defineAction — server-side execution', () => {
  it('executes handler directly on server (no fetch)', async () => {
    // In test env (Node/Bun), globalThis.window is undefined → server mode
    const action = defineAction(async (ctx) => {
      const data = ctx.json as { x: number }
      return { result: data.x + 1 }
    })

    const result = await action({ x: 10 })
    expect(result).toEqual({ result: 11 })
  })

  it('passes null json when called without data', async () => {
    const action = defineAction(async (ctx) => {
      return { received: ctx.json }
    })

    const result = await action()
    expect(result).toEqual({ received: null })
  })

  it('propagates errors on server-side execution', async () => {
    const action = defineAction(async () => {
      throw new Error('server error')
    })

    await expect(action()).rejects.toThrow('server error')
  })
})

function mockCtx(path: string, method: string, body?: string) {
  const url = new URL(`http://localhost${path}`)
  const req = new Request(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ?? undefined,
  })
  return {
    req,
    url,
    path,
    headers: new Headers(),
    locals: {},
  }
}
