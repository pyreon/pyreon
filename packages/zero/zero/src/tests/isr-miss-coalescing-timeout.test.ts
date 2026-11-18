// @vitest-environment node
/**
 * Concurrent cold misses for one key coalesce behind ONE leader render.
 * Followers used to `await` the leader with no bound, so a leader render that
 * never settled suspended every later request for that key forever (the
 * background-revalidation path already had `revalidateTimeoutMs`). The wait is
 * now bounded by the same timeout: past it the key is released, waiting
 * followers render for themselves, and new requests no longer join the hung
 * render.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createISRHandler } from '../isr'

afterEach(() => {
  vi.useRealTimers()
})

const page = (body: string) =>
  new Response(`<p>${body}</p>`, { headers: { 'content-type': 'text/html' } })

describe('ISR cold-miss coalescing — bounded wait for the leader', () => {
  it('a leader render that never settles does not suspend its followers past the timeout', async () => {
    vi.useFakeTimers()
    let calls = 0
    const handler = createISRHandler(
      () => {
        calls++
        // First call (the leader) hangs forever; later calls render.
        return calls === 1 ? new Promise<Response>(() => {}) : Promise.resolve(page(`r${calls}`))
      },
      { revalidate: 60, revalidateTimeoutMs: 5_000 },
    )
    void handler(new Request('http://x/p'))
    await Promise.resolve()
    const followers = Array.from({ length: 5 }, () => handler(new Request('http://x/p')))
    let settled = 0
    for (const f of followers) void f.then(() => settled++)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(settled).toBe(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(settled).toBe(5)
    const res = await Promise.all(followers)
    expect(res.every((r) => r.status === 200)).toBe(true)
    // A request arriving later does not join the hung render either.
    const later = await handler(new Request('http://x/p'))
    expect(later.status).toBe(200)
  })

  it('a leader that settles normally clears its timer (leak class I)', async () => {
    vi.useFakeTimers()
    const handler = createISRHandler(async () => page('ok'), {
      revalidate: 60,
      revalidateTimeoutMs: 5_000,
    })
    const leader = handler(new Request('http://x/q'))
    const follower = handler(new Request('http://x/q'))
    await Promise.all([leader, follower])
    expect(vi.getTimerCount()).toBe(0)
    expect(await (await follower).text()).toBe('<p>ok</p>')
  })

  it('a leader that resolves after the timeout does not evict a newer leader', async () => {
    vi.useFakeTimers()
    let calls = 0
    let releaseFirst!: (r: Response) => void
    const handler = createISRHandler(
      () => {
        calls++
        if (calls === 1) {
          return new Promise<Response>((r) => {
            releaseFirst = r
          })
        }

        return new Promise<Response>((r) => setTimeout(() => r(page(`r${calls}`)), 1_000))
      },
      { revalidate: 60, revalidateTimeoutMs: 5_000 },
    )
    const first = handler(new Request('http://x/r'))
    await vi.advanceTimersByTimeAsync(5_001)
    // A new leader starts (render #2, takes 1s); a follower joins it.
    const second = handler(new Request('http://x/r'))
    await Promise.resolve()
    const third = handler(new Request('http://x/r'))
    // The first render finally settles: it must not drop render #2's slot.
    releaseFirst(page('late'))
    await first
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.all([second, third])
    expect(calls).toBe(2)
  })
})
