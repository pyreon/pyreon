/**
 * `lazy()` on the server. A lazy component whose chunk has not settled yet used
 * to render as nothing: the renderers never awaited it. Inside a streamed
 * `<Suspense>` that produced an EMPTY `<template>`, and the swap replaced the
 * fallback with NOTHING — the first request after a lazily-evaluated chunk
 * served a blank boundary. `renderToString` kept the fallback forever instead.
 *
 * The contract now matches async components: both renderers wait for the lazy
 * chunk (the stream does so inside the boundary, after flushing the fallback).
 */
import { type ComponentFn, Suspense, h, lazy } from '@pyreon/core'
import { renderToStream, renderToString } from '../index'

async function read(s: ReadableStream<string>): Promise<string> {
  const r = s.getReader()
  let out = ''
  for (;;) {
    const { value, done } = await r.read()
    if (done) return out
    out += value
  }
}

const Quote: ComponentFn<{ who?: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who ?? 'x'}`)

function slowLazy(ms = 20) {
  return lazy<{ who?: string }>(
    () => new Promise((r) => setTimeout(() => r({ default: Quote }), ms)),
  )
}

describe('lazy() — renderToStream', () => {
  it('streams the lazy child into the Suspense swap template (not an empty one)', async () => {
    const Lazy = slowLazy()
    const html = await read(
      renderToStream(
        h('div', null, h(Suspense, { fallback: h('i', null, 'fb') }, h(Lazy, { who: 'a' }))),
      ),
    )
    expect(html).toContain('<div id="pyreon-s-0"><i>fb</i></div>')
    expect(html).toMatch(/<template id="pyreon-t-0"><p class="q">quote:a<\/p><\/template>/)
    // The fallback is flushed BEFORE the resolved content.
    expect(html.indexOf('<i>fb</i>')).toBeLessThan(html.indexOf('quote:a'))
  })

  it('awaits a lazy nested below the Suspense boundary', async () => {
    const Lazy = slowLazy()
    const html = await read(
      renderToStream(
        h(Suspense, { fallback: h('i', null, 'fb') }, h('section', null, h(Lazy, { who: 'n' }))),
      ),
    )
    expect(html).toMatch(/<template id="pyreon-t-0"><section><p class="q">quote:n<\/p><\/section><\/template>/)
  })

  it('a lazy that FAILS to load keeps the fallback (no swap)', async () => {
    const Broken = lazy<Record<string, never>>(
      () => new Promise((_, rej) => setTimeout(() => rej(new Error('chunk 404')), 5)),
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const html = await read(
      renderToStream(h(Suspense, { fallback: h('i', null, 'fb') }, h(Broken, {}))),
    )
    err.mockRestore()
    expect(html).toContain('<i>fb</i>')
    expect(html).not.toContain('<template id="pyreon-t-0">')
  })

  it('awaits a lazy outside any Suspense, like an async component', async () => {
    const Lazy = slowLazy()
    const html = await read(renderToStream(h('main', null, h(Lazy, { who: 'o' }))))
    expect(html).toContain('<main><p class="q">quote:o</p></main>')
  })
})

describe('lazy() — renderToString', () => {
  it('renders the lazy child inside Suspense instead of the fallback', async () => {
    const Lazy = slowLazy()
    const html = await renderToString(
      h('div', null, h(Suspense, { fallback: h('i', null, 'fb') }, h(Lazy, { who: 's' }))),
    )
    expect(html).toContain('quote:s')
    expect(html).not.toContain('<i>fb</i>')
  })

  it('awaits a lazy outside any Suspense', async () => {
    const Lazy = slowLazy()
    const html = await renderToString(h('main', null, h(Lazy, { who: 't' })))
    expect(html).toBe('<main><p class="q">quote:t</p></main>')
  })

  it('an already-loaded lazy renders synchronously-shaped output (no extra wait)', async () => {
    const Lazy = slowLazy(1)
    await renderToString(h(Lazy, {}))
    const html = await renderToString(h(Suspense, { fallback: 'fb' }, h(Lazy, { who: 'w' })))
    expect(html).toContain('quote:w')
  })

  it('a lazy that FAILS to load rejects the render like a throwing component', async () => {
    const Broken = lazy<Record<string, never>>(() => Promise.reject(new Error('chunk 404')))
    await expect(renderToString(h('main', null, h(Broken, {})))).rejects.toThrow('chunk 404')
  })
})
