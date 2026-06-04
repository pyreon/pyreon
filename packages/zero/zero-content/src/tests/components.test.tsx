/**
 * Built-in components — `<Callout>`, `<CodeGroup>`, `<CodeBlock>`.
 *
 * These are normally emitted by the markdown pipeline (callout +
 * codegroup remark plugins + Shiki integration). The pipeline-side
 * emission shape is locked by callout.test.ts / codegroup.test.ts /
 * highlighter.test.ts. This file covers the RUNTIME behavior of the
 * components themselves: rendered DOM structure, default vs override
 * props, ARIA attributes, signal-driven tab switching.
 */
import { describe, expect, it } from 'vitest'
import { mountReactive } from '@pyreon/test-utils'
import { Callout } from '../components/Callout'
import { CodeBlock } from '../components/CodeBlock'
import { CodeGroup } from '../components/CodeGroup'

describe('<Callout>', () => {
  it.each([
    ['tip', 'Tip', '★'],
    ['warning', 'Warning', '⚠'],
    ['note', 'Note', '✎'],
    ['danger', 'Danger', '✖'],
    ['info', 'Info', 'ℹ'],
  ])('renders %s type with default icon + title', (type, defaultTitle, icon) => {
    const { container, cleanup } = mountReactive(
      <Callout type={type as 'tip'}>body</Callout>,
    )
    const aside = container.querySelector('aside')
    expect(aside).not.toBeNull()
    expect(aside!.getAttribute('aria-label')).toBe(defaultTitle)
    expect(aside!.className).toContain('callout')
    expect(aside!.className).toContain(`callout--${type}`)
    expect(container.querySelector('.callout__icon')!.textContent).toBe(icon)
    expect(container.querySelector('.callout__title')!.textContent).toBe(
      defaultTitle,
    )
    expect(container.querySelector('.callout__body')!.textContent).toContain(
      'body',
    )
    cleanup()
  })

  it('overrides the default title when title prop is supplied', () => {
    const { container, cleanup } = mountReactive(
      <Callout type="tip" title="My custom title">
        body
      </Callout>,
    )
    expect(container.querySelector('.callout__title')!.textContent).toBe(
      'My custom title',
    )
    expect(container.querySelector('aside')!.getAttribute('aria-label')).toBe(
      'My custom title',
    )
    cleanup()
  })

  it('renders rich children inside the body', () => {
    const { container, cleanup } = mountReactive(
      <Callout type="warning">
        <strong>important</strong>
      </Callout>,
    )
    expect(container.querySelector('.callout__body strong')!.textContent).toBe(
      'important',
    )
    cleanup()
  })

  it('emits role="note" on the wrapping aside', () => {
    const { container, cleanup } = mountReactive(
      <Callout type="info">body</Callout>,
    )
    expect(container.querySelector('aside')!.getAttribute('role')).toBe('note')
    cleanup()
  })
})

describe('<CodeBlock>', () => {
  it('renders the Shiki HTML inside .code-block__pre via dangerouslySetInnerHTML', () => {
    const html = '<pre class="shiki"><code>const x = 1</code></pre>'
    const { container, cleanup } = mountReactive(
      <CodeBlock lang="ts" dangerouslySetInnerHTML={{ __html: html }} />,
    )
    const wrapper = container.querySelector('.code-block')!
    expect(wrapper).not.toBeNull()
    expect(wrapper.getAttribute('data-lang')).toBe('ts')
    const pre = wrapper.querySelector('.code-block__pre pre.shiki')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('const x = 1')
    cleanup()
  })

  it('renders a filename label when filename is supplied', () => {
    const { container, cleanup } = mountReactive(
      <CodeBlock
        lang="ts"
        filename="signal.ts"
        dangerouslySetInnerHTML={{ __html: '<pre></pre>' }}
      />,
    )
    const filename = container.querySelector('.code-block__filename')
    expect(filename).not.toBeNull()
    expect(filename!.textContent).toBe('signal.ts')
    expect(filename!.getAttribute('aria-hidden')).toBe('true')
    cleanup()
  })

  it('omits the filename label when filename is not supplied', () => {
    const { container, cleanup } = mountReactive(
      <CodeBlock dangerouslySetInnerHTML={{ __html: '<pre></pre>' }} />,
    )
    expect(container.querySelector('.code-block__filename')).toBeNull()
    cleanup()
  })

  it('defaults the data-lang attribute to "text" when lang is not supplied', () => {
    const { container, cleanup } = mountReactive(
      <CodeBlock dangerouslySetInnerHTML={{ __html: '<pre></pre>' }} />,
    )
    expect(container.querySelector('.code-block')!.getAttribute('data-lang')).toBe(
      'text',
    )
    cleanup()
  })
})

describe('<CodeGroup>', () => {
  it('renders one tab button per label', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['npm', 'bun', 'pnpm']}>
        <pre>npm install x</pre>
        <pre>bun add x</pre>
        <pre>pnpm add x</pre>
      </CodeGroup>,
    )
    const tabs = container.querySelectorAll('.code-group__tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]!.textContent).toBe('npm')
    expect(tabs[1]!.textContent).toBe('bun')
    expect(tabs[2]!.textContent).toBe('pnpm')
    cleanup()
  })

  it('marks the first tab active by default + sets aria-selected', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['a', 'b']}>
        <pre>A</pre>
        <pre>B</pre>
      </CodeGroup>,
    )
    const tabs = container.querySelectorAll('.code-group__tab')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[0]!.className).toContain('code-group__tab--active')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
    expect(tabs[1]!.className).not.toContain('code-group__tab--active')
    cleanup()
  })

  it('honors the initial prop to set a different starting tab', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['a', 'b', 'c']} initial={2}>
        <pre>A</pre>
        <pre>B</pre>
        <pre>C</pre>
      </CodeGroup>,
    )
    const tabs = container.querySelectorAll('.code-group__tab')
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[2]!.className).toContain('code-group__tab--active')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('false')
    cleanup()
  })

  it('flips aria-selected + active class on tab click (signal-driven)', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['a', 'b']}>
        <pre>A</pre>
        <pre>B</pre>
      </CodeGroup>,
    )
    const tabs = container.querySelectorAll('.code-group__tab')
    // click the second tab
    ;(tabs[1] as HTMLButtonElement).click()
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.className).toContain('code-group__tab--active')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('false')
    cleanup()
  })

  it('sets tabIndex on the active tab to 0, others to -1 (a11y)', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['a', 'b']}>
        <pre>A</pre>
        <pre>B</pre>
      </CodeGroup>,
    )
    const tabs = container.querySelectorAll('.code-group__tab')
    expect((tabs[0] as HTMLButtonElement).tabIndex).toBe(0)
    expect((tabs[1] as HTMLButtonElement).tabIndex).toBe(-1)
    cleanup()
  })

  it('wraps in a <section> with aria-label and a tablist role', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['a']}>
        <pre>A</pre>
      </CodeGroup>,
    )
    const section = container.querySelector('section.code-group')
    expect(section).not.toBeNull()
    expect(section!.getAttribute('aria-label')).toBe('Code examples')
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
    cleanup()
  })

  it('renders children inside the .code-group__panels container', () => {
    const { container, cleanup } = mountReactive(
      <CodeGroup labels={['x']}>
        <pre data-test="panel-content">x content</pre>
      </CodeGroup>,
    )
    const panels = container.querySelector('.code-group__panels')!
    expect(panels.querySelector('[data-test="panel-content"]')).not.toBeNull()
    cleanup()
  })
})
