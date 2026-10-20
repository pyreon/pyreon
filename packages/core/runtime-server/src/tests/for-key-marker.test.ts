import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { decodeKeyFromMarker, renderToString } from '../index'

// For list SSR carries every item's key in an HTML comment — on the closing
// marker (`<!--/pyreon-for:k0 k1 …-->`) for a leading run of single-element
// rows, and as a per-row `<!--k:KEY-->` marker from the first row of any
// other shape on. The key is user-supplied (derived from `by`) and must not
// be able to break out of EITHER comment form. A naive inline of `-->` would
// terminate the comment and inject arbitrary markup. This suite locks the fix
// for both forms.

// A component row is not a single-element row, so it takes the per-row form.
const CompRow = () => h('li', null, 'x')
const ROW_FORMS = [
  { name: 'closing-marker key list', row: () => h('li', null, 'x'), re: /<!--\/pyreon-for:([^>]*)-->/ },
  { name: 'per-row marker', row: () => h(CompRow, null), re: /<!--k:([^>]*)-->/ },
] as const

describe('For SSR — key marker safety', () => {
  it('carries a leading run of single-element rows\' keys on the closing marker', async () => {
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
    expect(html).toBe('<!--pyreon-for--><li>a</li><li>b</li><li>c</li><!--/pyreon-for:1 2 3-->')
  })

  it('switches to per-row markers from the first row that is not a single element', async () => {
    type Row = { id: number; comp: boolean }
    const items = signal<Row[]>([
      { id: 1, comp: false },
      { id: 2, comp: true },
      { id: 3, comp: false },
    ])
    const html = await renderToString(
      h(For, {
        each: () => items(),
        by: (r: Row) => r.id,
        children: (r: Row) => (r.comp ? h(CompRow, null) : h('li', null, String(r.id))),
      }),
    )
    // Row 1 is bare (its key on the closing marker); row 2 starts the marked
    // region, and row 3 stays marked even though it is an element again.
    expect(html).toBe(
      '<!--pyreon-for--><li>1</li><!--k:2--><li>x</li><!--k:3--><li>3</li><!--/pyreon-for:1-->',
    )
  })

  for (const form of ROW_FORMS) {
    it(`prevents comment-breakout via \`-->\` in the key (XSS guard) — ${form.name}`, async () => {
      // Adversarial: a key that would, unsanitized, close the comment and
      // inject a <script> tag.
      const attackKey = '--><script>alert(1)</script><!--'
      type Row = { id: string }
      const items = signal<Row[]>([{ id: attackKey }])
      const html = await renderToString(
        h(For, { each: () => items(), by: (r: Row) => r.id, children: form.row }),
      )

      // The raw attacker string must NOT appear verbatim.
      expect(html).not.toContain('<script>alert(1)</script>')
      const markerMatch = html.match(form.re)
      expect(markerMatch).not.toBeNull()
      // No literal `-` survives inside the encoded key (defense-in-depth
      // against any future HTML-comment parsing quirk).
      expect(markerMatch![1]).not.toMatch(/-/)
    })

    it(`URL-encodes keys with special chars safely — ${form.name}`, async () => {
      type Row = { id: string }
      const items = signal<Row[]>([{ id: 'a&b=c d' }])
      const html = await renderToString(
        h(For, { each: () => items(), by: (r: Row) => r.id, children: form.row }),
      )

      const marker = html.match(form.re)
      expect(marker).not.toBeNull()
      // `&`, `=`, ` `, and `-` all URL-encoded — the space in particular, since
      // it separates keys in the closing-marker list.
      expect(marker![1]).toBe('a%26b%3Dc%20d')
      // decodeKeyFromMarker round-trips back to the original string.
      expect(decodeKeyFromMarker(marker![1]!)).toBe('a&b=c d')
    })
  }

  it('decodeKeyFromMarker round-trips adversarial keys', () => {
    // Directly round-trip the adversarial case that motivated the fix.
    const attackKey = '--><script>alert(1)</script><!--'
    // Produce what SSR would emit (safeKeyForMarker is private; use
    // the inverse on a value we know was encoded from it).
    const encoded = encodeURIComponent(attackKey).replace(/-/g, '%2D')
    expect(decodeKeyFromMarker(encoded)).toBe(attackKey)
  })
})
