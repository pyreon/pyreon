import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, Suspense } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import { createHandler } from '../handler'
import type { ServerErrorInfo } from '../middleware'

/**
 * A client that disconnects cancels the RESPONSE body. The streaming handler's
 * outer `ReadableStream` had no `cancel`, so nothing reached the inner render:
 * it kept running until every Suspense boundary settled or timed out (never,
 * with `suspenseTimeoutMs: Infinity`), and its next write into the cancelled
 * body threw, which was then logged and reported to `onError` as a render
 * failure.
 *
 * The inner app stream is wrapped here only to OBSERVE whether a cancel reaches
 * it; it forwards everything to the real `renderToStream`.
 */
const inner = vi.hoisted(() => ({ cancelled: false, reason: undefined as unknown }))

vi.mock('@pyreon/runtime-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pyreon/runtime-server')>()
  return {
    ...actual,
    renderToStream: (...args: Parameters<typeof actual.renderToStream>) => {
      const reader = actual.renderToStream(...args).getReader()
      return new ReadableStream<string>({
        async pull(controller) {
          const { done, value } = await reader.read()
          if (done) controller.close()
          else controller.enqueue(value)
        },
        cancel(reason) {
          inner.cancelled = true
          inner.reason = reason
          return reader.cancel(reason)
        },
      })
    },
  }
})

describe('createHandler (stream) — a client disconnect', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    inner.cancelled = false
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  test('cancelling the response cancels the render and is not reported as a failure', async () => {
    const Never = (async () => new Promise<VNodeChild>(() => {})) as unknown as ComponentFn
    const Page: ComponentFn = () =>
      h('main', null, h('h1', null, 'shell'), h(Suspense, { fallback: h('p', null, 'loading') }, h(Never, null)))
    const seen: ServerErrorInfo[] = []
    const handler = createHandler({
      App: () => h(RouterView, null),
      routes: [{ path: '/', component: Page }],
      mode: 'stream',
      suspenseTimeoutMs: Infinity,
      onError: (_error, info) => void seen.push(info),
    })

    const res = await handler(new Request('http://localhost/'))
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let shell = ''
    while (!shell.includes('loading')) {
      const { done, value } = await reader.read()
      expect(done).toBe(false)
      shell += decoder.decode(value)
    }
    await reader.cancel('client went away')
    // Let the handler's read loop observe the cancel.
    await new Promise((r) => setTimeout(r, 20))

    expect(inner.cancelled).toBe(true)
    expect(inner.reason).toBe('client went away')
    expect(seen).toEqual([])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('a boundary that settles after the disconnect is not reported as a render failure', async () => {
    const Slow = (async () => {
      await new Promise((r) => setTimeout(r, 30))
      return h('p', null, 'late')
    }) as unknown as ComponentFn
    const Page: ComponentFn = () =>
      h('main', null, h(Suspense, { fallback: h('p', null, 'loading') }, h(Slow, null)))
    const seen: ServerErrorInfo[] = []
    const handler = createHandler({
      App: () => h(RouterView, null),
      routes: [{ path: '/', component: Page }],
      mode: 'stream',
      onError: (_error, info) => void seen.push(info),
    })

    const res = await handler(new Request('http://localhost/'))
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    await new Promise((r) => setTimeout(r, 80))

    expect(seen).toEqual([])
    expect(errorSpy).not.toHaveBeenCalled()
    expect(inner.cancelled).toBe(true)
  })
})
