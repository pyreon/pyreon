import type { SerializedEntry } from './types'

export function buildMap(
  entries: SerializedEntry[],
): Map<string, SerializedEntry> {
  const map = new Map<string, SerializedEntry>()
  for (const entry of entries) {
    map.set(entry.id, entry)
  }
  return map
}

export function getRoots(entries: SerializedEntry[]): SerializedEntry[] {
  return entries.filter((e) => e.parentId === null)
}

/**
 * Children indexed by `parentId`, derived from the flat entry list.
 *
 * The framework registers components **post-order** (a component is
 * registered after its subtree mounts), so a parent's own `childIds`
 * array is empty at the moment its children register — `childIds` is
 * NOT reliable for tree reconstruction. `parentId`, captured from the
 * mounting stack at mount start, always points at the correct parent.
 * The panel builds the tree from THIS map, not from `entry.childIds`,
 * so it renders correctly regardless of registration order. Insertion
 * order is preserved (the entry list arrives mount-ordered).
 */
export function getChildren(
  entries: SerializedEntry[],
): Map<string, SerializedEntry[]> {
  const children = new Map<string, SerializedEntry[]>()
  for (const entry of entries) {
    if (entry.parentId === null) continue
    const siblings = children.get(entry.parentId)
    if (siblings) {
      siblings.push(entry)
    } else {
      children.set(entry.parentId, [entry])
    }
  }
  return children
}
