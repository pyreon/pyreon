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
    // PR-S2: full UUID (128 bits). Previously sliced to 32 bits, which gave
    // birthday-collision probability at ~65k actions.
    expect(action.actionId).toMatch(/^action_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
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

function mockCtx(path: string, method: string, body?: string, headers?: Record<string, string>) {
  const url = new URL(`http://localhost${path}`)
  const reqHeaders: Record<string, string> = {}
  if (body) reqHeaders['Content-Type'] = 'application/json'
  if (headers) Object.assign(reqHeaders, headers)
  const req = new Request(url.toString(), {
    method,
    headers: reqHeaders,
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

// ─── PR-S2: server-action security regression ────────────────────────────────
//
// Bisect-verify: revert actions.ts:70 + the Origin check → these tests fail
// (collision test fails by finding duplicates within 1k IDs; CSRF tests fail
// by accepting the cross-origin POST).

describe('PR-S2: defineAction full-UUID regression (no collision in 1k samples)', () => {
  beforeEach(() => {
    _resetActions()
  })

  it('generates collision-free IDs across 1000 actions', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const a = defineAction(async () => i)
      expect(ids.has(a.actionId)).toBe(false)
      ids.add(a.actionId)
    }
    expect(ids.size).toBe(1000)
  })
})

describe('PR-S2: createActionMiddleware CSRF baseline (Origin / Referer same-origin check)', () => {
  beforeEach(() => {
    _resetActions()
  })

  it('ALLOWS same-origin POST (Origin === request.url origin)', async () => {
    const action = defineAction(async () => ({ ok: true }))
    const mw = createActionMiddleware()
    const ctx = mockCtx(
      `/_zero/actions/${action.actionId}`,
      'POST',
      'null',
      { Origin: 'http://localhost' },
    )
    const res = await mw(ctx as never)
    expect(res?.status).toBe(200)
    const body = await res!.json()
    expect(body).toEqual({ ok: true })
  })

  it('REJECTS cross-origin POST without corsOrigins opt-in (403)', async () => {
    const action = defineAction(async () => ({ ok: true }))
    const mw = createActionMiddleware()
    const ctx = mockCtx(
      `/_zero/actions/${action.actionId}`,
      'POST',
      'null',
      { Origin: 'https://malicious.test' },
    )
    const res = await mw(ctx as never)
    expect(res?.status).toBe(403)
    const body = (await res!.json()) as { error: string; origin: string }
    expect(body.error).toContain('Origin not allowed')
    expect(body.origin).toBe('https://malicious.test')
  })

  it('ALLOWS cross-origin POST when origin matches corsOrigins opt-in', async () => {
    const action = defineAction(async () => ({ ok: true }))
    const mw = createActionMiddleware({ corsOrigins: ['https://admin.example.com'] })
    const ctx = mockCtx(
      `/_zero/actions/${action.actionId}`,
      'POST',
      'null',
      { Origin: 'https://admin.example.com' },
    )
    const res = await mw(ctx as never)
    expect(res?.status).toBe(200)
  })

  it('REJECTS cross-origin POST when origin does NOT match any corsOrigins entry', async () => {
    const action = defineAction(async () => ({ ok: true }))
    const mw = createActionMiddleware({ corsOrigins: ['https://admin.example.com'] })
    const ctx = mockCtx(
      `/_zero/actions/${action.actionId}`,
      'POST',
      'null',
      { Origin: 'https://other.example.com' },
    )
    const res = await mw(ctx as never)
    expect(res?.status).toBe(403)
  })

  it('ALLOWS POST with no Origin / Referer (server-to-server, integration tests)', async () => {
    // Same-origin browser fetch() without credentials AND server-to-server
    // tooling (curl, integration tests) often omit Origin. The CSRF baseline
    // is "did this come from a browser tab on an attacker's origin?" — not
    // "is this an authenticated user?" That's the auth layer's job.
    const action = defineAction(async () => ({ ok: true }))
    const mw = createActionMiddleware()
    const ctx = mockCtx(`/_zero/actions/${action.actionId}`, 'POST', 'null')
    const res = await mw(ctx as never)
    expect(res?.status).toBe(200)
  })

  it('Referer header used when Origin is absent (older browsers / form POSTs)', async () => {
    const action = defineAction(async () => ({ ok: true }))
    const mw = createActionMiddleware()
    const ctx = mockCtx(
      `/_zero/actions/${action.actionId}`,
      'POST',
      'null',
      { Referer: 'https://malicious.test/some/page' },
    )
    const res = await mw(ctx as never)
    expect(res?.status).toBe(403)
  })
})
