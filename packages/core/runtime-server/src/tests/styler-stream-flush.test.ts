/**
 * Streaming SSR style-flush integration test.
 *
 * Verifies that `renderToStream` calls `globalThis.__PYREON_STYLER_FLUSH__`
 * BOTH after the shell render AND inside every resolved Suspense
 * boundary — so styler-collected CSS rules arrive in the stream BEFORE
 * the content that uses them, eliminating FOUC on streaming SSR with
 * Suspense.
 *
 * Bisect-verify: stash the two `__PYREON_STYLER_FLUSH__` blocks in
 * `index.ts` and watch every spec here fail with "expected '<style>...'
 * to be present".
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
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

interface FlushHookGlobal {
  __PYREON_STYLER_FLUSH__?: () => string
}

describe('renderToStream — styler flush hook integration', () => {
  let calls: number
  let pending: string[]

  beforeEach(() => {
    calls = 0
    pending = []
    // Simulate styler queueing rules via successive insert() calls. Each
    // entry in `pending` represents the styles collected since the
    // previous flush. The hook returns one entry per call and clears it.
    ;(globalThis as FlushHookGlobal).__PYREON_STYLER_FLUSH__ = () => {
      calls++
      return pending.shift() ?? ''
    }
  })

  afterEach(() => {
    delete (globalThis as FlushHookGlobal).__PYREON_STYLER_FLUSH__
  })

  test('flushes ONCE after shell render (no Suspense boundaries)', async () => {
    pending.push('.pyr-1{color:red}')
    const html = await collectStream(renderToStream(h('div', null, 'shell')))

    // The flush hook was invoked exactly once (post-shell).
    expect(calls).toBe(1)
    // The rules ended up in the stream as a <style> tag.
    expect(html).toContain('<style data-pyreon-stream="shell">.pyr-1{color:red}</style>')
    // The actual shell content is also present.
    expect(html).toContain('<div>shell</div>')
  })

  test('shell-only flush is a no-op when nothing collected', async () => {
    // pending is empty → hook returns "" → no <style> tag emitted.
    const html = await collectStream(renderToStream(h('div', null, 'plain')))
    expect(calls).toBe(1)
    expect(html).not.toContain('<style')
  })

  test('Suspense boundary flushes inline before its <template>', async () => {
    // Shell render collects rule 1.
    pending.push('.pyr-shell{color:black}')
    // Boundary resolution collects rule 2.
    pending.push('.pyr-boundary{color:red}')

    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('p', { id: 'resolved' }, 'done')
    }

    const vnode = h(Suspense, {
      fallback: h('p', { id: 'fallback' }, 'loading'),
      children: h(Slow as unknown as ComponentFn, null),
    })

    const html = await collectStream(renderToStream(vnode))

    // Both flush hooks fired.
    expect(calls).toBe(2)

    // The shell <style> tag.
    expect(html).toContain(
      '<style data-pyreon-stream="shell">.pyr-shell{color:black}</style>',
    )
    // The boundary <style> tag.
    expect(html).toContain(
      '<style data-pyreon-stream="0">.pyr-boundary{color:red}</style>',
    )

    // CRITICAL ORDERING — the boundary's <style> tag must appear BEFORE
    // its <template> in the stream, so the browser applies the styles
    // before `__NS` swaps the resolved content in.
    const styleIdx = html.indexOf('<style data-pyreon-stream="0">')
    const templateIdx = html.indexOf('<template id="pyreon-t-0">')
    expect(styleIdx).toBeGreaterThan(-1)
    expect(templateIdx).toBeGreaterThan(-1)
    expect(styleIdx).toBeLessThan(templateIdx)

    // Resolved content + swap are also present.
    expect(html).toContain('id="resolved"')
    expect(html).toContain('__NS("pyreon-s-0","pyreon-t-0")')
  })

  test('empty boundary flush emits no <style> tag (no-op contract)', async () => {
    // Shell render needs styles, boundary does not.
    pending.push('.pyr-shell-only{color:green}')
    pending.push('')

    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('p', null, 'done')
    }

    const vnode = h(Suspense, {
      fallback: h('p', null, 'loading'),
      children: h(Slow as unknown as ComponentFn, null),
    })

    const html = await collectStream(renderToStream(vnode))

    // Both hooks fired.
    expect(calls).toBe(2)
    // Shell <style> appears.
    expect(html).toContain('data-pyreon-stream="shell"')
    // Boundary <style> does NOT (returned empty).
    expect(html).not.toContain('data-pyreon-stream="0"')
  })

  test('escapes </style sequences inside CSS to prevent early-close XSS', async () => {
    // A malicious or accidentally-`@font-face`-embedded `</style` in CSS
    // content must be escaped so it can't terminate the emitted tag.
    pending.push('.x{content:"</style><script>alert(1)</script>"}')

    const html = await collectStream(renderToStream(h('div', null, 'shell')))

    // Raw </style must not appear inside the emitted <style>...</style>.
    // Look for the escaped form `<\/style` instead.
    expect(html).toContain('<\\/style')
    // The original raw </style> sequence still appears at end of tag
    // (the legitimate close), but the ONE inside the CSS body has been
    // escaped — confirm by counting.
    const styleOpens = (html.match(/<style data-pyreon-stream/g) ?? []).length
    const styleCloses = (html.match(/<\/style>/g) ?? []).length
    expect(styleOpens).toBe(1)
    // Only one legit close should pair with the open; the in-CSS </style
    // has been escaped to `<\/style`.
    expect(styleCloses).toBe(1)
  })

  test('no flush hook on globalThis — streaming still works (graceful no-op)', async () => {
    delete (globalThis as FlushHookGlobal).__PYREON_STYLER_FLUSH__

    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('p', { id: 'resolved' }, 'done')
    }

    const vnode = h(Suspense, {
      fallback: h('p', null, 'loading'),
      children: h(Slow as unknown as ComponentFn, null),
    })

    const html = await collectStream(renderToStream(vnode))

    // The hook was never registered — no <style> tags emitted.
    expect(html).not.toContain('<style data-pyreon-stream')
    // But the content still resolves and swaps.
    expect(html).toContain('id="resolved"')
    expect(html).toContain('__NS("pyreon-s-0","pyreon-t-0")')
  })

  test('multiple Suspense boundaries each get their own flush', async () => {
    pending.push('.pyr-shell{a:1}')
    pending.push('.pyr-b0{b:1}')
    pending.push('.pyr-b1{c:1}')

    async function SlowA(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 3))
      return h('p', { id: 'a' }, 'a')
    }
    async function SlowB(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('p', { id: 'b' }, 'b')
    }

    const vnode = h(
      'div',
      null,
      h(Suspense, {
        fallback: h('p', null, 'fa'),
        children: h(SlowA as unknown as ComponentFn, null),
      }),
      h(Suspense, {
        fallback: h('p', null, 'fb'),
        children: h(SlowB as unknown as ComponentFn, null),
      }),
    )

    const html = await collectStream(renderToStream(vnode))

    expect(calls).toBe(3) // shell + 2 boundaries
    expect(html).toContain('data-pyreon-stream="shell"')
    // Each boundary tagged by its bid (assigned in order 0, 1).
    expect(html).toContain('data-pyreon-stream="0"')
    expect(html).toContain('data-pyreon-stream="1"')
  })
})
