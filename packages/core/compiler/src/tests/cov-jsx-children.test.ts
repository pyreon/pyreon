/**
 * Branch coverage — `jsx.ts` CHILD classification, literal baking and text
 * normalisation. Each spec pairs the shape that takes an arm with the
 * neighbouring shape that must not.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string, file = 'in.tsx') => transformJSX_JS(src, file).code
const bothAgree = (src: string, file = 'in.tsx') => {
  const js = transformJSX_JS(src, file).code
  expect(transformJSX(src, file).code).toBe(js)
  return js
}

describe('jsx.ts — literal expression children (literalChildText)', () => {
  it('bakes a no-substitution TEMPLATE LITERAL child', () => {
    const out = bothAgree('<div>{`hi`}</div>')
    expect(out).toContain('_tpl("<div>hi</div>"')
    expect(out).not.toContain('_setChild')
  })

  it('does NOT bake a template literal WITH a substitution', () => {
    const out = t('<div>{`hi ${n}`}</div>')
    expect(out).not.toContain('<div>hi ')
    expect(out).toContain('_setChild(__root, `hi ${n}`)')
  })

  it('bakes `{null}` / `{undefined}` / `{false}` / `{true}` as NOTHING', () => {
    for (const v of ['null', 'undefined', 'false', 'true']) {
      const out = t(`<div>{${v}}</div>`)
      expect(out).toContain('_tpl("<div></div>"')
      expect(out).not.toContain('_setChild')
    }
  })

  it('does NOT bake a REGEX literal child — it keeps the runtime path', () => {
    // A `Literal` whose `value` is neither string, number, null nor boolean
    // falls through to `null`, so the runtime renders it.
    const out = t('<div>{/re/}</div>')
    expect(out).toContain('_setChild(__root, /re/)')
    expect(out).not.toContain('<div>/re/</div>')
  })

  it('does NOT bake a BIGINT literal child either', () => {
    const out = t('<div>{1n}</div>')
    expect(out).toContain('_setChild')
    expect(out).not.toContain('<div>1</div>')
  })
})

describe('jsx.ts — bakeable numeric literals (bakeableNumberRaw)', () => {
  it('bakes a plain decimal whose SOURCE is its String() form', () => {
    expect(bothAgree('<div>{42}</div>')).toContain('_tpl("<div>42</div>"')
    expect(t('<div>{3.5}</div>')).toContain('_tpl("<div>3.5</div>"')
    expect(t('<div>{0}</div>')).toContain('_tpl("<div>0</div>"')
  })

  it('does NOT bake EXPONENT notation (`1e3` ≠ "1000")', () => {
    const out = t('<div>{1e3}</div>')
    expect(out).toContain('_setChild(__root, 1e3)')
    expect(out).not.toContain('<div>1e3</div>')
  })

  it('does NOT bake HEX notation (`0x10` ≠ "16")', () => {
    const out = t('<div>{0x10}</div>')
    expect(out).toContain('_setChild')
    expect(out).not.toContain('<div>0x10</div>')
  })

  it('does NOT bake a TRAILING-ZERO fraction (`1.50` ≠ "1.5")', () => {
    const out = t('<div>{1.50}</div>')
    expect(out).toContain('_setChild')
    expect(out).not.toContain('<div>1.50</div>')
  })

  it('does NOT bake a numeric SEPARATOR literal (`1_000` ≠ "1_000")', () => {
    const out = t('<div>{1_000}</div>')
    expect(out).toContain('_setChild')
    expect(out).not.toContain('<div>1_000</div>')
  })

  it('does NOT bake a number past 15 significant digits (rounding could separate source from String())', () => {
    const out = t('<div>{1.2345678901234567}</div>')
    expect(out).toContain('_setChild')
    expect(out).not.toContain('<div>1.2345678901234567</div>')
  })

  it('DOES bake a 15-significant-digit number (the boundary that still round-trips)', () => {
    const out = t('<div>{1.23456789012345}</div>')
    expect(out).toContain('_tpl("<div>1.23456789012345</div>"')
  })
})

describe('jsx.ts — empty expression containers', () => {
  it('a COMMENT-only child (`{/* c */}`) contributes nothing', () => {
    const out = bothAgree('<div>a{/* note */}b</div>')
    expect(out).toContain('_tpl("<div>ab</div>"')
    expect(out).not.toContain('_setChild')
  })

  it('a NON-empty expression child in the same position DOES emit a child set', () => {
    const out = t('<div>a{x}b</div>')
    expect(out).toContain('_setChildAt(__root, __p0, x)')
    expect(out).toContain('<!>')
  })
})

describe('jsx.ts — string-literal children escape for the <template> parser', () => {
  it('escapes `&`, `<` and `>` in a LITERAL string child (they are data, not markup)', () => {
    const out = t('<div>{"a & b < c > d"}</div>')
    expect(out).toContain('&amp;')
    expect(out).toContain('&lt;')
    expect(out).toContain('&gt;')
    expect(out).not.toContain('a & b')
  })

  it('escapes a NEWLINE in a literal string child to a numeric entity', () => {
    // Plain JSX text can never carry a newline; a literal can, and a raw one
    // breaks the emitted double-quoted JS string.
    const out = t('<pre>{"// a\\nb"}</pre>')
    expect(out).toContain('&#10;')
    expect(out).not.toMatch(/_tpl\("<pre>[^"]*\n/)
  })

  it('plain JSX TEXT keeps an existing entity intact (entity-aware `&`)', () => {
    const out = t('<div>a &amp; b</div>')
    expect(out).toContain('&amp;')
    expect(out).not.toContain('&amp;amp;')
  })
})

describe('jsx.ts — JSX text normalisation (cleanJsxText)', () => {
  it('drops a whitespace-only text child between elements', () => {
    const out = t('<div>\n  <span>a</span>\n  <span>b</span>\n</div>')
    expect(out).toContain('<div><span>a</span><span>b</span></div>')
  })

  it('collapses a MULTI-LINE text child to single-spaced content', () => {
    const out = t('<p>\n  hello\n  world\n</p>')
    expect(out).toContain('hello world')
    expect(out).not.toContain('\\n')
  })

  it('preserves an INLINE trailing space before a sibling element', () => {
    const out = t('<p>Press <kbd>K</kbd></p>')
    expect(out).toContain('Press <kbd>K</kbd>')
  })

  it('collapses a TAB-indented multi-line text child', () => {
    const out = t('<p>\n\thello\n\tworld\n</p>')
    expect(out).toContain('hello world')
  })

  it('keeps a text child that is a SINGLE space between two elements', () => {
    const out = t('<p><b>a</b> <b>b</b></p>')
    expect(out).toContain('</b> <b>')
  })
})

describe('jsx.ts — fragment children flatten into the enclosing template', () => {
  it('flattens a DIRECT fragment child', () => {
    const out = bothAgree('<div><><span>a</span><span>b</span></></div>')
    expect(out).toContain('<div><span>a</span><span>b</span></div>')
  })

  it('flattens a NESTED fragment child at any depth', () => {
    const out = t('<div><><><span>a</span></></></div>')
    expect(out).toContain('<div><span>a</span></div>')
  })

  it('a fragment carrying an EXPRESSION child still emits a child set for it', () => {
    const out = t('<div><><span>a</span>{x}</></div>')
    expect(out).toContain('_setChildAt')
    expect(out).toContain('<span>a</span><!>')
  })
})

describe('jsx.ts — a STATIC JSX expression child is hoisted, not templated in place', () => {
  it('hoists `{<span/>}` to module scope', () => {
    const out = t('const v = <div>{<span>hi</span>}</div>')
    expect(out).toMatch(/const _\$h\d+ =/)
  })

  it('does NOT hoist a DYNAMIC element child', () => {
    const out = t('const v = <div>{<span>{x}</span>}</div>')
    expect(out).not.toMatch(/const _\$h\d+ =/)
  })
})
