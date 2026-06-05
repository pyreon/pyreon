/**
 * migrate-from-vitepress unit tests — locks the Vue→JSX conversion
 * shapes so a regression here would surface immediately instead of
 * 8 PRs later when somebody re-runs the migration. Each test is a
 * minimal pair (input, expected output).
 */
import { describe, expect, it } from 'vitest'
import { convertMarkdown } from './migrate-from-vitepress'

describe('convertMarkdown — frontmatter handling', () => {
  it('preserves existing frontmatter verbatim', () => {
    const src = '---\ntitle: My Page\n---\n\nbody\n'
    const { output } = convertMarkdown(src)
    expect(output).toContain('title: My Page')
    expect(output).toContain('body')
  })

  it('quotes YAML-reserved characters in title values', () => {
    const src = '---\ntitle: @pyreon/sized-map\n---\n\nbody\n'
    const { output } = convertMarkdown(src)
    expect(output).toContain('title: "@pyreon/sized-map"')
  })
})

describe('convertMarkdown — Playground conversion', () => {
  it('Vue :height binding → JSX height={N}', () => {
    const src = `---
title: t
---

<Playground title="X" :height="180">
const a = 1
</Playground>
`
    const { output } = convertMarkdown(src)
    expect(output).toContain('height={180}')
    expect(output).not.toContain(':height=')
    expect(output).toContain('code={`const a = 1`}')
  })

  it('escapes backticks + ${} inside the code body', () => {
    const src = `---
title: t
---

<Playground title="X" :height="100">
const a = \`tpl\`
const b = \${val}
</Playground>
`
    const { output } = convertMarkdown(src)
    expect(output).toContain('code={`const a = \\`tpl\\`')
    expect(output).toContain('const b = \\${val}')
  })

  it('emits a self-closing tag when body is empty', () => {
    const src = `---
title: t
---

<Playground title="X" :height="100">
</Playground>
`
    const { output } = convertMarkdown(src)
    expect(output).toContain('<Playground title="X" height={100} />')
  })
})

describe('convertMarkdown — Vue :propname=\'[...]\' bindings', () => {
  it('converts <PropTable :props=...> to JSX expression form', () => {
    const src = `---
title: t
---

<PropTable :props='[{ name: "x", type: "string", description: "y" }]' />
`
    const { output } = convertMarkdown(src)
    expect(output).toContain(`props={[{ name: "x", type: "string", description: "y" }]}`)
    expect(output).not.toContain(`:props=`)
  })

  it('converts <CompatMatrix :features=... :layers=...>', () => {
    const src = `---
title: t
---

<CompatMatrix :features='["a", "b"]' :layers='[{ name: "x", support: ["full", "none"] }]' />
`
    const { output } = convertMarkdown(src)
    expect(output).toContain(`features={["a", "b"]}`)
    expect(output).toContain(`layers={[{ name: "x", support: ["full", "none"] }]}`)
  })
})

describe('convertMarkdown — APICard signature with embedded JSX', () => {
  it('promotes signature="<RouterLink ...>" to JSX expression with JS-escaped string', () => {
    const src = `---
title: t
---

<APICard name="RouterLink" type="component" signature='<RouterLink to="/path" />' description="Navigation link." />
`
    const { output } = convertMarkdown(src)
    // The embedded JSX in the attribute value gets promoted to an
    // expression so MDX doesn't decode + mis-parse `<RouterLink>`.
    expect(output).toMatch(/signature=\{"<RouterLink to=\\"\/path\\" \/>"\}/)
  })

  it('keeps simple attributes as normal strings', () => {
    const src = `---
title: t
---

<APICard name="createRouter" type="function" signature="createRouter(opts: Options): Router" description="Create a router instance." />
`
    const { output } = convertMarkdown(src)
    // Simple values (no <, >, ") stay as normal string attributes.
    expect(output).toContain(`name="createRouter"`)
    expect(output).toContain(`type="function"`)
    expect(output).toContain(`signature="createRouter(opts: Options): Router"`)
  })
})

describe('convertMarkdown — code fence + admonition handling', () => {
  it('strips VitePress code-fence title="..." attribute', () => {
    const src = '---\ntitle: t\n---\n\n```ts title="vite.config.ts"\nexport default {}\n```\n'
    const { output } = convertMarkdown(src)
    expect(output).toContain('```ts')
    expect(output).not.toContain('title="vite.config.ts"')
  })

  it('converts > [!TIP] admonition to :::tip directive', () => {
    const src = `---
title: t
---

> [!TIP]
> Inline tip body.
> Across two lines.
`
    const { output } = convertMarkdown(src)
    expect(output).toContain(':::tip')
    expect(output).toContain('Inline tip body.')
    expect(output).toContain('Across two lines.')
    expect(output).toContain(':::')
  })

  it('converts HTML comments to JSX comments', () => {
    const src = '---\ntitle: t\n---\n\n<!-- legacy comment -->\n'
    const { output } = convertMarkdown(src)
    expect(output).toContain('{/* legacy comment */}')
    expect(output).not.toContain('<!--')
  })

  it('escapes `<` before digit in prose ("<50 ms")', () => {
    const src = '---\ntitle: t\n---\n\nResolves in <50 ms typical.\n'
    const { output } = convertMarkdown(src)
    expect(output).toContain('&lt;50 ms')
  })

  it('does NOT escape `<` before digit inside fenced code blocks', () => {
    const src = '---\ntitle: t\n---\n\n```ts\nif (x <5) return\n```\n'
    const { output } = convertMarkdown(src)
    expect(output).toContain('if (x <5) return')
  })
})

describe('convertMarkdown — div wrapper stripping', () => {
  it('drops `<div class="...">` wrappers around inline JSX', () => {
    const src = `---
title: t
---

<div class="flex">
  <PackageBadge name="@pyreon/core" />
  <PackageBadge name="@pyreon/router" />
</div>
`
    const { output } = convertMarkdown(src)
    expect(output).not.toContain('<div class=')
    expect(output).toContain('<PackageBadge name="@pyreon/core" />')
    expect(output).toContain('<PackageBadge name="@pyreon/router" />')
  })
})
