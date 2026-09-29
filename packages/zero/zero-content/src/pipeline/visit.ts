import type { Nodes, Parent } from 'mdast'

// ─── mdast tree walker ──────────────────────────────────────────────────────
//
// First-party replacement for `unist-util-visit` — the remark plugins in
// this package use exactly two of its forms, and the whole dependency
// (visit + visit-parents + unist-util-is + a colour helper) was carried for
// them. The traversal semantics below are the ones those plugins were
// written against, reproduced exactly because they depend on the details:
//
//   - Pre-order, depth-first. The visitor runs on a node BEFORE its
//     children are walked.
//   - A visitor may SPLICE its parent's `children` and return a NUMBER:
//     that is the index in the parent at which the walk resumes. Every
//     plugin here replaces a directive with `[open, ...body, close]` and
//     returns the index past the insertion so the new nodes are not
//     revisited.
//   - After the visitor returns (number or nothing), the walker STILL
//     descends into the node it was called with — reading `children` at
//     that point, not before. A replaced directive's own children are
//     therefore walked with the directive as their parent. The plugins
//     rely on nothing beyond this, but it is the upstream behaviour and a
//     silent change to it would alter which nested directives transform.
//   - `index` is `parent.children.indexOf(node)` — computed at visit time,
//     not the loop offset.
//   - `parent` is `undefined` for the root, and so is `index`.
//
// Only the two call shapes the plugins use are typed: `visit(tree, fn)`
// and `visit(tree, type, fn)` with a node-type string test.

/** What a visitor may return: nothing (continue), or the next index. */
export type VisitResult = number | undefined | void

/** Visitor over every node in the tree. */
export type Visitor<N extends Nodes = Nodes> = (
  node: N,
  index: number | undefined,
  parent: Parent | undefined,
) => VisitResult

/** A node of the given mdast `type`. */
export type NodeOfType<T extends Nodes['type']> = Extract<Nodes, { type: T }>

export function visit(tree: Nodes, visitor: Visitor): void
export function visit<T extends Nodes['type']>(
  tree: Nodes,
  type: T,
  visitor: Visitor<NodeOfType<T>>,
): void
export function visit(
  tree: Nodes,
  typeOrVisitor: string | Visitor,
  maybeVisitor?: Visitor,
): void {
  const type = typeof typeOrVisitor === 'string' ? typeOrVisitor : undefined
  const visitor = (typeof typeOrVisitor === 'function' ? typeOrVisitor : maybeVisitor) as Visitor
  walk(tree, undefined, type, visitor)
}

function walk(
  node: Nodes,
  parent: Parent | undefined,
  type: string | undefined,
  visitor: Visitor,
): number | undefined {
  let next: number | undefined
  if (type === undefined || node.type === type) {
    const index = parent ? parent.children.indexOf(node as Parent['children'][number]) : undefined
    const result = visitor(node, index, parent)
    if (typeof result === 'number') next = result
  }
  // Read `children` AFTER the visitor ran — a visitor may have replaced it.
  if ('children' in node && Array.isArray(node.children)) {
    const asParent = node as Parent
    let offset = 0
    while (offset > -1 && offset < asParent.children.length) {
      const child = asParent.children[offset] as Nodes
      const resume = walk(child, asParent, type, visitor)
      offset = resume === undefined ? offset + 1 : resume
    }
  }
  return next
}
