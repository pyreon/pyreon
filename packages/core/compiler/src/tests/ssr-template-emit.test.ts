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
 * The native (Rust) backend implements `ssr_template` parity — the fuzz
 * equivalence gate runs a dedicated ssrTemplate mode, and the For-fusion
 * suite below asserts JS ↔ native byte-equality explicitly (the fuzz grammar
 * does not generate `<For>`).
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

  test('.map fast path: markers + _ssrChildren, items are plain strings', () => {
    // INVARIANT: a `.map` child gets the <!--$-->…<!--/$--> markers baked into
    // the parent statics + ONE `_ssrChildren` hole, and each item produces a
    // PLAIN STRING (no per-item RawHtml wrap for `_ssrChildren` to unwrap).
    // The item BODY is the fused concat (see the fused-body specs below); it
    // still returns a plain string, and still falls back to `_ssrItem`.
    const out = ssrFast(`const L = (rows) => <ul>{rows.map(r => <li class="row">{r.name}</li>)}</ul>`)
    expect(out).toContain('_ssr(["<ul><!--$-->", "<!--/$--></ul>"], _ssrChildren(rows.map((r) => {')
    expect(out).toContain(
      '{ const _h0 = _esc(r.name); return typeof _h0 === "string" ? "<li class=\\"row\\">" + _h0 + "</li>" : _ssrItem(["<li class=\\"row\\">", "</li>"], _h0) }',
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
  test('bare dynamic attr → runtime helper; provably-safe url → baked', () => {
    const out = ssrFast(
      `const Row = (r) => <div class="row" data-id={r.id}><a href={"/i/" + r.id}>{r.label}</a></div>`,
    )
    // `data-id={r.id}` is a BARE member access — not provably non-null → runtime
    // `_ssrAttrGen`. `href={"/i/" + r.id}` is a string-concat starting with `/`
    // → provably a safe string → BAKED (` href="` + `_esc(...)` + `"`).
    expect(out).toContain(
      '_ssr(["<div class=\\"row\\"", "><a href=\\"", "\\"><!--$-->", "<!--/$--></a></div>"], _ssrAttrGen("data-id", r.id), _esc("/i/" + r.id), _esc(r.label))',
    )
  })

  test('provably non-null attrs BAKE ` name="` + _esc(v) + `"` (dead null/omit branch)', () => {
    // `String(x)` / `.toUpperCase()` → provably a string → generic bake.
    expect(ssrFast(`const R = (r) => <div data-id={String(r.id)}>x</div>`)).toContain(
      '_ssr(["<div data-id=\\"", "\\">x</div>"], _esc(String(r.id)))',
    )
    // template-literal href with a safe first quasi → provably-safe url → bake.
    expect(ssrFast('const R = (r) => <a href={`/item/${r.id}`}>x</a>')).toContain(
      '_ssr(["<a href=\\"", "\\">x</a>"], _esc(`/item/${r.id}`))',
    )
    // dynamic class / bare member / bare url stay on the runtime helper.
    expect(ssrFast(`const s = signal('x'); const N = <div class={s()}>y</div>`)).toContain(
      '_ssrAttr("div", "class", s())',
    )
    expect(ssrFast(`const R = (r) => <div data-id={r.id}>x</div>`)).toContain(
      '_ssrAttrGen("data-id", r.id)',
    )
    // a template-literal url whose first quasi is a DYNAMIC start → not provably
    // safe → keep the runtime url-guard helper.
    expect(ssrFast('const R = (r) => <a href={`${r.scheme}://x`}>y</a>')).toContain(
      '_ssrAttrUrl("a", "href", `${r.scheme}://x`)',
    )
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

describe('ssrTemplate — fused keyed <For> (_ssrForKeyed)', () => {
  const FOR_SRC = `const A = (props) => (
    <ul class="list">
      <For each={props.rows} by={(r) => r.id}>
        {(r) => (
          <li class="row" data-id={r.id}>
            <span class="id">{r.id}</span>
            <span class={r.id % 2 === 0 ? 'a' : 'b'}>{'$' + r.price}</span>
          </li>
        )}
      </For>
    </ul>
  )`

  test('For child emits ONE _ssrForKeyed hole — the parent skeleton compiles', () => {
    // The INVARIANT this locks: a <For> child no longer bails its parent to the
    // h() walk — the parent skeleton templatizes and the whole list is ONE hole.
    // (The item BODY shape is asserted separately below; it changed when the row
    // moved from an `_ssrItem` call to a fused concat.)
    const out = ssrFast(FOR_SRC)
    expect(out).toContain('_ssr(["<ul class=\\"list\\">", "</ul>"], _ssrForKeyed(props.rows, (r) => r.id, (r) => {')
    expect(out).toContain('_ssrForKeyed')
    // the import rides the runtime-server preamble
    expect(out).toMatch(/import \{ [^}]*_ssrForKeyed[^}]* \} from "@pyreon\/runtime-server"/)
  })

  describe('fused item body (concat instead of a per-item _ssrItem call)', () => {
    test('binds every hole to a temp, then concats statics + temps inline', () => {
      const out = ssrFast(FOR_SRC)
      // Temps preserve the call's left-to-right hole evaluation order.
      expect(out).toContain(
        '{ const _h0 = _ssrAttrGen("data-id", r.id), _h1 = _esc(r.id), _h2 = _ssrAttr("span", "class", r.id % 2 === 0 ? \'a\' : \'b\'), _h3 = _esc(\'$\' + r.price);',
      )
      // Statics are ordinary quoted literals (NOT a template literal) so the
      // emit reuses the existing static quoting — no second escaping path.
      expect(out).toContain(
        '"<li class=\\"row\\"" + _h0 + "><span class=\\"id\\">" + _h1 + "</span><span" + _h2 + ">" + _h3 + "</span></li>"',
      )
      expect(out).not.toContain('`<li')
    })

    test('guards ONLY the holes that are not provably string', () => {
      const out = ssrFast(FOR_SRC)
      // _h1 / _h3 are `_esc` (MaybeAsync) → guarded.
      expect(out).toContain('typeof _h1 === "string" && typeof _h3 === "string" ?')
      // _h0 / _h2 are `_ssrAttrGen` / `_ssrAttr`, both declared `: string` → no
      // guard. A spurious guard here would be a correctness no-op but pure cost
      // on every row, so it is worth pinning.
      expect(out).not.toContain('typeof _h0 === "string"')
      expect(out).not.toContain('typeof _h2 === "string"')
    })

    test('falls back to the UNCHANGED _ssrItem call with the same temps', () => {
      // This is what preserves byte-identity + the async promotion path when a
      // guard fails (an async _esc, or a RawHtml from a nested fast path).
      const out = ssrFast(FOR_SRC)
      expect(out).toContain(
        ': _ssrItem(["<li class=\\"row\\"", "><span class=\\"id\\">", "</span><span", ">", "</span></li>"], _h0, _h1, _h2, _h3)',
      )
    })

    test('an all-attr row needs no guard and no fallback branch at all', () => {
      const out = ssrFast(`const A = (props) => (
        <ul>
          <For each={props.rows} by={(r) => r.id}>
            {(r) => (<li data-id={r.id} data-x={r.x}></li>)}
          </For>
        </ul>
      )`)
      expect(out).toContain('_h0 = _ssrAttrGen("data-id", r.id), _h1 = _ssrAttrGen("data-x", r.x)')
      expect(out).not.toContain('typeof _h')
      // No guard → no branch → the fallback call is not emitted for this row.
      expect(out).not.toContain(': _ssrItem(')
    })

    test('declines to fuse when a user param would be shadowed by the temps', () => {
      // `_h0` as a user param is vanishingly rare, but the temps are injected
      // into the user's arrow scope — decline rather than silently shadow it.
      const out = ssrFast(`const A = (props) => (
        <ul>
          <For each={props.rows} by={(_h0) => _h0.id}>
            {(_h0) => (<li data-id={_h0.id}></li>)}
          </For>
        </ul>
      )`)
      expect(out).toContain('(_h0) => _ssrItem(')
      expect(out).not.toContain('const _h0 = _ssrAttrGen')
    })
  })

  test('JS ↔ native byte-equality for the fusion shape (fuzz grammar has no <For>)', async () => {
    const { transformJSX } = await import('../index')
    const js = transformJSX_JS(FOR_SRC, 'x.tsx', { ssr: true, ssrTemplate: true }).code
    const native = transformJSX(FOR_SRC, 'x.tsx', { ssr: true, ssrTemplate: true }).code
    expect(native).toBe(js)
  })

  test('bails (h() authoritative): fallback prop / spread / block body / component item', () => {
    const bail = (s: string) => expect(ssrFast(s)).not.toContain('_ssrForKeyed')
    bail(`const A = (p) => <ul><For each={p.r} by={(r) => r.id} fallback={<i/>}>{(r) => <li>{r.x}</li>}</For></ul>`)
    bail(`const A = (p) => <ul><For {...p.forProps}>{(r) => <li>{r.x}</li>}</For></ul>`)
    bail(`const A = (p) => <ul><For each={p.r} by={(r) => r.id}>{(r) => { return <li>{r.x}</li> }}</For></ul>`)
    bail(`const A = (p) => <ul><For each={p.r} by={(r) => r.id}>{(r) => <Row r={r} />}</For></ul>`)
  })

  test('flag OFF: For fixture keeps the plain h() path (no _ssr at all)', () => {
    expect(ssrPlain(FOR_SRC)).not.toContain('_ssr')
  })
})
