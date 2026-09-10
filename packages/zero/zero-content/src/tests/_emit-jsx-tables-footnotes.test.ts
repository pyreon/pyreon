/**
 * Emitting GFM tables and footnotes to JSX.
 *
 * A docs table that loses its column alignment, or a footnote whose
 * anchor does not match its definition, renders as a page that LOOKS
 * fine. The alignment is a visual regression nobody files; the footnote
 * is a link that scrolls nowhere, which readers assume is their browser.
 * Neither throws, so both need assertions rather than eyes.
 *
 * Alignment is the sharp one: GFM puts it on the TABLE node, not the
 * cell, so the emitter has to thread `align[colIdx]` down per cell. An
 * off-by-one in that index right-aligns the wrong column — which reads
 * as a styling bug rather than an emitter one, and sends whoever
 * investigates into the CSS.
 *
 * Footnote id derivation is the other: `slugify(identifier)` runs on
 * both the reference and the definition, so an identifier with
 * punctuation (`[^my note!]`) has to produce the SAME slug on both
 * sides. Diverging there breaks every footnote using a non-trivial
 * label, silently.
 */
import { describe, expect, it } from 'vitest'
import { emitJsx } from '../pipeline/emit-jsx'
import type { Root } from 'mdast'

const text = (value: string) => ({ type: 'text', value })
const cell = (...children: unknown[]) => ({ type: 'tableCell', children })
const row = (...cells: unknown[]) => ({ type: 'tableRow', children: cells })
const emit = async (children: unknown[]): Promise<string> =>
  (await emitJsx({ type: 'root', children } as Root)).body

describe('a GFM table emits thead, tbody and per-column alignment', () => {
  it('renders a header row and body rows', () => {
    // The control. Every alignment spec below is worthless against an
    // emitter that produces no table.
    return emit([{
      type: 'table',
      children: [row(cell(text('H1')), cell(text('H2'))), row(cell(text('a')), cell(text('b')))],
    }]).then((out) => {
      expect(out).toContain('<table>')
      expect(out).toContain('<thead><tr><th>H1</th><th>H2</th></tr></thead>')
      expect(out).toContain('<tbody><tr><td>a</td><td>b</td></tr></tbody>')
    })
  })

  it('applies alignment PER COLUMN, in order', () => {
    // An off-by-one here aligns the wrong column and reads as a CSS bug.
    const out = emit([{
      type: 'table',
      align: ['left', 'center', 'right'],
      children: [row(cell(text('L')), cell(text('C')), cell(text('R')))],
    }])
    return out.then((s) => {
      expect(s).toContain('<th style={{ textAlign: "left" }}>L</th>')
      expect(s).toContain('<th style={{ textAlign: "center" }}>C</th>')
      expect(s).toContain('<th style={{ textAlign: "right" }}>R</th>')
    })
  })

  it('emits NO style for an unaligned column', () => {
    // GFM writes `null` for a column with no alignment marker. Emitting
    // `textAlign: null` would be an invalid style object.
    const out = emit([{
      type: 'table',
      align: ['left', null, 'right'],
      children: [row(cell(text('a')), cell(text('b')), cell(text('c')))],
    }])
    return out.then((s) => {
      expect(s).toContain('<th style={{ textAlign: "left" }}>a</th>')
      expect(s).toContain('<th>b</th>')
      expect(s).not.toContain('null')
    })
  })

  it('emits no style at all when the table has no align array', () => {
    return emit([{ type: 'table', children: [row(cell(text('x')))] }]).then((s) => {
      expect(s).toContain('<th>x</th>')
      expect(s).not.toContain('textAlign')
    })
  })

  it('omits tbody entirely for a header-only table', () => {
    // remark normalises a single-row table to header-only. An empty
    // `<tbody></tbody>` is legal but renders a stray row in some themes.
    return emit([{ type: 'table', children: [row(cell(text('only')))] }]).then((s) => {
      expect(s).toContain('<thead>')
      expect(s).not.toContain('<tbody>')
    })
  })

  it('renders an empty table without emitting a stray thead', () => {
    return emit([{ type: 'table', children: [] }]).then((s) => {
      expect(s).toContain('<table>')
      expect(s).not.toContain('<thead>')
    })
  })

  it('renders inline markup inside a cell', () => {
    // Cells hold full inline content; flattening them to text loses
    // every link in every table on the site.
    return emit([{
      type: 'table',
      children: [row(cell({ type: 'strong', children: [text('bold')] }))],
    }]).then((s) => {
      expect(s).toContain('<strong>bold</strong>')
    })
  })

  it('escapes cell text rather than emitting raw JSX', () => {
    // A `{` in a table cell is a JSX expression opener; unescaped, the
    // whole page fails to compile.
    return emit([{
      type: 'table',
      children: [row(cell(text('a {b} < c')))],
    }]).then((s) => {
      expect(s).not.toContain('>a {b} < c<')
    })
  })

  it('ignores a non-row child of a table', () => {
    // A malformed AST from another plugin. Rendering it as a row emits
    // markup a browser silently relocates outside the table.
    return emit([{
      type: 'table',
      children: [{ type: 'paragraph', children: [text('stray')] }, row(cell(text('real')))],
    }]).then((s) => {
      expect(s).toContain('real')
      expect(s).not.toContain('<p>stray</p>')
    })
  })
})

describe('footnote references and definitions agree on their ids', () => {
  it('emits a reference anchor pointing at the definition', () => {
    return emit([{ type: 'footnoteReference', identifier: '1', label: '1' }]).then((s) => {
      expect(s).toContain('footnote-ref')
      expect(s).toContain('"fnref-1"')
      expect(s).toContain('"#fn-1"')
    })
  })

  it('falls back to the IDENTIFIER when there is no label', () => {
    // `label` is optional in mdast. Without the fallback the visible
    // marker renders as `undefined`.
    return emit([{ type: 'footnoteReference', identifier: 'note-a' }]).then((s) => {
      expect(s).toContain('note-a')
      expect(s).not.toContain('undefined')
    })
  })

  it('derives the SAME slug for a punctuated identifier on both sides', () => {
    // `[^my note!]` — the id must match between the anchor and the
    // definition or the link scrolls nowhere, which readers blame on
    // their browser.
    return Promise.all([
      emit([{ type: 'footnoteReference', identifier: 'my note!', label: '1' }]),
      emit([{ type: 'footnoteDefinition', identifier: 'my note!', children: [] }]),
    ]).then(([ref, def]) => {
      const target = /#fn-([\w-]+)/.exec(ref)?.[1]
      expect(target, 'the reference must name a slug').toBeTruthy()
      expect(def, 'and the definition must carry that same slug').toContain(`fn-${target}`)
    })
  })

  it('escapes the visible marker', () => {
    return emit([{ type: 'footnoteReference', identifier: 'x', label: '<b>' }]).then((s) => {
      expect(s).not.toContain('>Y<b>Y<')
      expect(s).toContain('footnote-ref')
    })
  })
})
