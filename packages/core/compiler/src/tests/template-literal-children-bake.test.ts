/**
 * Emit locks for two compiled-template fixes the compiled-path hydration parity
 * fuzz surfaced (`runtime-dom/src/tests/hydration-parity-fuzz-compiled.test.tsx`):
 *
 * 1. A LITERAL expression child bakes into the template HTML exactly like plain
 *    JSX text. It used to emit `<!>` + `_setChildAt(parent, p, "t")` — a runtime
 *    call per literal per mount, and, because the server renders the same
 *    literal as plain text with NO range markers, the one shape that made the
 *    adopt verifier bail on an otherwise adoptable element (every root swap in
 *    the fuzz's first 300 seeds). Adjacent texts MERGE into one entry, because
 *    the parser produces one text node and later placeholder refs walk by child
 *    index. `&`, `<` AND `>` are escaped unconditionally (a JS string is data;
 *    a raw `>` in template text makes the adopt verifier refuse the template).
 *
 * 2. `<textarea value>` — string attr or literal expression — is never baked as
 *    an attribute: the `value` content attribute is dead on a textarea (its
 *    value is its text content), so a baked `value="0"` mounted an EMPTY
 *    textarea on the client. It emits the one-time `_setValue` the reactive
 *    form already uses, against a phase-1 element const (PZ-08).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX } from '../index'

const tpl = (code: string) => (code.match(/_tpl\("((?:[^"\\]|\\.)*)"/) ?? [])[1] ?? null
const js = (src: string) => transformJSX(src, 'x.tsx').code

describe('literal expression children bake into the template', () => {
  it('string / number / null / boolean / undefined / template literals', () => {
    const out = js(`const A = () => <main>{"t"}<hr />{54}{null}{true}{false}{undefined}{\`x\`}</main>`)
    expect(tpl(out)).toBe('<main>t<hr>54x</main>')
    expect(out).not.toContain('_setChild')
    expect(out).not.toContain('<!>')
  })

  it('adjacent literals merge into one text node, like the parser does', () => {
    expect(tpl(js(`const A = () => <main>{54}{60}</main>`))).toBe('<main>5460</main>')
    expect(tpl(js(`const A = () => <main>a{"b"}c</main>`))).toBe('<main>abc</main>')
  })

  it('escapes & < > unconditionally — a JS string is data, and a raw > blocks adoption', () => {
    expect(tpl(js(`const A = () => <main>{"<&>\\"&amp;"}</main>`))).toBe('<main>&lt;&amp;&gt;\\"&amp;amp;</main>')
  })

  it('a numeric literal bakes only when its source is its String() form', () => {
    expect(tpl(js(`const A = () => <main>{0}{7}{1.5}{123456789012345}</main>`))).toBe('<main>071.5123456789012345</main>')
    const out = js(`const A = () => <main>{1.50}{1e3}{-1}{0x10}{1234567890123456}</main>`)
    expect(tpl(out)).toBe('<main><!><!><!><!><!></main>')
    expect(out.match(/_setChildAt\(/g)).toHaveLength(5)
  })

  it('a cast or parenthesized literal bakes byte-identically', () => {
    expect(js(`const A = () => <main>{("t") as string}</main>`)).toBe(js(`const A = () => <main>{"t"}</main>`))
  })

  it('a non-literal static expression keeps the runtime path', () => {
    const out = js(`const TITLE = 'x'; const A = () => <main>{TITLE}<hr /></main>`)
    expect(out).toContain('_setChildAt(')
  })
})

describe('<textarea value> is never baked as an attribute', () => {
  it('string attr → _setValue on a phase-1 const', () => {
    const out = js(`const A = () => <main><textarea value="0" /></main>`)
    expect(tpl(out)).toBe('<main><textarea></textarea></main>')
    expect(out).toMatch(/const __e\d+ = __root\.firstElementChild;\n\s+_setValue\(__e\d+, "0"\)/)
  })

  it('literal expression → the same emit, and a following sibling gets its own const', () => {
    const out = js(`const A = () => <main><textarea value={"0"} /><p>{"x"}</p></main>`)
    expect(tpl(out)).toBe('<main><textarea></textarea><p>x</p></main>')
    expect(out).toMatch(/_setValue\(__e\d+, "0"\)/)
    expect(out).not.toMatch(/_setValue\(__root\./)
  })

  it('<input value="0"> still bakes (the attribute IS its default value)', () => {
    expect(tpl(js(`const A = () => <main><input value="0" /></main>`))).toBe('<main><input value=\\"0\\"></main>')
  })
})
