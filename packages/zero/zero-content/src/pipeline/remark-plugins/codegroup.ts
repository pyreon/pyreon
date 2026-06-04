import { visit } from 'unist-util-visit'
import type { Code, Root } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'

// ─── pyreon-remark-codegroup ──────────────────────────────────────────────
//
// Transforms `:::code-group` containers wrapping code blocks with
// `[label]` info strings into `<CodeGroup>` JSX with tabbed children.
//
// Input syntax:
//
//   :::code-group
//   ```bash [npm]
//   npm install x
//   ```
//   ```bash [bun]
//   bun add x
//   ```
//   :::
//
// We walk the mdast tree, find container directives named
// `code-group`, extract each Code child's `[label]` from its `meta`
// field, and rewrite as:
//
//   <CodeGroup labels={["npm","bun"]}>
//     <code-block-1 />
//     <code-block-2 />
//   </CodeGroup>
//
// The CodeGroup component (PR 2 built-in) renders the tabs and
// switches active panel.

interface CodeWithLabel {
  code: Code
  label: string
}

export function remarkCodeGroup() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'containerDirective') return
      const directive = node as ContainerDirective
      if (directive.name !== 'code-group') return
      if (parent == null || index == null) return

      // Collect labeled code blocks. Children that aren't `code` with
      // a `[label]` meta are silently dropped (consistent with the
      // existing prototype). The directive's body usually contains
      // only the code fences plus optional empty paragraphs which we
      // skip.
      const labeled: CodeWithLabel[] = []
      for (const child of directive.children) {
        if (child.type !== 'code') continue
        const meta = (child as Code).meta
        const label = parseLabel(meta)
        if (label) labeled.push({ code: child as Code, label })
      }

      if (labeled.length === 0) {
        // Empty / malformed code group → emit nothing rather than a
        // broken `<CodeGroup>`.
        parent.children.splice(index, 1)
        return index
      }

      const labelsJson = JSON.stringify(labeled.map((c) => c.label))
      const openNode = {
        type: 'html' as const,
        value: `<CodeGroup labels={${labelsJson}}>`,
      }
      const closeNode = { type: 'html' as const, value: '</CodeGroup>' }

      // Replace the directive with: [openTag, ...code-blocks, closeTag].
      // The code blocks render normally through the emit pipeline;
      // CodeGroup wraps + tabs them at runtime.
      parent.children.splice(
        index,
        1,
        openNode,
        ...labeled.map((l) => l.code),
        closeNode,
      )
      return index + 2 + labeled.length
    })
  }
}

/**
 * Parse a `[label]` from a markdown code fence's meta string.
 *
 * Examples:
 *   "[npm]"            → "npm"
 *   "[bun] {2}"        → "bun"
 *   "extra [label] x"  → "label"
 *   ""                 → null
 *   undefined          → null
 *
 * @internal exported for testing
 */
export function parseLabel(meta: string | null | undefined): string | null {
  if (!meta) return null
  const m = meta.match(/\[([^\]]+)\]/)
  return m ? m[1]!.trim() : null
}
