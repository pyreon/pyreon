import { describe, expect, it } from 'vitest'
import type { DocumentMarker } from '../extractDocumentTree'
import { extractDocumentTree } from '../extractDocumentTree'

// Helper: create a mock VNode
const vnode = (
  type: string | ((...args: any[]) => any),
  props: Record<string, any> = {},
  children: unknown[] = [],
) => ({ type, props, children })

// Helper: create a document-marked component function
const docComponent = (docType: string, render?: (...args: any[]) => any) => {
  const fn = render ?? ((props: any) => vnode('div', props, props.children ? [props.children] : []))
  ;(fn as any)._documentType = docType
  return fn as ((...args: any[]) => any) & DocumentMarker
}

describe('extractDocumentTree', () => {
  it('extracts a simple document node', () => {
    const Heading = docComponent('heading')
    const tree = vnode(
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

    const tree = vnode(Section, { $rocketstyle: { padding: 16 } }, [
      vnode(Text, { $rocketstyle: { fontSize: 14, color: '#333' } }, ['Paragraph one']),
      vnode(Text, { $rocketstyle: { fontSize: 14, color: '#333' } }, ['Paragraph two']),
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
    const tree = vnode(Section, {}, [
      vnode('div', {}, [vnode(Text, { $rocketstyle: { fontSize: 14 } }, ['Hello'])]),
    ])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('section')
    expect(result.children).toHaveLength(1)
    expect((result.children[0] as any).type).toBe('text')
  })

  it('handles string children', () => {
    const Text = docComponent('text')
    const tree = vnode(Text, {}, ['Hello', ' ', 'World'])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['Hello', ' ', 'World'])
  })

  it('handles number children', () => {
    const Text = docComponent('text')
    const tree = vnode(Text, {}, [42])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['42'])
  })

  it('skips null and boolean children', () => {
    const Section = docComponent('section')
    const tree = vnode(Section, {}, [null, false, true, 'visible'])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['visible'])
  })

  it('resolves reactive getter children', () => {
    const Text = docComponent('text')
    const tree = vnode(Text, {}, [() => 'dynamic text'])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(['dynamic text'])
  })

  it('omits styles when includeStyles is false', () => {
    const Heading = docComponent('heading')
    const tree = vnode(Heading, { $rocketstyle: { fontSize: 24 } }, ['Hello'])

    const result = extractDocumentTree(tree, { includeStyles: false })

    expect(result.styles).toBeUndefined()
  })

  it('wraps in document node when root has no _documentType', () => {
    const tree = vnode('div', {}, ['raw text'])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('document')
    expect(result.children).toEqual(['raw text'])
  })

  it('handles component functions without _documentType by calling them', () => {
    const Text = docComponent('text')
    const Wrapper = (props: any) =>
      vnode(Text, { $rocketstyle: { fontSize: 14 } }, [props.children])

    const tree = vnode(Wrapper, {}, ['wrapped text'])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe('text')
    expect(result.children).toEqual(['wrapped text'])
  })

  it('handles function passed directly', () => {
    const Text = docComponent('text')
    const template = () => vnode(Text, { $rocketstyle: { fontSize: 14 } }, ['Hello'])

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
      const tree = vnode(
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
      const tree = vnode(
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
      const tree = vnode(
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
      const tree = vnode(
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
        vnode('div', {
          _documentProps: {
            ...(userProps.title ? { title: userProps.title } : {}),
            ...(userProps.author ? { author: userProps.author } : {}),
          },
        })) as ((...args: any[]) => any) & DocumentMarker
      ;(DocDocLike as any)._documentType = 'document'

      // The JSX vnode has user props but NO _documentProps directly
      const jsxVnode = vnode(DocDocLike, { title: 'My Doc', author: 'Alice' }, [])

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
        vnode('div', {
          _documentProps: {
            title: userProps.title, // store the accessor as-is
          },
        })) as ((...args: any[]) => any) & DocumentMarker
      ;(DocDocLike as any)._documentType = 'document'

      const jsxVnode = vnode(DocDocLike, { title: () => liveTitle }, [])

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
        return vnode('div', { _documentProps: { title: 'from-call' } })
      }) as ((...args: any[]) => any) & DocumentMarker
      ;(DocDocLike as any)._documentType = 'document'

      const jsxVnode = vnode(
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
