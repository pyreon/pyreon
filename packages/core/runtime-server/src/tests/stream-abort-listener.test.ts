import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, Suspense } from '@pyreon/core'
import { describe, expect, test, vi } from 'vitest'
import { renderToStream } from '../index'

/**
 * `renderToStream({ signal })` chains the caller's signal to the stream's own
 * controller. The listener was removed only if the caller's signal aborted, so
 * a caller that shares one long-lived signal across renders (a server-wide
 * shutdown signal, a per-connection signal reused for many responses) gained
 * one listener — and one retained stream closure — per render.
 */
function listenerBalance(signal: AbortSignal): { net: () => number } {
  let net = 0
  const add = signal.addEventListener.bind(signal)
  const remove = signal.removeEventListener.bind(signal)
  vi.spyOn(signal, 'addEventListener').mockImplementation((type, fn, opts) => {
    if (type === 'abort') net++
    add(type, fn, opts)
  })
  vi.spyOn(signal, 'removeEventListener').mockImplementation((type, fn, opts) => {
    if (type === 'abort') net--
    remove(type, fn, opts)
  })

  return { net: () => net }
}

async function drain(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

const asyncComp = (fn: () => Promise<VNodeChild>): ComponentFn => fn as unknown as ComponentFn

describe('renderToStream detaches from the caller’s signal', () => {
  test('100 completed streams leave no listener behind', async () => {
    const shared = new AbortController().signal
    const balance = listenerBalance(shared)
    for (let i = 0; i < 100; i++) {
      expect(await drain(renderToStream(h('p', null, 'x'), { signal: shared }))).toContain('x')
    }
    expect(balance.net()).toBe(0)
  })

  test('a stream that errors leaves no listener behind', async () => {
    const shared = new AbortController().signal
    const balance = listenerBalance(shared)
    let errored = 0
    for (let i = 0; i < 10; i++) {
      // An accessor outside any component throws past the per-component catch,
      // so the stream itself errors.
      const root = h('p', null, () => {
        throw new Error('boom')
      })
      await drain(renderToStream(root, { signal: shared })).catch(() => {
        errored++
      })
    }
    expect(errored).toBe(10)
    expect(balance.net()).toBe(0)
  })

  test('a cancelled stream leaves no listener behind', async () => {
    const shared = new AbortController().signal
    const balance = listenerBalance(shared)
    const Never = asyncComp(async () => new Promise<VNodeChild>(() => {}))
    for (let i = 0; i < 20; i++) {
      const reader = renderToStream(h('div', null, h(Suspense, { fallback: 'wait' }, h(Never, null))), {
        signal: shared,
        suspenseTimeoutMs: Infinity,
      }).getReader()
      await reader.read()
      await reader.cancel()
    }
    expect(balance.net()).toBe(0)
  })

  test('aborting the caller’s signal still cancels the render', async () => {
    const ac = new AbortController()
    const Never = asyncComp(async () => new Promise<VNodeChild>(() => {}))
    const stream = renderToStream(h('div', null, h(Suspense, { fallback: 'wait' }, h(Never, null))), {
      signal: ac.signal,
      suspenseTimeoutMs: Infinity,
    })
    const reader = stream.getReader()
    expect((await reader.read()).value).toContain('wait')
    ac.abort()
    // The never-settling boundary is abandoned and the stream ends.
    expect((await reader.read()).done).toBe(true)
  })
})
