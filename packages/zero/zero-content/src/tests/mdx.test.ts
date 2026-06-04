/**
 * MDX integration — JSX-in-markdown + ESM hoisting.
 *
 * Locks the contract that:
 *   - `<Component prop="x">body</Component>` in markdown emits as JSX
 *     in the compiled .tsx output.
 *   - Inline `<Tag>` in a paragraph (`mdxJsxTextElement`) emits as JSX.
 *   - Per-`.md` `import X from './path'` statements hoist to the top
 *     of the compiled module verbatim.
 *   - Component names referenced in the body are auto-imported from
 *     the configured `componentsModule` virtual specifier.
 *   - Hoisted imports take precedence — names brought in via the
 *     user's own `import` aren't double-imported.
 *   - Attribute shapes: string literal, expression, boolean, spread.
 *   - `{expression}` blocks emit as JSX expression slots.
 *   - Self-closing components emit correctly.
 *   - Fragments `<>...</>` emit verbatim.
 */
import { describe, expect, it } from 'vitest'
import { compileMarkdown, defaultMdxEnabled } from '../pipeline/parse'

async function out(md: string, opts = {}) {
  return await compileMarkdown(md, '/abs/x.md', {
    highlight: false,
    componentsModule: 'virtual:zero-content/components',
    ...opts,
  })
}

describe('compileMarkdown — MDX JSX elements', () => {
  it('emits a flow JSX element with string attribute', async () => {
    const result = await out('<Callout type="tip">A tip.</Callout>')
    expect(result.code).toContain('<Callout type="tip">A tip.</Callout>')
  })

  it('emits a self-closing JSX element', async () => {
    const result = await out('<HorizontalRule />')
    expect(result.code).toContain('<HorizontalRule />')
  })

  it('emits a JSX element with expression attribute', async () => {
    const result = await out('<Note count={42}>body</Note>')
    expect(result.code).toContain('<Note count={42}>body</Note>')
  })

  it('emits a boolean (valueless) attribute', async () => {
    const result = await out('<Banner sticky>body</Banner>')
    expect(result.code).toContain('<Banner sticky>')
  })

  it('emits a spread attribute', async () => {
    const result = await out('<Custom {...props}>body</Custom>')
    expect(result.code).toContain('<Custom {...props}>')
  })

  it('emits a JSX fragment', async () => {
    const result = await out('<>a fragment</>')
    expect(result.code).toContain('<>a fragment</>')
  })

  it('emits inline (text) JSX inside a paragraph', async () => {
    const result = await out('Hello <Highlight>world</Highlight>!')
    expect(result.code).toContain('<Highlight>world</Highlight>')
  })
})

describe('compileMarkdown — MDX expression blocks', () => {
  it('emits a flow expression block', async () => {
    const result = await out('{1 + 2}')
    expect(result.code).toContain('{1 + 2}')
  })

  it('emits an inline (text) expression block in a paragraph', async () => {
    const result = await out('Hello {name}!')
    expect(result.code).toContain('{name}')
  })
})

describe('compileMarkdown — ESM hoisting', () => {
  it('hoists top-level import statements to the module head', async () => {
    const md = `import Logo from './Logo'

# Title

A page.
`
    const result = await out(md)
    expect(result.hoistedEsm).toEqual([`import Logo from './Logo'`])
    expect(result.code).toContain(`import Logo from './Logo'`)
    // ESM goes above the `export const frontmatter` line
    const esmIdx = result.code.indexOf(`import Logo from './Logo'`)
    const fmIdx = result.code.indexOf('export const frontmatter')
    expect(esmIdx).toBeLessThan(fmIdx)
    expect(esmIdx).toBeGreaterThanOrEqual(0)
  })

  it('hoists multiple import statements in source order', async () => {
    // remark-mdx groups consecutive ESM lines into a single mdxjsEsm
    // node; the joined value contains both imports.
    const md = `import A from './A'
import B from './B'

body
`
    const result = await out(md)
    expect(result.code).toContain(`import A from './A'`)
    expect(result.code).toContain(`import B from './B'`)
    // The order is preserved in the joined source.
    const aIdx = result.code.indexOf(`import A`)
    const bIdx = result.code.indexOf(`import B`)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThan(aIdx)
  })

  it('hoists export statements (e.g. const)', async () => {
    const md = `export const meta = { foo: 'bar' }

body
`
    const result = await out(md)
    expect(result.hoistedEsm.some((esm) => esm.includes('export const meta'))).toBe(
      true,
    )
  })
})

describe('compileMarkdown — auto-import from virtual:zero-content/components', () => {
  it('emits a single import for components referenced in the body', async () => {
    const result = await out('<Callout type="tip">x</Callout>')
    expect(result.componentRefs).toContain('Callout')
    expect(result.code).toContain(
      `import { Callout } from "virtual:zero-content/components"`,
    )
  })

  it('groups multiple referenced components into one import', async () => {
    const result = await out(
      '<Callout type="tip">x</Callout>\n\n<CodeGroup labels={["a"]}>y</CodeGroup>',
    )
    expect(result.componentRefs).toContain('Callout')
    expect(result.componentRefs).toContain('CodeGroup')
    // One import line, two names, sorted alphabetically
    expect(result.code).toContain(
      `import { Callout, CodeGroup } from "virtual:zero-content/components"`,
    )
  })

  it('does NOT re-import a component already brought in via hoisted ESM', async () => {
    const md = `import { Callout } from '~/components/Local'

<Callout type="tip">body</Callout>
`
    const result = await out(md)
    expect(result.code).toContain(
      `import { Callout } from '~/components/Local'`,
    )
    // No auto-import for Callout — the hoisted import takes precedence.
    expect(result.code).not.toContain(
      'from "virtual:zero-content/components"',
    )
  })

  it('emits NO import line when no components are referenced', async () => {
    const result = await out('# Plain text only\n\nA paragraph.')
    expect(result.componentRefs).toEqual([])
    expect(result.code).not.toContain(
      'from "virtual:zero-content/components"',
    )
  })

  it('skips lowercase tag names (HTML elements)', async () => {
    const result = await out('<div class="x">body</div>')
    expect(result.componentRefs).not.toContain('div')
    expect(result.code).not.toContain(
      'from "virtual:zero-content/components"',
    )
  })

  it('honours a custom componentsModule specifier', async () => {
    const result = await out('<Callout type="tip">x</Callout>', {
      componentsModule: 'my-custom/components',
    })
    expect(result.code).toContain(`import { Callout } from "my-custom/components"`)
  })
})

describe('compileMarkdown — mdx: false opt-out', () => {
  it('does NOT parse `<Component>` as JSX when mdx is false', async () => {
    const result = await out('<Callout type="tip">A tip.</Callout>', {
      mdx: false,
    })
    // Without remark-mdx, `<Callout>` is a raw HTML block — emit-jsx
    // passes it through verbatim.
    expect(result.code).toContain('<Callout')
    expect(result.componentRefs).toEqual([])
  })

  it('still parses callout directives even with mdx: false', async () => {
    const result = await out(`:::tip
body
:::`, { mdx: false })
    expect(result.code).toContain('<Callout type="tip">')
  })
})

describe('defaultMdxEnabled', () => {
  it.each([
    ['/abs/x.md', true],
    ['/abs/x.mdx', true],
    ['/abs/random.md', true],
  ])('defaultMdxEnabled(%j) === %j', (input, expected) => {
    expect(defaultMdxEnabled(input)).toBe(expected)
  })
})
