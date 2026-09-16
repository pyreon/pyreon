import { describe, expect, it } from 'vitest'

import { cssDecl, headingTag, padStr, sanitizeNumber, styleDecls } from '../renderers/css'
import { emailRenderer } from '../renderers/email'
import { htmlRenderer } from '../renderers/html'
import { svgRenderer } from '../renderers/svg'
import type { DocNode } from '../types'

/**
 * PR #3435 guarded ONE field — `TableColumn.width` breaking out of a `style`
 * attribute. The reproduced SHAPE was fixed; the CLASS was not. Every
 * user-controllable value that reaches an attribute or style position in the
 * `html` and `email` renderers broke out the same way, including `col.align`
 * one line above the guarded `width`, the image `width`/`height` ATTRIBUTES,
 * and — because the email renderer had no sanitizing funnel at all — the whole
 * of its `heading`, `text`, `section`, `divider`, `spacer` and `button` emit.
 * `email`'s `heading` even interpolated `level` into the TAG NAME.
 *
 * The oracle is a real parse, not a substring: a payload surviving INSIDE a
 * style value as inert CSS is exactly what sanitizing means, so asserting its
 * absence would assert the wrong thing. What must never happen is a new
 * ATTRIBUTE appearing — so parse the output and look for one.
 */

const node = (type: string, props: Record<string, unknown>, children: unknown[] = []): DocNode =>
  ({ type, props, children }) as never

/** Every attribute whose name starts with `on`, anywhere in the parsed output. */
function eventAttributes(html: string): string[] {
  const host = document.createElement('div')
  host.innerHTML = html
  const found: string[] = []
  for (const el of host.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      if (attr.name.toLowerCase().startsWith('on')) found.push(`${el.tagName}@${attr.name}`)
    }
  }
  return found
}

const ATTR = '1" onerror="alert(1)'
const STYLE = '1px;x:y" onmouseover="alert(1)'

/** Every site a hostile value can reach an attribute / style position. */
const cases: { name: string; doc: DocNode }[] = [
  // ── table cells — the #3435 neighbourhood ────────────────────────────────
  {
    name: 'TableColumn.align (th + td)',
    doc: node('table', {
      columns: [{ header: 'A', align: 'left;" onmouseover="alert(1)' }],
      rows: [['1']],
    }),
  },
  {
    name: 'TableColumn.width (the #3435 field)',
    doc: node('table', { columns: [{ header: 'A', width: STYLE }], rows: [['1']] }),
  },
  // ── attribute positions (no style value involved at all) ─────────────────
  { name: 'image width attribute', doc: node('image', { src: 'x.png', width: ATTR }) },
  { name: 'image height attribute', doc: node('image', { src: 'x.png', height: ATTR }) },
  { name: 'heading level in the TAG NAME', doc: node('heading', { level: '1 onload="x"' }, ['H']) },
  // ── style positions the renderers build by hand ──────────────────────────
  { name: 'divider thickness', doc: node('divider', { thickness: STYLE }) },
  { name: 'spacer height', doc: node('spacer', { height: STYLE }) },
  { name: 'heading align', doc: node('heading', { align: STYLE }, ['H']) },
  { name: 'text size', doc: node('text', { size: STYLE }, ['T']) },
  { name: 'text lineHeight', doc: node('text', { lineHeight: STYLE }, ['T']) },
  { name: 'text align', doc: node('text', { align: STYLE }, ['T']) },
  { name: 'section padding', doc: node('section', { padding: [STYLE, 2] }, ['S']) },
  { name: 'section borderRadius', doc: node('section', { borderRadius: STYLE }, ['S']) },
  {
    name: 'section gap (row layout)',
    doc: node('section', { direction: 'row', gap: STYLE }, [node('text', {}, ['a'])]),
  },
  { name: 'row gap', doc: node('row', { gap: STYLE }, [node('text', {}, ['a'])]) },
  { name: 'button align', doc: node('button', { href: '#', align: STYLE }, ['go']) },
  { name: 'button borderRadius', doc: node('button', { href: '#', borderRadius: STYLE }, ['go']) },
  { name: 'button padding', doc: node('button', { href: '#', padding: [STYLE, 2] }, ['go']) },
]

const renderers = [
  ['html', htmlRenderer],
  ['email', emailRenderer],
] as const

for (const [format, renderer] of renderers) {
  describe(`${format} renderer — no value reaches an attribute position unguarded`, () => {
    for (const { name, doc } of cases) {
      it(`${name} cannot break out of its attribute`, async () => {
        const out = (await renderer.render(doc)) as string
        expect(
          eventAttributes(out),
          'a hostile value must never become an ATTRIBUTE',
        ).toStrictEqual([])
        // Belt-and-braces on the raw string: an attribute closed early always
        // leaves a quote immediately before the injected handler.
        expect(out, 'no attribute may be closed early').not.toMatch(/"\s*on[a-z]+\s*=/i)
      })
    }
  })

  describe(`${format} renderer — ordinary values still render`, () => {
    it('a table column keeps its align and width', async () => {
      const out = (await renderer.render(
        node('table', {
          columns: [{ header: 'A', align: 'center', width: '120px' }],
          rows: [['1']],
        }),
      )) as string
      expect(out).toContain('text-align:center')
      expect(out).toContain('width:120px')
    })

    it('an image keeps numeric width and height', async () => {
      const out = (await renderer.render(
        node('image', { src: 'x.png', width: 40, height: 20 }),
      )) as string
      expect(out).toContain('width="40"')
      expect(out).toContain('height="20"')
    })

    it('a numeric-typed field supplied as a numeric STRING still renders', async () => {
      // The guard coerces rather than rejects, so a JSON document tree that
      // carries "40" instead of 40 keeps working.
      const out = (await renderer.render(node('image', { src: 'x.png', width: '40' }))) as string
      expect(out).toContain('width="40"')
    })

    it('a heading renders a real h-tag and a divider its thickness', async () => {
      const h = (await renderer.render(node('heading', { level: 3 }, ['H']))) as string
      expect(h).toContain('<h3')
      const d = (await renderer.render(node('divider', { thickness: 3 }))) as string
      expect(d).toContain('border-top:3px')
    })

    it('a spacer and a button keep their numeric geometry', async () => {
      const s = (await renderer.render(node('spacer', { height: 24 }))) as string
      expect(s).toContain('height:24px')
      const b = (await renderer.render(
        node('button', { href: '#', borderRadius: 8, align: 'center' }, ['go']),
      )) as string
      expect(b).toContain('border-radius:8px')
      expect(b).toContain('text-align:center')
    })
  })
}

// ─── svg — the same class, in SVG attribute position ────────────────────────

describe('svg renderer — numeric fields cannot break out of an attribute', () => {
  // The svg renderer emits `font-size="${size}"` / `width="${width}"` /
  // `stroke-width="${thickness}"` from fields typed `number`, so the same
  // untyped document tree closes them. It also adds them to `ctx.y`, where a
  // non-number silently poisons every later coordinate with NaN.
  const svgCases: { name: string; doc: DocNode }[] = [
    { name: 'text size', doc: node('text', { size: ATTR }, ['T']) },
    { name: 'image width', doc: node('image', { src: 'http://x/y.png', width: ATTR }) },
    { name: 'image height', doc: node('image', { src: 'http://x/y.png', height: ATTR }) },
    { name: 'divider thickness', doc: node('divider', { thickness: ATTR }) },
  ]

  for (const { name, doc } of svgCases) {
    it(`${name} cannot break out of its attribute`, async () => {
      const out = (await svgRenderer.render(doc)) as string
      expect(eventAttributes(out), 'a hostile value must never become an ATTRIBUTE').toStrictEqual(
        [],
      )
      expect(out, 'no attribute may be closed early').not.toMatch(/"\s*on[a-z]+\s*=/i)
    })
  }

  it('a non-numeric spacer height does not poison every later coordinate', async () => {
    // `ctx.y += p.height` string-concatenates rather than adding, so one bad
    // spacer turned every subsequent coordinate into `40oops`-style garbage
    // (and the document height with it) — no breakout, but nothing renders.
    const out = (await svgRenderer.render(
      node('document', {}, [node('spacer', { height: 'oops' }), node('text', {}, ['after'])]),
    )) as string
    const coords = [...out.matchAll(/\b(?:x|y|x1|y1|x2|y2|width|height)="([^"]*)"/g)].map(
      (m) => m[1] as string,
    )
    expect(coords.length, 'the probe must actually find coordinates').toBeGreaterThan(4)
    const bad = coords.filter((v) => !Number.isFinite(Number(v)))
    expect(bad, 'every coordinate must still be a number').toStrictEqual([])
  })

  it('ordinary numeric geometry still renders', async () => {
    const out = (await svgRenderer.render(node('divider', { thickness: 3 }))) as string
    expect(out).toContain('stroke-width="3"')
  })
})

// ─── The funnel itself ───────────────────────────────────────────────────────

describe('the shared css funnel', () => {
  it('drops a non-finite number rather than emitting it as CSS', () => {
    // `NaN`/`Infinity` ARE numbers, so a `typeof v === 'number'` guard waves
    // them through — `width:NaNpx` is not CSS.
    expect(styleDecls({ width: Number.NaN })).toBe('')
    expect(styleDecls({ width: Number.POSITIVE_INFINITY })).toBe('')
    expect(styleDecls({ width: 12 })).toBe('width:12px')
  })

  it('cssDecl emits a terminated declaration, or nothing at all', () => {
    expect(cssDecl('text-align', 'center')).toBe('text-align:center;')
    expect(cssDecl('text-align', undefined)).toBe('')
    // Nothing survives sanitization → no stray `text-align:;`
    expect(cssDecl('text-align', '"()<>')).toBe('')
  })

  it('sanitizeNumber coerces a numeric string and refuses everything else', () => {
    expect(sanitizeNumber('40')).toBe(40)
    expect(sanitizeNumber(40)).toBe(40)
    expect(sanitizeNumber(Number.NaN, 7)).toBe(7)
    expect(sanitizeNumber('1px" onerror="x')).toBeUndefined()
    expect(sanitizeNumber('   ')).toBeUndefined()
    expect(sanitizeNumber(null, 3)).toBe(3)
  })

  it('padStr drops the whole shorthand when any element is not a number', () => {
    expect(padStr(8)).toBe('8px')
    expect(padStr('8' as never)).toBe('8px')
    expect(padStr([1, 2])).toBe('1px 2px')
    expect(padStr([1, 2, 3, 4])).toBe('1px 2px 3px 4px')
    expect(padStr(undefined)).toBeUndefined()
    expect(padStr([STYLE, 2] as never)).toBeUndefined()
  })

  it('headingTag clamps every out-of-contract level into h1..h6', () => {
    expect(headingTag(3)).toBe('h3')
    expect(headingTag(0)).toBe('h1')
    expect(headingTag(9)).toBe('h6')
    expect(headingTag(2.4)).toBe('h2')
    expect(headingTag('1 onload="x"')).toBe('h1')
    expect(headingTag(undefined)).toBe('h1')
  })
})
