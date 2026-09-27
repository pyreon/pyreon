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
  /**
   * The component this folder is NAMED after, when there is one — `Accordion`
   * for the `Accordion/` folder holding `AccordionItem` + friends. Set by
   * {@link mergeOwners}; the sidebar renders the folder row AS that component
   * (click selects it, a caret reveals its parts) instead of showing the same
   * name twice — once as a leaf, once as a folder.
   */
  owner?: WorkbenchComponent
  /**
   * True when `owner` also sits in the PARENT's `items` (and the parent lists
   * this folder in `slots`), false/absent when it was one of this folder's own.
   */
  ownerFromParent?: boolean
  /**
   * Folders rendered IN PLACE of one of this node's items — keyed by the
   * owning component's id. See {@link mergeOwners}.
   */
  slots?: Record<string, HierarchyNode>
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
 * Fold every folder into the component it is named after.
 *
 * A directory-derived catalog routinely produces BOTH a component `Accordion`
 * (in `Components`) AND a folder `Components/Accordion` holding its parts, so
 * the tree listed the name twice — once as a leaf, once as a folder header —
 * and nothing said the two were related. The owner is looked for among the
 * PARENT's items first (the `Accordion` + `Accordion/` sibling shape), then
 * among the folder's own items (`Combobox/Combobox.tsx`). Matched by display
 * name, case-insensitively; a folder with no namesake is untouched.
 *
 * Pure, and every component still appears exactly once:
 *  - a PARENT-item owner stays in the parent's `items` (so it keeps its
 *    curated position in the list) and the folder is recorded as that item's
 *    `slots` entry — the sidebar renders the folder AT that position;
 *  - an OWN-item owner is moved out of the folder's `items` into `owner`.
 *
 * Run it AFTER filtering, so a filtered-out owner leaves a plain folder
 * rather than a row for a non-match.
 */
export function mergeOwners(nodes: readonly HierarchyNode[]): HierarchyNode[] {
  const key = (c: WorkbenchComponent) => (c.title ?? c.name).toLowerCase()
  const visit = (node: HierarchyNode): HierarchyNode => {
    const slots: Record<string, HierarchyNode> = {}
    let hasSlot = false
    const children = node.children.map((child) => {
      const name = child.name.toLowerCase()
      const fromParent = node.items.find((c) => key(c) === name && !(c.id in slots))
      if (fromParent) {
        const merged: HierarchyNode = { ...visit(child), owner: fromParent, ownerFromParent: true }
        slots[fromParent.id] = merged
        hasSlot = true
        return merged
      }
      const own = child.items.find((c) => key(c) === name)
      if (own) {
        return { ...visit({ ...child, items: child.items.filter((c) => c !== own) }), owner: own }
      }
      return visit(child)
    })
    return hasSlot ? { ...node, children, slots } : { ...node, children }
  }
  // Roots have no parent items; a root folder can still own one of its own.
  return nodes.map((root) => {
    const name = root.name.toLowerCase()
    const own = root.items.find((c) => key(c) === name)
    if (!own) return visit(root)
    return { ...visit({ ...root, items: root.items.filter((c) => c !== own) }), owner: own }
  })
}

/** One row-producing entry of a node, in the order the sidebar shows it. */
export type TreeEntry =
  | { kind: 'item'; component: WorkbenchComponent }
  | { kind: 'node'; node: HierarchyNode }

/**
 * A node's contents in display order: its items (parts after their parent),
 * each owner item REPLACED by the folder it owns, then the remaining child
 * folders. The single ordering both the sidebar and ↑↓ browsing walk.
 */
export function nodeEntries(node: HierarchyNode): TreeEntry[] {
  const out: TreeEntry[] = []
  const slotted = new Set<HierarchyNode>()
  for (const c of withParts(node.items)) {
    const slot = node.slots?.[c.id]
    if (slot) {
      slotted.add(slot)
      out.push({ kind: 'node', node: slot })
    } else out.push({ kind: 'item', component: c })
  }
  for (const child of node.children) if (!slotted.has(child)) out.push({ kind: 'node', node: child })
  return out
}

/**
 * The folder paths that must be EXPANDED for component `id`'s row to be on
 * screen — every ancestor folder, but not a folder the component OWNS (its row
 * is that folder's header, visible whenever the folder itself is). Empty when
 * the id is not in the tree.
 */
export function ancestorPaths(nodes: readonly HierarchyNode[], id: string): string[] {
  const walk = (list: readonly HierarchyNode[], trail: string[]): string[] | null => {
    for (const node of list) {
      if (node.owner?.id === id && !node.ownerFromParent) return trail
      if (node.items.some((c) => c.id === id)) return [...trail, node.path]
      const found = walk(node.children, [...trail, node.path])
      if (found) return found
    }
    return null
  }
  return walk(nodes, []) ?? []
}

/**
 * Components UNDER an owned folder, not counting the owner itself — what
 * the part-list toggle shows. Zero means the folder is only the component's
 * own directory, not a list.
 */
export function partCount(node: HierarchyNode): number {
  return node.items.length + node.children.reduce((n, child) => n + countUnder(child), 0)
}

/**
 * Paths of every owned folder that HAS parts — the part lists, collapsed by
 * default. A folder holding nothing but its own component (`PasswordInput/`)
 * is not a list at all; the sidebar renders it as a plain row.
 */
export function ownerPaths(nodes: readonly HierarchyNode[]): string[] {
  return flattenHierarchy(nodes)
    .filter((n) => n.owner && partCount(n) > 0)
    .map((n) => n.path)
}

/**
 * The component ids in the order the sidebar SHOWS them: depth-first over the
 * tree, parts after their parent, and nothing under a collapsed group. This
 * is what arrow-key browsing walks, so the selection can never land on a row
 * that is not on screen.
 */
export function browseOrder(nodes: readonly HierarchyNode[], collapsed: ReadonlySet<string>): string[] {
  const out: string[] = []
  const walk = (node: HierarchyNode) => {
    // An owned folder's header IS a component row, visible even collapsed.
    if (node.owner) out.push(node.owner.id)
    if (collapsed.has(node.path)) return
    for (const entry of nodeEntries(node)) {
      if (entry.kind === 'item') out.push(entry.component.id)
      else walk(entry.node)
    }
  }
  for (const node of nodes) walk(node)
  return out
}

/** Total components under a node, including descendants — the sidebar count. */
export function countUnder(node: HierarchyNode): number {
  // A parent-item owner is counted in the PARENT's items; an own-item owner
  // was moved out of this node's items and is counted here.
  return partCount(node) + (node.owner && !node.ownerFromParent ? 1 : 0)
}
