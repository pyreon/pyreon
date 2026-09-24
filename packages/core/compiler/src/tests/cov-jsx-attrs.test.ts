/**
 * Branch coverage — `jsx.ts` ATTRIBUTE classification and emit.
 *
 * Every spec pairs the source shape that TAKES an arm with the neighbouring
 * shape that must NOT, so a regression that collapses the two is visible as a
 * failing assertion rather than as an unchanged coverage number.
 *
 * Driven through the public `transformJSX_JS` (the JS backend, which is what
 * `transformJSX` falls back to and what these arms live in); where the shape is
 * cheap to cross-check, the native backend's emit is asserted byte-equal via
 * `transformJSX`, which prefers the binary.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string, file = 'in.tsx') => transformJSX_JS(src, file).code
/** Both backends must emit the same bytes for this source. */
const bothAgree = (src: string, file = 'in.tsx') => {
  const js = transformJSX_JS(src, file).code
  expect(transformJSX(src, file).code).toBe(js)
  return js
}

describe('jsx.ts — namespaced attribute names (JSXNamespacedName)', () => {
  it('bakes a namespaced attribute under its QUALIFIED name', () => {
    // `xlink:href` parses as JSXNamespacedName — read through `jsxAttrName`,
    // which joins namespace + name. The pre-fix `''` fallthrough emitted
    // `<use ="#icon">`.
    const out = bothAgree('<svg><use xlink:href="#icon" /></svg>')
    expect(out).toContain('xlink:href=\\"#icon\\"')
    expect(out).not.toContain('<use =')
  })

  it('a PLAIN identifier attribute on the same tag keeps the unqualified name', () => {
    const out = t('<svg><use href="#icon" /></svg>')
    expect(out).toContain('href=\\"#icon\\"')
    expect(out).not.toContain('xlink:')
  })

  it('a DYNAMIC namespaced attribute emits a setter under the qualified name', () => {
    const out = t('<svg><use xlink:href={u} /></svg>')
    expect(out).toContain('"xlink:href"')
    expect(out).not.toContain('_setAttr(__root, ""')
  })
})

describe('jsx.ts — static attribute value shapes (staticAttrToHtml)', () => {
  it('bakes a no-substitution template literal', () => {
    const out = bothAgree('<div id={`x`}>a</div>')
    expect(out).toContain('<div id=\\"x\\">a</div>')
    expect(out).not.toContain('_setAttr')
  })

  it('does NOT bake a template literal WITH a substitution', () => {
    const out = t('<div id={`x${y}`}>a</div>')
    expect(out).toContain('_setAttr')
    expect(out).not.toContain('id=\\"x')
  })

  it('bakes a NEGATIVE numeric literal (`tabIndex={-1}`)', () => {
    const out = bothAgree('<div tabIndex={-1}>a</div>')
    expect(out).toContain('tabIndex=\\"-1\\"')
    expect(out).not.toContain('_setAttr')
  })

  it('bakes a UNARY-PLUS numeric literal without the sign', () => {
    const out = bothAgree('<div tabIndex={+1}>a</div>')
    expect(out).toContain('tabIndex=\\"1\\"')
    expect(out).not.toContain('tabIndex=\\"+1\\"')
  })

  it('does NOT bake a unary operator over a NON-numeric argument', () => {
    // `!0` is static-but-computed — it falls through to the dynamic path
    // rather than being silently omitted.
    const out = t('<div hidden={!0}>a</div>')
    expect(out).toContain('_setAttr')
    expect(out).not.toContain('hidden=\\"')
  })

  it('bakes `attr={true}` as a bare presence attribute', () => {
    const out = bothAgree('<div><input disabled={true} /></div>')
    expect(out).toContain('<input disabled>')
    expect(out).not.toContain('disabled=\\"true\\"')
  })

  it('omits `attr={false}` / `{null}` / `{undefined}` entirely', () => {
    // Wrapped in a parent so the element is templatized (a SELF-CLOSING root
    // never takes the `_tpl` path).
    for (const v of ['false', 'null', 'undefined']) {
      const out = t(`<div><input disabled={${v}} /></div>`)
      expect(out).not.toContain('disabled')
      expect(out).not.toContain('_setAttr')
    }
  })
})

describe('jsx.ts — `value` on select / textarea is never baked (PZ-09)', () => {
  it('`<select value={"b"}>` routes to the DEFERRED property set, not a baked attribute', () => {
    const out = t('<select value={"b"}><option value="b">B</option></select>')
    expect(out).toContain('__root.value = "b"')
    expect(out).not.toContain('<select value=')
  })

  it('`<select value={true}>` — the boolean arm is ALSO deferred, never baked bare', () => {
    const out = t('<select value={true}><option /></select>')
    expect(out).toContain('__root.value = true')
    expect(out).not.toContain('<select value>')
  })

  it('`<select value={1}>` — the numeric arm is deferred too', () => {
    const out = t('<select value={1}><option /></select>')
    expect(out).toContain('__root.value = 1')
    expect(out).not.toContain('<select value=\\"1\\"')
  })

  it('`<select value={`b`}>` — the template-literal arm is deferred too', () => {
    const out = t('<select value={`b`}><option /></select>')
    expect(out).toContain('__root.value')
    expect(out).not.toContain('<select value=\\"b\\"')
  })

  it('`<select value={-1}>` — the signed-numeric arm is deferred too', () => {
    const out = t('<select value={-1}><option /></select>')
    expect(out).toContain('__root.value')
    expect(out).not.toContain('<select value=\\"-1\\"')
  })

  it('`<textarea value={"hi"}>` is deferred — the content attribute is DEAD', () => {
    // A textarea's value is its TEXT CONTENT; a baked `value="hi"` mounted an
    // EMPTY textarea on the client.
    const out = t('<div><textarea value={"hi"} /></div>')
    expect(out).not.toContain('textarea value=\\"hi\\"')
  })

  it('the SAME literal on a plain `<input>` IS baked', () => {
    const out = t('<div><input value={"hi"} /></div>')
    expect(out).toContain('value=\\"hi\\"')
  })

  it('`value` on an `<option>` is baked — only select/textarea defer', () => {
    const out = t('<div><option value={"x"}>X</option></div>')
    expect(out).toContain('value=\\"x\\"')
  })
})

describe('jsx.ts — reserved / duplicate / empty attributes', () => {
  it('`key` on a DOM element is stripped from the emitted template HTML', () => {
    const out = t('<div key="k">a</div>')
    expect(out).not.toContain('key=\\"k\\"')
  })

  it('a plain sibling attribute on the same element IS emitted', () => {
    const out = t('<div id="k">a</div>')
    expect(out).toContain('id=\\"k\\"')
  })

  it('a DUPLICATED plain attribute keeps the LAST value (JSX object semantics)', () => {
    const r = transformJSX_JS('<div id="a" id="b">x</div>', 'in.tsx')
    expect(r.code).toContain('id=\\"b\\"')
    expect(r.code).not.toContain('id=\\"a\\"')
    expect(r.warnings.some((w) => w.code === 'duplicate-jsx-attr')).toBe(true)
  })

  it('two DISTINCT attributes both survive and warn about nothing', () => {
    const r = transformJSX_JS('<div id="a" title="b">x</div>', 'in.tsx')
    expect(r.code).toContain('id=\\"a\\"')
    expect(r.code).toContain('title=\\"b\\"')
    expect(r.warnings.some((w) => w.code === 'duplicate-jsx-attr')).toBe(false)
  })

  it('an EMPTY expression container attribute (`class={/* c */}`) emits nothing', () => {
    const out = t('<div class={/* c */}>x</div>')
    expect(out).toContain('<div>x</div>')
    expect(out).not.toContain('_setClass')
  })

  it('a NON-empty expression container attribute emits the setter', () => {
    const out = t('<div class={c}>x</div>')
    expect(out).toContain('_setClass')
  })
})

describe('jsx.ts — component spread (`_wrapSpread`) idempotency', () => {
  it('wraps a bare component spread', () => {
    const out = t('<Comp {...rest} />')
    expect(out).toContain('_wrapSpread(rest)')
  })

  it('does NOT re-wrap a spread that is ALREADY `_wrapSpread(...)`', () => {
    const out = t('<Comp {..._wrapSpread(rest)} />')
    expect(out).toContain('_wrapSpread(rest)')
    expect(out).not.toContain('_wrapSpread(_wrapSpread(')
  })

  it('does NOT wrap a spread on a LOWERCASE (DOM) tag', () => {
    const out = t('<div {...rest} />')
    expect(out).not.toContain('_wrapSpread')
  })
})

describe('jsx.ts — non-string `class` values route through the runtime setter', () => {
  it('an ARRAY class emits `_setClass`, which normalises via the runtime `cx`', () => {
    // The compiler never injects `cx` itself — `needsCxImport` is vestigial
    // (see the unreachable-arm tally); the runtime `_setClass` (= applyClassProp)
    // owns the normalisation, so the two paths cannot drift.
    const out = t('<div class={["a", "b"]}>x</div>')
    expect(out).toContain('_setClass(__root, ["a", "b"])')
    expect(out).not.toContain('cx as _cx')
  })

  it('a plain STRING class is baked into the template HTML instead', () => {
    const out = t('<div class="a b">x</div>')
    expect(out).toContain('class=\\"a b\\"')
    expect(out).not.toContain('_setClass')
  })
})

describe('jsx.ts — `.jsx` filename selects the jsx parser', () => {
  it('transforms a `.jsx` file (no TS syntax) identically to `.tsx`', () => {
    const src = '<div>{count()}</div>'
    expect(transformJSX_JS(src, 'in.jsx').code).toBe(transformJSX_JS(src, 'in.tsx').code)
  })

  it('a `.jsx` file parses `<T>` as JSX, not as a type assertion', () => {
    const out = t('<div><T /></div>', 'in.jsx')
    expect(out).toContain('T')
  })
})
