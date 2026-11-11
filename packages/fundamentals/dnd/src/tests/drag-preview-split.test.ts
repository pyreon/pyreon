/**
 * The custom drag preview is an import-chosen feature: `dragPreview(options)`
 * builds it, so a draggable without one ships none of pdnd's preview utilities
 * (locked by the `@pyreon/dnd::useDraggable` import budget).
 */
import { describe, expect, it } from 'vitest'
import { dragPreview } from '../drag-preview'
import { useDraggable } from '../use-draggable'

describe('dragPreview split', () => {
  it('dragPreview() returns an onGenerateDragPreview handler', () => {
    expect(typeof dragPreview({ render: () => {} }).onGenerateDragPreview).toBe('function')
  })

  it('useDraggable rejects the old options-object preview in dev', () => {
    expect(() =>
      useDraggable({ data: { id: 'x' }, preview: { render: () => {} } as never }),
    ).toThrow(/dragPreview\(\{ render, offset \}\)/)
  })
})
