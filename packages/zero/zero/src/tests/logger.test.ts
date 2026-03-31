import { describe, expect, it, vi } from 'vitest'
import { loggerMiddleware } from '../logger'

describe('loggerMiddleware', () => {
  it('returns a middleware function', () => {
    const mw = loggerMiddleware()
    expect(typeof mw).toBe('function')
  })

  it('returns no-op when level is none', () => {
    const mw = loggerMiddleware({ level: 'none' })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mw({ req: new Request('http://localhost/test'), path: '/test', headers: new Headers(), locals: {} } as any)
    // queueMicrotask is async, but with level=none it's a no-op function
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('skips internal paths', async () => {
    const mw = loggerMiddleware({ colors: false })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mw({ req: new Request('http://localhost/__vite'), path: '/__vite', headers: new Headers(), locals: {} } as any)
    mw({ req: new Request('http://localhost/@fs'), path: '/@fs', headers: new Headers(), locals: {} } as any)

    // Wait for microtask
    await new Promise((r) => setTimeout(r, 10))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('logs regular requests', async () => {
    const mw = loggerMiddleware({ colors: false })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mw({
      req: new Request('http://localhost/api/users'),
      path: '/api/users',
      headers: new Headers(),
      locals: {},
    } as any)

    await new Promise((r) => setTimeout(r, 10))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toContain('/api/users')
    expect(spy.mock.calls[0]?.[0]).toContain('GET')
    spy.mockRestore()
  })

  it('uses custom format', async () => {
    const format = vi.fn((entry: any) => `${entry.method} ${entry.path}`)
    const mw = loggerMiddleware({ format })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mw({
      req: new Request('http://localhost/test', { method: 'POST' }),
      path: '/test',
      headers: new Headers(),
      locals: {},
    } as any)

    await new Promise((r) => setTimeout(r, 10))
    expect(format).toHaveBeenCalled()
    expect(spy.mock.calls[0]?.[0]).toBe('POST /test')
    spy.mockRestore()
  })

  it('skips log when format returns null', async () => {
    const mw = loggerMiddleware({ format: () => null })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mw({
      req: new Request('http://localhost/test'),
      path: '/test',
      headers: new Headers(),
      locals: {},
    } as any)

    await new Promise((r) => setTimeout(r, 10))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('respects custom skip paths', async () => {
    const mw = loggerMiddleware({ skip: ['/health'], colors: false })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mw({ req: new Request('http://localhost/health'), path: '/health', headers: new Headers(), locals: {} } as any)

    await new Promise((r) => setTimeout(r, 10))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
