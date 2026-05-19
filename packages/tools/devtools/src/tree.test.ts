import { describe, expect, it } from 'vitest'
import { buildMap, getRoots } from './tree'
import type { SerializedEntry } from './types'

const entries: SerializedEntry[] = [
  {
    id: 'root-1',
    name: 'App',
    parentId: null,
    childIds: ['child-1', 'child-2'],
  },
  { id: 'child-1', name: 'Header', parentId: 'root-1', childIds: ['leaf-1'] },
  { id: 'child-2', name: 'Body', parentId: 'root-1', childIds: [] },
  { id: 'leaf-1', name: 'Logo', parentId: 'child-1', childIds: [] },
  { id: 'root-2', name: 'Modal', parentId: null, childIds: [] },
]

describe('buildMap', () => {
  it('creates a map keyed by entry id', () => {
    const map = buildMap(entries)

    expect(map.size).toBe(5)
    expect(map.get('root-1')?.name).toBe('App')
    expect(map.get('leaf-1')?.name).toBe('Logo')
  })

  it('returns an empty map for empty input', () => {
    expect(buildMap([]).size).toBe(0)
  })
})

describe('getRoots', () => {
  it('returns entries with null parentId', () => {
    const roots = getRoots(entries)

    expect(roots).toHaveLength(2)
    expect(roots.map((r) => r.id)).toEqual(['root-1', 'root-2'])
  })

  it('returns empty array when all entries have parents', () => {
    const noRoots: SerializedEntry[] = [
      { id: 'a', name: 'A', parentId: 'x', childIds: [] },
    ]
    expect(getRoots(noRoots)).toHaveLength(0)
  })
})
