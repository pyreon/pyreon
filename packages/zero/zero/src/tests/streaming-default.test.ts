// @vitest-environment node
/**
 * Phase 4 — streaming is the DEFAULT for `mode: 'ssr'` (buffered for
 * 'isr', where the SWR cache stores complete bodies).
 *
 * The discriminator is TIMING, not headers: in stream mode the shell
 * flushes IMMEDIATELY while a Suspense boundary is still pending — the
 * first chunk arrives long before a slow async child resolves. In string
 * mode nothing arrives until the whole document is rendered. The spec
 * mounts a Suspense child that resolves after 120ms and asserts the first
 * chunk lands well before it.
 */
import type { ComponentFn } from '@pyreon/core'
import { h, Suspense } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { createServer } from '../entry-server'

const SLOW_MS = 120

const Slow: ComponentFn = (async () => {
  await new Promise((r) => setTimeout(r, SLOW_MS))
  return h('p', { id: 'slow' }, 'resolved')
}) as unknown as ComponentFn

const Page: ComponentFn = () =>
  h(
    'main',
    null,
    h('h1', null, 'shell'),
    // children via PROP — the canonical streaming-Suspense shape (matches
    // runtime-server's own styler-stream-flush fixtures).
    h(Suspense as never, {
      fallback: h('p', null, 'loading…'),
      children: h(Slow, null),
    } as never),
  )

async function firstChunkTiming(handler: (req: Request) => Promise<Response>) {
  const t0 = Date.now()
  const res = await handler(new Request('http://x/'))
  const reader = (res.body as ReadableStream<Uint8Array | string>).getReader()
  const decoder = new TextDecoder()
  const chunkToString = (v: Uint8Array | string | undefined): string =>
    v === undefined ? '' : typeof v === 'string' ? v : decoder.decode(v, { stream: true })
  const first = await reader.read()
  const firstChunkAt = Date.now() - t0
  let total = chunkToString(first.value)
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += chunkToString(value)
  }
  const doneAt = Date.now() - t0
  return { firstChunkAt, doneAt, total }
}

describe('streaming default (mode ssr)', () => {
  it("mode 'ssr' STREAMS by default — shell flushes before the Suspense child resolves", async () => {
    const handler = createServer({
      routes: [{ path: '/', component: Page }],
      config: { mode: 'ssr' },
    })
    const { firstChunkAt, total } = await firstChunkTiming(handler)
    // The shell must arrive well before the 120ms async child — half the
    // delay is a generous load-tolerant bound (string mode would be ≥120ms).
    expect(firstChunkAt).toBeLessThan(SLOW_MS / 2)
    // And the out-of-order swap eventually delivers the resolved content.
    expect(total).toContain('shell')
    expect(total).toContain('resolved')
  })

  it("ssr: { mode: 'string' } opts back into buffered", async () => {
    const handler = createServer({
      routes: [{ path: '/', component: Page }],
      config: { mode: 'ssr', ssr: { mode: 'string' } },
    })
    const { firstChunkAt, total } = await firstChunkTiming(handler)
    expect(firstChunkAt).toBeGreaterThanOrEqual(SLOW_MS)
    expect(total).toContain('resolved')
  })

  it("mode 'isr' stays BUFFERED by default (the SWR cache stores complete bodies)", async () => {
    const handler = createServer({
      routes: [{ path: '/', component: Page }],
      config: { mode: 'isr', isr: { revalidate: 60 } },
    })
    const { firstChunkAt, total } = await firstChunkTiming(handler)
    expect(firstChunkAt).toBeGreaterThanOrEqual(SLOW_MS)
    expect(total).toContain('resolved')
  })
})
