import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToStream, renderToString } from '../index'

// runtime-server establishes a per-request styler SSR scope around STREAMING
// renders, so @pyreon/styler's singleton buffer + flush watermark are isolated
// per concurrent stream. It exposes the per-request bag via
// `globalThis.__PYREON_STYLER_REQUEST_STATE__`.
//
// Deliberately NOT around `renderToString`. The invariant this file protects is
// "concurrent renders do not share the flush watermark", and the watermark only
// exists on the streaming path — `flushSSRPending` is a streaming API. String
// mode reads the buffer AFTER the render returns (`renderToString(...)` then
// `getStyleTag()` / `getStyleRules()`), which is what the SSG pipeline, the
// server handler and the rocketstyle-collapse resolver all do; scoping it puts
// every rule in a bag that is gone by the time anyone reads, so the page renders
// with NO styles. That regression showed up as 4 collapse-resolver specs and the
// ssg-i18n-prefix + ui-regression e2e suites all seeing an empty rule set.
describe('per-request styler SSR scope', () => {
  const getBag = () =>
    (globalThis as { __PYREON_STYLER_REQUEST_STATE__?: () => unknown }).__PYREON_STYLER_REQUEST_STATE__?.()

  it('the request-state accessor is registered', () => {
    expect(
      (globalThis as { __PYREON_STYLER_REQUEST_STATE__?: unknown }).__PYREON_STYLER_REQUEST_STATE__,
    ).toBeTypeOf('function')
  })

  it('gives concurrent STREAMS distinct bags, and tears the scope down after', async () => {
    expect(getBag()).toBeUndefined()
    const bags: unknown[] = []
    const Probe = () => {
      bags.push(getBag())
      return h('div', null)
    }
    const drain = async (s: ReadableStream<string>): Promise<void> => {
      const reader = s.getReader()
      for (;;) {
        const { done } = await reader.read()
        if (done) return
      }
    }
    await Promise.all([
      drain(renderToStream(h(Probe, null))),
      drain(renderToStream(h(Probe, null))),
    ])
    expect(bags).toHaveLength(2)
    expect(bags[0]).toBeDefined()
    expect(bags[1]).toBeDefined()
    expect(bags[0]).not.toBe(bags[1]) // isolated per stream
    // scope torn down after the render
    expect(getBag()).toBeUndefined()
  })

  // The other half, and the one the first version of this file got wrong:
  // string mode must leave the rules readable AFTER the render, because that is
  // the only way its callers ever read them.
  it('leaves string-mode rules readable after the render returns', async () => {
    const seen: unknown[] = []
    const Probe = () => {
      seen.push(getBag())
      return h('div', null)
    }
    await renderToString(h(Probe, null))
    expect(seen[0], 'renderToString must NOT open a styler scope').toBeUndefined()
  })
})
