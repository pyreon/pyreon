import { h } from '@pyreon/core'
import { extractDocumentTree } from '@pyreon/connector-document'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import DocDocument from '../primitives/DocDocument'
import DocHeading from '../primitives/DocHeading'
import DocText from '../primitives/DocText'

// Real-browser smoke suite for @pyreon/document-primitives.
//
// The contract under test here is the one PR #197 fixed: when you pass a real
// rocketstyle-wrapped primitive (not a hand-constructed mock vnode) through
// `extractDocumentTree`, the extractor must invoke the component to reach the
// post-attrs vnode where `_documentProps` actually lives. Before PR #197,
// every real primitive silently dropped its metadata during export.
//
// The existing unit tests in `connector-document/src/__tests__/` use a
// hand-constructed `DocDocLike` function. This suite closes the gap by
// using the ACTUAL `DocDocument` primitive with real rocketstyle runtime,
// in a real browser.

describe('document-primitives in real browser', () => {
  afterEach(() => {
    // Each test cleans up its own mount; extract-only tests have nothing to do.
  })

  it('extracts title + author from a real DocDocument vnode (PR #197 regression)', () => {
    const vnode = h(DocDocument, { title: 'Resume', author: 'Alice' })
    const tree = extractDocumentTree(vnode)

    expect(tree.type).toBe('document')
    expect(tree.props.title).toBe('Resume')
    expect(tree.props.author).toBe('Alice')
  })

  it('resolves reactive accessor props at extraction time (live signal reads)', () => {
    const name = signal('Alice')
    const vnode = h(DocDocument, {
      title: () => `${name()} — Resume`,
      author: () => name(),
    })

    const first = extractDocumentTree(vnode)
    expect(first.props.title).toBe('Alice — Resume')
    expect(first.props.author).toBe('Alice')

    name.set('Bob')
    const second = extractDocumentTree(vnode)
    expect(second.props.title).toBe('Bob — Resume')
    expect(second.props.author).toBe('Bob')
  })

  it('renders a nested DocDocument tree to real DOM and extracts the same tree', () => {
    const vnode = h(
      DocDocument,
      { title: 'Report' },
      h(DocHeading, { level: 'h1' }, 'Q1 Results'),
      h(DocText, null, 'Revenue grew 12%.'),
    )

    const { container, unmount } = mountInBrowser(vnode)
    // Real browser renders the rocketstyle-wrapped elements.
    expect(container.textContent).toContain('Q1 Results')
    expect(container.textContent).toContain('Revenue grew 12%.')

    // Same vnode drives the export path.
    const tree = extractDocumentTree(vnode)
    expect(tree.type).toBe('document')
    expect(tree.props.title).toBe('Report')
    expect(tree.children.length).toBeGreaterThanOrEqual(2)
    const nodeChildren = tree.children.filter(
      (c): c is Exclude<typeof c, string> => typeof c !== 'string',
    )
    expect(nodeChildren.some((c) => c.type === 'heading')).toBe(true)
    expect(nodeChildren.some((c) => c.type === 'text')).toBe(true)

    unmount()
  })
})
