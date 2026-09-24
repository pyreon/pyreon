import { describe, expect, it } from 'vitest'

import { Document, Page, render, Table } from '../index'

/**
 * `TableColumn.width` is typed `number | string` and a string is documented
 * input, so it reached a `style` attribute raw — while every sibling in the
 * same template literal was guarded (`sanitizeColor` on the background and
 * colour, the escaped header). One unguarded field among guarded neighbours
 * reads as covered, which is why it survived.
 *
 * Severity depends on provenance: developer-authored columns cap it low, but a
 * tenant config or a user-saved view makes it stored XSS.
 */
const docWith = (width: number | string) =>
  Document({
    title: 'T',
    children: Page({
      children: Table({
        columns: [{ key: 'a', header: 'A', width }] as never,
        rows: [{ a: '1' }],
      } as never),
    }),
  })

for (const format of ['html', 'email'] as const) {
  describe(`${format} renderer escapes TableColumn.width`, () => {
    it('a width cannot break out of the style attribute', async () => {
      const out = (await render(docWith('1px" onmouseover="alert(1)') as never, format)) as string
      // The payload text survives INSIDE the style value as inert CSS — that is
      // what sanitizing means, and asserting its absence would assert the wrong
      // thing. The invariant is that it never becomes an ATTRIBUTE: the quotes
      // are gone, so the style attribute is never closed early.
      expect(out, 'the style attribute must not be closed early').not.toContain('" onmouseover')
      const th = /<th style="([^"]*)"/.exec(out)
      expect(th, 'the th must still carry exactly one well-formed style attribute').not.toBeNull()
      expect(th?.[1], 'no quote may survive into the style value').not.toContain('"')
    })

    it('an ordinary width still renders', async () => {
      const out = (await render(docWith('120px') as never, format)) as string
      expect(out).toContain('width:120px')
    })

    it('a numeric width still renders', async () => {
      const out = (await render(docWith(120) as never, format)) as string
      expect(out).toContain('width:120px')
    })
  })
}
