/**
 * Compile-to-string SSR fast path (`_ssr` / `_ssrChildren` / `_esc`) —
 * BYTE-IDENTITY gate against the h() path.
 *
 * The #1 requirement of the fast path is that `renderToString(_ssr(...))`
 * produces output byte-identical to `renderToString(h(...))` for the same
 * subtree — anything else silently breaks hydration for every SSR/SSG app.
 * Every case below renders BOTH forms and asserts equality, so the h() path
 * (the proven-correct oracle) is the ground truth for the fast path.
 */
import type { ComponentFn, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
// eslint-disable-next-line import/no-unresolved
import { _esc, _ssr, _ssrChildren, renderToString } from '../index'

// `_ssr(...)` returns branded RawHtml at runtime; the compiler emits it where a
// VNode is statically expected, so TS never sees the brand. Cast in tests.
const ssrRoot = (v: unknown): VNode => v as VNode

describe('_esc — mirrors renderNode string escaping', () => {
  test('escapes the five HTML metacharacters', () => {
    expect(_esc(`a&<>"'b`)).toBe('a&amp;&lt;&gt;&quot;&#39;b')
  })
  test('passes clean strings through untouched', () => {
    expect(_esc('hello world')).toBe('hello world')
  })
  test('byte-identical to a rendered text child', async () => {
    const s = `<x> & "y" 'z'`
    expect(_esc(s)).toBe(await renderToString(h('p', null, s)).then((r) => r.slice(3, -4)))
  })
})

describe('_ssr — byte-identical to h() path', () => {
  test('static element + static text', async () => {
    expect(await renderToString(ssrRoot(_ssr(['<div>hello</div>'])))).toBe(
      await renderToString(h('div', null, 'hello')),
    )
  })

  test('static attributes (source order preserved)', async () => {
    expect(await renderToString(ssrRoot(_ssr(['<div class="x" id="y" role="note">z</div>'])))).toBe(
      await renderToString(h('div', { class: 'x', id: 'y', role: 'note' }, 'z')),
    )
  })

  test('wrapped dynamic text hole gets <!--$--> markers', async () => {
    const name = signal('Ada')
    const fast = await renderToString(ssrRoot(_ssr(['<div>', '</div>'], () => name())))
    const slow = await renderToString(h('div', null, () => name()))
    expect(fast).toBe(slow)
    expect(fast).toBe('<div><!--$-->Ada<!--/$--></div>')
  })

  test('bare (non-wrapped) value hole — no markers, escaped', async () => {
    const row = { name: `<b>&"'` }
    const fast = await renderToString(ssrRoot(_ssr(['<span>', '</span>'], row.name)))
    const slow = await renderToString(h('span', null, row.name))
    expect(fast).toBe(slow)
    expect(fast).toBe('<span>&lt;b&gt;&amp;&quot;&#39;</span>')
  })

  test('mixed static text + hole preserves order', async () => {
    const x = signal(7)
    const fast = await renderToString(ssrRoot(_ssr(['<p>a', 'b</p>'], () => x())))
    const slow = await renderToString(h('p', null, 'a', () => x(), 'b'))
    expect(fast).toBe(slow)
    expect(fast).toBe('<p>a<!--$-->7<!--/$-->b</p>')
  })

  test('nested _ssr element as a RawHtml hole appends raw (not re-escaped)', async () => {
    const fast = await renderToString(ssrRoot(_ssr(['<ul>', '</ul>'], _ssr(['<li>a &amp; b</li>']))))
    // The h() equivalent must inline the SAME raw markup. A nested _ssr result
    // is trusted HTML; the h() oracle expresses that via a pre-built child.
    const slow = await renderToString(h('ul', null, h('li', null, 'a & b')))
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><li>a &amp; b</li></ul>')
  })

  test('null / false / undefined holes render empty', async () => {
    const fast = await renderToString(ssrRoot(_ssr(['<div>', '', '', '</div>'], null, false, undefined)))
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
    // Fast path: <ul> baked with the accessor markers around the mapped items.
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul><!--$-->', '<!--/$--></ul>'],
          _ssrChildren(rows.map((r) => _ssr(['<li class="row">', '</li>'], r.name))),
        ),
      ),
    )
    // Oracle: the h() path wraps `.map` in an accessor → <!--$--> markers, and
    // renderChildList over the array adds NO per-item markers.
    const slow = await renderToString(
      h('ul', null, () => rows.map((r) => h('li', { class: 'row' }, r.name))),
    )
    expect(fast).toBe(slow)
    expect(fast).toBe(
      '<ul><!--$--><li class="row">Alice</li><li class="row">Bob</li><!--/$--></ul>',
    )
  })

  test('empty list is byte-identical', async () => {
    const rows: { name: string }[] = []
    const fast = await renderToString(
      ssrRoot(_ssr(['<ul><!--$-->', '<!--/$--></ul>'], _ssrChildren(rows.map((r) => _ssr(['<li>', '</li>'], r.name))))),
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

  test('a hole resolving to an async component promotes the whole call', async () => {
    const fast = await renderToString(ssrRoot(_ssr(['<div>', '</div>'], h(Async, null))))
    const slow = await renderToString(h('div', null, h(Async, null)))
    expect(fast).toBe(slow)
    // Async component subtree is bracketed by <!--$pas-->…<!--$pae-->.
    expect(fast).toContain('<!--$pas-->')
    expect(fast).toContain('<em>async</em>')
  })

  test('_ssrChildren with a maybe-async mixed item list stays ordered', async () => {
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul>', '</ul>'],
          _ssrChildren([_ssr(['<li>1</li>']), h(Async, null), _ssr(['<li>3</li>'])]),
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
