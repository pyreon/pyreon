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

/**
 * Top-level entries: no parent, or a parent that is not in the list (it
 * unmounted, or registered after the snapshot was taken). Without the
 * second rule such a subtree would silently vanish from the panel.
 */
export function getRoots(entries: SerializedEntry[]): SerializedEntry[] {
  const ids = new Set<string>()
  for (const e of entries) ids.add(e.id)
  return entries.filter((e) => e.parentId === null || !ids.has(e.parentId))
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

/** One visible row of the component tree. */
export interface TreeRow {
  entry: SerializedEntry
  depth: number
  childCount: number
  expanded: boolean
  /** The row's own name matches the filter (false when no filter is set). */
  match: boolean
}

export interface TreeIndex {
  map: Map<string, SerializedEntry>
  children: Map<string, SerializedEntry[]>
  roots: SerializedEntry[]
}

export function indexTree(entries: SerializedEntry[]): TreeIndex {
  return { map: buildMap(entries), children: getChildren(entries), roots: getRoots(entries) }
}

/**
 * The rows a tree view shows, depth-first, honouring `expanded`. With a
 * filter, only rows whose name contains it (case-insensitive) and their
 * ancestors are listed, and those ancestors are shown expanded so every
 * match is visible. Iterative, so a 10,000-deep chain cannot overflow the
 * stack.
 */
export function flattenTree(
  index: TreeIndex,
  expanded: ReadonlySet<string>,
  filter = '',
): TreeRow[] {
  const q = filter.trim().toLowerCase()
  let keep: Set<string> | null = null
  if (q) {
    keep = new Set<string>()
    for (const e of index.map.values()) {
      if (!e.name.toLowerCase().includes(q)) continue
      let cur: SerializedEntry | undefined = e
      while (cur && !keep.has(cur.id)) {
        keep.add(cur.id)
        cur = cur.parentId === null ? undefined : index.map.get(cur.parentId)
      }
    }
  }
  const rows: TreeRow[] = []
  const stack: { entry: SerializedEntry; depth: number }[] = []
  for (let i = index.roots.length - 1; i >= 0; i--) {
    stack.push({ entry: index.roots[i] as SerializedEntry, depth: 0 })
  }
  while (stack.length > 0) {
    const { entry, depth } = stack.pop() as { entry: SerializedEntry; depth: number }
    if (keep && !keep.has(entry.id)) continue
    const kids = index.children.get(entry.id) ?? []
    const isOpen = keep ? kids.some((k) => (keep as Set<string>).has(k.id)) : expanded.has(entry.id)
    rows.push({
      entry,
      depth,
      childCount: kids.length,
      expanded: isOpen && kids.length > 0,
      match: q !== '' && entry.name.toLowerCase().includes(q),
    })
    if (isOpen) {
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ entry: kids[i] as SerializedEntry, depth: depth + 1 })
      }
    }
  }
  return rows
}

/** Names from the root down to `id` (inclusive). Stops on a cycle or a missing parent. */
export function ownerPath(id: string, map: Map<string, SerializedEntry>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur = map.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.push(cur.name)
    cur = cur.parentId === null ? undefined : map.get(cur.parentId)
  }
  return out.reverse()
}

/** Ids of `id`'s ancestors, nearest first. */
export function ancestorIds(id: string, map: Map<string, SerializedEntry>): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let parent = map.get(id)?.parentId ?? null
  while (parent !== null && !seen.has(parent)) {
    seen.add(parent)
    out.push(parent)
    parent = map.get(parent)?.parentId ?? null
  }
  return out
}
