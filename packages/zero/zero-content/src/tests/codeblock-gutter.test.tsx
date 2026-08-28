/**
 * `<CodeBlock>`'s line-number gutter renders as real nodes.
 *
 * The gutter used to be built as an HTML STRING and inlined with
 * `dangerouslySetInnerHTML` — a workaround for a compiler bug where a bare
 * array-typed `const` child baked to `textContent` and stringified its VNodes.
 * Universal VNode[] mounting fixed that, so the workaround became a raw
 * `innerHTML` sink in a component that never needed one.
 *
 * `_pr-h-authoring-features.test.tsx` already asserts the gutter renders three
 * spans, and it is what proves the swap kept working. These specs cover what it
 * does not: that the numbers are the RIGHT numbers rather than merely three of
 * something, that the gutter is empty when line numbers are off, and that it
 * stays out of the accessibility tree — a screen reader announcing "one two
 * three" before the code is noise.
 */
import { mountReactive, queryAll } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'
import { CodeBlock } from '../components/CodeBlock'

const HTML = '<pre class="shiki"><code>a\nb\nc</code></pre>'

describe('<CodeBlock> line-number gutter', () => {
  it('renders one node per line when showLineNumbers is set', () => {
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock lang="ts" showLineNumbers lineCount={3} dangerouslySetInnerHTML={{ __html: HTML }} />
    ))
    const numbers = queryAll<HTMLElement>(container, '.code-block__line-number')
    expect(numbers.map((n) => n.textContent)).toEqual(['1', '2', '3'])
    cleanup()
  })

  it('renders no numbers when showLineNumbers is absent', () => {
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock lang="ts" lineCount={3} dangerouslySetInnerHTML={{ __html: HTML }} />
    ))
    expect(queryAll<HTMLElement>(container, '.code-block__line-number')).toHaveLength(0)
    cleanup()
  })

  it('keeps the gutter out of the accessibility tree', () => {
    // Line numbers are decoration; a screen reader announcing "one two three"
    // before the code is noise.
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock lang="ts" showLineNumbers lineCount={3} dangerouslySetInnerHTML={{ __html: HTML }} />
    ))
    const gutter = container.querySelector('[aria-hidden="true"]')
    expect(gutter).not.toBeNull()
    expect(gutter?.querySelectorAll('.code-block__line-number').length).toBe(3)
    cleanup()
  })
})
