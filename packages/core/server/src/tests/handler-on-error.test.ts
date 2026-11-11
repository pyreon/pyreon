import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { redirect, RouterView } from '@pyreon/router'
import { createHandler } from '../handler'
import type { ServerErrorInfo } from '../middleware'

// `createHandler({ onError })` — the one place an app can forward server
// errors to Sentry / OpenTelemetry. Before it, every server error went only to
// `console.error`, so there was nothing to plug a reporter into.
describe('createHandler — onError', () => {
  const Home: ComponentFn = () => h('div', null, 'home')
  const Boom: ComponentFn = () => {
    throw new Error('render exploded')
  }
  const routes = [
    { path: '/', component: Home },
    { path: '/boom', component: Boom },
  ]
  const App: ComponentFn = () => h(RouterView, null)

  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  const collect = () => {
    const seen: Array<{ error: unknown; info: ServerErrorInfo }> = []
    return { seen, onError: (error: unknown, info: ServerErrorInfo) => void seen.push({ error, info }) }
  }

  test('a throwing middleware is reported with phase "middleware" and the request', async () => {
    const { seen, onError } = collect()
    const failure = new Error('db down')
    const handler = createHandler({
      App,
      routes,
      onError,
      middleware: [
        () => {
          throw failure
        },
      ],
    })
    const req = new Request('http://localhost/api/x')
    const res = await handler(req)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Internal Server Error')
    expect(seen).toHaveLength(1)
    expect(seen[0]!.error).toBe(failure)
    expect(seen[0]!.info.phase).toBe('middleware')
    expect(seen[0]!.info.request).toBe(req)
  })

  test('a failed string-mode render is reported with phase "render"', async () => {
    const { seen, onError } = collect()
    const handler = createHandler({ App, routes, onError })
    const res = await handler(new Request('http://localhost/boom'))
    expect(res.status).toBe(500)
    expect(seen.map((s) => s.info.phase)).toEqual(['render'])
    expect((seen[0]!.error as Error).message).toBe('render exploded')
  })

  test('a failed stream-mode render (before the shell) is reported with phase "render"', async () => {
    const { seen, onError } = collect()
    const handler = createHandler({
      App,
      routes: [{ path: '/', component: Home, loader: () => Promise.reject(new Error('loader exploded')) }],
      mode: 'stream',
      onError,
    })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(500)
    expect(seen.map((s) => [s.info.phase, (s.error as Error).message])).toEqual([['render', 'loader exploded']])
  })

  test('a middleware can report an error it handled itself via ctx.reportError', async () => {
    const { seen, onError } = collect()
    const handled = new Error('upstream 503')
    const handler = createHandler({
      App,
      routes,
      onError,
      middleware: [
        (ctx) => {
          ctx.reportError?.(handled, 'reported')
          return new Response('busy', { status: 503 })
        },
      ],
    })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(503)
    expect(seen).toEqual([{ error: handled, info: expect.objectContaining({ phase: 'reported' }) }])
  })

  test('redirects and successful renders never reach onError', async () => {
    const { seen, onError } = collect()
    const handler = createHandler({
      App,
      routes: [
        { path: '/', component: Home },
        { path: '/old', component: Home, beforeEnter: () => redirect('/') },
      ],
      onError,
    })
    expect((await handler(new Request('http://localhost/'))).status).toBe(200)
    await handler(new Request('http://localhost/old'))
    expect(seen).toEqual([])
  })

  test('a throwing or rejecting hook is caught and never changes the response', async () => {
    const throwing = createHandler({
      App,
      routes,
      onError: () => {
        throw new Error('hook broke')
      },
    })
    expect((await throwing(new Request('http://localhost/boom'))).status).toBe(500)

    const rejecting = createHandler({ App, routes, onError: () => Promise.reject(new Error('async hook broke')) })
    expect((await rejecting(new Request('http://localhost/boom'))).status).toBe(500)
    await new Promise((r) => setTimeout(r, 0))
    const logged: string[] = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(logged.filter((m) => m.includes('onError hook itself failed'))).toHaveLength(2)
  })

  test('without onError the handler behaves as before (console line only)', async () => {
    const handler = createHandler({ App, routes })
    expect((await handler(new Request('http://localhost/boom'))).status).toBe(500)
    expect(errorSpy).toHaveBeenCalled()
  })
})
