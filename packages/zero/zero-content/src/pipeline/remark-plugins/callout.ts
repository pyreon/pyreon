import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'

// ─── pyreon-remark-callout ────────────────────────────────────────────────
//
// Transforms `:::tip` / `:::warning` / `:::note` / `:::danger` /
// `:::info` container directives into `<Callout type="...">` JSX.
//
// Input (remark-directive parses `:::` into a ContainerDirective node):
//
//   :::tip
//   This is the tip body.
//   :::
//
// Output: a `mdxJsxFlowElement` or — for v1 simplicity — an `html` node
// containing the opening + closing `<Callout>` tags around the body.
//
// We rewrite as `html` nodes flanking the body content; the emit-jsx
// layer renders `html` nodes through verbatim (PR 1 wired this).
// PR 3's MDX integration will switch to proper `mdxJsxFlowElement`
// for full type-checked component props.

type CalloutType = 'tip' | 'warning' | 'note' | 'danger' | 'info'

const VALID_TYPES = new Set<CalloutType>(['tip', 'warning', 'note', 'danger', 'info'])

/**
 * Whether a directive name maps to a callout type. Exported for the
 * codegroup plugin which needs to distinguish callout containers from
 * its own.
 *
 * @internal
 */
export function isCalloutType(name: string): name is CalloutType {
  return VALID_TYPES.has(name as CalloutType)
}

export function remarkCallout() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'containerDirective') return
      const directive = node as ContainerDirective
      if (!isCalloutType(directive.name)) return
      if (parent == null || index == null) return

      const type = directive.name
      const title = typeof directive.attributes?.title === 'string'
        ? directive.attributes.title
        : undefined

      const openTag = title
        ? `<Callout type="${type}" title="${escapeAttr(title)}">`
        : `<Callout type="${type}">`

      const openNode = { type: 'html' as const, value: openTag }
      const closeNode = { type: 'html' as const, value: '</Callout>' }

      // Replace the directive with: [openTag, ...children, closeTag].
      // remark-directive's children are already-parsed mdast — they'll
      // walk through the emit pipeline normally.
      parent.children.splice(index, 1, openNode, ...directive.children, closeNode)
      return index + 2 + directive.children.length
    })
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
