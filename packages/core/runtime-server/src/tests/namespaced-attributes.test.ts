/**
 * Namespaced attributes through SSR — and the DRIFT LOCK for the server bytes
 * `runtime-dom`'s `namespaced-attributes.browser.test.tsx` hand-writes (it
 * cannot import this package: `node:async_hooks`).
 *
 * SSR needed no change — `toAttrName` passes a qualified name through, and the
 * bytes are then parsed by the browser, which applies the HTML "adjust foreign
 * attributes" step. That is precisely WHY the client had to be fixed rather than
 * the server: the parsed form (SSR, and the compiled `_tpl` bake, which also
 * goes through the parser) put `xlink:href` in the XLink namespace, while every
 * client-side `setAttribute` spelling did not — so a server-rendered sprite
 * worked and its own client mount did not.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToStream, renderToString } from '../index'

describe('SSR serializes the qualified attribute name', () => {
  it('emits the exact bytes the browser twin hand-writes', async () => {
    const html = await renderToString(
      h('svg', { width: 100, height: 100 }, [h('use', { 'xlink:href': '#icon' })]),
    )
    expect(html).toBe('<svg width="100" height="100"><use xlink:href="#icon"></use></svg>')
  })

  it('keeps xml:lang / xlink:title intact', async () => {
    expect(await renderToString(h('text', { 'xml:lang': 'cs' }, 'x'))).toBe(
      '<text xml:lang="cs">x</text>',
    )
    expect(await renderToString(h('use', { 'xlink:title': 'Icon' }))).toBe(
      '<use xlink:title="Icon"></use>',
    )
  })

  it('resolves an accessor value, like every other attribute', async () => {
    expect(await renderToString(h('use', { 'xlink:href': () => '#icon' }))).toBe(
      '<use xlink:href="#icon"></use>',
    )
  })

  it('omits a nullish value rather than writing "undefined"', async () => {
    expect(await renderToString(h('use', { 'xlink:href': undefined }))).toBe('<use></use>')
    expect(await renderToString(h('use', { 'xlink:href': null }))).toBe('<use></use>')
  })

  it('runs the url guard over xlink:href, as it does over href', async () => {
    // `xlink:href` is in URL_ATTRS — a `javascript:` URL must not survive to the
    // client, where it would be an execution sink on an SVG `<a>`.
    const html = await renderToString(h('use', { 'xlink:href': 'javascript:alert(1)' }))
    expect(html).not.toContain('javascript:')
  })

  it('the streaming renderer agrees with the string renderer', async () => {
    const vnode = () => h('svg', null, [h('use', { 'xlink:href': '#icon' })])
    const chunks: string[] = []
    const stream = renderToStream(vnode())
    const reader = stream.getReader()
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(typeof value === 'string' ? value : dec.decode(value as Uint8Array))
    }
    expect(chunks.join('')).toContain('<use xlink:href="#icon"></use>')
    expect(chunks.join('')).toContain(await renderToString(vnode()))
  })
})
