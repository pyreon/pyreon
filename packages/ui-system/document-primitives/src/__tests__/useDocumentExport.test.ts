import type { DocumentMarker } from '@pyreon/connector-document'
import { describe, expect, it } from 'vitest'
import { createDocumentExport } from '../useDocumentExport'

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
