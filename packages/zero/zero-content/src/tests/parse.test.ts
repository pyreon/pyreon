/**
 * End-to-end pipeline test: markdown source string → compiled `.tsx`
 * module string. Asserts the module exports the right shape and the
 * body JSX is wrapped correctly.
 */
import { describe, expect, it } from 'vitest'
import { compileMarkdown, deriveSlug } from '../pipeline/parse'

describe('compileMarkdown — module shape', () => {
  it('emits frontmatter / headings / slug / default exports', () => {
    const md = `---
title: Hello
description: A page
---

# Top

## Section

content paragraph
`
    const result = compileMarkdown(md, '/abs/src/content/docs/hello.md')
    expect(result.code).toContain('export const frontmatter =')
    expect(result.code).toContain('"title": "Hello"')
    expect(result.code).toContain('"description": "A page"')
    expect(result.code).toContain('export const headings =')
    expect(result.code).toContain('"slug": "section"')
    expect(result.code).toContain('export const slug = "docs/hello"')
    expect(result.code).toContain('export default function ContentPage()')
  })

  it('wraps body JSX in <article class="content">', () => {
    const result = compileMarkdown('# Title', '/abs/random.md')
    expect(result.code).toContain('<article class="content">')
    expect(result.code).toContain('<h1')
  })

  it('returns the parsed frontmatter as a plain object', () => {
    const md = `---
title: Hi
since: 0.20.0
draft: true
---

body`
    const result = compileMarkdown(md, '/abs/x.md')
    expect(result.frontmatter.title).toBe('Hi')
    expect(result.frontmatter.since).toBe('0.20.0')
    expect(result.frontmatter.draft).toBe(true)
  })

  it('returns an empty frontmatter when none present', () => {
    const result = compileMarkdown('# Just title', '/abs/x.md')
    expect(result.frontmatter).toEqual({})
  })

  it('captures headings level 2-3 only', () => {
    const md = `# h1
## h2
### h3
#### h4
`
    const result = compileMarkdown(md, '/abs/x.md')
    expect(result.headings).toHaveLength(2)
    expect(result.headings[0]!.level).toBe(2)
    expect(result.headings[1]!.level).toBe(3)
  })

  it('does not crash on empty input', () => {
    const result = compileMarkdown('', '/abs/empty.md')
    expect(result.code).toContain('<article class="content">')
    expect(result.headings).toEqual([])
  })
})

describe('deriveSlug', () => {
  it.each([
    ['/abs/project/src/content/docs/zero.md', 'docs/zero'],
    ['/abs/project/src/content/docs/index.md', 'docs'],
    ['/abs/project/src/content/index.md', ''],
    ['/abs/project/random.md', 'random'],
    ['/abs/project/src/CONTENT/docs/up.mdx', 'docs/up'],
  ])('deriveSlug(%j) === %j', (input, expected) => {
    // Note: trailing /index strips to ''; that's intentional — the
    // route-emit layer (PR 4) will route `'' → /<collection>/`.
    expect(deriveSlug(input)).toBe(expected)
  })

  it('handles windows-style paths', () => {
    expect(deriveSlug('C:\\proj\\src\\content\\docs\\zero.md')).toBe('docs/zero')
  })
})
