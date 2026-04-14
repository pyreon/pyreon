import { h, Suspense } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderToStream } from '../index'

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += value
  }
  return out
}

// PR #233 follow-up: when an async child inside a Suspense boundary
// rejects mid-stream, what happens? The fallback should stay visible,
// the swap must NOT be emitted, and the stream must close (not hang
// waiting for a resolution that will never come).

describe('renderToStream — Suspense boundary rejection', () => {
  test('keeps fallback visible and closes stream when async child rejects', async () => {
    async function Rejects(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      throw new Error('deliberate test failure')
    }

    const vnode = h(Suspense, {
      fallback: h('p', { id: 'fallback' }, 'loading...'),
      children: h(Rejects as unknown as ComponentFn, null),
    })

    // If the stream hangs, this test will time out. Passing means it
    // closed cleanly via controller.close().
    const html = await collectStream(renderToStream(vnode))

    // Fallback placeholder + content are present
    expect(html).toContain('id="pyreon-s-0"')
    expect(html).toContain('loading...')

    // NO swap template or __NS invocation for this boundary — those only
    // emit on successful resolution. The __NS helper FUNCTION is always
    // inlined once per stream; distinguish definition vs call.
    expect(html).not.toContain('id="pyreon-t-0"')
    expect(html).not.toContain('__NS("pyreon-s-0"')
  })

  test('one rejecting boundary does not abort siblings — other content still streams', async () => {
    async function Rejects(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      throw new Error('sibling rejection')
    }
    async function Resolves(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 10))
      return h('span', { id: 'ok' }, 'ok')
    }

    const vnode = h(
      'div',
      null,
      h(Suspense, {
        fallback: h('span', { id: 'fb-a' }, 'fb-a'),
        children: h(Rejects as unknown as ComponentFn, null),
      }),
      h(Suspense, {
        fallback: h('span', { id: 'fb-b' }, 'fb-b'),
        children: h(Resolves as unknown as ComponentFn, null),
      }),
    )

    const html = await collectStream(renderToStream(vnode))

    // Both fallbacks shipped
    expect(html).toContain('id="fb-a"')
    expect(html).toContain('id="fb-b"')
    // The resolving sibling's swap still went through. The rejecting
    // sibling (boundary id 0) must NOT swap; the resolving one (id 1)
    // must. Assert the specific invocations.
    expect(html).toContain('id="ok"')
    expect(html).not.toContain('__NS("pyreon-s-0"')
    expect(html).toContain('__NS("pyreon-s-1"')
  })
})
