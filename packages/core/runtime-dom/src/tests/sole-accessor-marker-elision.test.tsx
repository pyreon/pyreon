/**
 * SOLE-CHILD ACCESSOR MARKER ELISION — contract locks.
 *
 * SSR wraps every reactive accessor's output in `<!--$-->…<!--/$-->` because an
 * accessor's DOM extent is runtime-unknowable. The ONE construct where it is
 * knowable is an accessor that is its element's ONLY child: the tag boundary
 * already delimits the slot, so the markers carry no information and are
 * elided.
 *
 * The elision is decided from the STATIC vnode shape (`children.length === 1 &&
 * typeof children[0] === 'function'`) — never from the rendered VALUE. That is
 * the safety argument: a value-conditional marker scheme regressed 83/5000
 * parity-fuzz seeds because a marked range adjacent to an unmarked one
 * reintroduced cursor gaps. "Sole child of an element" is a CONSTRUCT, uniform
 * across every value it can produce.
 *
 * Four surfaces must agree byte-for-byte or hydration misaligns:
 *   1. `renderNode`/`renderElement`   (runtime-server, string)
 *   2. `streamElementNode`            (runtime-server, stream)
 *   3. `hydrateElement`               (runtime-dom) + the `<For>` row plan and
 *      the compiled-`_tpl` adopt verifier (hydration-plan.ts)
 *   4. the `_escSole` emit in BOTH compiler backends
 * The combinatoric coverage lives in `hydration-parity-fuzz` (20k seeds),
 * `ssr-template-fuzz` and the compiler's `fuzz-equivalence`; this file locks
 * the individual contract points those gates would only fail in aggregate.
 */
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  _esc,
  _escSole,
  _ssr,
  _ssrChildren,
  _ssrItem,
  renderToStream,
  renderToString,
} from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { disableHydrationWarnings, hydrateRoot, onHydrationMismatch } from '../index'

/** `_ssr` returns a RawHtml; renderToString needs a node to walk. */
const ssrRoot = (raw: unknown) => raw as never

const streamToString = async (vnode: unknown): Promise<string> => {
  const stream = renderToStream(vnode as never)
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += typeof value === 'string' ? value : dec.decode(value as Uint8Array)
  }
  return out
}

describe('SSR — sole-child accessor elides its range markers', () => {
  it('elides for a text value', async () => {
    const s = signal('v')
    expect(await renderToString(h('div', null, (() => s()) as never))).toBe('<div>v</div>')
  })

  it('elides for a VNode value — the tag boundary still delimits it', async () => {
    expect(await renderToString(h('div', null, (() => h('b', null, 'x')) as never))).toBe(
      '<div><b>x</b></div>',
    )
  })

  it('elides for an EMPTY value (the construct, not the value, decides)', async () => {
    // The load-bearing case for uniformity: an empty slot emits nothing at all
    // rather than an empty marker pair. A value-conditional scheme would keep
    // markers here and reintroduce the mixed marked/unmarked adjacency that
    // regressed the parity fuzz.
    expect(await renderToString(h('div', null, (() => '') as never))).toBe('<div></div>')
    expect(await renderToString(h('div', null, (() => null) as never))).toBe('<div></div>')
  })

  it('elides for a MULTI-ROOT value (array) — everything between the tags', async () => {
    expect(
      await renderToString(h('div', null, (() => [h('b', null, '1'), h('i', null, '2')]) as never)),
    ).toBe('<div><b>1</b><i>2</i></div>')
  })

  it('KEEPS markers when the accessor has siblings', async () => {
    const s = signal('v')
    expect(await renderToString(h('div', null, (() => s()) as never, 'tail'))).toBe(
      '<div><!--$-->v<!--/$-->tail</div>',
    )
    expect(await renderToString(h('div', null, (() => s()) as never, (() => s()) as never))).toBe(
      '<div><!--$-->v<!--/$--><!--$-->v<!--/$--></div>',
    )
  })

  it('KEEPS markers for an accessor inside a Fragment — no tag to delimit it', async () => {
    const s = signal('v')
    expect(
      await renderToString(h('div', null, h(Fragment, null, (() => s()) as never) as never)),
    ).toBe('<div><!--$-->v<!--/$--></div>')
  })

  it('KEEPS markers at the ROOT — nothing encloses it', async () => {
    const s = signal('v')
    expect(await renderToString((() => s()) as never)).toBe('<!--$-->v<!--/$-->')
  })

  it('elides at every level of a nested sole chain', async () => {
    const s = signal('v')
    expect(
      await renderToString(
        h('div', null, (() => h('span', null, (() => s()) as never)) as never),
      ),
    ).toBe('<div><span>v</span></div>')
  })

  it('the STREAM path is byte-identical to the string path', async () => {
    const s = signal('v')
    const shapes: unknown[] = [
      h('div', null, (() => s()) as never),
      h('div', null, (() => '') as never),
      h('div', null, (() => h('b', null, 'x')) as never),
      h('div', null, (() => s()) as never, 'tail'),
      h('ul', null, h(For, { each: () => [1, 2], by: (n: number) => n, children: (n: number) => h('li', null, (() => `r${n}`) as never) }) as never),
    ]
    for (const shape of shapes) {
      expect(await streamToString(shape)).toBe(await renderToString(shape as never))
    }
  })
})

describe('_escSole — the compiled path\'s twin of the elision', () => {
  it('unwraps a FUNCTION value without markers; _esc still adds them', async () => {
    // `_escSole` is `_esc` plus one branch, and that branch is the whole
    // contract: a hole whose value is a function is an accessor, and an
    // accessor in sole-child position renders unmarked.
    const s = signal('v')
    const fn = () => s()
    expect(await renderToString(ssrRoot(_ssr(['<div>', '</div>'], _escSole(fn))))).toBe(
      await renderToString(h('div', null, fn as never)),
    )
    expect(await renderToString(ssrRoot(_ssr(['<div>', '</div>'], _esc(fn))))).toBe(
      '<div><!--$-->v<!--/$--></div>',
    )
  })

  it('is byte-identical to _esc for every NON-function value', async () => {
    for (const v of ['x', 0, 42, null, undefined, false, true, h('b', null, 'n')]) {
      const sole = await renderToString(ssrRoot(_ssr(['<p>', '</p>'], _escSole(v))))
      const plain = await renderToString(ssrRoot(_ssr(['<p>', '</p>'], _esc(v))))
      expect(sole).toBe(plain)
    }
  })

  it('a `.map` ITEM whose sole child holds a function stays byte-identical', async () => {
    // The shape that made this a real divergence rather than a hypothetical:
    // mapitem mode short-circuits before the wrap decision, so it emitted
    // `_esc`. If the item's value happens to BE a function (`{r.render}`), h()
    // renders it as that `<li>`'s sole accessor child — unmarked — while
    // `_esc` would have marked it. No fuzz covers this (their map values are
    // strings), so it is locked here.
    const rows = [{ render: () => 'A' }, { render: () => 'B' }]
    const fast = await renderToString(
      ssrRoot(
        _ssr(
          ['<ul>', '</ul>'],
          _ssrChildren(rows.map((r) => _ssrItem(['<li>', '</li>'], _escSole(r.render)))),
        ),
      ),
    )
    const slow = await renderToString(
      h('ul', null, (() => rows.map((r) => h('li', null, r.render as never))) as never),
    )
    expect(fast).toBe(slow)
    expect(fast).toBe('<ul><li>A</li><li>B</li></ul>')
  })
})

describe('hydration — sole-child accessor over elided SSR output', () => {
  const hydrateOver = async (make: () => unknown) => {
    const html = await renderToString(make() as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const mismatches: string[] = []
    const off = onHydrationMismatch((c) => mismatches.push(`${c.type}@${c.path}`))
    const cleanup = hydrateRoot(host, make() as never)
    off()
    return { host, mismatches, cleanup }
  }

  it('ADOPTS the SSR text node in place (no remount) and stays reactive', async () => {
    disableHydrationWarnings()
    const s = signal('a')
    const make = () => h('div', null, (() => s()) as never)
    const html = await renderToString(make() as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const textBefore = (host.firstElementChild as Element).firstChild
    const cleanup = hydrateRoot(host, make() as never)
    // Node IDENTITY survives — the whole point of adoption.
    expect((host.firstElementChild as Element).firstChild).toBe(textBefore)
    s.set('b')
    expect(host.firstElementChild!.textContent).toBe('b')
    cleanup()
    host.remove()
  })

  it('hydrates an EMPTY sole slot and can later flip to a VNode', async () => {
    disableHydrationWarnings()
    const s = signal<unknown>('')
    const make = () => h('div', null, (() => s()) as never)
    const { host, mismatches, cleanup } = await hydrateOver(make)
    expect(mismatches).toEqual([])
    expect(host.firstElementChild!.textContent).toBe('')
    // An empty initial must NOT pin the binding to text — the accessor can
    // yield a subtree on any later flip.
    s.set(h('b', null, 'later'))
    expect(host.firstElementChild!.querySelector('b')?.textContent).toBe('later')
    cleanup()
    host.remove()
  })

  it('hydrates a VNode sole slot without duplicating the SSR subtree', async () => {
    disableHydrationWarnings()
    const s = signal(1)
    const make = () => h('div', null, (() => h('b', null, String(s()))) as never)
    const { host, mismatches, cleanup } = await hydrateOver(make)
    expect(mismatches).toEqual([])
    expect(host.firstElementChild!.querySelectorAll('b')).toHaveLength(1)
    s.set(2)
    expect(host.firstElementChild!.textContent).toBe('2')
    cleanup()
    host.remove()
  })

  it('hydrates a MULTI-ROOT sole slot exactly once', async () => {
    disableHydrationWarnings()
    const s = signal(['x', 'y'])
    const make = () => h('div', null, (() => s().map((v) => h('b', null, v))) as never)
    const { host, mismatches, cleanup } = await hydrateOver(make)
    expect(mismatches).toEqual([])
    expect(host.firstElementChild!.querySelectorAll('b')).toHaveLength(2)
    cleanup()
    host.remove()
  })
})
