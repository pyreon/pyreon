import type { DocumentMarker } from '@pyreon/connector-document'
import { describe, expect, it } from 'vitest'
import { createDocumentExport, extractDocNode } from '../useDocumentExport'

// Mock VNode
const vnode = (
  type: string | ((...args: any[]) => any),
  props: Record<string, any> = {},
  children: unknown[] = [],
) => ({ type, props, children })

// Mock document-marked component
const docComponent = (docType: string) => {
  const fn = (props: any) => vnode('div', props, props.children ? [props.children] : [])
  ;(fn as any)._documentType = docType
  return fn as ((...args: any[]) => any) & DocumentMarker
}

const DocDocument = docComponent('document')
const DocHeading = docComponent('heading')
const DocText = docComponent('text')

describe('createDocumentExport', () => {
  it('extracts a document tree from template function', () => {
    const doc = createDocumentExport(() =>
      vnode(DocDocument, { _documentProps: { title: 'Test' } }, [
        vnode(
          DocHeading,
          {
            $rocketstyle: { fontSize: 24, fontWeight: 'bold' },
            _documentProps: { level: 1 },
          },
          ['Hello'],
        ),
        vnode(
          DocText,
          {
            $rocketstyle: { fontSize: 14, color: '#333' },
          },
          ['World'],
        ),
      ]),
    )

    const tree = doc.getDocNode()

    expect(tree.type).toBe('document')
    expect(tree.props.title).toBe('Test')
    expect(tree.children).toHaveLength(2)

    const heading = tree.children[0] as any
    expect(heading.type).toBe('heading')
    expect(heading.props.level).toBe(1)
    expect(heading.styles?.fontSize).toBe(24)
    expect(heading.children).toEqual(['Hello'])

    const text = tree.children[1] as any
    expect(text.type).toBe('text')
    expect(text.styles?.fontSize).toBe(14)
    expect(text.styles?.color).toBe('#333')
  })

  it('can be called multiple times', () => {
    const doc = createDocumentExport(() =>
      vnode(DocText, { $rocketstyle: { fontSize: 14 } }, ['Static']),
    )

    const tree1 = doc.getDocNode()
    const tree2 = doc.getDocNode()

    expect(tree1.type).toBe('text')
    expect(tree2.type).toBe('text')
  })

  it('respects includeStyles option', () => {
    const doc = createDocumentExport(
      () => vnode(DocHeading, { $rocketstyle: { fontSize: 24 } }, ['Hello']),
      { includeStyles: false },
    )

    const tree = doc.getDocNode()
    expect(tree.styles).toBeUndefined()
  })

  it('handles empty template', () => {
    const doc = createDocumentExport(() => null)

    const tree = doc.getDocNode()
    expect(tree.type).toBe('document')
    expect(tree.children).toEqual([])
  })
})

describe('extractDocNode (one-step alias)', () => {
  // The one-step form. Equivalent to
  // `createDocumentExport(templateFn).getDocNode()` but without
  // the wrapper-object indirection. This is the form most
  // consumers should use.

  it('extracts a tree from a template function in one call', () => {
    const tree = extractDocNode(() =>
      vnode(DocDocument, { _documentProps: { title: 'Test' } }, [
        vnode(DocHeading, { _documentProps: { level: 1 } }, ['Hello']),
      ]),
    )

    expect(tree.type).toBe('document')
    expect(tree.props.title).toBe('Test')
    expect(tree.children).toHaveLength(1)
    const heading = tree.children[0] as { type: string; props: Record<string, unknown> }
    expect(heading.type).toBe('heading')
    expect(heading.props.level).toBe(1)
  })

  it('respects extraction options (includeStyles: false)', () => {
    const tree = extractDocNode(
      () => vnode(DocHeading, { $rocketstyle: { fontSize: 24 } }, ['Hello']),
      { includeStyles: false },
    )
    expect(tree.styles).toBeUndefined()
  })

  it('returns the same tree shape as createDocumentExport().getDocNode()', () => {
    // Equivalence guarantee — the two-step form delegates to the
    // one-step form internally, so they MUST produce identical
    // output for identical input.
    const template = () =>
      vnode(DocText, { $rocketstyle: { fontSize: 14 } }, ['Hello'])

    const oneStep = extractDocNode(template)
    const twoStep = createDocumentExport(template).getDocNode()

    expect(oneStep).toEqual(twoStep)
  })

  it('is idempotent — calling extractDocNode twice on the same template produces equivalent results', () => {
    // The framework fix in PR #197 changed extractDocumentTree to
    // CALL the component function for documentType vnodes when
    // _documentProps is not directly on the JSX vnode. The fix is
    // correct because rocketstyle's attrs HOC is meant to be pure
    // setup with no observable side effects on the second call.
    // This test locks in that purity assumption: extracting the
    // same template twice produces structurally equivalent doc
    // nodes.
    //
    // If a future change to a primitive accidentally introduces a
    // side effect in its attrs callback (e.g. a counter, a log
    // line, a stateful import), the second extraction would still
    // SUCCEED but produce different output — and this test would
    // catch the regression. The three extractions should be deeply
    // equal under any change to the primitive's setup path.
    const template = () =>
      vnode(
        DocDocument,
        { _documentProps: { title: 'Idempotent', author: 'Test' } },
        [
          vnode(DocHeading, { _documentProps: { level: 1 } }, ['Hello']),
          vnode(DocText, { $rocketstyle: { fontSize: 14 } }, ['World']),
        ],
      )

    const first = extractDocNode(template)
    const second = extractDocNode(template)
    const third = extractDocNode(template)

    expect(first).toEqual(second)
    expect(second).toEqual(third)
  })

  it('resolves function values in _documentProps each call (D1+D2 integration)', () => {
    // The combined contract: extractDocNode is the one-step form,
    // and it benefits from the same function-value resolution
    // that extractDocumentTree does. Each call sees the live
    // value of any accessor in _documentProps.
    let counter = 0
    const template = () =>
      vnode(
        DocDocument,
        {
          _documentProps: {
            title: () => `Export ${++counter}`,
            author: 'Plain string still works',
          },
        },
        [],
      )

    const first = extractDocNode(template)
    const second = extractDocNode(template)

    expect(first.props.title).toBe('Export 1')
    expect(first.props.author).toBe('Plain string still works')
    expect(second.props.title).toBe('Export 2')
  })
})

describe('DocDocument reactive metadata (D1 integration)', () => {
  // The end-to-end contract: a real DocDocument primitive (NOT a
  // mock vnode) accepts accessor functions for title/author/subject,
  // stores them in _documentProps, and the export pipeline reads
  // the LIVE values at extraction time.
  //
  // This test mounts DocDocument as if from JSX (via h()) and
  // extracts the resulting tree, then mutates the closure-captured
  // state and re-extracts to prove the second extraction sees the
  // updated value. The previous tests use mock vnodes — this one
  // uses the real primitive.

  // Long timeout: this test dynamic-imports @pyreon/test-utils,
  // @pyreon/core, and DocDocument inside the test body. Each
  // dynamic import triggers Vite's transform pipeline (JSX
  // compilation, rocketstyle wrapping, etc.) which takes 5+
  // seconds on slow CI runners on first hit. The default 5000ms
  // timeout fails reliably on CI.
  it('DocDocument with accessor title produces live values across multiple extractions', { timeout: 30_000 }, async () => {
    // Use happy-dom + initTestConfig like the rest of the test suite
    const { initTestConfig } = await import('@pyreon/test-utils')
    const { h } = await import('@pyreon/core')
    const cleanup = initTestConfig()
    try {
      // Real DocDocument from the package (not the mock above)
      const RealDocDocument = (await import('../primitives/DocDocument')).default

      // Closure state that the accessor reads from. Mutating it
      // between extractions simulates a signal change.
      let currentName = 'Aisha'
      const titleAccessor = () => `${currentName} — Resume`
      const authorAccessor = () => currentName

      // Build the template via h() so DocDocument's attrs callback
      // runs (storing the accessor functions in _documentProps).
      const template = () =>
        h(
          RealDocDocument as never,
          { title: titleAccessor, author: authorAccessor } as never,
        )

      const first = extractDocNode(template)
      expect(first.type).toBe('document')
      expect(first.props.title).toBe('Aisha — Resume')
      expect(first.props.author).toBe('Aisha')

      // Mutate the closure-captured name. The next extraction
      // should see the new value because extractDocumentTree calls
      // the function fresh.
      currentName = 'Marcus'
      const second = extractDocNode(template)
      expect(second.props.title).toBe('Marcus — Resume')
      expect(second.props.author).toBe('Marcus')

      // And once more for good measure
      currentName = 'Priya'
      const third = extractDocNode(template)
      expect(third.props.title).toBe('Priya — Resume')
      expect(third.props.author).toBe('Priya')
    } finally {
      cleanup()
    }
  })

  it('DocDocument with plain string title still works (backward compat)', { timeout: 30_000 }, async () => {
    const { initTestConfig } = await import('@pyreon/test-utils')
    const { h } = await import('@pyreon/core')
    const cleanup = initTestConfig()
    try {
      const RealDocDocument = (await import('../primitives/DocDocument')).default

      const tree = extractDocNode(() =>
        h(
          RealDocDocument as never,
          { title: 'Static title', author: 'Static author' } as never,
        ),
      )

      expect(tree.props.title).toBe('Static title')
      expect(tree.props.author).toBe('Static author')
    } finally {
      cleanup()
    }
  })

  it('DocDocument subject prop also accepts both string and accessor (full prop coverage)', { timeout: 30_000 }, async () => {
    // The widening covered all three metadata props (title, author,
    // subject). The previous tests only exercise title and author —
    // this test fills the coverage gap so a typo in the subject
    // type widening would be caught.
    const { initTestConfig } = await import('@pyreon/test-utils')
    const { h } = await import('@pyreon/core')
    const cleanup = initTestConfig()
    try {
      const RealDocDocument = (await import('../primitives/DocDocument')).default

      // Plain string subject
      const plainTree = extractDocNode(() =>
        h(RealDocDocument as never, { subject: 'Q4 Report' } as never),
      )
      expect(plainTree.props.subject).toBe('Q4 Report')

      // Accessor subject — value resolved at extraction time
      let topic = 'Initial topic'
      const accessorTree1 = extractDocNode(() =>
        h(RealDocDocument as never, { subject: () => topic } as never),
      )
      expect(accessorTree1.props.subject).toBe('Initial topic')

      topic = 'Updated topic'
      const accessorTree2 = extractDocNode(() =>
        h(RealDocDocument as never, { subject: () => topic } as never),
      )
      expect(accessorTree2.props.subject).toBe('Updated topic')
    } finally {
      cleanup()
    }
  })
})
