/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { extractDocumentTree } from '../extractDocumentTree'
import { resolveStyles } from '../resolveStyles'

// Real-Chromium smoke for @pyreon/connector-document.
//
// The pre-existing unit tests construct mock vnode objects by hand
// (`{ type, props, children }`) — fast but they bypass the real
// `@pyreon/core` `h()` runtime. PR #197 fixed a class of bug that
// hand-mock tests can't catch: `_documentProps` only appears on a
// vnode AFTER rocketstyle's `.attrs()` HOC runs, so the JSX
// vnode (what `h()` returns) only carries USER-provided props.
//
// This suite builds vnodes with the real `h()` runtime and verifies:
//   1. Path A: a documentType component with `_documentProps` already
//      set on the JSX vnode extracts cleanly.
//   2. Path B: `extractDocumentTree` invokes the component and reads
//      `_documentProps` from the post-call vnode (the rocketstyle
//      attrs-style path) — proving the workaround documented in the
//      source still functions in a real browser.
//   3. Function-valued `_documentProps` (reactive accessors) are
//      resolved to LIVE values at extraction time — covers the
//      "metadata reads current signal" path used by document-primitives.
//   4. resolveStyles converts rocketstyle theme objects to plain
//      style records in the browser bundle (no Node-only dep leaks).

describe('@pyreon/connector-document in real browser', () => {
  afterEach(() => {
    // No globals to reset — extractDocumentTree is pure.
  })

  it('Path A — reads _documentProps off the JSX vnode WITHOUT invoking the component', () => {
    // Strict Path A: the component function itself must NEVER touch
    // `_documentProps` — `_documentProps` is supplied directly on the
    // JSX vnode props. To prove the extractor takes the fast path and
    // doesn't call the component, we install a throwing body: if
    // extractNode falls through to Path B (invoking the component),
    // the test fails with the throw. Passing proves Path A is taken.
    const Heading = (_props: any) => {
      throw new Error('Path A must not invoke the component')
    }
    ;(Heading as any)._documentType = 'heading'

    const tree = h(
      Heading,
      { _documentProps: { level: 1 }, $rocketstyle: { color: '#000' } },
      'Hi',
    )
    const result = extractDocumentTree(tree)

    expect(result.type).toBe('heading')
    expect(result.props).toEqual({ level: 1 })
    expect(result.children[0]).toBe('Hi')
    expect(result.styles?.color).toBe('#000')
  })

  it('Path B — invokes the component to recover _documentProps from the post-call vnode', () => {
    // Simulates the rocketstyle attrs-HOC pattern: USER passes
    // `{ title, author }` as JSX props; the component itself
    // injects `_documentProps` into its return vnode via h().
    const DocDocument = (props: any) =>
      h(
        'div',
        {
          // Post-attrs props — never visible on the JSX vnode itself.
          _documentProps: {
            title: props.title,
            author: props.author,
          },
        },
        props.children,
      )
    ;(DocDocument as any)._documentType = 'document'

    const tree = h(DocDocument, { title: 'Manual', author: 'Vít' }, 'body')
    const result = extractDocumentTree(tree)

    expect(result.type).toBe('document')
    expect(result.props).toEqual({ title: 'Manual', author: 'Vít' })
  })

  it('resolves function-valued _documentProps to LIVE values at extraction time', () => {
    const titleSig = signal('Initial')
    const DocDocument = (props: any) =>
      h(
        'div',
        {
          _documentProps: {
            // Accessor — extractor must call this to read the live signal.
            title: props.title,
          },
        },
        props.children,
      )
    ;(DocDocument as any)._documentType = 'document'

    const tree = h(DocDocument, { title: () => titleSig() }, 'x')

    const before = extractDocumentTree(tree)
    expect(before.props).toEqual({ title: 'Initial' })

    titleSig.set('Updated')
    const after = extractDocumentTree(tree)
    // Same vnode, same accessor — but it now reads the new signal value.
    expect(after.props).toEqual({ title: 'Updated' })
  })

  it('flattens transparent (non-documentType) wrappers built with h()', () => {
    const Section = (props: any) => h('div', props, props.children)
    ;(Section as any)._documentType = 'section'
    const Text = (props: any) => h('span', props, props.children)
    ;(Text as any)._documentType = 'text'

    const tree = h(
      Section,
      null,
      // Plain `h('div')` wrapper has no _documentType — should be
      // flattened, leaving the inner Text directly under Section.
      h('div', null, h(Text, null, 'inner')),
    )
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('section')
    expect(result.children).toHaveLength(1)
    expect((result.children[0] as any).type).toBe('text')
    expect((result.children[0] as any).children[0]).toBe('inner')
  })

  it('resolveStyles produces a plain style record in the browser bundle', () => {
    const styles = resolveStyles(
      {
        color: '#fff',
        backgroundColor: '#0070f3',
        fontSize: 24,
        padding: '8px 16px',
      },
      16,
    )
    expect(styles.color).toBe('#fff')
    expect(styles.backgroundColor).toBe('#0070f3')
    expect(styles.fontSize).toBe(24)
    expect(styles.padding).toEqual([8, 16])
  })
})
