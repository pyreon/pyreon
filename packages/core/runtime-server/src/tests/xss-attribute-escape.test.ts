import { h } from '@pyreon/core'
import { renderToString } from '../index'

// Lock-in regression suite for attribute-value escaping. Flagged as
// PR #233 follow-up: would a user-supplied string with embedded
// HTML-significant characters break out of an attribute value and
// inject arbitrary markup? Verified: escapeHtml covers all five
// critical characters (& < > " '); this suite locks the invariant.

describe('renderToString — attribute value escaping', () => {
  it('escapes double quotes in attribute values (breakout prevention)', async () => {
    const html = await renderToString(h('div', { 'data-x': 'he said "hi"' }))
    expect(html).toContain('data-x="he said &quot;hi&quot;"')
  })

  it('escapes single quotes in attribute values', async () => {
    const html = await renderToString(h('div', { 'data-x': "it's fine" }))
    expect(html).toContain('data-x="it&#39;s fine"')
  })

  it('escapes ampersands (prevent entity confusion)', async () => {
    const html = await renderToString(h('a', { href: 'https://x.test?a=1&b=2' }))
    expect(html).toContain('href="https://x.test?a=1&amp;b=2"')
  })

  it('escapes < and > (prevent tag injection via attribute)', async () => {
    const html = await renderToString(h('div', { 'data-x': '<script>bad</script>' }))
    expect(html).toContain('data-x="&lt;script&gt;bad&lt;/script&gt;"')
  })

  it('escapes all five critical characters in a single value', async () => {
    const html = await renderToString(h('div', { title: `&<>"'` }))
    expect(html).toContain('title="&amp;&lt;&gt;&quot;&#39;"')
  })

  it('escapes text children containing HTML-significant chars', async () => {
    const html = await renderToString(h('p', null, 'a & b < c > "d"'))
    expect(html).toContain('a &amp; b &lt; c &gt; &quot;d&quot;')
  })
})
