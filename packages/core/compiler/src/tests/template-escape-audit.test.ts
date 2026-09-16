/**
 * 2026-09 compiler audit — template/SSR emit regressions, both backends.
 *
 * Every spec here is a shape the emitter got WRONG on `main` before the fix,
 * verified by running the real transform (see the PR body for the bisect):
 *
 * - a multi-line JSX attribute (or a JS string attr carrying `\n`/`\r`/U+2028)
 *   baked a raw line terminator into the double-quoted `_tpl` HTML string →
 *   `Unterminated string`, a hard build break (the text-child twin had the
 *   fix; the attribute path never got it);
 * - a JSX attribute string carrying an entity (`title="a&quot;b"`) was
 *   escaped AGAIN, so the DOM attribute held the SOURCE text `a&quot;b`
 *   while the h() path (oxc decodes entities) and SSR held `a"b`;
 * - a no-substitution template-literal attr baked its RAW text, so `\t`
 *   rendered as a backslash and a `t`;
 * - static text inside `<script>`/`<style>` was entity-escaped into an
 *   element whose content the parser reads as RAW TEXT (entities are never
 *   decoded there) → `.b &gt; i` / `a &amp;&amp; b` as literal characters;
 * - a plain attribute written AFTER a spread was applied BEFORE it, so the
 *   spread's key won — inverting JSX object semantics and silently defeating
 *   the `{...p} rel="noopener"` guard idiom;
 * - the signal auto-call pass recognised three binding forms as shadows, so a
 *   `catch (error)` / `for (const item of …)` / nested-pattern binding sharing
 *   a module signal's name was auto-called → `TypeError: error is not a
 *   function` inside the error handler itself;
 * - the Rust backend derived the parser dialect from the FILENAME, so a Vite
 *   id with a `?v=` query, `.pyreon`, or an uppercase extension parsed as plain
 *   JavaScript, failed on TS syntax, and returned the source UNCHANGED as a
 *   success (raw JSX shipped) while the JS backend compiled it;
 * - the Rust Reactivity-Lens sidecar dropped the span for a props-backed
 *   component child (`<Comp>{props.p}</Comp>`) the JS backend reports.
 */
import { transformJSX, transformJSX_JS } from '../index'

const SIG = 'import { signal } from "@pyreon/reactivity"\n'

const both = (src: string, file = 'in.tsx', o: Record<string, unknown> = {}) => {
  const js = transformJSX_JS(src, file, o).code
  expect(transformJSX(src, file, o).code).toBe(js)
  return js
}

describe('attribute baking — line terminators, entities, template cooked', () => {
  it('a multi-line JSX attribute string bakes line terminators as numeric entities', () => {
    const out = both('const a = <div title="a\n   b\r\nc">y</div>')
    expect(out).toContain('title=\\"a&#10;   b&#13;&#10;c\\"')
    // The emitted module must PARSE — this was `Unterminated string`.
    expect(() => new Function(out.replace(/^import.*$/gm, ''))).not.toThrow()
  })

  it('a JS string / template attr with line terminators bakes the same way, unconditionally escaped', () => {
    const out = both('const a = <div title={"a\\nb&amp;\\u2028"} class={"x\\ny"} style={"c\\rd"}>y</div>')
    expect(out).toContain('title=\\"a&#10;b&amp;amp;&#8232;\\"')
    expect(out).toContain('class=\\"x&#10;y\\"')
    expect(out).toContain('style=\\"c&#13;d\\"')
    expect(() => new Function(out.replace(/^import.*$/gm, ''))).not.toThrow()
  })

  it('a JSX attribute string preserves a well-formed entity (the parser decodes it, as oxc does)', () => {
    const out = both('const a = <p title="a&quot;b" data-y="&lt;" data-z="x & y">z</p>')
    expect(out).toContain('title=\\"a&quot;b\\"')
    expect(out).toContain('data-y=\\"&lt;\\"')
    expect(out).toContain('data-z=\\"x &amp; y\\"')
  })

  it('a no-substitution template attr bakes its COOKED text', () => {
    const out = both('const a = <div title={`a\\tb&amp;`}>y</div>')
    expect(out).toContain('title=\\"a\tb&amp;amp;\\"')
  })

  it('a template attr whose cooked value is absent (invalid escape) takes the runtime path', () => {
    const out = both('const a = <div title={`a\\u{}`}>y</div>')
    expect(out).toContain('_setAttr(__root, "title", `a\\u{}`)')
  })
})

describe('raw-text and void elements keep the h() path', () => {
  it('<style> / <script> / <noscript> with content bail (entities are never decoded there)', () => {
    for (const tag of ['style', 'script', 'noscript']) {
      const out = both(`const a = <div><${tag}>{".b > i {}"}</${tag}></div>`)
      expect(out, tag).not.toContain('_tpl(')
    }
    // Childless raw-text elements still bake.
    expect(both('const a = <div><style /><script></script></div>')).toContain('_tpl(')
  })

  it('escapable raw text (<textarea>/<title>) still bakes — its entities DO decode', () => {
    expect(both('const a = <div><textarea>{"a < b"}</textarea></div>')).toContain('<textarea>a &lt; b</textarea>')
  })

  it('a void element written with children bails instead of silently dropping them', () => {
    expect(both('const a = <div><br>x</br></div>')).not.toContain('_tpl(')
    expect(both('const a = <div><br /></div>')).toContain('_tpl(')
  })

  it('the `_ssr` fast path bails on raw-text content too', () => {
    const o = { ssr: true, ssrTemplate: true }
    expect(both('const a = <div class="d"><style>{s}</style></div>', 'in.tsx', o)).not.toContain('_ssr(')
    expect(both('const a = <div class="d"><b>{s}</b></div>', 'in.tsx', o)).toContain('_ssr(')
  })
})

describe('a plain attribute after a spread wins (JSX object semantics)', () => {
  it('bails the element to h(), where the later attribute overrides the spread key', () => {
    const out = both('const a = <a {...p} rel="noopener" href="/safe">x</a>')
    expect(out).not.toContain('_tpl(')
    expect(out).toContain('<a {...p} rel="noopener" href="/safe">x</a>')
  })

  it('a plain attribute BEFORE the spread keeps the template (the spread legitimately wins)', () => {
    const out = both('const a = <a rel="noopener" {...p}>x</a>')
    expect(out).toContain('_tpl(')
    expect(out).toContain('_applyProps(__root, p)')
  })
})

describe('signal auto-call — every binding form shadows', () => {
  const cases: Array<[string, string]> = [
    ['catch param', `${SIG}const error = signal(null)\nfunction f() { try { g() } catch (error) { return <p>{error}</p> } }`],
    ['for-of head', `${SIG}const item = signal(1)\nfunction f(xs) { for (const item of xs) { return <p>{item}</p> } }`],
    ['for-in head', `${SIG}const k = signal(1)\nfunction f(o) { for (const k in o) { return <p>{k}</p> } }`],
    ['nested object pattern param', `${SIG}const c = signal(1)\nfunction f({ a: { c } }) { return <p>{c}</p> }`],
    ['default param', `${SIG}const c = signal(1)\nfunction f(c = 1) { return <p>{c}</p> }`],
    ['rest param', `${SIG}const c = signal(1)\nfunction f(...c) { return <p>{c}</p> }`],
    ['block-nested let', `${SIG}const c = signal(1)\nfunction f() { if (x) { let c = 2; return <p>{c}</p> } }`],
    ['function declaration', `${SIG}const c = signal(1)\nfunction f() { function c() {} return <p>{c}</p> }`],
    ['class declaration', `${SIG}const c = signal(1)\nfunction f() { class c {} return <p>{c}</p> }`],
    ['switch-case const', `${SIG}const c = signal(1)\nfunction f() { switch (y) { case 1: { const c = 2; return <p>{c}</p> } } }`],
    ['body destructure', `${SIG}const c = signal(1)\nconst f = () => { const [c] = p; return <p>{c}</p> }`],
  ]
  for (const [name, src] of cases) {
    it(`${name} is a shadow, not an auto-call`, () => {
      const out = both(src)
      // A shadowed name reaches the child bare (`_setChild(__root, c)`), never
      // as the auto-call `c()`. (`function c() {}` legitimately contains `c()`
      // in its own declaration, so assert on the emitted child, not the file.)
      expect(out).toMatch(/_setChild\(__root, (error|item|k|c)\)/)
    })
  }

  it('a same-named `signal()` re-declaration is NOT a shadow (the carve-out survives)', () => {
    expect(both(`${SIG}const c = signal(1)\nfunction f() { const c = signal(2); return <p>{c}</p> }`)).toContain('c()')
  })
})

describe('native backend — parser dialect never comes from the filename', () => {
  const code = 'interface P { n: number }\nfunction C(props: P) { const label: string = "x" + props.n; return <div class="c">{label}</div> }'
  for (const file of ['t.tsx', 't.pyreon', '/src/App.tsx?v=abc', 't.TSX', 'no-extension']) {
    it(`${file} compiles TS + JSX on both backends`, () => {
      const out = both(code, file)
      expect(out).toContain('_tpl(')
    })
  }
})

describe('Reactivity Lens — props-backed component child span on both backends', () => {
  it('reports the span for `<Comp>{props.p}</Comp>`', () => {
    const src = 'function App(props){ return <Comp>{props.p}</Comp> }'
    const js = transformJSX_JS(src, 'a.tsx', { reactivityLens: true })
    const native = transformJSX(src, 'a.tsx', { reactivityLens: true })
    expect(js.reactivityLens?.length).toBe(1)
    expect(native.reactivityLens).toEqual(js.reactivityLens)
  })
})
