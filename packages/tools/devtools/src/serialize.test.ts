import { describe, expect, it } from 'vitest'
import type { DevtoolsComponentEntry } from './serialize'
import { serialize } from './serialize'

describe('serialize', () => {
  it('strips the el property from a component entry', () => {
    const entry: DevtoolsComponentEntry = {
      id: 'c-1',
      name: 'Counter',
      el: document.createElement('div'),
      parentId: null,
      childIds: ['c-2', 'c-3'],
    }

    const result = serialize(entry)

    expect(result).toEqual({
      id: 'c-1',
      name: 'Counter',
      parentId: null,
      childIds: ['c-2', 'c-3'],
    })
    expect(result).not.toHaveProperty('el')
  })

  it('preserves parentId when present', () => {
    const entry: DevtoolsComponentEntry = {
      id: 'c-2',
      name: 'Button',
      el: null,
      parentId: 'c-1',
      childIds: [],
    }

    const result = serialize(entry)

    expect(result.parentId).toBe('c-1')
  })

  it('handles empty childIds', () => {
    const entry: DevtoolsComponentEntry = {
      id: 'c-1',
      name: 'Leaf',
      el: null,
      parentId: null,
      childIds: [],
    }

    expect(serialize(entry).childIds).toEqual([])
  })
})
