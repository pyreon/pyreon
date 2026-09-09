import { describe, expect, it } from 'vitest'

import { transformJSX } from '../index'

const compile = (src: string, opts: Record<string, unknown> = {}): string => {
  const out = transformJSX(src, 'c.tsx', opts as never)
  return typeof out === 'string' ? out : (out as { code: string }).code
}

/**
 * JSXText is HTML SOURCE. The parser decodes `&nbsp;` / `&amp;` / `&mdash;`
 * before the characters ever reach a DOM text node — which is why the unfused
 * path is correct by construction: the text is baked into the `_tpl` HTML
 * string and `_tpl` parses it via `innerHTML`.
 *
 * Text fusion (#3341) moves that same text into a JS STRING LITERAL handed to
 * `bindPolymorphicText`, which assigns `Text.data`. That assignment parses
 * nothing, so the literal characters `&nbsp;items` render on screen. Measured
 * before the fix:
 *
 *   <span>&nbsp;items</span>        -> _tpl("<span>&nbsp;items</span>")      correct
 *   <span>{n()}&nbsp;items</span>   -> _fuse(n(), "&nbsp;items")             literal
 *
 * and on the SSR arm `_escSole` escapes the `&` again into `&amp;nbsp;`, so
 * the two halves of a hydrating page disagree as well.
 *
 * Fusion therefore bails on any `&` in JSXText. Conservative on purpose: a bare
 * `&` is harmless either way and HTML decodes some entities without the
 * trailing semicolon, so a precise entity regex would buy a rare fusion at the
 * cost of being wrong about the cases it did not enumerate. `ssrSerializeChild`
 * already bails on the same character for the same reason.
 */
describe('text fusion does not swallow HTML entities', () => {
  it('an entity beside an interpolation is NOT fused', () => {
    const code = compile(`export const A = () => <span>{n()}&nbsp;items</span>`)
    expect(code, 'fusion would put the entity in a JS string literal').not.toContain('_fuse(')
    // It must land where the HTML parser can see it.
    expect(code).toContain('&nbsp;items</span>')
  })

  it('the entity is never emitted as a JS string literal', () => {
    const code = compile(`export const A = () => <span>{n()}&nbsp;items</span>`)
    expect(code).not.toContain('"&nbsp;items"')
    expect(code).not.toContain("'&nbsp;items'")
  })

  for (const ent of ['&amp;', '&mdash;', '&times;', '&copy;', '&#8212;']) {
    it(`${ent} beside an interpolation is NOT fused`, () => {
      const code = compile(`export const A = () => <span>{n()}${ent}x</span>`)
      expect(code).not.toContain('_fuse(')
    })
  }

  it('SSR: an entity beside an interpolation is not double-escaped through the fused arm', () => {
    const code = compile(`export const A = () => <span>{n()}&nbsp;items</span>`, {
      ssr: true,
      ssrTemplate: true,
    })
    expect(code).not.toContain('_fuse(')
  })

  // The optimization must survive for everything that is not an entity —
  // otherwise the bail has quietly reverted #3341.
  it('plain static text beside an interpolation STILL fuses', () => {
    const code = compile(`export const B = () => <span>{n()} items</span>`)
    expect(code, 'the fusion optimization must be intact for non-entity text').toContain('_fuse(')
  })

  it("a JS string literal child keeps its characters verbatim (JSX does not decode it)", () => {
    // `{'&nbsp;'}` is a JS string whose characters are already final — React and
    // Pyreon both render it literally, so fusing it is correct.
    const code = compile(`export const C = () => <span>{n()}{'x'}</span>`)
    expect(code).toContain('_fuse(')
  })
})
