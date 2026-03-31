import { describe, expect, it } from 'vitest'
import { compose, getContext } from '../middleware'

function createMockCtx(overrides: Partial<{ path: string }> = {}) {
  const path = overrides.path ?? '/'
  const url = new URL(`http://localhost${path}`)
  return {
    req: new Request(url),
    url,
    path,
    headers: new Headers(),
    locals: {} as Record<string, unknown>,
  }
}

// ─── compose ────────────────────────────────────────────────────────────────

describe('compose', () => {
  it('runs middleware in order', async () => {
    const order: number[] = []
    const mw1 = () => {
      order.push(1)
    }
    const mw2 = () => {
      order.push(2)
    }
    const mw3 = () => {
      order.push(3)
    }

    const combined = compose(mw1, mw2, mw3)
    await combined(createMockCtx())
    expect(order).toEqual([1, 2, 3])
  })

  it('short-circuits when middleware returns a Response', async () => {
    const order: number[] = []
    const mw1 = () => {
      order.push(1)
    }
    const mw2 = () => {
      order.push(2)
      return new Response('blocked', { status: 403 })
    }
    const mw3 = () => {
      order.push(3)
    }

    const combined = compose(mw1, mw2, mw3)
    const result = await combined(createMockCtx())
    expect(order).toEqual([1, 2])
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
  })

  it('returns void when all middleware return void', async () => {
    const mw1 = () => {}
    const mw2 = () => {}
    const combined = compose(mw1, mw2)
    const result = await combined(createMockCtx())
    expect(result).toBeUndefined()
  })

  it('handles async middleware', async () => {
    const order: number[] = []
    const mw1 = async () => {
      await Promise.resolve()
      order.push(1)
    }
    const mw2 = async () => {
      await Promise.resolve()
      order.push(2)
    }

    const combined = compose(mw1, mw2)
    await combined(createMockCtx())
    expect(order).toEqual([1, 2])
  })

  it('handles empty middleware list', async () => {
    const combined = compose()
    const result = await combined(createMockCtx())
    expect(result).toBeUndefined()
  })

  it('passes the same ctx to all middleware', async () => {
    const seen: unknown[] = []
    const mw1 = (ctx: unknown) => {
      seen.push(ctx)
    }
    const mw2 = (ctx: unknown) => {
      seen.push(ctx)
    }

    const ctx = createMockCtx()
    const combined = compose(mw1, mw2)
    await combined(ctx)
    expect(seen[0]).toBe(ctx)
    expect(seen[1]).toBe(ctx)
  })

  it('middleware can set headers for downstream', async () => {
    const mw1 = (ctx: { headers: Headers }) => {
      ctx.headers.set('X-First', 'yes')
    }
    const mw2 = (ctx: { headers: Headers }) => {
      ctx.headers.set('X-Second', ctx.headers.get('X-First') ?? 'no')
    }

    const ctx = createMockCtx()
    await compose(mw1, mw2)(ctx)
    expect(ctx.headers.get('X-First')).toBe('yes')
    expect(ctx.headers.get('X-Second')).toBe('yes')
  })
})

// ─── getContext ──────────────────────────────────────────────────────────────

describe('getContext', () => {
  it('returns an empty object on first access', () => {
    const ctx = createMockCtx()
    const zctx = getContext(ctx)
    expect(zctx).toEqual({})
  })

  it('returns the same object on subsequent accesses', () => {
    const ctx = createMockCtx()
    const first = getContext(ctx)
    first.userId = '123'
    const second = getContext(ctx)
    expect(second.userId).toBe('123')
    expect(second).toBe(first)
  })

  it('isolates context per request', () => {
    const ctx1 = createMockCtx()
    const ctx2 = createMockCtx()
    getContext(ctx1).value = 'a'
    getContext(ctx2).value = 'b'
    expect(getContext(ctx1).value).toBe('a')
    expect(getContext(ctx2).value).toBe('b')
  })

  it('works with compose for cross-middleware communication', async () => {
    const mw1 = (ctx: { locals: Record<string, unknown> }) => {
      getContext(ctx as ReturnType<typeof createMockCtx>).authUser = 'admin'
    }
    const mw2 = (ctx: { locals: Record<string, unknown> }) => {
      const user = getContext(ctx as ReturnType<typeof createMockCtx>).authUser
      if (user !== 'admin') return new Response('Forbidden', { status: 403 })
    }

    const ctx = createMockCtx()
    const result = await compose(mw1, mw2)(ctx)
    expect(result).toBeUndefined() // no short-circuit — admin passed
  })

  it('does not overwrite existing locals', () => {
    const ctx = createMockCtx()
    ctx.locals.myValue = 'preserved'
    getContext(ctx)
    expect(ctx.locals.myValue).toBe('preserved')
  })
})
