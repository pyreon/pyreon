/**
 * Nested component hierarchy.
 *
 * `groupComponents` produces ONE flat level: every component sits under a
 * single group name, in first-seen order. That is fine for a demo catalog and
 * unusable past ~30 components, which is roughly where any real design system
 * starts. A user scanning 200 flat entries is reading a list, not navigating.
 *
 * A group path is `/`-separated (`Forms/Inputs`), which the derived catalog
 * already produces naturally from directory structure. Pure, so ordering and
 * the awkward cases — a component at the root, a path with an empty segment —
 * are testable without a DOM.
 */
import type { WorkbenchComponent } from './catalog'

export interface HierarchyNode {
  /** Path segment, e.g. `Inputs`. */
  name: string
  /** Full path, e.g. `Forms/Inputs` — stable, so it can key expansion state. */
  path: string
  /** Depth from the root, 0-based. */
  depth: number
  children: HierarchyNode[]
  items: WorkbenchComponent[]
}

/** Split a group path, dropping empty segments (`Forms//Inputs`, a trailing `/`). */
export function splitPath(group: string): string[] {
  return group.split('/').map((s) => s.trim()).filter(Boolean)
}

/**
 * Build the tree.
 *
 * Ordering is FIRST-SEEN, matching the flat implementation this replaces, and
 * deliberately not alphabetical: catalog order is a curatorial choice — a
 * design system usually wants Foundations before Feedback — and sorting would
 * silently discard it. Sorting can be offered later as an option; imposing it
 * here would be a behaviour change disguised as a feature.
 */
export function buildHierarchy(components: readonly WorkbenchComponent[]): HierarchyNode[] {
  const roots: HierarchyNode[] = []
  const byPath = new Map<string, HierarchyNode>()

  for (const component of components) {
    const segments = splitPath(component.group)
    // A component with no usable group is not dropped — it goes under a
    // top-level bucket, because losing a component from the sidebar is a worse
    // failure than an untidy group name.
    const parts = segments.length > 0 ? segments : ['Components']

    let parentList = roots
    let path = ''
    parts.forEach((name, depth) => {
      path = path ? `${path}/${name}` : name
      let node = byPath.get(path)
      if (!node) {
        node = { name, path, depth, children: [], items: [] }
        byPath.set(path, node)
        parentList.push(node)
      }
      parentList = node.children
      if (depth === parts.length - 1) node.items.push(component)
    })
  }
  return roots
}

/** Every node, depth-first — the order a sidebar renders them in. */
export function flattenHierarchy(nodes: readonly HierarchyNode[]): HierarchyNode[] {
  const out: HierarchyNode[] = []
  const walk = (list: readonly HierarchyNode[]) => {
    for (const node of list) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/**
 * Filter the tree to components matching a set of ids, dropping branches that
 * end up empty.
 *
 * Search must not leave behind a group header with nothing under it — a header
 * for a hidden match reads as a broken filter.
 */
export function filterHierarchy(
  nodes: readonly HierarchyNode[],
  visibleIds: ReadonlySet<string>,
): HierarchyNode[] {
  const out: HierarchyNode[] = []
  for (const node of nodes) {
    const items = node.items.filter((i) => visibleIds.has(i.id))
    const children = filterHierarchy(node.children, visibleIds)
    if (items.length === 0 && children.length === 0) continue
    out.push({ ...node, items, children })
  }
  return out
}

/**
 * Order a node's items so every PART follows its parent — a tab panel under
 * its tabs, an accordion item under its accordion — in the parent's slot,
 * with parts of a parent that is not in this list left where they were.
 * Pure; the sidebar indents by the same relation.
 */
export function withParts(items: readonly WorkbenchComponent[]): WorkbenchComponent[] {
  const byParent = new Map<string, WorkbenchComponent[]>()
  const ids = new Set(items.map((c) => c.id))
  for (const c of items) {
    if (c.partOf && ids.has(c.partOf) && c.partOf !== c.id) {
      const list = byParent.get(c.partOf) ?? []
      list.push(c)
      byParent.set(c.partOf, list)
    }
  }
  const out: WorkbenchComponent[] = []
  for (const c of items) {
    if (c.partOf && ids.has(c.partOf) && c.partOf !== c.id) continue
    out.push(c, ...(byParent.get(c.id) ?? []))
  }
  return out
}

/**
 * The component ids in the order the sidebar SHOWS them: depth-first over the
 * tree, parts after their parent, and nothing under a collapsed group. This
 * is what arrow-key browsing walks, so the selection can never land on a row
 * that is not on screen.
 */
export function browseOrder(nodes: readonly HierarchyNode[], collapsed: ReadonlySet<string>): string[] {
  const out: string[] = []
  const walk = (list: readonly HierarchyNode[]) => {
    for (const node of list) {
      if (collapsed.has(node.path)) continue
      for (const c of withParts(node.items)) out.push(c.id)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/** Total components under a node, including descendants — the sidebar count. */
export function countUnder(node: HierarchyNode): number {
  return node.items.length + node.children.reduce((n, child) => n + countUnder(child), 0)
}
