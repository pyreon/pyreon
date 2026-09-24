/**
 * Extracting a directive's body and label from the mdast.
 *
 * These feed `:::math`, `:::mermaid` and `:::details` — the three
 * directives whose content is NOT markdown. A formula, a diagram
 * definition and a collapsed block each carry source that must reach the
 * renderer byte-for-byte, and every failure here is silent: a dropped
 * line renders a *different* equation, a swallowed indent renders a
 * *different* diagram. Nothing throws and nothing looks obviously wrong
 * on the page, which is why they need tests rather than eyes.
 *
 * `extractDirectiveSource` is the one that matters most. remark parses
 * the directive body as markdown, so a mermaid graph comes back as
 * paragraphs with the indentation gone — which mermaid then rejects or,
 * worse, renders as a different graph. Slicing the ORIGINAL source by
 * the node's offsets is what preserves it, and the fence-stripping has
 * to handle both `\n:::` and a bare trailing `:::`.
 *
 * `extractDirectiveLabel` reads a marker that moved between
 * remark-directive versions — it sits on the paragraph in one and on its
 * first inline child in another. Handling only one means `:::details[Why?]`
 * silently loses its summary and every collapsed block on the site reads
 * "Details".
 */
import { describe, expect, it } from 'vitest'
import {
  extractDirectiveBody,
  extractDirectiveLabel,
  extractDirectiveSource,
} from '../pipeline/remark-plugins/math-mermaid-details'

const text = (value: string) => ({ type: 'text', value })
const para = (...children: unknown[]) => ({ type: 'paragraph', children })

describe('extractDirectiveBody gathers every text value, at any depth', () => {
  it('joins top-level values with newlines', () => {
    // The control.
    expect(extractDirectiveBody({ children: [text('a'), text('b')] } as never)).toBe('a\nb')
  })

  it('descends into nested children', () => {
    // remark wraps directive content in paragraphs, so the values are
    // never at the top level in practice.
    expect(extractDirectiveBody({
      children: [para(text('x = 1')), para(text('y = 2'))],
    } as never)).toBe('x = 1\ny = 2')
  })

  it('skips non-object children instead of stringifying them', () => {
    // `String(null)` in a formula renders "null" into the equation.
    expect(extractDirectiveBody({
      children: [null, undefined, 'raw', 42, text('kept')],
    } as never)).toBe('kept')
  })

  it('prefers a node VALUE over descending into it', () => {
    // A node with both is a literal; walking its children would emit the
    // content twice.
    expect(extractDirectiveBody({
      children: [{ type: 'code', value: 'V', children: [text('ignored')] }],
    } as never)).toBe('V')
  })

  it('returns empty for a directive with no children', () => {
    expect(extractDirectiveBody({ children: [] } as never)).toBe('')
  })

  it('trims the joined result', () => {
    expect(extractDirectiveBody({ children: [text('  a  ')] } as never)).toBe('a')
  })
})

describe('extractDirectiveLabel reads the marker wherever the parser put it', () => {
  it('reads it from the PARAGRAPH', () => {
    expect(extractDirectiveLabel({
      children: [{ ...para(text('Why?')), data: { directiveLabel: true } }],
    } as never)).toBe('Why?')
  })

  it('reads it from the first INLINE CHILD', () => {
    // The other remark-directive version. Handling only the paragraph
    // form makes every `:::details[…]` on the site lose its summary.
    expect(extractDirectiveLabel({
      children: [para({ type: 'text', value: 'Why?', data: { directiveLabel: true } })],
    } as never)).toBe('Why?')
  })

  it('concatenates several text children', () => {
    expect(extractDirectiveLabel({
      children: [{
        ...para(text('Why '), { type: 'emphasis', children: [] }, text('not?')),
        data: { directiveLabel: true },
      }],
    } as never)).toBe('Why not?')
  })

  it('returns undefined when the marker is ABSENT', () => {
    // A directive with no label. Treating the first paragraph as one
    // would eat the directive's opening line of content.
    expect(extractDirectiveLabel({ children: [para(text('body text'))] } as never)).toBeUndefined()
  })

  for (const [label, node] of [
    ['no children', { children: [] }],
    ['first child is not a paragraph', { children: [{ type: 'code', value: 'x' }] }],
    ['marker present but no text', {
      children: [{ type: 'paragraph', children: [], data: { directiveLabel: true } }],
    }],
    ['marker present, whitespace only', {
      children: [{ ...para(text('   ')), data: { directiveLabel: true } }],
    }],
  ] as Array<[string, unknown]>) {
    it(`returns undefined when ${label}`, () => {
      // An empty-string label renders a blank `<summary>`, which is a
      // collapsed block nobody can see the handle for.
      expect(extractDirectiveLabel(node as never), label).toBeUndefined()
    })
  }
})

describe('extractDirectiveSource slices the ORIGINAL text, preserving layout', () => {
  const at = (start: number, end: number) =>
    ({ position: { start: { offset: start }, end: { offset: end } } }) as never

  it('returns the body between the opening line and the fence', () => {
    // The control, and the reason this function exists: remark would
    // have re-parsed this as markdown and dropped the indentation.
    const src = ':::mermaid\ngraph TD\n  A --> B\n:::'
    expect(extractDirectiveSource(at(0, src.length), src)).toBe('graph TD\n  A --> B')
  })

  it('PRESERVES indentation and blank lines a markdown re-parse would eat', () => {
    // A mermaid graph or a LaTeX align block is whitespace-significant.
    const src = ':::math\n\\begin{align}\n  a &= b \\\\\n\n  c &= d\n\\end{align}\n:::'
    const out = extractDirectiveSource(at(0, src.length), src)!
    expect(out).toContain('  a &= b')
    expect(out).toContain('\n\n')
  })

  it('strips a fence with no preceding newline', () => {
    // `body:::` — what a file with no trailing newline produces.
    const src = ':::details\nbody:::'
    expect(extractDirectiveSource(at(0, src.length), src)).toBe('body')
  })

  it('returns EMPTY for a single-line directive', () => {
    // No newline means no body at all; slicing from -1 would return the
    // whole directive including its own opening marker.
    expect(extractDirectiveSource(at(0, 10), ':::mermaid')).toBe('')
  })

  it('returns null when the node carries no offsets', () => {
    // An mdast node built by another plugin rather than by the parser.
    // Null is the caller's signal to fall back to the mdast walk.
    const src = ':::x\nbody\n:::'
    expect(extractDirectiveSource({ position: undefined } as never, src)).toBeNull()
    expect(extractDirectiveSource({ position: { start: {}, end: {} } } as never, src)).toBeNull()
    expect(extractDirectiveSource(
      { position: { start: { offset: 0 }, end: {} } } as never, src,
    )).toBeNull()
  })

  it('slices the right region when the directive is not at offset 0', () => {
    // The real case — a directive partway down a page. An off-by-one
    // here silently shifts every subsequent formula.
    const prefix = '# Heading\n\nsome text\n\n'
    const directive = ':::math\nE = mc^2\n:::'
    const src = prefix + directive + '\n\nafter'
    expect(extractDirectiveSource(at(prefix.length, prefix.length + directive.length), src))
      .toBe('E = mc^2')
  })
})
