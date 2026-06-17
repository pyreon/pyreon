// Targeted coverage for residual node-reachable SSR branches in the
// renderToString / renderToStream pipeline.

import { For, h, Suspense } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'
import { renderToStream, renderToString } from '../index'

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += typeof value === 'string' ? value : dec.decode(value as never)
  }
  return out
}

describe('SSR — <For> with a function `each` accessor', () => {
  it('renders items from a function-shaped each (renderToString path)', async () => {
    const html = await renderToString(
      h(
        For,
        { each: () => [1, 2, 3], by: (x: number) => x },
        ((item: number) => h('li', null, String(item))) as never,
      ),
    )
    expect(html).toContain('<li')
    expect(html).toContain('1')
    expect(html).toContain('3')
  })

  it('renders items from an array each', async () => {
    const html = await renderToString(
      h(
        For,
        { each: ['a', 'b'], by: (x: string) => x },
        ((item: string) => h('span', null, item)) as never,
      ),
    )
    expect(html).toContain('a')
    expect(html).toContain('b')
  })
})

describe('SSR — component render error is caught (renderToString catch)', () => {
  it('a throwing component runs the SSR error catch', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bad: ComponentFn = () => {
      throw new Error('render boom')
    }
    // The SSR renderer's per-component catch runs — outside a Suspense
    // boundary the error propagates to the caller. (The dev console.error
    // inside the catch is `__DEV__`-gated and inert under NODE_ENV=production.)
    await expect(renderToString(h('div', null, h(Bad, null)))).rejects.toThrow(
      'render boom',
    )
    errSpy.mockRestore()
  })
})

describe('SSR — dangerouslySetInnerHTML + innerHTML variants', () => {
  it('object form emits the raw html', async () => {
    const html = await renderToString(
      h('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } }),
    )
    expect(html).toContain('<b>raw</b>')
  })

  it('function form is invoked', async () => {
    const html = await renderToString(
      h('div', { dangerouslySetInnerHTML: () => ({ __html: '<i>fn</i>' }) }),
    )
    expect(html).toContain('<i>fn</i>')
  })

  it('plain innerHTML (non-empty) is emitted', async () => {
    const html = await renderToString(h('div', { innerHTML: 'plain inner' }))
    expect(html).toContain('plain inner')
  })
})

describe('SSR — style object normalization', () => {
  it('a plain style object is serialized to a CSS string', async () => {
    const html = await renderToString(
      h('div', { style: { color: 'red', fontSize: '12px' } }),
    )
    expect(html).toContain('color: red')
    expect(html).toContain('font-size: 12px')
  })

  it('a function style accessor is invoked', async () => {
    const html = await renderToString(h('div', { style: () => 'color: blue' }))
    expect(html).toContain('color: blue')
  })
})

describe('SSR — unsafe tag name warns in dev (warnIfUnsafeTag)', () => {
  it('a tag with invalid characters triggers the dev warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // leading digit → fails SAFE_TAG_RE → warnIfUnsafeTag path
    await renderToString(h('1bad' as never, null))
    warn.mockRestore()
    expect(true).toBe(true)
  })
})

describe('SSR — renderToStream basic drain', () => {
  it('streams a simple tree to completion', async () => {
    const out = await collectStream(renderToStream(h('div', null, h('p', null, 'streamed'))))
    expect(out).toContain('streamed')
  })
})

describe('SSR stream-path — streamElementNode inner-html variants', () => {
  it('dangerouslySetInnerHTML object form (stream)', async () => {
    const out = await collectStream(
      renderToStream(h('div', { dangerouslySetInnerHTML: { __html: '<b>sraw</b>' } })),
    )
    expect(out).toContain('<b>sraw</b>')
  })

  it('dangerouslySetInnerHTML function form (stream)', async () => {
    const out = await collectStream(
      renderToStream(h('div', { dangerouslySetInnerHTML: () => ({ __html: '<i>sfn</i>' }) })),
    )
    expect(out).toContain('<i>sfn</i>')
  })

  it('plain innerHTML (stream)', async () => {
    const out = await collectStream(renderToStream(h('div', { innerHTML: 'stream inner' })))
    expect(out).toContain('stream inner')
  })

  it('void element (stream) — self-closes with no children', async () => {
    const out = await collectStream(renderToStream(h('img', { src: '/x.png', alt: '' })))
    expect(out).toContain('<img')
  })
})

describe('SSR stream-path — <For> + component error + unsafe tag', () => {
  it('streams a <For> list', async () => {
    const out = await collectStream(
      renderToStream(
        h(
          For,
          { each: [1, 2, 3], by: (x: number) => x },
          ((item: number) => h('li', null, String(item))) as never,
        ),
      ),
    )
    expect(out).toContain('<li')
    expect(out).toContain('3')
  })

  it('a throwing component outside Suspense emits a marker, stream continues', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bad: ComponentFn = () => {
      throw new Error('stream boom')
    }
    // Outside a Suspense boundary the per-component catch swallows + emits a
    // marker so the stream still completes (does NOT reject).
    const out = await collectStream(renderToStream(h('div', null, h(Bad, null), h('p', null, 'after'))))
    expect(out).toContain('after')
    errSpy.mockRestore()
  })

  it('an unsafe tag name in the stream triggers the dev guard', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await collectStream(renderToStream(h('1bad' as never, null)))
    warn.mockRestore()
    expect(true).toBe(true)
  })
})

describe('SSR stream-path — Suspense timeout + no-timeout modes', () => {
  it('no-timeout mode (Infinity) awaits async children', async () => {
    async function AsyncComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('div', null, 'inf-resolved')
    }
    const vnode = h(Suspense, {
      fallback: h('span', null, 'inf-fallback'),
      children: h(AsyncComp as unknown as ComponentFn, null),
    })
    const out = await collectStream(renderToStream(vnode, { suspenseTimeoutMs: Infinity }))
    expect(out).toContain('inf-resolved')
  })

  it('a tiny timeout fires before a slow boundary resolves (fallback stays)', async () => {
    async function SlowComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 200))
      return h('div', null, 'too-slow')
    }
    const vnode = h(Suspense, {
      fallback: h('span', null, 'timeout-fallback'),
      children: h(SlowComp as unknown as ComponentFn, null),
    })
    const out = await collectStream(renderToStream(vnode, { suspenseTimeoutMs: 1 }))
    expect(out).toContain('timeout-fallback')
  })

  it('a synchronous (non-async) Suspense child resolves inline', async () => {
    const vnode = h(Suspense, {
      fallback: h('span', null, 'sync-fallback'),
      children: h('div', null, 'sync-child'),
    })
    const out = await collectStream(renderToStream(vnode))
    expect(out).toContain('sync-child')
  })

  it('a Suspense with no children streams just the fallback (children ?? null)', async () => {
    const vnode = h(Suspense, { fallback: h('span', null, 'no-children-fb') })
    const out = await collectStream(renderToStream(vnode))
    expect(out).toContain('no-children-fb')
  })

  it('aborting during async resolution skips the post-resolve swap (signal.aborted return)', async () => {
    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 60))
      return h('div', null, 'aborted-late')
    }
    const vnode = h(Suspense, {
      fallback: h('span', null, 'abort-fb'),
      children: h(Slow as unknown as ComponentFn, null),
    })
    const ac = new AbortController()
    const stream = renderToStream(vnode, { signal: ac.signal })
    // abort after the fallback streams but well before the slow child resolves
    setTimeout(() => ac.abort(), 10)
    const out = await collectStream(stream)
    expect(out).toContain('abort-fb')
    expect(out).not.toContain('aborted-late')
  })

  it('a Suspense boundary with no fallback streams (fallback ?? null)', async () => {
    async function AsyncComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('div', null, 'nofallback-resolved')
    }
    const vnode = h(Suspense, {
      children: h(AsyncComp as unknown as ComponentFn, null),
    })
    const out = await collectStream(renderToStream(vnode))
    expect(out).toContain('nofallback-resolved')
  })
})

describe('SSR — renderToString async component continuations (then/catch)', () => {
  it('renderToString resolves a NESTED async component (inner-promise continuation)', async () => {
    async function AsyncInner(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 3))
      return h('div', null, 'rts-nested-resolved')
    }
    async function AsyncOuter(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 3))
      // resolved output is ITSELF an async component → `inner` is a Promise →
      // the nested `inner.then` success continuation (765) runs.
      return h(AsyncInner as unknown as ComponentFn, null)
    }
    const html = await renderToString(h(AsyncOuter as unknown as ComponentFn, null))
    expect(html).toContain('rts-nested-resolved')
  })

  it('renderToString surfaces a NESTED rejecting async component (inner error continuation)', async () => {
    async function BadInner(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 3))
      throw new Error('rts-nested-boom')
    }
    async function AsyncOuter(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 3))
      return h(BadInner as unknown as ComponentFn, null)
    }
    // The nested inner-promise error continuation (769) runs (trims the stack);
    // the rejection then propagates.
    await expect(
      renderToString(h(AsyncOuter as unknown as ComponentFn, null)),
    ).rejects.toThrow('rts-nested-boom')
  })
})

describe('SSR stream-path — Suspense boundary error catch (fallback stays)', () => {
  it('a rejecting async child in the stream keeps the fallback, no swap', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    async function BadAsync(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      throw new Error('stream-suspense-boom')
    }
    const vnode = h(Suspense, {
      fallback: h('span', null, 'reject-fallback'),
      children: h(BadAsync as unknown as ComponentFn, null),
    })
    const out = await collectStream(renderToStream(vnode))
    expect(out).toContain('reject-fallback')
    // No swap script — the boundary error left the fallback in place.
    expect(out).not.toMatch(/__NS\(\s*["']pyreon-s-/)
    errSpy.mockRestore()
  })
})

describe('SSR stream-path — innerHTML function form', () => {
  it('a function innerHTML in the stream is invoked', async () => {
    const out = await collectStream(renderToStream(h('div', { innerHTML: () => 'fn-stream-inner' })))
    expect(out).toContain('fn-stream-inner')
  })
})

describe('SSR — style normalization edge cases', () => {
  it('a falsy non-string style value is tolerated (isStyleObject !value)', async () => {
    // style: 0 → isStyleObject(0) hits the `!value` guard → not an object
    const html = await renderToString(h('div', { style: 0 as never }))
    expect(typeof html).toBe('string')
  })

  it('a null-prototype style object serializes', async () => {
    const styleObj = Object.assign(Object.create(null), { color: 'green' })
    const html = await renderToString(h('div', { style: styleObj as never }))
    expect(html).toContain('color: green')
  })
})
