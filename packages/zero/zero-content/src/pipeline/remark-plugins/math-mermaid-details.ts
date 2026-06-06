import { visit } from 'unist-util-visit'
import type { Root, BlockContent } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'

// ─── remark plugin: math / mermaid / details directives (PR-M) ────────────
//
// Recognises four `:::` container-directive forms:
//
//   :::math
//   E = mc^2
//   :::
//
//   :::math inline
//   E = mc^2
//   :::
//
//   :::mermaid
//   graph TD
//     A --> B
//   :::
//
//   :::details Click me
//   Hidden body.
//   :::
//
// Each form rewrites the directive node into an mdxJsxFlowElement that
// the emit-jsx walker turns into a JSX element. The actual rendering
// libraries (KaTeX / mermaid) are dynamically imported by the
// components on the client; the pipeline only emits the marker.
//
// PR-M audit M6+M7+M8.

interface DirectiveNode {
  type: 'containerDirective' | 'leafDirective' | 'textDirective'
  name: string
  attributes?: Record<string, string | null | undefined> | null
  children: BlockContent[]
}

/**
 * Extract the inner text body from a directive's children. We
 * concatenate every `text` / `code` node's value with a newline so
 * multi-line content (mermaid diagrams, math expressions) survives.
 *
 * @internal exported for testing
 */
export function extractDirectiveBody(node: DirectiveNode): string {
  const parts: string[] = []
  const walk = (children: unknown[]) => {
    for (const child of children) {
      if (typeof child !== 'object' || child === null) continue
      const ch = child as { type: string; value?: string; children?: unknown[] }
      if (typeof ch.value === 'string') {
        parts.push(ch.value)
      } else if (Array.isArray(ch.children)) {
        walk(ch.children)
      }
    }
  }
  walk(node.children)
  return parts.join('\n').trim()
}

/**
 * Extract the leading label from a container directive (the text in
 * the bracketed `[...]` after the directive name). `:::details[Why?]`
 * → `Why?`. Returns `undefined` when no label.
 *
 * remark-directive surfaces the label as the FIRST child paragraph
 * whose `data?.directiveLabel === true` (set on the paragraph itself
 * in mdast-util-directive). We also walk into the first child if the
 * marker is there instead.
 *
 * @internal exported for testing
 */
export function extractDirectiveLabel(
  node: ContainerDirective | LeafDirective | TextDirective,
): string | undefined {
  const children = node.children as Array<{
    type: string
    data?: { directiveLabel?: boolean }
    children?: Array<{ type: string; value?: string; data?: { directiveLabel?: boolean } }>
  }>
  const first = children[0]
  if (!first || first.type !== 'paragraph') return undefined
  // Either the paragraph OR its first inline child can carry the
  // directiveLabel marker depending on remark-directive version.
  const onParagraph = first.data?.directiveLabel === true
  const onChild = first.children?.[0]?.data?.directiveLabel === true
  if (!onParagraph && !onChild) return undefined
  // Concatenate every text child's value (a label can contain inline
  // formatting; we keep it plain for now).
  const parts: string[] = []
  for (const child of first.children ?? []) {
    if (typeof child.value === 'string') parts.push(child.value)
  }
  return parts.join('').trim() || undefined
}

function makeJsxElement(
  name: string,
  attributes: Array<{ name: string; value: string }>,
): {
  type: 'mdxJsxFlowElement'
  name: string
  attributes: Array<{ type: 'mdxJsxAttribute'; name: string; value: string }>
  children: []
} {
  return {
    type: 'mdxJsxFlowElement',
    name,
    attributes: attributes.map((a) => ({
      type: 'mdxJsxAttribute',
      name: a.name,
      value: a.value,
    })),
    children: [],
  }
}

export interface RemarkMathMermaidDetailsOptions {
  /** The original markdown source — used to preserve verbatim text
   *  inside `:::math` and `:::mermaid` blocks where markdown's
   *  curly-brace / backslash interpretation would otherwise mangle
   *  the LaTeX / mermaid syntax. When omitted, the body is
   *  reconstructed from the parsed children which loses fidelity. */
  source?: string
  /** When set, called with each unknown / malformed directive name so
   *  the Vite plugin can surface a warning. */
  warnings?: string[]
}

/**
 * Extract the raw inner text of a container directive from the
 * original markdown source. Strips the opening `:::name\n` line and
 * the closing `\n:::` so the returned body is verbatim. Falls back
 * to `extractDirectiveBody` if the source isn't supplied OR the
 * position info is missing.
 *
 * @internal exported for testing
 */
export function extractDirectiveSource(
  node: ContainerDirective,
  source: string,
): string | null {
  const pos = node.position
  if (
    pos?.start?.offset === undefined
    || pos.end?.offset === undefined
  ) {
    return null
  }
  const raw = source.slice(pos.start.offset, pos.end.offset)
  // Drop the opening directive line + the closing fence.
  const firstNewline = raw.indexOf('\n')
  if (firstNewline < 0) return ''
  let body = raw.slice(firstNewline + 1)
  if (body.endsWith('\n:::')) body = body.slice(0, -4)
  else if (body.endsWith(':::')) body = body.slice(0, -3)
  return body.trim()
}

export function remarkMathMermaidDetails(
  options: RemarkMathMermaidDetailsOptions = {},
) {
  return function transformer(tree: Root) {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'containerDirective') return
      const directive = node as ContainerDirective
      if (parent == null || index == null) return

      switch (directive.name) {
        case 'math': {
          // Prefer the raw source slice for math + mermaid so curly
          // braces, backslashes, and `^` survive remark-parse's
          // markdown inline transformations.
          const body =
            (options.source
              ? extractDirectiveSource(directive, options.source)
              : null)
            ?? extractDirectiveBody(directive as unknown as DirectiveNode)
          const inline = directive.attributes?.['inline'] !== undefined
            || directive.children.some(
              (c) =>
                (c as { type: string; children?: Array<{ value?: string }> }).type
                  === 'paragraph'
                && (c as { children: Array<{ value?: string }> }).children?.[0]
                  ?.value === 'inline',
            )
          const jsx = makeJsxElement('Math', [
            { name: 'children', value: body },
            ...(inline ? [{ name: 'inline', value: 'true' }] : []),
          ])
          parent.children.splice(index, 1, jsx as unknown as BlockContent)
          return index + 1
        }
        case 'mermaid': {
          const body =
            (options.source
              ? extractDirectiveSource(directive, options.source)
              : null)
            ?? extractDirectiveBody(directive as unknown as DirectiveNode)
          const jsx = makeJsxElement('Mermaid', [
            { name: 'children', value: body },
          ])
          parent.children.splice(index, 1, jsx as unknown as BlockContent)
          return index + 1
        }
        case 'details': {
          const label = extractDirectiveLabel(directive)
          const childrenAfterLabel = directive.children.filter((c, i) => {
            // Drop the synthetic label paragraph from the body so it
            // doesn't render twice.
            if (i !== 0) return true
            const p = c as {
              type: string
              children?: Array<{ data?: { directiveLabel?: boolean } }>
            }
            return !(
              p.type === 'paragraph'
              && p.children?.[0]?.data?.directiveLabel === true
            )
          })
          const jsx = {
            type: 'mdxJsxFlowElement' as const,
            name: 'Details',
            attributes: [
              ...(label !== undefined
                ? [{ type: 'mdxJsxAttribute' as const, name: 'summary', value: label }]
                : []),
            ],
            children: childrenAfterLabel,
          }
          parent.children.splice(index, 1, jsx as unknown as BlockContent)
          return index + 1
        }
        default:
          // Unknown directive name — leave the diagnostics to the
          // callout plugin's "did you mean…?" hints. Pushing a generic
          // warning here would double up on the callout side.
          if (options.warnings) {
            // Intentionally silent for math/mermaid/details only; other
            // directive plugins handle their own diagnostics.
          }
          return
      }
    })
  }
}
