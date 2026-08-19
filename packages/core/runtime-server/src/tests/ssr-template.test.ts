/**
 * Compile-to-string SSR fast path (`_ssr` / `_ssrChildren` / `_esc` /
 * `_ssrAttr`) — BYTE-IDENTITY gate against the h() path.
 *
 * The #1 requirement: `renderToString(_ssr(...))` must be byte-identical to
 * `renderToString(h(...))` for the same subtree, or hydration breaks. Every
 * case renders BOTH the fast-path shape the compiler emits (LEAN: pre-
 * stringified holes — `_esc` for text, `_ssrAttr` for dynamic attrs, baked
 * `<!--$-->` markers) and the hand-written h() oracle, and asserts equality.
 */
import type { ComponentFn, VNode, VNodeChild } from '@pyreon/core'
import { createContext, h, provide, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
// eslint-disable-next-line import/no-unresolved
import {
  _esc, _escSole,
  _ssr,
  _ssrAttr,
  _ssrDeferred,
  _ssrNode,
  _ssrAttrGen,
  _ssrAttrUrl,
  _ssrChildren,
  _ssrItem,
  renderToStream,
  renderToString,
} from '../index'

// `_ssr(...)` returns branded RawHtml at runtime; the compiler emits it where a
// VNode is statically expected, so TS never sees the brand. Cast in tests.
const ssrRoot = (v: unknown): VNode => v as VNode

describe('_esc — matches renderNode per-value output', () => {
  test('escapes the five HTML metacharacters', () => {
    expect(_esc(`a&<>"'b`)).toBe('a&amp;&lt;&gt;&quot;&#39;b')
  })
  test('primitives: number → String, null/false/undefined → "", true → "true"', () => {
    expect(_esc(5)).toBe('5')
    expect(_esc(null)).toBe('')
    expect(_esc(undefined)).toBe('')
    expect(_esc(false)).toBe('')
    expect(_esc(true)).toBe('true')
  })
  test('a VNode text value MOUNTS (delegates to renderNode)', async () => {
    const r = await (_esc(h('em', null, 'hi')) as Promise<string> | string)
    expect(r).toBe('<em>hi</em>')
  })
})

describe('_ssrAttr — renderProp verbatim (byte-identical dynamic attrs)', () => {
  test('generic attr with escaping', () => {
    expect(_ssrAttr('div', 'data-id', 5)).toBe(' data-id="5"')
    expect(_ssrAttr('div', 'title', `a"b&c`)).toBe(' title="a&quot;b&amp;c"')
  })
  test('camelCase name maps via toAttrName', () => {
    expect(_ssrAttr('div', 'tabIndex', -1)).toBe(' tabindex="-1"')
    expect(_ssrAttr('div', 'className', 'x')).toBe(' class="x"')
  })
  test('class object → cx; style object → normalized', () => {
    expect(_ssrAttr('div', 'class', { a: true, b: false })).toBe(' class="a"')
    expect(_ssrAttr('div', 'style', { color: 'red', marginTop: 4 })).toBe(
      ' style="color: red; margin-top: 4px"',
    )
  })
  test('unsafe URL dropped; safe URL kept', () => {
    expect(_ssrAttr('a', 'href', 'javascript:alert(1)')).toBe('')
    expect(_ssrAttr('a', 'href', '/ok?a=1&b=2')).toBe(' href="/ok?a=1&amp;b=2"')
  })
  test('null / undefined / false → absent', () => {
    expect(_ssrAttr('div', 'data-x', null)).toBe('')
    expect(_ssrAttr('div', 'data-x', undefined)).toBe('')
    expect(_ssrAttr('div', 'hidden', false)).toBe('')
  })
})

describe('_ssrAttrGen / _ssrAttrUrl — lean, byte-identical to renderProp', () => {
  test('_ssrAttrGen matches _ssrAttr for generic names (incl. null-omit + boolean)', () => {
    for (const v of [5, 'a<b>&"', '', null, undefined, false, true, 0]) {
      expect(_ssrAttrGen('data-id', v)).toBe(_ssrAttr('div', 'data-id', v))
    }
  })
  test('_ssrAttrUrl matches _ssrAttr for URL names (incl. the guard)', () => {
    for (const v of ['/ok?a=1&b=2', 'javascript:x', 'data:text/html,x', null, false, true]) {
      expect(_ssrAttrUrl('a', 'href', v)).toBe(_ssrAttr('a', 'href', v))
    }
    // data:image on an image-context element is kept (safe-image exception).
    const img = 'data:image/png;base64,iVBORw0KGgo='
    expect(_ssrAttrUrl('img', 'src', img)).toBe(_ssrAttr('img', 'src', img))
  })

  // FUNCTION values were missing from the matrices above, which is the ONLY
  // reason the divergence shipped: the oracle and the shape were both right.
  // `renderProp` resolves a callable (mirroring the client's `applyAttrProp`),
  // but the lean helpers are selected by the attribute NAME while the branch
  // that fires depends on the VALUE'S TYPE — so the name-based selection can
  // never rule it out, and both helpers stringified the closure SOURCE into the
  // attribute (`d="() =&gt; …"`) instead. Visible in the SSR HTML and a
  // guaranteed hydration mismatch.
  test('_ssrAttrGen resolves a FUNCTION value (accessor), matching _ssrAttr', () => {
    for (const v of [() => 'M0 0', () => 5, () => '', () => null, () => undefined, () => false, () => true]) {
      expect(_ssrAttrGen('d', v)).toBe(_ssrAttr('path', 'd', v))
    }
    expect(_ssrAttrGen('d', () => 'M0 0')).toBe(' d="M0 0"')
    // Nested accessors unwrap to the same depth as renderProp's recursion.
    expect(_ssrAttrGen('title', () => () => 'x')).toBe(_ssrAttr('div', 'title', () => () => 'x'))
  })
  test('_ssrAttrUrl resolves a FUNCTION value BEFORE the url-guard', () => {
    for (const v of [() => '/ok', () => 'javascript:x', () => null, () => false, () => true]) {
      expect(_ssrAttrUrl('a', 'href', v)).toBe(_ssrAttr('a', 'href', v))
    }
    expect(_ssrAttrUrl('a', 'href', () => '/ok')).toBe(' href="/ok"')
    // The guard only inspects STRINGS, so resolving after it would have let an
    // accessor-returned `javascript:` url through as a stringified function.
    expect(_ssrAttrUrl('a', 'href', () => 'javascript:alert(1)')).toBe('')
  })
})

describe('_ssr — byte-identical to h() path', () => {
  test('static element + static text', async () => {
    expect(await renderToString(ssrRoot(_ssr(['<div>hello</div>'])))).toBe(
      await renderToString(h('div', null, 'hello')),
    )
  })

  test('static + dynamic attrs (via _ssrAttr) preserve order', async () => {
    const fast = await renderToString(
      ssrRoot(_ssr(['<div class="x"', ' role="note">z</div>'], _ssrAttr('div', 'id', 'y'))),
    )
    const slow = await renderToString(h('div', { class: 'x', id: 'y', role: 'note' }, 'z'))
    expect(fast).toBe(slow)
    expect(fast).toBe('<div class="x" id="y" role="note">z</div>')
  })

  test('SOLE dynamic text hole — markers ELIDED, _escSole', async () => {
    // The element's tag boundary already delimits a sole accessor's extent, so
    // neither side emits markers (see `soleAccessorChild`). The `<p>a {x} b</p>`
    // case below is the non-sole twin, where they are still required.
    const name = signal('Ada')
    const fast = await renderToString(ssrRoot(_ssr(['<div>', '</div>'], _escSole(name))))
    const slow = await renderToString(h('div', null, () => name()))
    expect(fast).toBe(slow)
    expect(fast).toBe('<div>Ada</div>')
  })

  test('STREAMED accessor children match the string path — sole elides, non-sole marks', async () => {
    // The streaming engine walks a SEPARATE code path from renderToString, and
    // marker elision had to be mirrored into it. Neither the sole-accessor arm
    // nor `streamNode`'s marker arm had a streaming spec, so both read as dead
    // code while the string path was fully exercised — the exact place a
    // stream/string marker divergence would hide (it would surface as a
    // hydration mismatch only for users on renderToStream).
    const collect = async (v: unknown): Promise<string> => {
      const reader = (renderToStream(v as VNode) as ReadableStream<string>).getReader()
      let out = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        out += typeof value === 'string' ? value : new TextDecoder().decode(value)
      }
      return out
    }

    const name = signal('Ada')

    // SOLE accessor child: the tag boundary delimits it, so NO markers.
    const soleStream = await collect(h('div', null, () => name()))
    const soleString = await renderToString(h('div', null, () => name()))
    expect(soleStream).toBe(soleString)
    expect(soleStream).toBe('<div>Ada</div>')

    // NON-sole accessor: markers are still required to delimit the hole.
    const mixedStream = await collect(h('p', null, 'a ', () => name(), ' b'))
    const mixedString = await renderToString(h('p', null, 'a ', () => name(), ' b'))
    expect(mixedStream).toBe(mixedString)
    expect(mixedStream).toContain('<!--$-->')
  })

  test('STREAMED <select> with a sole accessor still marks the matching option', async () => {
    // `<select>` runs its children inside an AsyncLocalStorage frame so options
    // can see the selected value; the sole-accessor arm inside that frame is a
    // distinct branch from both the non-sole frame arm and the frameless sole
    // arm. Streaming it is the only way to reach it.
    const collect = async (v: unknown): Promise<string> => {
      const reader = (renderToStream(v as VNode) as ReadableStream<string>).getReader()
      let out = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        out += typeof value === 'string' ? value : new TextDecoder().decode(value)
      }
      return out
    }

    const opts = () => [h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')]
    const streamed = await collect(h('select', { value: 'b' }, opts))
    const stringed = await renderToString(h('select', { value: 'b' }, opts))
    expect(streamed).toBe(stringed)
    // The SSR contract for <select> is a marked <option>, never a value attr.
    expect(streamed).not.toContain('<select value=')
    expect(streamed).toContain('selected')
  })

  test('_escSole — every value arm matches the h() sole-accessor path', async () => {
    // `_escSole`'s string and function arms are exercised by the template specs
    // above; its number / nullish / boolean / VNode arms were reached ONLY by
    // the seeded parity fuzz, which lives in @pyreon/runtime-dom. Coverage is
    // per-package, so those arms read as dead code here — and a hole in the
    // elision helper is exactly where a marker-parity bug would hide.
    //
    // Each case asserts PARITY with the h() path rather than literal bytes:
    // the invariant is that eliding markers cannot change what a sole
    // accessor serializes to, whatever it yields.
    const cases: { label: string; v: unknown; child: VNodeChild }[] = [
      { label: 'number', v: 42, child: () => 42 },
      { label: 'number zero', v: 0, child: () => 0 },
      { label: 'null', v: null, child: () => null },
      { label: 'undefined', v: undefined, child: () => undefined },
      { label: 'false', v: false, child: () => false },
      { label: 'true', v: true, child: () => true },
      { label: 'vnode', v: h('em', null, 'hi'), child: () => h('em', null, 'hi') },
      { label: 'vnode array', v: [h('i', null, 'a'), h('b', null, 'c')], child: () => [h('i', null, 'a'), h('b', null, 'c')] },
    ]

    for (const c of cases) {
      const fast = await renderToString(ssrRoot(_ssr(['<div>', '</div>'], _escSole(c.v))))
      const slow = await renderToString(h('div', null, c.child))
      expect(fast, `${c.label}: fast/slow parity`).toBe(slow)
      // And no markers on either side — that is the whole point of _escSole.
      expect(fast, `${c.label}: no range markers`).not.toContain('<!--$-->')
    }
  })

  test('_escSole — escapes a VALUE-arm string exactly like the h() path', async () => {
    // The string arm IS covered elsewhere, but not with hostile input; a helper
    // that elides markers must not also elide escaping.
    const hostile = `<script>&"'`
    const fast = await renderToString(ssrRoot(_ssr(['<div>', '</div>'], _escSole(hostile))))
    const slow = await renderToString(h('div', null, () => hostile))
    expect(fast).toBe(slow)
    expect(fast).not.toContain('<script>')
  })

  test('mapitem text hole — no markers, escaped', async () => {
    const row = { name: `<b>&"'` }
    const fast = await renderToString(ssrRoot(_ssr(['<span>', '</span>'], _esc(row.name))))
    const slow = await renderToString(h('span', null, row.name))
    expect(fast).toBe(slow)
    expect(fast).toBe('<span>&lt;b&gt;&amp;&quot;&#39;</span>')
  })

  test('mixed static text + wrapped hole preserves order', async () => {
    const x = signal(7)
    const fast = await renderToString(ssrRoot(_ssr(['<p>a <!--$-->', '<!--/$--> b</p>'], _esc(x()))))
    const slow = await renderToString(h('p', null, 'a ', () => x(), ' b'))
    expect(fast).toBe(slow)
    expect(fast).toBe('<p>a <!--$-->7<!--/$--> b</p>')
  })

  test('nested _ssr element as a RawHtml hole appends raw (not re-escaped)', async () => {
    const fast = await renderToString(ssrRoot(_ssr(['<ul>', '</ul>'], _ssr(['<li>a &amp; b</li>']))))
    const slow = await renderToString(h('ul', null, h('li', null, 'a & b')))
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><li>a &amp; b</li></ul>')
  })

  test('null / false / undefined text holes render empty (via _esc)', async () => {
    const fast = await renderToString(
      ssrRoot(_ssr(['<div>', '', '', '</div>'], _esc(null), _esc(false), _esc(undefined))),
    )
    const slow = await renderToString(h('div', null, null, false, undefined))
    expect(fast).toBe(slow)
    expect(fast).toBe('<div></div>')
  })
})

describe('_ssrChildren — .map fast path byte-identity', () => {
  test('keyless list matches wrapped .map through h()', async () => {
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul>', '</ul>'],
          _ssrChildren(rows.map((r) => _ssr(['<li class="row">', '</li>'], _escSole(r.name)))),
        ),
      ),
    )
    const slow = await renderToString(
      h('ul', null, () => rows.map((r) => h('li', { class: 'row' }, r.name))),
    )
    expect(fast).toBe(slow)
    expect(fast).toBe(
      '<ul><li class="row">Alice</li><li class="row">Bob</li></ul>',
    )
  })

  test('_ssrItem (plain-string items) is byte-identical to _ssr items', async () => {
    const rows = [{ name: 'Ada & Bob' }, { name: '<x>' }]
    // The compiler emits `_ssrItem` for .map items (no per-item RawHtml wrap).
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul>', '</ul>'],
          _ssrChildren(rows.map((r) => _ssrItem(['<li>', '</li>'], _escSole(r.name)))),
        ),
      ),
    )
    const slow = await renderToString(h('ul', null, () => rows.map((r) => h('li', null, r.name))))
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><li>Ada &amp; Bob</li><li>&lt;x&gt;</li></ul>')
  })

  test('empty list is byte-identical', async () => {
    const rows: { name: string }[] = []
    const fast = await renderToString(
      ssrRoot(_ssr(['<ul>', '</ul>'], _ssrChildren(rows.map((r) => _ssr(['<li>', '</li>'], _escSole(r.name)))))),
    )
    const slow = await renderToString(h('ul', null, () => rows.map((r) => h('li', null, r.name))))
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul></ul>')
  })
})

describe('_ssr — async hole promotion', () => {
  async function AsyncName() {
    await Promise.resolve()
    return h('em', null, 'async')
  }
  const Async = AsyncName as unknown as ComponentFn

  test('an async text hole (_esc of an async component) promotes the whole call', async () => {
    const fast = await renderToString(ssrRoot(_ssr(['<div>', '</div>'], _esc(h(Async, null)))))
    const slow = await renderToString(h('div', null, h(Async, null)))
    expect(fast).toBe(slow)
    expect(fast).toContain('<!--$pas-->')
    expect(fast).toContain('<em>async</em>')
  })

  test('_ssrChildren with a maybe-async mixed item list stays ordered', async () => {
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul>', '</ul>'],
          _ssrChildren([_ssr(['<li>1</li>']), _esc(h(Async, null)), _ssr(['<li>3</li>'])]),
        ),
      ),
    )
    const slow = await renderToString(
      h('ul', null, h('li', null, '1'), h(Async, null), h('li', null, '3')),
    )
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><li>1</li><!--$pas--><em>async</em><!--$pae--><li>3</li></ul>')
  })
})

describe('_ssr composes through a component boundary', () => {
  test('a component that returns _ssr(...) renders raw (not double-escaped)', async () => {
    const Card = (() =>
      ssrRoot(_ssr(['<article class="c">hi &amp; bye</article>']))) as unknown as ComponentFn
    const fast = await renderToString(h('main', null, h(Card, null)))
    const slow = await renderToString(h('main', null, h('article', { class: 'c' }, 'hi & bye')))
    expect(fast).toBe(slow)
    expect(fast).toBe('<main><article class="c">hi &amp; bye</article></main>')
  })
})

// ─── `_ssrDeferred` — the component-hole deferral, on BOTH render paths ───────
//
// The string path is covered end-to-end by runtime-dom's
// `ssr-template-differential.test.tsx` (which compiles real source). What that
// file cannot reach is `streamNode`: the stream renderer has its OWN node
// dispatch, so a branch added to `renderNode` alone would leave streaming SSR
// emitting `[object Object]` — a divergence between the two renderers, which is
// exactly the pair this repo keeps getting bitten by. These assert both.
describe('_ssrDeferred — deferred component holes render on both paths', () => {
  const Theme = createContext<string>('DEFAULT')
  const Consumer: ComponentFn = () => h('i', null, useContext(Theme))
  /** What the compiler emits for `<div class="p"><Consumer /></div>`. */
  const deferred = () => _ssrDeferred(() => _ssr(['<div class="p">', '</div>'], _ssrNode(h(Consumer, null))) as never)
  const Provider: ComponentFn = (p: { children?: unknown }) => {
    provide(Theme, 'PROVIDED')
    return h('main', null, p.children as never)
  }

  it('renderToString resolves the thunk inside the provider', async () => {
    const html = await renderToString(h(Provider, null, deferred() as never))
    expect(html).toBe('<main><div class="p"><i>PROVIDED</i></div></main>')
  })

  it('renderToStream resolves it identically — no [object Object]', async () => {
    const stream = renderToStream(h(Provider, null, deferred() as never))
    // The stream enqueues STRINGS (not bytes) — see `streamNode`'s `enqueue`.
    const reader = (stream as ReadableStream<string>).getReader()
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out += typeof value === 'string' ? value : new TextDecoder().decode(value)
    }
    expect(out).not.toContain('[object Object]')
    expect(out).toContain('<div class="p"><i>PROVIDED</i></div>')
  })

  it('an ASYNC component hole still resolves through the deferral', async () => {
    const Slow = (async () => h('em', null, 'late')) as unknown as ComponentFn
    const node = _ssrDeferred(
      () => _ssr(['<main>', '</main>'], _ssrNode(h(Slow, null))) as never,
    )
    const html = await renderToString(node as never)
    expect(html).toContain('late')
  })
})
