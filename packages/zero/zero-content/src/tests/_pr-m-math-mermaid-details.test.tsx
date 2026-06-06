// PR-M — math + mermaid + details directives (audit M6+M7+M8)
//
//  - M6 — `:::math` block (and `:::math inline`) for LaTeX. KaTeX is
//         a peer dependency loaded on demand; SSR + no-KaTeX builds
//         render the source as a `<code>` fallback.
//
//  - M7 — `:::mermaid` block for diagrams. mermaid is a peer dep
//         loaded on demand; fallback is a `<pre><code>` block.
//
//  - M8 — `:::details Label` block. Native `<details>` + `<summary>`;
//         no peer deps.

import { describe, expect, it } from 'vitest'
import { mountReactive } from '@pyreon/test-utils'
import { compileMarkdown } from '../pipeline/parse'
import {
  Details,
  Math,
  Mermaid,
} from '../index'
import { BUILT_IN_COMPONENTS } from '../_shared/built-ins'

describe('PR-M — built-in catalogue', () => {
  it('exposes Math, Mermaid, and Details as built-ins', () => {
    for (const name of ['Math', 'Mermaid', 'Details']) {
      expect(BUILT_IN_COMPONENTS).toContain(name)
    }
  })
})

describe('PR-M — M6 — `:::math` directive', () => {
  it('rewrites a math directive into a <Math> JSX element', async () => {
    const md = `:::math
E = mc^2
:::
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('<Math')
    expect(result.code).toContain('E = mc^2')
  })

  it('emits a flat `children` attribute carrying the LaTeX body verbatim', async () => {
    // The TS template literal `\\int` is one backslash on disk; the
    // emitted JSX string literal escapes it back to `\\int`. The
    // `{-x}` survives because the math plugin extracts from the raw
    // source (not the mdast-mangled inline children).
    const md = `:::math
\\int_0^\\infty e^{-x} dx = 1
:::
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('e^{-x} dx = 1')
    expect(result.code).toContain('\\\\int_0^\\\\infty')
  })

  it('<Math> renders a source-text fallback when KaTeX is not present', () => {
    // happy-dom doesn't have KaTeX. The onMount dynamic import rejects
    // → fallback to the `<code>` element.
    const { container, cleanup } = mountReactive(<Math>E = mc^2</Math>)
    const code = container.querySelector('.pyreon-math__source')
    expect(code).not.toBeNull()
    expect(code!.textContent).toBe('E = mc^2')
    cleanup()
  })
})

describe('PR-M — M7 — `:::mermaid` directive', () => {
  it('rewrites a mermaid directive into a <Mermaid> JSX element', async () => {
    const md = `:::mermaid
graph TD
A --> B
:::
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('<Mermaid')
    expect(result.code).toContain('graph TD')
  })

  it('<Mermaid> renders a source-text fallback when mermaid is not present', () => {
    const { container, cleanup } = mountReactive(
      <Mermaid>{`graph TD\nA --> B`}</Mermaid>,
    )
    const pre = container.querySelector('.pyreon-mermaid__source')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('graph TD')
    cleanup()
  })
})

describe('PR-M — M8 — `:::details` directive', () => {
  it('rewrites a details directive with bracketed label into a <Details> JSX element', async () => {
    // remark-directive's label syntax is `[Label]` after the
    // directive name.
    const md = `:::details[Why?]
The reason is X.
:::
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('<Details')
    expect(result.code).toContain('summary="Why?"')
    expect(result.code).toContain('The reason is X.')
  })

  it('omits the summary attribute when no label is provided', async () => {
    const md = `:::details
Body without label.
:::
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('<Details')
    expect(result.code).not.toContain('summary=')
  })

  it('<Details> renders native <details><summary> with the label', () => {
    const { container, cleanup } = mountReactive(
      <Details summary="Why?">The reason is X.</Details>,
    )
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    const summary = container.querySelector('summary')
    expect(summary).not.toBeNull()
    expect(summary!.textContent).toBe('Why?')
    expect(container.textContent).toContain('The reason is X.')
    cleanup()
  })

  it('<Details> respects the `open` prop', () => {
    const { container, cleanup } = mountReactive(
      <Details summary="Hi" open={true}>Visible</Details>,
    )
    const details = container.querySelector('details')
    expect(details!.hasAttribute('open')).toBe(true)
    cleanup()
  })
})
