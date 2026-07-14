/**
 * Compile-to-string SSR fast path (`options.ssrTemplate`) — JS backend
 * EMISSION lock.
 *
 * Asserts the EXACT `_ssr(...)` the JS backend emits for the eligible subset,
 * and that the flag is a strict opt-in (OFF → the current h() path, byte-
 * identical to before). The RENDERED byte-identity of this output against the
 * h() path is proven end-to-end in
 * `@pyreon/runtime-dom`'s `ssr-template-differential.test.tsx`; this file locks
 * the codegen shape so a refactor can't silently change it.
 *
 * The native (Rust) backend does not implement `ssrTemplate` yet — the
 * equivalence gates run with the flag OFF so both backends stay byte-identical;
 * see `TransformOptions.ssrTemplate`.
 */
import { transformJSX_JS } from '../jsx'

const ssrFast = (src: string): string =>
  transformJSX_JS(src, 'test.tsx', { ssr: true, ssrTemplate: true }).code
const ssrPlain = (src: string): string => transformJSX_JS(src, 'test.tsx', { ssr: true }).code

describe('ssrTemplate — opt-in gate', () => {
  test('flag OFF leaves the h() path untouched (no _ssr)', () => {
    const src = `const A = <div class="x">{name}</div>`
    expect(ssrPlain(src)).not.toContain('_ssr')
  })
  test('ssrTemplate requires ssr:true (client build unaffected)', () => {
    const src = `const A = <div class="x">hi</div>`
    expect(transformJSX_JS(src, 't.tsx', { ssrTemplate: true }).code).not.toContain('_ssr(')
  })
})

describe('ssrTemplate — emission shapes', () => {
  test('fully static element bakes into a single static (no holes)', () => {
    expect(ssrFast(`const A = <div class="x" id="y">hello</div>`)).toContain(
      'const A = _ssr(["<div class=\\"x\\" id=\\"y\\">hello</div>"])',
    )
  })

  test('dynamic prop-derived text child is wrapped (markers via renderNode)', () => {
    const out = ssrFast(`function C(props) { return <div>{props.x}</div> }`)
    expect(out).toContain('return _ssr(["<div>", "</div>"], () => props.x)')
  })

  test('mixed static text + hole preserves order + bakes text', () => {
    const out = ssrFast(`function C(props) { return <p>a {props.x} b</p> }`)
    expect(out).toContain('_ssr(["<p>a ", " b</p>"], () => props.x)')
  })

  test('.map fast path bakes accessor markers + _ssrChildren', () => {
    const out = ssrFast(`const L = (rows) => <ul>{rows.map(r => <li class="row">{r.name}</li>)}</ul>`)
    expect(out).toContain(
      '_ssr(["<ul><!--$-->", "<!--/$--></ul>"], _ssrChildren(rows.map((r) => _ssr(["<li class=\\"row\\">", "</li>"], r.name))))',
    )
    expect(out).toContain('import { _ssr, _ssrChildren } from "@pyreon/runtime-server"')
  })

  test('nested elements inline into the parent statics', () => {
    const out = ssrFast(`const A = <ul><li>a</li><li>b</li></ul>`)
    expect(out).toContain('const A = _ssr(["<ul><li>a</li><li>b</li></ul>"])')
  })

  test('SSR text escaping bakes all five metacharacters', () => {
    const out = ssrFast(`const A = <p>{'a & b < c > d " e \\' f'}</p>`)
    // Static string-literal child is a bare hole (renderNode escapes it); assert
    // the fast path is taken and the shape is a single hole.
    expect(out).toContain('const A = _ssr(["<p>", "</p>"], ')
  })

  test('safe URL attr bakes; import is _ssr only', () => {
    const out = ssrFast(`const A = <a href="/foo?a=1&b=2">go</a>`)
    // `&` is SSR-escaped to `&amp;` in the baked attr value (matches renderProp).
    expect(out).toContain('const A = _ssr(["<a href=\\"/foo?a=1&amp;b=2\\">go</a>"])')
    expect(out).toContain('import { _ssr } from "@pyreon/runtime-server"')
  })
})

describe('ssrTemplate — bail catalogue (stays on h())', () => {
  const bails: [string, string][] = [
    ['unsafe javascript: url', `const N = <a href="javascript:alert(1)">x</a>`],
    ['unsafe data: url', `const N = <a href="data:text/html,x">x</a>`],
    ['dynamic class attr', `const s = signal('x'); const N = <div class={s()}>y</div>`],
    ['spread attribute', `const N = <div {...props}>y</div>`],
    ['component child', `const N = <div><Widget /></div>`],
    ['void element', `const N = <img src="/a.png" />`],
    ['select value', `const N = <select value="b"><option>a</option></select>`],
    ['camelCase attr (needs runtime name map)', `const N = <div tabIndex={0}>y</div>`],
    ['object style', `const N = <div style={{ color: 'red' }}>y</div>`],
    ['innerHTML content prop', `const N = <div innerHTML={'<x>'}></div>`],
    ['dangerouslySetInnerHTML', `const N = <div dangerouslySetInnerHTML={{ __html: '<x>' }}></div>`],
    ['duplicate attribute', `const N = <div id="a" id="b">y</div>`],
  ]
  for (const [name, src] of bails) {
    test(`bails: ${name}`, () => {
      expect(ssrFast(src)).not.toContain('_ssr(')
    })
  }
})
