import { describe, expect, it } from 'vitest'
import {
  ancestorIds,
  buildMap,
  flattenTree,
  getRoots,
  indexTree,
  ownerPath,
} from './tree'
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

  it('treats an entry whose parent is not in the list as a root', () => {
    // Its parent unmounted or registered after the snapshot: without
    // this the whole subtree would vanish from the panel.
    const orphan: SerializedEntry[] = [
      { id: 'a', name: 'A', parentId: 'x', childIds: [] },
      { id: 'b', name: 'B', parentId: 'a', childIds: [] },
    ]
    expect(getRoots(orphan).map((r) => r.id)).toEqual(['a'])
  })
})

// Post-order registration, as the framework really does it: children
// register BEFORE their parent, and every parent's childIds is empty.
const postOrder: SerializedEntry[] = [
  { id: 'nav', name: 'Nav', parentId: 'header', childIds: [] },
  { id: 'toggle', name: 'ThemeToggle', parentId: 'header', childIds: [] },
  { id: 'header', name: 'Header', parentId: 'app', childIds: [] },
  { id: 'row1', name: 'MessageRow', parentId: 'list', childIds: [] },
  { id: 'row2', name: 'MessageRow', parentId: 'list', childIds: [] },
  { id: 'list', name: 'MessageList', parentId: 'app', childIds: [] },
  { id: 'app', name: 'App', parentId: null, childIds: [] },
]

describe('flattenTree', () => {
  const index = indexTree(postOrder)
  const names = (rows: ReturnType<typeof flattenTree>) =>
    rows.map((r) => `${'  '.repeat(r.depth)}${r.entry.name}`)

  it('rebuilds the tree from parentId even though every childIds is empty', () => {
    const rows = flattenTree(index, new Set(['app', 'header', 'list']))
    expect(names(rows)).toEqual([
      'App',
      '  Header',
      '    Nav',
      '    ThemeToggle',
      '  MessageList',
      '    MessageRow',
      '    MessageRow',
    ])
    expect(rows[0]).toMatchObject({ childCount: 2, expanded: true, match: false })
  })

  it('hides the children of collapsed rows', () => {
    const rows = flattenTree(index, new Set(['app']))
    expect(names(rows)).toEqual(['App', '  Header', '  MessageList'])
    expect(rows[1]).toMatchObject({ childCount: 2, expanded: false })
  })

  it('a filter keeps matches and their ancestors, opened, whatever is collapsed', () => {
    const rows = flattenTree(index, new Set(), 'toggle')
    expect(names(rows)).toEqual(['App', '  Header', '    ThemeToggle'])
    expect(rows.map((r) => r.match)).toEqual([false, false, true])
    expect(rows[1]!.expanded).toBe(true)
    expect(flattenTree(index, new Set(), 'nothing-matches')).toEqual([])
  })

  it('handles a 20,000-deep chain without overflowing the stack', () => {
    const deep: SerializedEntry[] = Array.from({ length: 20_000 }, (_, i) => ({
      id: `n${i}`,
      name: `N${i}`,
      parentId: i === 0 ? null : `n${i - 1}`,
      childIds: [],
    }))
    const all = new Set(deep.map((d) => d.id))
    const rows = flattenTree(indexTree(deep), all)
    expect(rows).toHaveLength(20_000)
    expect(rows[19_999]!.depth).toBe(19_999)
    expect(ownerPath('n19999', buildMap(deep))).toHaveLength(20_000)
  })

  it('ownerPath and ancestorIds walk parentId and stop on cycles', () => {
    const map = buildMap(postOrder)
    expect(ownerPath('nav', map)).toEqual(['App', 'Header', 'Nav'])
    expect(ancestorIds('nav', map)).toEqual(['header', 'app'])
    expect(ownerPath('missing', map)).toEqual([])
    const cyc = buildMap([
      { id: 'a', name: 'A', parentId: 'b', childIds: [] },
      { id: 'b', name: 'B', parentId: 'a', childIds: [] },
    ])
    expect(ownerPath('a', cyc)).toEqual(['B', 'A'])
    expect(ancestorIds('a', cyc)).toEqual(['b'])
  })
})
