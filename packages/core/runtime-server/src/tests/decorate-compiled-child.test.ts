/**
 * #4382, the server half: a component that DECORATES its child element (adds a
 * class, a style, an attribute) receives, for a literal child, the compiled
 * item instead of a VNode: `_ssr` raw HTML, an `_ssrDeferred` thunk (a subtree
 * holding a component) or streamed parts. Each exposes `withRootAttrs(extra)`,
 * which puts the props on the ROOT element's opening tag with the h() path's
 * own serializer, appending to the element's own `class` and `style`.
 *
 * Every shape is produced by the REAL compiler (`ssr` + `ssrTemplate`) and
 * rendered through both `renderToString` and `renderToStream`.
 */
import { transformJSX } from '@pyreon/compiler'
import { _lc, Fragment, h } from '@pyreon/core'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import * as server from '../index'
import { renderToStream, renderToString } from '../index'

const SERVER_HELPERS = Object.fromEntries(Object.entries(server).filter(([k]) => k.startsWith('_')))

type Decoratable = { withRootAttrs: (extra: Record<string, unknown>) => unknown }

/** A decorating component, as kinetic's stagger item is: duck-typed, no server import. */
const decorator = (extra: Record<string, unknown>) => (props: { children?: unknown }) => {
  let child = props.children
  while (typeof child === 'function') child = (child as () => unknown)()

  return (child as Decoratable).withRootAttrs(extra)
}

function compile(src: string, scope: Record<string, unknown>): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', { ssr: true, ssrTemplate: true })
  const js = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = { h, Fragment, _lc, ...SERVER_HELPERS, ...scope }

  return new Function(...Object.keys(deps), `${js}\nreturn App`)(...Object.values(deps)) as () => unknown
}

async function streamToString(vnode: unknown): Promise<string> {
  const reader = renderToStream(vnode as never).getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

const C = () => h('b', null, 'c')
const AsyncC = async () => h('b', null, 'c')
const v = () => 1

/** Render `<D>{child}</D>` with `extra` as the decoration, on both renderers. */
async function decorated(child: string, extra: Record<string, unknown>): Promise<{ string: string; stream: string; emit: string }> {
  const src = `const App = () => <D>${child}</D>`
  const App = compile(src, { D: decorator(extra), C, AsyncC, v })

  return {
    string: await renderToString(h(App as never, null) as never),
    stream: await streamToString(h(App as never, null)),
    emit: transformJSX(src, 'case.tsx', { ssr: true, ssrTemplate: true }).code,
  }
}

describe('withRootAttrs: a compiled child takes a decoration on its root tag (#4382)', () => {
  it('adds attributes the root does not have, serialized as the h() path does', async () => {
    const r = await decorated('<li>a</li>', {
      class: 'pre',
      style: { opacity: 0, '--i': 2, marginTop: 4 },
      'data-k': () => 'v',
      hidden: true,
    })
    expect(r.emit).toContain('_ssr(["<li>a</li>"])')
    expect(r.string).toBe('<li class="pre" style="opacity: 0; --i: 2; margin-top: 4px" data-k="v" hidden>a</li>')
    expect(r.stream).toBe(r.string)
  })

  it("appends to the root's own class and style; the added declarations come last", async () => {
    const r = await decorated('<li class="own" style="color: red;">a</li>', { class: 'pre', style: { opacity: 0 } })
    expect(r.string).toBe('<li class="own pre" style="color: red; opacity: 0">a</li>')
    expect(r.stream).toBe(r.string)
  })

  it('replaces any other attribute the root already has, valued or bare', async () => {
    const r = await decorated('<li id="a" hidden class="">a</li>', { id: 'b', hidden: true, class: 'pre' })
    expect(r.string).toBe('<li id="b" hidden class="pre">a</li>')
    expect(r.stream).toBe(r.string)
  })

  it('renders nothing for ref, key, children, handlers and absent values, and calls none of them', async () => {
    const called: string[] = []
    const r = await decorated('<li>a</li>', {
      ref: () => called.push('ref'),
      key: 'k',
      children: 'x',
      onClick: () => called.push('onClick'),
      title: null,
      hidden: false,
    })
    expect(r.string).toBe('<li>a</li>')
    expect(r.stream).toBe(r.string)
    expect(called).toEqual([])
  })

  it('keeps a void element self-closing', async () => {
    const img = await decorated('<img class="a" src="x.png" />', { class: 'pre' })
    expect(img.string).toBe('<img class="a pre" src="x.png" />')
    expect(img.stream).toBe(img.string)
    const br = await decorated('<br />', { class: 'pre' })
    expect(br.string).toBe('<br class="pre" />')
  })

  it('finds the end of the root tag past an escaped ">" in an attribute value', async () => {
    const r = await decorated('<li title="a > b" class="own"><i class="inner">x</i></li>', { class: 'pre' })
    expect(r.string).toBe('<li title="a &gt; b" class="own pre"><i class="inner">x</i></li>')
    expect(r.stream).toBe(r.string)
  })

  it('a root with a dynamic attribute', async () => {
    const r = await decorated('<li class="own" data-x={v()}>a</li>', { class: 'pre' })
    expect(r.emit).toContain('_ssrAttrGen("data-x"')
    expect(r.string).toBe('<li class="own pre" data-x="1">a</li>')
    expect(r.stream).toBe(r.string)
  })

  it('a child holding a component (a deferred thunk; streamed parts in a stream)', async () => {
    const r = await decorated('<li class="own">a<C /></li>', { class: 'pre' })
    expect(r.emit).toContain('_ssrDeferred(')
    expect(r.string).toBe('<li class="own pre">a<b>c</b></li>')
    expect(r.stream).toBe(r.string)
  })

  it('a child holding a component whose root tag is split by a dynamic attribute', async () => {
    const r = await decorated('<li class="own" data-x={v()} style="color: red">a<C /></li>', { style: { opacity: 0 } })
    expect(r.string).toBe('<li class="own" data-x="1" style="color: red; opacity: 0">a<b>c</b></li>')
    expect(r.stream).toBe(r.string)
  })

  it('a child holding an ASYNC component: the decoration lands when it resolves', async () => {
    const r = await decorated('<li class="own">a<AsyncC /></li>', { class: 'pre' })
    // (`$pas` / `$pae` bracket an async component's output for hydration.)
    expect(r.string).toBe('<li class="own pre">a<!--$pas--><b>c</b><!--$pae--></li>')
    expect(r.stream).toBe(r.string)
  })

  it('a multi-node result has no root tag and is returned as it is', async () => {
    const list = server._ssrForKeyed(
      [1, 2],
      (n: unknown) => n as number,
      (n: unknown) => server._ssr([`<li>${String(n)}</li>`]),
    ) as unknown as Decoratable
    expect(list.withRootAttrs({ class: 'pre' })).toBe(list)
    const html = await renderToString(list as never)
    expect(html).not.toContain('pre')
    expect(html).toContain('<li>1</li>')
  })
})
