/**
 * SSR / runtime-server probe — verifies the 6 server-side counters fire
 * at expected shapes on realistic render patterns. Serves the same role
 * as the counters-runtime/counters-styler/etc. suites: assert that the
 * instrumentation points emit what they claim.
 *
 * These are NOT perf regression tests — assertions are coarse "counter
 * fired ≥ N times" bounds. A future PR can tighten them to absolute
 * bounds when the probe numbers stabilise.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { For, Fragment, h, Suspense } from '@pyreon/core'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

function List({ items }: { items: string[] }) {
  return h(
    'ul',
    null,
    h(For, {
      each: () => items,
      by: (s: string) => s,
      children: (s: string) => h('li', null, s),
    }),
  )
}

async function streamToString(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) out += value
  }
  return out
}

describe('SSR counter shape', () => {
  it('renderToString fires runtime-server.render once per call', async () => {
    const outcome = await perfHarness.record('ssr-render-once', async () => {
      await renderToString(h('div', null, 'hello'))
    })
    expect(outcome.after['runtime-server.render']).toBe(1)
    expect(outcome.after['runtime-server.stream']).toBeFalsy()
  })

  it('renderToString fires one runtime-server.component per component vnode', async () => {
    const Comp = () => h('span', null, 'x')
    const outcome = await perfHarness.record('ssr-component-count', async () => {
      await renderToString(h('div', null, h(Comp, null), h(Comp, null), h(Comp, null)))
    })
    // Three Comp instances → three component emits
    expect(outcome.after['runtime-server.component']).toBe(3)
  })

  it('renderToString fires runtime-server.escape for strings with special chars', async () => {
    const outcome = await perfHarness.record('ssr-escape-count', async () => {
      // "&" and "<" both trigger escape; "hello" does not
      await renderToString(h('div', null, 'hello', h('span', null, 'a & b'), h('span', null, '<x>')))
    })
    // 'hello' stays; 'a & b' and '<x>' both need escape → ≥ 2
    expect(outcome.after['runtime-server.escape']).toBe(2)
  })

  it('renderToString fires one runtime-server.for.keyMarker per <For> item', async () => {
    const items = ['a', 'b', 'c', 'd']
    const outcome = await perfHarness.record('ssr-for-markers', async () => {
      await renderToString(h(List, { items }))
    })
    expect(outcome.after['runtime-server.for.keyMarker']).toBe(items.length)
  })

  it('renderToStream fires runtime-server.stream once per call', async () => {
    const outcome = await perfHarness.record('ssr-stream-once', async () => {
      const stream = renderToStream(h('div', null, 'hello'))
      await streamToString(stream)
    })
    expect(outcome.after['runtime-server.stream']).toBe(1)
    expect(outcome.after['runtime-server.render']).toBeFalsy()
  })

  it('renderToStream fires runtime-server.suspense.boundary once per Suspense', async () => {
    // Async component — the SSR renderer `await`s the returned Promise.
    // Pyreon's type sig is `(p) => VNodeChild` (sync) but the runtime
    // accepts Promise<VNode> too; cast via `unknown` since the TS type
    // doesn't have an async overload.
    const AsyncChild = (async () => {
      await new Promise((r) => setTimeout(r, 1))
      return h('span', null, 'ready') as VNodeChild
    }) as unknown as ComponentFn
    const outcome = await perfHarness.record('ssr-suspense', async () => {
      const stream = renderToStream(
        h(
          Fragment,
          null,
          h(Suspense, { fallback: 'loading' as unknown }, h(AsyncChild, null)),
          h(Suspense, { fallback: 'loading' as unknown }, h(AsyncChild, null)),
        ),
      )
      await streamToString(stream)
    })
    // Two boundaries
    expect(outcome.after['runtime-server.suspense.boundary']).toBe(2)
    // Neither timed out — fallback counter should be 0
    expect(outcome.after['runtime-server.suspense.fallback']).toBeFalsy()
  })
})
