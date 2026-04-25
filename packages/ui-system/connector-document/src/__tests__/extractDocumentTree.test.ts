import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import type { DocumentMarker } from '../extractDocumentTree'
import { extractDocumentTree } from '../extractDocumentTree'

// Helper: build a real VNode via @pyreon/core's h(). The third arg
// is an array (kept for parity with the prior mock helper) and
// spreads into h()'s varargs. All tests below run real-h() VNodes
// through the extraction pipeline — see PR #197 for why mock-only
// tests masked a silent metadata drop in the real attrs HOC path.
const node = (
  type: string | ((...args: any[]) => any),
  props: Record<string, any> = {},
  children: unknown[] = [],
) => h(type as any, props, ...(children as any[])) as any

// Helper: create a document-marked component function
const docComponent = (docType: string, render?: (...args: any[]) => any) => {
  const fn = render ?? ((props: any) => node('div', props, props.children ? [props.children] : []))
  ;(fn as any)._documentType = docType
  return fn as ((...args: any[]) => any) & DocumentMarker
}

describe('extractDocumentTree', () => {
  it('extracts a simple document node', () => {
    const Heading = docComponent('heading')
    const tree = node(
      Heading,
      { $rocketstyle: { fontSize: 24, fontWeight: 'bold' }, _documentProps: { level: 1 } },
      ['Hello World'],
    )

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('heading')
    expect(result.props).toEqual({ level: 1 })
    expect(result.children).toEqual(['Hello World'])
    expect(result.styles).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('extracts nested document nodes', () => {
    const Section = docComponent('section')
    const Text = docComponent('text')

    const tree = node(Section, { $rocketstyle: { padding: 16 } }, [
      node(Text, { $rocketstyle: { fontSize: 14, color: '#333' } }, ['Paragraph one']),
      node(Text, { $rocketstyle: { fontSize: 14, color: '#333' } }, ['Paragraph two']),
    ])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('section')
    expect(result.styles).toEqual({ padding: 16 })
    expect(result.children).toHaveLength(2)
    expect((result.children[0] as any).type).toBe('text')
    expect((result.children[1] as any).type).toBe('text')
  })

  it('flattens transparent wrappers', () => {
    const Section = docComponent('section')
    const Text = docComponent('text')

    // A plain div wrapper (no _documentType) should be transparent
    const tree = node(Section, {}, [
      node('div', {}, [node(Text, { $rocketstyle: { fontSize: 14 } }, ['Hello'])]),
    ])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('section')
    expect(result.children).toHaveLength(1)
    expect((result.children[0] as any).type).toBe('text')
  })

  it('handles string children', () => {
    const Text = docComponent('text')
    const tree = node(Text, {}, ['Hello', ' ', 'World'])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['Hello', ' ', 'World'])
  })

  it('handles number children', () => {
    const Text = docComponent('text')
    const tree = node(Text, {}, [42])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['42'])
  })

  it('skips null and boolean children', () => {
    const Section = docComponent('section')
    const tree = node(Section, {}, [null, false, true, 'visible'])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['visible'])
  })

  it('resolves reactive getter children', () => {
    const Text = docComponent('text')
    const tree = node(Text, {}, [() => 'dynamic text'])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['dynamic text'])
  })

  it('omits styles when includeStyles is false', () => {
    const Heading = docComponent('heading')
    const tree = node(Heading, { $rocketstyle: { fontSize: 24 } }, ['Hello'])

    const result = extractDocumentTree(tree, { includeStyles: false })

    expect(result.styles).toBeUndefined()
  })

  it('wraps in document node when root has no _documentType', () => {
    const tree = node('div', {}, ['raw text'])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('document')
    expect(result.children).toEqual(['raw text'])
  })

  it('handles component functions without _documentType by calling them', () => {
    const Text = docComponent('text')
    const Wrapper = (props: any) =>
      node(Text, { $rocketstyle: { fontSize: 14 } }, [props.children])

    const tree = node(Wrapper, {}, ['wrapped text'])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('text')
    expect(result.children).toEqual(['wrapped text'])
  })

  it('handles function passed directly', () => {
    const Text = docComponent('text')
    const template = () => node(Text, { $rocketstyle: { fontSize: 14 } }, ['Hello'])

    const result = extractDocumentTree(template)

    expect(result.type).toBe('text')
    expect(result.children).toEqual(['Hello'])
  })

  it('creates empty document for null input', () => {
    const result = extractDocumentTree(null)

    expect(result.type).toBe('document')
    expect(result.children).toEqual([])
  })

  describe('_documentProps function value resolution (D1)', () => {
    // Document primitives like DocDocument now accept reactive
    // accessors (e.g. `title={() => store.name()}`) and store the
    // function in _documentProps. extractDocumentTree resolves the
    // function at extraction time so the export pipeline always
    // sees the live value, not a stale snapshot from component
    // mount time.
    //
    // These tests lock in the behavior at the connector-document
    // boundary so any future change to the resolution logic gets
    // caught by a focused unit test.

    it('calls function values in _documentProps and stores the result', () => {
      const Document = docComponent('document')
      const tree = node(
        Document,
        {
          _documentProps: {
            title: () => 'Resolved title',
            author: () => 'Alice',
            subject: 'Plain string still works',
          },
        },
        [],
      )

      const result = extractDocumentTree(tree)

      expect(result.props).toEqual({
        title: 'Resolved title',
        author: 'Alice',
        subject: 'Plain string still works',
      })
    })

    it('reads the live value each time extractDocumentTree is called', () => {
      // The whole point of accessors: every export call sees the
      // current state, not a value frozen at component mount.
      // We simulate this by mutating the closure variable between
      // two extractDocumentTree calls on the same vnode.
      let counter = 0
      const Document = docComponent('document')
      const tree = node(
        Document,
        {
          _documentProps: {
            title: () => `Export ${++counter}`,
          },
        },
        [],
      )

      const first = extractDocumentTree(tree)
      const second = extractDocumentTree(tree)
      const third = extractDocumentTree(tree)

      expect(first.props.title).toBe('Export 1')
      expect(second.props.title).toBe('Export 2')
      expect(third.props.title).toBe('Export 3')
    })

    it('mixes function and plain values in the same _documentProps object', () => {
      const Image = docComponent('image')
      const tree = node(
        Image,
        {
          _documentProps: {
            src: 'static-url.png',         // plain
            alt: () => 'dynamic alt text', // accessor
            width: 800,                    // plain number
            caption: () => 'caption ' + 42, // accessor returning a string
          },
        },
        [],
      )

      const result = extractDocumentTree(tree)
      expect(result.props).toEqual({
        src: 'static-url.png',
        alt: 'dynamic alt text',
        width: 800,
        caption: 'caption 42',
      })
    })

    it('preserves backward compatibility — existing primitives with plain props still work', () => {
      // Regression case: every existing document primitive uses
      // plain values in _documentProps. The function-resolution
      // change must not break them. This test mirrors the shape
      // of DocHeading's existing _documentProps.
      const Heading = docComponent('heading')
      const tree = node(
        Heading,
        { _documentProps: { level: 1 } },
        ['Hello'],
      )

      const result = extractDocumentTree(tree)
      expect(result.props).toEqual({ level: 1 })
      expect(typeof result.props.level).toBe('number')
    })
  })

  describe('component invocation path (extracts from post-attrs vnodes)', () => {
    // Real-world case: rocketstyle-based primitives never have
    // `_documentProps` on the JSX vnode. The user passes
    // `<DocDocument title="X" />`, which produces a JSX vnode
    // with `props = { title: 'X' }`. The `_documentProps` only
    // appears AFTER the rocketstyle attrs HOC runs the
    // `.attrs()` callback.
    //
    // Before the fix, extractDocumentTree only looked for
    // `_documentProps` on the JSX vnode's props directly — so
    // every real primitive's metadata was silently dropped during
    // export. The mock-vnode tests above hand-constructed
    // `_documentProps` to bypass this and never noticed.
    //
    // After the fix, extractDocumentTree CALLS the component
    // function for documentType vnodes that don't have
    // `_documentProps` directly, captures the post-attrs result,
    // and reads `_documentProps` from THAT.
    //
    // These tests use a hand-constructed component that mimics
    // the rocketstyle attrs pattern: the component is a function
    // with `_documentType` set, and calling it returns a vnode
    // whose props contain `_documentProps`. No real rocketstyle
    // dependency needed for the unit test.

    it('calls the component function and reads _documentProps from the post-attrs vnode', () => {
      // Component that mimics a rocketstyle-wrapped primitive:
      // takes user props, returns a vnode with _documentProps
      // populated by the "attrs callback".
      const DocDocLike = ((userProps: { title?: string; author?: string }) =>
        node('div', {
          _documentProps: {
            ...(userProps.title ? { title: userProps.title } : {}),
            ...(userProps.author ? { author: userProps.author } : {}),
          },
        })) as ((...args: any[]) => any) & DocumentMarker
      ;(DocDocLike as any)._documentType = 'document'

      // The JSX vnode has user props but NO _documentProps directly
      const jsxVnode = node(DocDocLike, { title: 'My Doc', author: 'Alice' }, [])

      const result = extractDocumentTree(jsxVnode)

      expect(result.type).toBe('document')
      expect(result.props.title).toBe('My Doc')
      expect(result.props.author).toBe('Alice')
    })

    it('also resolves function values from the post-attrs path', () => {
      // The two fixes compose: a real primitive that stores
      // accessor functions in its _documentProps (via the attrs
      // callback) gets the live value resolved at extraction time.
      let liveTitle = 'First'
      const DocDocLike = ((userProps: { title?: () => string }) =>
        node('div', {
          _documentProps: {
            title: userProps.title, // store the accessor as-is
          },
        })) as ((...args: any[]) => any) & DocumentMarker
      ;(DocDocLike as any)._documentType = 'document'

      const jsxVnode = node(DocDocLike, { title: () => liveTitle }, [])

      const first = extractDocumentTree(jsxVnode)
      expect(first.props.title).toBe('First')

      liveTitle = 'Second'
      const second = extractDocumentTree(jsxVnode)
      expect(second.props.title).toBe('Second')
    })

    it('prefers JSX-vnode _documentProps when both paths are available (back-compat)', () => {
      // If a vnode has _documentProps directly on its props (the
      // mock-vnode test pattern), extractDocumentTree should use
      // it WITHOUT calling the component. This preserves the
      // existing tests' fast path and avoids invoking components
      // unnecessarily.
      let componentCalled = false
      const DocDocLike = (() => {
        componentCalled = true
        return node('div', { _documentProps: { title: 'from-call' } })
      }) as ((...args: any[]) => any) & DocumentMarker
      ;(DocDocLike as any)._documentType = 'document'

      const jsxVnode = node(
        DocDocLike,
        { _documentProps: { title: 'from-jsx' } },
        [],
      )

      const result = extractDocumentTree(jsxVnode)
      expect(result.props.title).toBe('from-jsx')
      expect(componentCalled).toBe(false)
    })
  })
})

// ─── Real h() round-trip (parallel to the mock-vnode tests above) ────────
//
// This is the exact file PR #197 fixed — `extractDocumentTree` was
// silently dropping metadata from real rocketstyle primitives because
// the existing tests ONLY used the local `node(...)` helper that
// hardcodes `{ type, props, children }` literals. The mock path
// worked; the real pipeline (where `_documentProps` is only attached
// AFTER the attrs HOC runs) didn't. The `audit_test_environment` tool
// from PR #311 flagged this file HIGH (27 mock-helper call-sites, 0
// real `h()` calls, no `@pyreon/core` import).
//
// This block adds a parallel: the same tree shapes built via real
// `h(...)` from `@pyreon/core`. The mock `node()` helper returns a
// hand-built object literal; real `h()` returns whatever the current
// Pyreon VNode shape is — if the two ever drift, only the real-`h()`
// path catches it. The mock tests above stay as the fast unit-test
// path; these are the safety net.

describe('extractDocumentTree — real h() round-trip', () => {
  it('extracts a simple document node built via real h()', () => {
    const Heading = docComponent('heading')
    const tree = h(
      Heading,
      { $rocketstyle: { fontSize: 24, fontWeight: 'bold' }, _documentProps: { level: 1 } },
      'Hello World',
    )

    const result = extractDocumentTree(tree)
    expect(result.type).toBe('heading')
    expect(result.props).toEqual({ level: 1 })
    expect(result.children).toEqual(['Hello World'])
    expect(result.styles).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('extracts nested document nodes through real h() trees', () => {
    const Section = docComponent('section')
    const Text = docComponent('text')

    const tree = h(
      Section,
      { $rocketstyle: { padding: 16 } },
      h(Text, { $rocketstyle: { fontSize: 14 } }, 'Paragraph one'),
      h(Text, { $rocketstyle: { fontSize: 14 } }, 'Paragraph two'),
    )

    const result = extractDocumentTree(tree)
    expect(result.type).toBe('section')
    expect(result.styles).toEqual({ padding: 16 })
    expect(result.children).toHaveLength(2)
    const child0 = result.children[0] as { type: string; children: unknown[] }
    const child1 = result.children[1] as { type: string; children: unknown[] }
    expect(child0.type).toBe('text')
    expect(child0.children).toEqual(['Paragraph one'])
    expect(child1.type).toBe('text')
    expect(child1.children).toEqual(['Paragraph two'])
  })

  it('transparent wrappers (no _documentType) are flattened by the extractor', () => {
    const Section = docComponent('section')
    const Text = docComponent('text')
    // A plain `div` wrapper nested inside a section — no document
    // marker on the div — should be invisible to the extractor.
    // Consumers sprinkle layout containers without breaking the
    // extraction pipeline.
    const tree = h(
      Section,
      {},
      h('div', {}, h(Text, { $rocketstyle: { fontSize: 14 } }, 'Hello')),
    )

    const result = extractDocumentTree(tree)
    expect(result.type).toBe('section')
    expect(result.children).toHaveLength(1)
    const child0 = result.children[0] as { type: string; children: unknown[] }
    expect(child0.type).toBe('text')
    expect(child0.children).toEqual(['Hello'])
  })

  it('component is INVOKED during extraction (the PR #197 fix)', () => {
    // The fix in PR #197: when a docComponent has attrs-HOC-style
    // post-processing, extractDocumentTree must call the component to
    // see its post-attrs VNode. With real `h()` the contract is the
    // same — the component function on `vnode.type` must be invoked
    // so that attrs-populated `_documentProps` surface correctly.
    let callCount = 0
    const Enriched = docComponent('heading', (props: any) => {
      callCount++
      // Mimic an attrs HOC that stamps post-attrs metadata onto a
      // child VNode instead of the outer wrapper (the exact shape
      // PR #197 discovered).
      return h('div', { ...props, _documentProps: { level: 2 } }, props.children)
    })

    const tree = h(Enriched, {}, 'After attrs')
    const result = extractDocumentTree(tree)
    expect(callCount).toBeGreaterThan(0)
    expect(result.type).toBe('heading')
    expect(result.props.level).toBe(2)
  })
})

// ─── T3.1 hoisted-attrs fast path (Path C) ────────────────────────────
//
// Real rocketstyle primitives now expose `__rs_attrs` — the accumulated
// `.attrs()` callback chain — on the component function itself.
// `extractDocumentTree` runs that chain DIRECTLY instead of invoking
// the full component, so `_documentProps` resolution doesn't pay for
// the styled wrapper / dimension resolution / JSX tree creation.
//
// The test below mimics rocketstyle's exposed surface (no real
// `@pyreon/rocketstyle` import needed — the contract is just "if
// `__rs_attrs` is present on the component function, use it"). A
// counter-spied "render" function asserts the body is NEVER called when
// the fast path is taken.

describe('extractDocumentTree — T3.1 hoisted-attrs fast path', () => {
  it('uses __rs_attrs without invoking the component function (Path C)', () => {
    let callCount = 0
    // Mimic a rocketstyle primitive: function with _documentType static
    // AND __rs_attrs static (the hoisted attrs chain). The body is what
    // would be the styled wrapper; we count its invocations.
    const FakeRocketDoc = ((props: any) => {
      callCount++
      return h('div', props, props.children)
    }) as ((p: any) => any) & DocumentMarker
    ;(FakeRocketDoc as any)._documentType = 'document'
    ;(FakeRocketDoc as any).__rs_attrs = [
      (props: { title?: string; author?: string }) => ({
        _documentProps: {
          ...(props.title ? { title: props.title } : {}),
          ...(props.author ? { author: props.author } : {}),
        },
      }),
    ]

    const tree = h(FakeRocketDoc, { title: 'My Doc', author: 'Alice' })
    const result = extractDocumentTree(tree)

    expect(result.type).toBe('document')
    expect(result.props.title).toBe('My Doc')
    expect(result.props.author).toBe('Alice')
    // The architectural assertion — the component body must NOT run.
    expect(callCount).toBe(0)
  })

  it('also resolves accessor function values from __rs_attrs (composes with D1 fix)', () => {
    let liveTitle = 'First'
    let callCount = 0
    const FakeRocketDoc = ((props: any) => {
      callCount++
      return h('div', props, props.children)
    }) as ((p: any) => any) & DocumentMarker
    ;(FakeRocketDoc as any)._documentType = 'document'
    ;(FakeRocketDoc as any).__rs_attrs = [
      (props: { title?: () => string }) => ({
        _documentProps: { title: props.title },
      }),
    ]

    const jsx = h(FakeRocketDoc, { title: () => liveTitle })
    const first = extractDocumentTree(jsx)
    expect(first.props.title).toBe('First')

    liveTitle = 'Second'
    const second = extractDocumentTree(jsx)
    expect(second.props.title).toBe('Second')

    // Two extractions, zero component invocations.
    expect(callCount).toBe(0)
  })

  it('falls back to Path B (full component invocation) when __rs_attrs is absent', () => {
    // Non-rocketstyle docComponents (test fixtures, hand-rolled HOCs)
    // don't have __rs_attrs and must still work via the legacy Path B.
    let callCount = 0
    const PlainDoc = ((props: any) => {
      callCount++
      return h('div', { ...props, _documentProps: { level: 3 } }, props.children)
    }) as ((p: any) => any) & DocumentMarker
    ;(PlainDoc as any)._documentType = 'heading'
    // Note: NO __rs_attrs here — Path B should fire

    const tree = h(PlainDoc, {}, 'Body')
    const result = extractDocumentTree(tree)

    expect(result.type).toBe('heading')
    expect(result.props.level).toBe(3)
    expect(callCount).toBeGreaterThan(0)
  })
})
