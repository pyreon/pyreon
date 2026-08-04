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

/**
 * Read the whole body, recording the CUMULATIVE prefix at the moment the
 * shell marker first appears, plus first-chunk timing for the lower-bound
 * assertions (buffered modes).
 *
 * The prefix is the load-immune streaming discriminator. This spec used to
 * assert `firstChunkAt < 60ms`, and that UPPER bound is a race against the
 * machine, not against the code: under load the first chunk of a genuinely
 * streaming response measured 100ms, and the spec rejected two unrelated
 * pushes in one day (2026-08-04), failing 1-in-3 even in isolation. What
 * streaming actually MEANS is ordering — the shell is delivered while the
 * Suspense child is still pending — and ordering is observable without a
 * clock: at the instant the shell text has arrived, the resolved child text
 * must NOT have arrived yet (it lands in a later chunk via the out-of-order
 * swap). ReadableStream readers return enqueued chunks one per read, so a
 * slow reader cannot merge the shell flush with the later swap chunk.
 * Timing survives only where load cannot break it: LOWER bounds (buffered
 * modes emit nothing before the child resolves, so >= SLOW_MS holds no
 * matter how slow the machine is — load only pushes it later).
 */
async function readStream(handler: (req: Request) => Promise<Response>) {
  const t0 = Date.now()
  const res = await handler(new Request('http://x/'))
  const reader = (res.body as ReadableStream<Uint8Array | string>).getReader()
  const decoder = new TextDecoder()
  const chunkToString = (v: Uint8Array | string | undefined): string =>
    v === undefined ? '' : typeof v === 'string' ? v : decoder.decode(v, { stream: true })
  let total = ''
  let firstChunkAt = -1
  let prefixAtShell = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (firstChunkAt === -1) firstChunkAt = Date.now() - t0
    if (done) break
    total += chunkToString(value)
    if (prefixAtShell === '' && total.includes('shell')) prefixAtShell = total
  }
  return { firstChunkAt, total, prefixAtShell }
}

describe('streaming default (mode ssr)', () => {
  it("mode 'ssr' STREAMS by default — shell flushes before the Suspense child resolves", async () => {
    const handler = createServer({
      routes: [{ path: '/', component: Page }],
      config: { mode: 'ssr' },
    })
    const { total, prefixAtShell } = await readStream(handler)
    // ORDERING, not latency: when the shell text completed arriving, the
    // Suspense child's content must not have arrived yet — that is what
    // "the shell flushes before the child resolves" observably means, and
    // no amount of machine load can invert delivery order. (Buffered modes
    // fail this: their single body contains both at once.)
    expect(prefixAtShell).toContain('shell')
    expect(prefixAtShell).not.toContain('resolved')
    // And the out-of-order swap eventually delivers the resolved content.
    expect(total).toContain('resolved')
  })

  it("ssr: { mode: 'string' } opts back into buffered", async () => {
    const handler = createServer({
      routes: [{ path: '/', component: Page }],
      config: { mode: 'ssr', ssr: { mode: 'string' } },
    })
    const { firstChunkAt, total, prefixAtShell } = await readStream(handler)
    // LOWER bound — load-immune: buffered mode emits nothing before the
    // 120ms child resolves; load can only make this LATER.
    expect(firstChunkAt).toBeGreaterThanOrEqual(SLOW_MS)
    // Buffered delivery means the resolved child arrives WITH the shell.
    expect(prefixAtShell).toContain('resolved')
    expect(total).toContain('resolved')
  })

  it("mode 'isr' stays BUFFERED by default (the SWR cache stores complete bodies)", async () => {
    const handler = createServer({
      routes: [{ path: '/', component: Page }],
      config: { mode: 'isr', isr: { revalidate: 60 } },
    })
    const { firstChunkAt, total, prefixAtShell } = await readStream(handler)
    // LOWER bound — load-immune: buffered mode emits nothing before the
    // 120ms child resolves; load can only make this LATER.
    expect(firstChunkAt).toBeGreaterThanOrEqual(SLOW_MS)
    // Buffered delivery means the resolved child arrives WITH the shell.
    expect(prefixAtShell).toContain('resolved')
    expect(total).toContain('resolved')
  })
})
