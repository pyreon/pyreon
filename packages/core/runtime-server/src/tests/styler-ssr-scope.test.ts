import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToString } from '../index'

// runtime-server establishes a per-request styler SSR scope around every render
// (so @pyreon/styler's singleton buffer + streaming watermark are isolated per
// concurrent streaming request). It exposes the per-request bag via
// `globalThis.__PYREON_STYLER_REQUEST_STATE__`.
describe('per-request styler SSR scope', () => {
  const getBag = () =>
    (globalThis as { __PYREON_STYLER_REQUEST_STATE__?: () => unknown }).__PYREON_STYLER_REQUEST_STATE__?.()

  it('the request-state accessor is registered', () => {
    expect(
      (globalThis as { __PYREON_STYLER_REQUEST_STATE__?: unknown }).__PYREON_STYLER_REQUEST_STATE__,
    ).toBeTypeOf('function')
  })

  it('returns undefined outside a render, a bag inside, and DISTINCT bags per concurrent render', async () => {
    expect(getBag()).toBeUndefined()
    const bags: unknown[] = []
    const Probe = () => {
      bags.push(getBag())
      return h('div', null)
    }
    await Promise.all([renderToString(h(Probe, null)), renderToString(h(Probe, null))])
    expect(bags).toHaveLength(2)
    expect(bags[0]).toBeDefined()
    expect(bags[1]).toBeDefined()
    expect(bags[0]).not.toBe(bags[1]) // isolated per request
    // scope torn down after the render
    expect(getBag()).toBeUndefined()
  })
})
