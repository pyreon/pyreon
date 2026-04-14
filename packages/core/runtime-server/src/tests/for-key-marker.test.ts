import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '../index'

// For list SSR emits <!--k:KEY--> markers between items. The key is
// user-supplied (derived from `by`) and must not be able to break out
// of the HTML comment. A naive inline of `-->` would terminate the
// comment and inject arbitrary markup. This suite locks the fix.

describe('For SSR — key marker safety', () => {
  it('emits one marker per item with the expected key for normal ids', async () => {
    type Row = { id: number; label: string }
    const items = signal<Row[]>([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ])
    const html = await renderToString(
      h(For, {
        each: () => items(),
        by: (r: Row) => r.id,
        children: (r: Row) => h('li', null, r.label),
      }),
    )

    const markers = html.match(/<!--k:[^>]*-->/g) ?? []
    expect(markers).toHaveLength(3)
    // Numeric keys are URL-encoded predictably (digits survive).
    expect(markers[0]).toBe('<!--k:1-->')
    expect(markers[1]).toBe('<!--k:2-->')
    expect(markers[2]).toBe('<!--k:3-->')
  })

  it('prevents comment-breakout via `-->` in the key (XSS guard)', async () => {
    // Adversarial: a key that would, unsanitized, close the comment and
    // inject a <script> tag.
    const attackKey = '--><script>alert(1)</script><!--'
    type Row = { id: string }
    const items = signal<Row[]>([{ id: attackKey }])
    const html = await renderToString(
      h(For, {
        each: () => items(),
        by: (r: Row) => r.id,
        children: () => h('li', null, 'x'),
      }),
    )

    // The raw attacker string must NOT appear verbatim.
    expect(html).not.toContain('<script>alert(1)</script>')
    // The `-->` terminator must not appear anywhere but at the very end
    // of the marker (after the encoded key).
    const markerMatch = html.match(/<!--k:([^-]*)-->/)
    expect(markerMatch).not.toBeNull()
    // No literal `-` survives inside the encoded key (defense-in-depth
    // against any future HTML-comment parsing quirk).
    expect(markerMatch![1]).not.toMatch(/-/)
  })

  it('URL-encodes keys with special chars safely', async () => {
    type Row = { id: string }
    const items = signal<Row[]>([{ id: 'a&b=c d' }])
    const html = await renderToString(
      h(For, {
        each: () => items(),
        by: (r: Row) => r.id,
        children: () => h('li', null, 'x'),
      }),
    )

    const marker = html.match(/<!--k:([^>]*)-->/)
    expect(marker).not.toBeNull()
    // `&`, `=`, ` `, and `-` all URL-encoded.
    expect(marker![1]).toBe('a%26b%3Dc%20d')
  })
})
