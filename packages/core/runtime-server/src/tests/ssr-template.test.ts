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
import type { ComponentFn, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
// eslint-disable-next-line import/no-unresolved
import {
  _esc,
  _ssr,
  _ssrAttr,
  _ssrAttrGen,
  _ssrAttrUrl,
  _ssrChildren,
  _ssrItem,
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

  test('wrapped dynamic text hole gets baked <!--$--> markers', async () => {
    const name = signal('Ada')
    const fast = await renderToString(ssrRoot(_ssr(['<div><!--$-->', '<!--/$--></div>'], _esc(name()))))
    const slow = await renderToString(h('div', null, () => name()))
    expect(fast).toBe(slow)
    expect(fast).toBe('<div><!--$-->Ada<!--/$--></div>')
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
          ['<ul><!--$-->', '<!--/$--></ul>'],
          _ssrChildren(rows.map((r) => _ssr(['<li class="row">', '</li>'], _esc(r.name)))),
        ),
      ),
    )
    const slow = await renderToString(
      h('ul', null, () => rows.map((r) => h('li', { class: 'row' }, r.name))),
    )
    expect(fast).toBe(slow)
    expect(fast).toBe(
      '<ul><!--$--><li class="row">Alice</li><li class="row">Bob</li><!--/$--></ul>',
    )
  })

  test('_ssrItem (plain-string items) is byte-identical to _ssr items', async () => {
    const rows = [{ name: 'Ada & Bob' }, { name: '<x>' }]
    // The compiler emits `_ssrItem` for .map items (no per-item RawHtml wrap).
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul><!--$-->', '<!--/$--></ul>'],
          _ssrChildren(rows.map((r) => _ssrItem(['<li>', '</li>'], _esc(r.name)))),
        ),
      ),
    )
    const slow = await renderToString(h('ul', null, () => rows.map((r) => h('li', null, r.name))))
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><!--$--><li>Ada &amp; Bob</li><li>&lt;x&gt;</li><!--/$--></ul>')
  })

  test('empty list is byte-identical', async () => {
    const rows: { name: string }[] = []
    const fast = await renderToString(
      ssrRoot(_ssr(['<ul><!--$-->', '<!--/$--></ul>'], _ssrChildren(rows.map((r) => _ssr(['<li>', '</li>'], _esc(r.name)))))),
    )
    const slow = await renderToString(h('ul', null, () => rows.map((r) => h('li', null, r.name))))
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><!--$--><!--/$--></ul>')
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
