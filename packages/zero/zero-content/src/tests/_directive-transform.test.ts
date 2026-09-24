/**
 * The `:::math` / `:::mermaid` / `:::details` transform, end to end
 * through a real remark pipeline.
 *
 * The extractors have their own specs; this covers what the transformer
 * does with them, which is where the two authoring-visible contracts
 * live.
 *
 * **Raw source wins over the parsed body.** remark parses a directive's
 * content as markdown, so `\\frac{a}{b}` loses its backslashes, `x^2`
 * becomes superscript markup, and a mermaid graph loses its indentation.
 * Preferring the ORIGINAL slice is what makes math and diagrams work at
 * all — and the fallback to the parsed body has to stay, because a node
 * synthesised by another plugin carries no offsets. Both directions are
 * silent when wrong: a different formula renders, not an error.
 *
 * **The label is not also content.** `:::details[Why?]` puts the label
 * in a synthetic first paragraph. Leaving it in the children renders
 * "Why?" twice — once as the summary and once as the first line of the
 * body — which reads as an authoring mistake rather than a pipeline one.
 */
import { describe, expect, it } from 'vitest'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { remarkMathMermaidDetails } from '../pipeline/remark-plugins/math-mermaid-details'
import type { Root } from 'mdast'

interface JsxNode {
  type: string
  name?: string
  attributes?: Array<{ name: string; value: string }>
  children?: unknown[]
}

/** Parse markdown and run the REAL transformer over it. */
function transform(source: string, opts: { source?: string } = {}): JsxNode[] {
  const tree = unified().use(remarkParse).use(remarkDirective).parse(source) as Root
  remarkMathMermaidDetails(opts as never)(tree)
  return tree.children as unknown as JsxNode[]
}

const attr = (n: JsxNode, name: string) =>
  n.attributes?.find((a) => a.name === name)?.value

describe('a math directive becomes a <Math> element', () => {
  it('replaces the directive in place', () => {
    // The control.
    const out = transform(':::math\nE = mc^2\n:::')
    expect(out[0]!.type).toBe('mdxJsxFlowElement')
    expect(out[0]!.name).toBe('Math')
    expect(attr(out[0]!, 'children')).toContain('E = mc')
  })

  it('prefers the RAW SOURCE when it is available', () => {
    // The whole reason `source` is threaded through. remark would have
    // eaten the backslashes and turned `_i` into emphasis — a different
    // formula, rendered without complaint.
    const src = ':::math\n\\frac{a}{b} + x_i^2\n:::'
    const out = transform(src, { source: src })
    expect(attr(out[0]!, 'children')).toBe('\\frac{a}{b} + x_i^2')
  })

  it('falls back to the PARSED body when no source is given', () => {
    // A node synthesised by another plugin carries no offsets, so the
    // fallback is what keeps it rendering at all.
    const out = transform(':::math\nE = mc\n:::')
    expect(attr(out[0]!, 'children')).toContain('E = mc')
  })

  it('marks the inline form from an attribute', () => {
    const out = transform(':::math{inline}\nx\n:::')
    expect(attr(out[0]!, 'inline')).toBe('true')
  })

  it('omits the inline attribute for the display form', () => {
    // An `inline="false"` string is truthy in JSX; omitting is the only
    // correct way to say "not inline".
    const out = transform(':::math\nx\n:::')
    expect(attr(out[0]!, 'inline')).toBeUndefined()
  })

  it('preserves indentation and blank lines through the raw path', () => {
    const src = ':::math\n\\begin{align}\n  a &= b\n\n  c &= d\n\\end{align}\n:::'
    const body = attr(transform(src, { source: src })[0]!, 'children')!
    expect(body).toContain('  a &= b')
    expect(body).toContain('\n\n')
  })
})

describe('a mermaid directive becomes a <Mermaid> element', () => {
  it('preserves the graph definition verbatim', () => {
    // mermaid is whitespace-significant; a re-parsed body renders a
    // different graph or none at all.
    const src = ':::mermaid\ngraph TD\n  A[Start] --> B{Choice}\n  B --> C\n:::'
    const body = attr(transform(src, { source: src })[0]!, 'children')!
    expect(body).toContain('  A[Start] --> B{Choice}')
    expect(transform(src, { source: src })[0]!.name).toBe('Mermaid')
  })

  it('carries no inline attribute — a diagram is never inline', () => {
    const src = ':::mermaid\ngraph TD\n:::'
    expect(attr(transform(src, { source: src })[0]!, 'inline')).toBeUndefined()
  })
})

describe('a details directive becomes <Details> with its label as summary', () => {
  it('lifts the bracketed label out of the body', () => {
    // Left in place it renders twice — once as the summary and once as
    // the first line of the disclosure.
    const out = transform(':::details[Why is this?]\nBecause.\n:::')
    expect(out[0]!.name).toBe('Details')
    expect(attr(out[0]!, 'summary')).toBe('Why is this?')
    expect(JSON.stringify(out[0]!.children)).not.toContain('Why is this?')
    expect(JSON.stringify(out[0]!.children)).toContain('Because.')
  })

  it('omits summary entirely when there is no label', () => {
    // `summary=""` renders a collapsed block with an invisible handle.
    const out = transform(':::details\nBody only.\n:::')
    expect(attr(out[0]!, 'summary')).toBeUndefined()
    expect(JSON.stringify(out[0]!.children)).toContain('Body only.')
  })

  it('keeps the body as real mdast, not a flattened string', () => {
    // A details block holds markdown — lists, code, links. Flattening it
    // would render the source instead.
    const out = transform(':::details[More]\n- one\n- two\n:::')
    expect(JSON.stringify(out[0]!.children)).toContain('listItem')
  })

  it('keeps a first paragraph that is NOT the label', () => {
    // Dropping index 0 unconditionally would eat the first line of every
    // unlabelled details block.
    const out = transform(':::details\nFirst line.\n\nSecond line.\n:::')
    const json = JSON.stringify(out[0]!.children)
    expect(json).toContain('First line.')
    expect(json).toContain('Second line.')
  })
})

describe('other directives are left alone', () => {
  it('does not touch a callout — its own plugin owns it', () => {
    // Two plugins rewriting one node is how a directive ends up
    // double-wrapped, or warned about twice.
    const out = transform(':::warning\nbe careful\n:::')
    expect(out[0]!.type).toBe('containerDirective')
  })

  it('does not touch an unknown directive name', () => {
    // The callout plugin emits the "did you mean…?" hint; a second
    // warning here would double up.
    const out = transform(':::nonsense\nbody\n:::')
    expect(out[0]!.type).toBe('containerDirective')
  })

  it('leaves ordinary markdown untouched', () => {
    const out = transform('# Heading\n\nA paragraph.\n')
    expect(out.map((n) => n.type)).toEqual(['heading', 'paragraph'])
  })

  it('handles several directives in one document', () => {
    // The visitor splices as it goes; a stale index would skip or
    // double-process the ones that follow.
    const src = ':::math\na\n:::\n\ntext\n\n:::mermaid\ngraph TD\n:::\n\n:::details[L]\nb\n:::'
    const names = transform(src, { source: src })
      .filter((n) => n.type === 'mdxJsxFlowElement')
      .map((n) => n.name)
    expect(names).toEqual(['Math', 'Mermaid', 'Details'])
  })
})
