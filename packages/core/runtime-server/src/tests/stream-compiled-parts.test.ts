/**
 * Streamed compiled pages — `streamPart`'s dispatch over every hole kind an
 * `_ssr(...)` call can carry once it contains a `StreamHole`, plus the abort
 * and request-scope edges of `renderToStream` this PR introduced.
 *
 * The contract for every compiled-part shape is the one `ssr-template.test.ts`
 * holds for the string path: the CONCATENATED stream is byte-identical to
 * `renderToString` of the same thunk. A hole kind `streamPart` mishandles shows
 * up as `[object Object]`, a dropped fragment, or a reordered one.
 */
import type { ComponentFn, VNode, VNodeChild } from '@pyreon/core'
import { Suspense, h } from '@pyreon/core'
import {
  _setStreamFlushBytes,
  _ssr,
  _ssrDeferred,
  _ssrNode,
  renderToStream,
  renderToString,
  runWithRequestContext,
} from '../index'

async function chunks(s: ReadableStream<string>): Promise<string[]> {
  const reader = s.getReader()
  const out: string[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out.push(value)
  }
}

const asNode = (x: unknown) => x as VNode
const Em: ComponentFn<{ t: string }> = (p) => h('em', null, p.t)

describe('streamed compiled page — every hole kind', () => {
  afterEach(() => {
    _setStreamFlushBytes(4096)
  })

  // What the compiler emits for a page whose `_ssr(...)` call mixes a component
  // hole (StreamHole) with a nested templated subtree, a nested component-
  // bearing subtree, an async text hole, and an empty leading static.
  const page = () =>
    _ssrDeferred(
      () =>
        _ssr(
          ['', '<hr>', '|', '|', '|', '</main>'],
          // leading '' static — must be skipped, not enqueued as an empty chunk
          _ssrNode(h(Em, { t: 'a' })),
          // nested all-string `_ssr` → a RawHtml part
          _ssr(['<b>', '</b>'], 'raw'),
          // nested component-bearing `_ssr` → a nested StreamParts part
          _ssr(['<section>', '</section>'], _ssrNode(h(Em, { t: 'nested' }))),
          // async text hole → Promise part (already-escaped string)
          Promise.resolve('<i>async</i>'),
          // async hole resolving to a non-string → holeToString
          Promise.resolve(42),
        ) as never,
    )

  it('concatenated stream equals the string render, byte for byte', async () => {
    const expected = await renderToString(asNode(page()))
    expect(expected).toBe(
      '<em>a</em><hr><b>raw</b>|<section><em>nested</em></section>|<i>async</i>|42</main>',
    )
    const streamed = (await chunks(renderToStream(asNode(page())))).join('')
    expect(streamed).toBe(expected)
  })

  it('never emits an empty chunk for an empty static part', async () => {
    _setStreamFlushBytes(0) // one chunk per fragment, so an empty one would show
    const out = await chunks(renderToStream(asNode(page())))
    expect(out).not.toContain('')
    expect(out.join('')).not.toContain('[object')
    // the RawHtml part is delivered as ONE fragment, not re-walked
    expect(out).toContain('<b>raw</b>')
  })

  it('flushes everything before an async hole, before awaiting it', async () => {
    let release!: (v: string) => void
    const gate = new Promise<string>((r) => {
      release = r
    })
    const node = _ssrDeferred(
      () => _ssr(['<main>', '', '</main>'], _ssrNode(h(Em, { t: 'shell' })), gate) as never,
    )
    const reader = renderToStream(asNode(node)).getReader()
    const first = await reader.read()
    // The shell reached the consumer while the hole is still pending.
    expect(first.value).toBe('<main><em>shell</em>')
    release('<i>late</i>')
    let rest = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      rest += value
    }
    expect(rest).toBe('<i>late</i></main>')
  })
})

describe('renderToStream — abort edges', () => {
  afterEach(() => {
    _setStreamFlushBytes(4096)
  })

  it('drops output buffered before an abort instead of delivering it after', async () => {
    const ac = new AbortController()
    // Aborts DURING its own render, after the parent's `<div>` was buffered;
    // the async output then triggers a flush with the stream already aborted.
    const Aborter = (() => {
      ac.abort()
      return Promise.resolve(h('p', null, 'after'))
    }) as unknown as ComponentFn
    const out = await chunks(renderToStream(h('div', null, h(Aborter, null)), { signal: ac.signal }))
    expect(out).toEqual([])
  })

  it('drops a Suspense swap whose child resolves after the consumer aborted', async () => {
    const ac = new AbortController()
    const Late = (async () => {
      await Promise.resolve()
      ac.abort()
      return h('p', null, 'too-late')
    }) as unknown as ComponentFn
    const out = (
      await chunks(
        renderToStream(h(Suspense, { fallback: h('i', null, 'fb') }, h(Late, null)), {
          signal: ac.signal,
        }),
      )
    ).join('')
    // The shell (swap helper + fallback) went out before the wait …
    expect(out).toContain('<div id="pyreon-s-0"><i>fb</i></div>')
    // … and nothing resolved after the abort was delivered.
    expect(out).not.toContain('too-late')
    expect(out).not.toContain('<template')
  })

  it('closes cleanly (no stream error) when the render throws after an abort', async () => {
    const ac = new AbortController()
    const node = _ssrDeferred(() => {
      ac.abort()
      throw new Error('boom after abort')
    })
    // A throw with the stream NOT aborted errors the stream — here the abort
    // wins and the consumer sees a normal end-of-stream.
    await expect(chunks(renderToStream(asNode(node), { signal: ac.signal }))).resolves.toEqual([])
  })

  it('errors the stream when the render throws without an abort', async () => {
    const node = _ssrDeferred(() => {
      throw new Error('boom')
    })
    await expect(chunks(renderToStream(asNode(node)))).rejects.toThrow('boom')
  })
})

describe('renderToStream — async component resolving to null', () => {
  it('emits the async range markers with nothing between them', async () => {
    const Nothing = (async () => null) as unknown as ComponentFn
    const html = (await chunks(renderToStream(h('div', null, h(Nothing, null))))).join('')
    expect(html).toBe('<div><!--$pas--><!--$pae--></div>')
  })
})

describe('renderToStream — Suspense with no children and no timeout', () => {
  it('swaps in an empty template instead of leaving the fallback forever', async () => {
    const html = (
      await chunks(
        renderToStream(h(Suspense, { fallback: h('i', null, 'fb') } as never), {
          suspenseTimeoutMs: Infinity,
        }),
      )
    ).join('')
    expect(html).toContain('<div id="pyreon-s-0"><i>fb</i></div>')
    expect(html).toContain('<template id="pyreon-t-0"></template>')
    expect(html).toContain('__NS("pyreon-s-0","pyreon-t-0")')
  })
})

describe('per-request styler scope — nesting', () => {
  const getBag = () =>
    (
      globalThis as { __PYREON_STYLER_REQUEST_STATE__?: () => Record<string, unknown> | undefined }
    ).__PYREON_STYLER_REQUEST_STATE__?.()

  it('a nested request context reuses the outer bag rather than opening a new one', async () => {
    const [outer, inner] = await runWithRequestContext(async () => {
      const o = getBag()
      const i = await runWithRequestContext(async () => getBag())
      return [o, i] as const
    })
    expect(outer).toBeTypeOf('object')
    expect(inner).toBe(outer)
    expect(getBag()).toBeUndefined()
  })

  it('a stream inside a request context writes into that request’s bag', async () => {
    const seen: unknown[] = []
    const Probe: ComponentFn = () => {
      seen.push(getBag())
      return h('div', null, 'x' as VNodeChild)
    }
    const outer = await runWithRequestContext(async () => {
      await chunks(renderToStream(h(Probe, null)))
      return getBag()
    })
    expect(seen).toEqual([outer])
  })
})
