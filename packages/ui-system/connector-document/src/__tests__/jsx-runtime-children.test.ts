import { _rp, Fragment, h } from '@pyreon/core'
import { jsx, jsxs } from '@pyreon/core/jsx-runtime'
import { describe, expect, it } from 'vitest'
import { extractDocumentTree } from '../extractDocumentTree'

// #4303 — the AUTOMATIC JSX runtime (`jsx()`) puts a component's children in
// `props.children` and leaves `vnode.children` empty; `h()` does the reverse.
// The extractor must read both, by the runtime's rule (props.children wins),
// and hand components the props the runtime would: compiler reactive-prop
// thunks (`_rp`) become getters. Each tree is built through the REAL `h()` and
// the REAL `jsx()`, plus a hand-built vnode; the compiled-JSX path (the real
// compiler) is covered in @pyreon/document-primitives'
// `jsx-compiled-extraction.test.ts`.

const doc = (type: string) => {
  const C = (props: Record<string, unknown>) => h('div', props)
  ;(C as unknown as { _documentType: string })._documentType = type
  return C
}
const Doc = doc('document')
const Page = doc('page')
const Text = doc('text')
// A plain wrapper (no _documentType) that renders its children.
const Wrap = (props: { children?: unknown }) => h(Fragment, null, props.children as never)

const expected = {
  type: 'document',
  props: {},
  children: [
    {
      type: 'page',
      props: {},
      children: [
        { type: 'text', props: {}, children: ['Hello'] },
        { type: 'text', props: {}, children: ['wrapped'] },
        { type: 'text', props: {}, children: ['a'] },
        { type: 'text', props: {}, children: ['b'] },
      ],
    },
  ],
}

describe('extractDocumentTree — children from h(), jsx() and props.children', () => {
  it('h() tree (children in vnode.children)', () => {
    const tree = h(
      Doc,
      {},
      h(
        Page,
        {},
        h(Text, {}, 'Hello'),
        h(Wrap, {}, h(Text, {}, 'wrapped')),
        ['a', 'b'].map((x) => h(Text, {}, x)),
      ),
    )
    expect(extractDocumentTree(tree)).toEqual(expected)
  })

  it('jsx() tree (children in props.children) extracts the same', () => {
    const tree = jsx(Doc, {
      children: jsxs(Page, {
        children: [
          jsx(Text, { children: 'Hello' }),
          jsx(Wrap, { children: jsx(Text, { children: 'wrapped' }) }),
          ['a', 'b'].map((x) => jsx(Text, { children: x })),
        ],
      }),
    })
    expect(extractDocumentTree(tree)).toEqual(expected)
  })

  it('a hand-built vnode: props.children wins over vnode.children, like the runtime', () => {
    const vnode = {
      type: Doc,
      props: { children: { type: Text, props: { children: 'from props' }, children: [] } },
      children: [{ type: Text, props: {}, children: ['from vnode'] }],
    }
    expect(extractDocumentTree(vnode).children).toEqual([
      { type: 'text', props: {}, children: ['from props'] },
    ])
  })

  it('a component receives reactive-prop thunks as values (getters)', () => {
    const seen: unknown[] = []
    const Heading = (props: { level?: unknown; children?: unknown }) => {
      seen.push(props.level)
      return { type: 'div', props: { _documentProps: { level: props.level } }, children: [] }
    }
    ;(Heading as unknown as { _documentType: string })._documentType = 'heading'
    let level = 2
    const tree = jsx(Heading as never, { level: _rp(() => level), children: 'Title' })
    expect(extractDocumentTree(tree)).toEqual({
      type: 'heading',
      props: { level: 2 },
      children: ['Title'],
    })
    level = 3
    extractDocumentTree(tree)
    expect(seen).toEqual([2, 3]) // a getter, read live — never the thunk itself
  })
})
