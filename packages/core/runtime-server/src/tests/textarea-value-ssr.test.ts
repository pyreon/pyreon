// `<textarea value>` SSR — the sibling of the `<select value>` class (PZ-09),
// missed when that landed.
//
// <textarea> has NO `value` CONTENT attribute: the value IS the element's text
// content. SSR serialized it as a plain attribute, which the HTML parser
// ignores entirely — so a server-rendered prefilled textarea came back EMPTY,
// filled in only after hydration, and stayed empty with JS off.
//
//   before  <textarea value="hello"></textarea>   → renders blank
//   after   <textarea>hello</textarea>            → renders "hello"
//
// It was also an SSR/client divergence: the client was already correct, because
// `applyProps` sets the `.value` PROPERTY rather than an attribute.

import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { renderToStream, renderToString } from '../index'

const streamToString = async (vnode: ReturnType<typeof h>): Promise<string> => {
  const chunks: string[] = []
  const stream = renderToStream(vnode)
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(typeof value === 'string' ? value : decoder.decode(value))
  }
  return chunks.join('')
}

describe('<textarea value> SSR', () => {
  it('emits the value as TEXT CONTENT, not a dead attribute', async () => {
    const html = await renderToString(h('textarea', { value: 'hello world' }))
    expect(html).toBe('<textarea>hello world</textarea>')
    // The attribute form is what made the control render blank.
    expect(html).not.toContain('value=')
  })

  // Value wins over children because that is what the CLIENT does: a `.value`
  // property set after children mount overrides the text content. SSR emitting
  // the children instead would be a hydration mismatch.
  it('lets value win over children, matching the client', async () => {
    expect(await renderToString(h('textarea', { value: 'v' }, 'child'))).toBe(
      '<textarea>v</textarea>',
    )
  })

  it('leaves children alone when there is no value prop', async () => {
    expect(await renderToString(h('textarea', {}, 'just children'))).toBe(
      '<textarea>just children</textarea>',
    )
  })

  it('escapes the value — it is text content, so it is an injection site', async () => {
    const html = await renderToString(h('textarea', { value: '</textarea><script>x()</script>' }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;/textarea&gt;')
  })

  it('resolves an accessor value', async () => {
    expect(await renderToString(h('textarea', { value: () => 'lazy' }))).toBe(
      '<textarea>lazy</textarea>',
    )
  })

  it('treats null / undefined as "no value", keeping children', async () => {
    expect(await renderToString(h('textarea', { value: null }, 'kept'))).toBe(
      '<textarea>kept</textarea>',
    )
    expect(await renderToString(h('textarea', { value: undefined }, 'kept'))).toBe(
      '<textarea>kept</textarea>',
    )
  })

  it('coerces a numeric value', async () => {
    expect(await renderToString(h('textarea', { value: 42 }))).toBe('<textarea>42</textarea>')
  })

  // <input> DOES have a value content attribute — it must keep it. This is the
  // guard against over-applying the fix to every form control.
  it('does NOT touch <input value>, which is a real attribute', async () => {
    expect(await renderToString(h('input', { value: 'x' }))).toContain('value="x"')
  })

  // The stream path is a SEPARATE code path from the string path and had the
  // same bug; a fix to one is not a fix to the other.
  it('is fixed on the STREAM path too', async () => {
    expect(await streamToString(h('textarea', { value: 'streamed' }))).toContain(
      '<textarea>streamed</textarea>',
    )
  })
})
