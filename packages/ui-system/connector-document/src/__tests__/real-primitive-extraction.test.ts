import { Fragment, h } from '@pyreon/core'
import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { describe, expect, it } from 'vitest'
import { extractDocumentTree } from '../extractDocumentTree'

// ─── Real rocketstyle-primitive extraction (closes the PR #197 gap) ──────
//
// PR #197's silent metadata drop lived in THIS package and survived the
// entire lifetime of the code because no test ran a REAL rocketstyle
// primitive through the REAL extractor — only hand-rolled fixtures (a
// function with `_documentType`/`__rs_attrs` stapled on) did, and those
// carry, by construction, exactly the shape the mock author expected.
//
// Every other test in this package still uses that fixture shape. This
// file is the connector's OWN real-primitive lock: it builds primitives
// with the actual `rocketstyle()(...).statics().attrs()` factory — the
// same construction @pyreon/document-primitives uses — so the extractor's
// hoisted-attrs fast path (Path C) is exercised against a REAL `__rs_attrs`
// chain produced by the real factory, not a hand-assembled array. If the
// rocketstyle attrs-chain shape (`options.attrs` → `__rs_attrs`) ever
// drifts, these fail where the fixture tests would keep passing.
//
// rocketstyle + @pyreon/elements are test-only devDeps here (no runtime
// cycle: neither depends on @pyreon/connector-document). Path C never
// INVOKES the component, so no theme context / mount is needed — the
// factory definition + the pure attrs callbacks are all that run.

const RealDocSection = rocketstyle()({ name: 'RealDocSection', component: Element })
  .statics({ _documentType: 'section' as const })
  .attrs<{ direction?: string }>((props) => ({
    tag: 'div',
    _documentProps: { direction: props.direction ?? 'column' },
  }))

const RealDocItem = rocketstyle()({ name: 'RealDocItem', component: Text })
  .statics({ _documentType: 'list-item' as const })
  .attrs(() => ({ tag: 'li', _documentProps: {} }))

// A DocTable-shaped primitive: `filter` strips the metadata props off the
// DOM path. The filter is stored in a SEPARATE `filterAttrs` chain, so it
// must NOT corrupt the `__rs_attrs` chain the extractor reads.
const RealDocTable = rocketstyle()({ name: 'RealDocTable', component: Element })
  .statics({ _documentType: 'table' as const })
  .attrs<{ columns?: unknown[]; rows?: unknown[]; striped?: boolean }>(
    (props) => ({
      tag: 'table',
      _documentProps: {
        columns: props.columns ?? [],
        rows: props.rows ?? [],
        ...(props.striped ? { striped: props.striped } : {}),
      },
    }),
    { filter: ['columns', 'rows', 'striped'] },
  )

// A DocDocument-shaped primitive whose metadata props accept accessors.
const RealDocDocument = rocketstyle()({ name: 'RealDocDocument', component: Element })
  .statics({ _documentType: 'document' as const })
  .attrs<{ title?: string | (() => string) }>((props) => ({
    tag: 'div',
    _documentProps: { ...(props.title != null ? { title: props.title } : {}) },
  }))

describe('extractDocumentTree — real rocketstyle primitives (Path C)', () => {
  it('extracts _documentType + _documentProps from a REAL rocketstyle primitive', () => {
    const tree = extractDocumentTree(h(RealDocSection as never, { direction: 'row' } as never))
    expect(tree.type).toBe('section')
    expect(tree.props).toEqual({ direction: 'row' })
  })

  it('reads __rs_attrs WITHOUT invoking the real component body (Path C)', () => {
    // The T3.1 architectural invariant, end-to-end on a real primitive:
    // extraction must NOT run the styled wrapper. A Proxy apply-trap counts
    // any call; property reads (__rs_attrs, meta, _documentType, …) pass
    // through so the extractor's contract still works.
    let callCount = 0
    const Spied = new Proxy(RealDocSection, {
      apply(target, thisArg, args) {
        callCount++
        return Reflect.apply(target as (...a: unknown[]) => unknown, thisArg, args as unknown[])
      },
    })

    const tree = extractDocumentTree(h(Spied as never, { direction: 'row' } as never))
    expect(tree.type).toBe('section')
    expect(tree.props).toEqual({ direction: 'row' })
    expect(callCount).toBe(0)
  })

  it('a `filter`-option primitive (DocTable shape) extracts metadata intact', () => {
    // The filter lives in the separate `filterAttrs` chain — it must not
    // interfere with the `__rs_attrs` chain the extractor reads.
    const tree = extractDocumentTree(
      h(RealDocTable as never, {
        columns: [{ header: 'Name' }],
        rows: [['Alice']],
        striped: true,
      } as never),
    )
    expect(tree.type).toBe('table')
    expect(tree.props).toEqual({
      columns: [{ header: 'Name' }],
      rows: [['Alice']],
      striped: true,
    })
  })

  it('resolves accessor-valued _documentProps at extraction time (real primitive)', () => {
    let live = 'First'
    const template = () =>
      h(RealDocDocument as never, { title: () => live } as never)

    const first = extractDocumentTree(template())
    expect(first.props.title).toBe('First')

    live = 'Second'
    const second = extractDocumentTree(template())
    expect(second.props.title).toBe('Second')
  })

  it('extracts a nested tree of REAL primitives with children preserved', () => {
    const tree = extractDocumentTree(
      h(
        RealDocSection as never,
        { direction: 'column' } as never,
        h(RealDocItem as never, {} as never, 'one'),
        h(RealDocItem as never, {} as never, 'two'),
      ),
    )
    expect(tree.type).toBe('section')
    expect(tree.children).toHaveLength(2)
    expect((tree.children[0] as any).type).toBe('list-item')
    expect((tree.children[0] as any).children).toEqual(['one'])
    expect((tree.children[1] as any).children).toEqual(['two'])
  })

  it('flattens a real `<>` Fragment grouping real primitives (the user-facing drop)', () => {
    // The most faithful reproduction of the silent-drop bug: a real doc
    // template groups siblings with `<>` — idiomatic — and feeds real
    // primitives through the real extractor. Pre-fix, the Fragment vnode
    // dropped every item; the section extracted with ZERO children.
    const tree = extractDocumentTree(
      h(
        RealDocSection as never,
        {} as never,
        h(
          Fragment,
          null,
          h(RealDocItem as never, {} as never, 'a'),
          h(RealDocItem as never, {} as never, 'b'),
        ),
      ),
    )
    expect(tree.type).toBe('section')
    expect(tree.children).toHaveLength(2)
    expect((tree.children[0] as any).children).toEqual(['a'])
    expect((tree.children[1] as any).children).toEqual(['b'])
  })
})
