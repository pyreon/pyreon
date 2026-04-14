import { h } from '@pyreon/core'
import { extractDocumentTree } from '@pyreon/connector-document'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import DocCode from '../primitives/DocCode'
import DocDocument from '../primitives/DocDocument'
import DocHeading from '../primitives/DocHeading'
import DocImage from '../primitives/DocImage'
import DocLink from '../primitives/DocLink'
import DocList from '../primitives/DocList'
import DocListItem from '../primitives/DocListItem'
import DocSection from '../primitives/DocSection'
import DocTable from '../primitives/DocTable'
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

  it('extracts heading level from real DocHeading primitive', () => {
    const tree = extractDocumentTree(
      h(DocDocument, { title: 't' }, h(DocHeading, { level: 'h2' }, 'Section')),
    )
    const heading = (tree.children.find((c) => typeof c !== 'string' && c.type === 'heading') ??
      null) as { type: string; props: { level?: number } } | null
    expect(heading).not.toBeNull()
    // DocHeading converts the 'h2' level prop into a numeric `level: 2`.
    expect(heading?.props.level).toBe(2)
  })

  it('extracts href from real DocLink primitive', () => {
    const tree = extractDocumentTree(
      h(
        DocDocument,
        { title: 't' },
        h(DocLink, { href: 'https://example.com' }, 'click me'),
      ),
    )
    const link = (tree.children.find((c) => typeof c !== 'string' && c.type === 'link') ??
      null) as { type: string; props: { href?: string } } | null
    expect(link).not.toBeNull()
    expect(link?.props.href).toBe('https://example.com')
  })

  it('extracts ordered flag from real DocList primitive', () => {
    const tree = extractDocumentTree(
      h(
        DocDocument,
        { title: 't' },
        h(
          DocList,
          { ordered: true },
          h(DocListItem, null, 'one'),
          h(DocListItem, null, 'two'),
        ),
      ),
    )
    const list = (tree.children.find((c) => typeof c !== 'string' && c.type === 'list') ??
      null) as { type: string; props: { ordered?: boolean }; children: unknown[] } | null
    expect(list).not.toBeNull()
    expect(list?.props.ordered).toBe(true)
    expect(list?.children.length).toBe(2)
  })

  it('extracts language from real DocCode primitive', () => {
    const tree = extractDocumentTree(
      h(
        DocDocument,
        { title: 't' },
        h(DocCode, { language: 'typescript' }, 'const x = 1'),
      ),
    )
    const code = (tree.children.find((c) => typeof c !== 'string' && c.type === 'code') ??
      null) as { type: string; props: { language?: string } } | null
    expect(code).not.toBeNull()
    expect(code?.props.language).toBe('typescript')
  })

  it('extracts src + alt from real DocImage primitive (no DOM forwarding crash)', () => {
    // Image element has read-only `naturalWidth`/`naturalHeight` properties —
    // a clean test that DocImage doesn't try to set them via property assignment.
    const tree = extractDocumentTree(
      h(
        DocDocument,
        { title: 't' },
        h(DocImage, { src: 'https://example.com/x.png', alt: 'logo' }),
      ),
    )
    const img = (tree.children.find((c) => typeof c !== 'string' && c.type === 'image') ??
      null) as { type: string; props: { src?: string; alt?: string } } | null
    expect(img).not.toBeNull()
    expect(img?.props.src).toBe('https://example.com/x.png')
    expect(img?.props.alt).toBe('logo')
  })

  it('extracts table rows + columns without read-only-property crash', () => {
    // DocTable uses `.attrs(callback, { filter: ['rows', 'columns', ...] })`
    // to strip export-only props before they reach the DOM, because
    // HTMLTableElement.rows is a read-only HTMLCollection getter — assigning
    // to it would crash. This test exercises that filter path.
    const tree = extractDocumentTree(
      h(
        DocDocument,
        { title: 't' },
        h(DocTable, {
          rows: [
            ['a1', 'b1'],
            ['a2', 'b2'],
          ],
          columns: ['col-a', 'col-b'],
        }),
      ),
    )
    const table = (tree.children.find((c) => typeof c !== 'string' && c.type === 'table') ??
      null) as
      | {
          type: string
          props: {
            rows?: unknown[]
            columns?: unknown[]
          }
        }
      | null
    expect(table).not.toBeNull()
    expect(Array.isArray(table?.props.rows)).toBe(true)
    expect(table?.props.rows).toHaveLength(2)
    expect(table?.props.columns).toEqual(['col-a', 'col-b'])
  })

  it('extracts deeply nested tree (DocSection wrapping multiple primitives)', () => {
    const tree = extractDocumentTree(
      h(
        DocDocument,
        { title: 'Report' },
        h(
          DocSection,
          null,
          h(DocHeading, { level: 'h1' }, 'Intro'),
          h(DocText, null, 'paragraph'),
          h(DocSection, null, h(DocText, null, 'nested-paragraph')),
        ),
      ),
    )
    expect(tree.type).toBe('document')

    // The traversal into nested sections should preserve depth.
    const findByType = (node: unknown, type: string): unknown => {
      if (typeof node !== 'object' || !node) return null
      const n = node as { type?: string; children?: unknown[] }
      if (n.type === type) return n
      for (const c of n.children ?? []) {
        const found = findByType(c, type)
        if (found) return found
      }
      return null
    }
    const heading = findByType(tree, 'heading')
    expect(heading).not.toBeNull()
    // 'nested-paragraph' should appear as a text node anywhere in the tree.
    const treeStr = JSON.stringify(tree)
    expect(treeStr).toContain('nested-paragraph')
  })

  it('handles primitives that have NO _documentProps cleanly (DocText)', () => {
    // DocText has `_documentProps: {}` — empty object. Confirms the
    // extractor doesn't choke on absent metadata.
    const tree = extractDocumentTree(
      h(DocDocument, { title: 't' }, h(DocText, null, 'just text')),
    )
    const text = (tree.children.find((c) => typeof c !== 'string' && c.type === 'text') ??
      null) as { type: string; children?: unknown[] } | null
    expect(text).not.toBeNull()
    expect(JSON.stringify(text)).toContain('just text')
  })

  it('handles undefined / nullish optional metadata (omits, does not emit `key: undefined`)', () => {
    // DocDocument explicitly only sets keys when non-null. Verify by
    // omitting all optional props.
    const tree = extractDocumentTree(h(DocDocument, {}))
    expect(tree.type).toBe('document')
    expect(tree.props).not.toHaveProperty('title')
    expect(tree.props).not.toHaveProperty('author')
    expect(tree.props).not.toHaveProperty('subject')
  })
})
