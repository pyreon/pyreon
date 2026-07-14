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

  test('dynamic prop text child: baked <!--$--> markers + _esc', () => {
    const out = ssrFast(`function C(props) { return <div>{props.x}</div> }`)
    expect(out).toContain('return _ssr(["<div><!--$-->", "<!--/$--></div>"], _esc(props.x))')
  })

  test('mixed static text + wrapped hole preserves order (markers baked)', () => {
    const out = ssrFast(`function C(props) { return <p>a {props.x} b</p> }`)
    expect(out).toContain('_ssr(["<p>a <!--$-->", "<!--/$--> b</p>"], _esc(props.x))')
  })

  test('.map fast path: markers + _ssrChildren, items via _ssrItem (plain string)', () => {
    const out = ssrFast(`const L = (rows) => <ul>{rows.map(r => <li class="row">{r.name}</li>)}</ul>`)
    expect(out).toContain(
      '_ssr(["<ul><!--$-->", "<!--/$--></ul>"], _ssrChildren(rows.map((r) => _ssrItem(["<li class=\\"row\\">", "</li>"], _esc(r.name)))))',
    )
    expect(out).toContain('import { _ssr, _ssrChildren, _ssrItem, _esc } from "@pyreon/runtime-server"')
  })

  test('nested elements inline into the parent statics', () => {
    const out = ssrFast(`const A = <ul><li>a</li><li>b</li></ul>`)
    expect(out).toContain('const A = _ssr(["<ul><li>a</li><li>b</li></ul>"])')
  })

  test('baked JSXText is SSR-escaped at compile time (quotes)', () => {
    // `"`/`'` are the escapable chars that can appear in JSXText (`<`/`>`
    // parse-error, `&` bails for entity safety). → &quot; / &#39;.
    const out = ssrFast(`const A = <p>say "hi" it's me</p>`)
    expect(out).toContain(`const A = _ssr(["<p>say &quot;hi&quot; it&#39;s me</p>"])`)
  })

  test('safe static URL attr bakes; import is _ssr only', () => {
    const out = ssrFast(`const A = <a href="/foo/bar">go</a>`)
    expect(out).toContain('const A = _ssr(["<a href=\\"/foo/bar\\">go</a>"])')
    expect(out).toContain('import { _ssr } from "@pyreon/runtime-server"')
  })
})

describe('ssrTemplate — dynamic attributes via _ssrAttr (renderProp verbatim)', () => {
  test('generic dynamic attr → lean _ssrAttrGen; url attr → lean _ssrAttrUrl', () => {
    const out = ssrFast(
      `const Row = (r) => <div class="row" data-id={r.id}><a href={"/i/" + r.id}>{r.label}</a></div>`,
    )
    // `data-id` is generic (lean `_ssrAttrGen`); `href` is a lowercase URL attr
    // (lean `_ssrAttrUrl` — same url-guard as renderProp); `r` is a component
    // prop → the text read is wrapped (markers baked).
    expect(out).toContain(
      '_ssr(["<div class=\\"row\\"", "><a", "><!--$-->", "<!--/$--></a></div>"], _ssrAttrGen("data-id", r.id), _ssrAttrUrl("a", "href", "/i/" + r.id), _esc(r.label))',
    )
    expect(out).toContain('_ssrAttrGen, _ssrAttrUrl } from "@pyreon/runtime-server"')
  })

  test('dynamic class (signal), camelCase name, object style → _ssrAttr (renderProp)', () => {
    const s = (src: string) => ssrFast(src)
    expect(s(`const s = signal('x'); const N = <div class={s()}>y</div>`)).toContain(
      '_ssrAttr("div", "class", s())',
    )
    expect(s(`const N = <div tabIndex={0}>y</div>`)).toContain('_ssrAttr("div", "tabIndex", 0)')
    expect(s(`const N = <div style={{ color: 'red' }}>y</div>`)).toContain(
      '_ssrAttr("div", "style", { color: \'red\' })',
    )
  })

  test('unsafe URL literal routes through _ssrAttrUrl (url-guard drops it)', () => {
    expect(ssrFast(`const N = <a href="javascript:alert(1)">x</a>`)).toContain(
      '_ssrAttrUrl("a", "href", "javascript:alert(1)")',
    )
  })
})

describe('ssrTemplate — bail catalogue (stays on h())', () => {
  const bails: [string, string][] = [
    ['spread attribute', `const N = <div {...props}>y</div>`],
    ['component child', `const N = <div><Widget /></div>`],
    ['void element', `const N = <img src="/a.png" />`],
    ['select value', `const N = <select value="b"><option>a</option></select>`],
    ['& in JSXText (entity-decode ambiguity)', `const N = <p>Tom &amp; Jerry</p>`],
    ['bare & in JSXText', `const N = <p>fish & chips</p>`],
    ['& in raw JSX string attr', `const N = <a title="Tom &amp; Jerry">x</a>`],
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
