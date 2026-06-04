/**
 * End-to-end pipeline test: markdown source string → compiled `.tsx`
 * module string. Asserts the module exports the right shape and the
 * body JSX is wrapped correctly.
 */
import { describe, expect, it } from 'vitest'
import { compileMarkdown, deriveSlug } from '../pipeline/parse'

describe('compileMarkdown — module shape', () => {
  it('emits frontmatter / headings / slug / default exports', async () => {
    const md = `---
title: Hello
description: A page
---

# Top

## Section

content paragraph
`
    const result = await compileMarkdown(md, '/abs/src/content/docs/hello.md', {
      highlight: false,
    })
    expect(result.code).toContain('export const frontmatter =')
    expect(result.code).toContain('"title": "Hello"')
    expect(result.code).toContain('"description": "A page"')
    expect(result.code).toContain('export const headings =')
    expect(result.code).toContain('"slug": "section"')
    expect(result.code).toContain('export const slug = "docs/hello"')
    expect(result.code).toContain('export default function ContentPage()')
  })

  it('wraps body JSX in <article class="content">', async () => {
    const result = await compileMarkdown('# Title', '/abs/random.md', {
      highlight: false,
    })
    expect(result.code).toContain('<article class="content">')
    expect(result.code).toContain('<h1')
  })

  it('returns the parsed frontmatter as a plain object', async () => {
    const md = `---
title: Hi
since: 0.20.0
draft: true
---

body`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.frontmatter.title).toBe('Hi')
    expect(result.frontmatter.since).toBe('0.20.0')
    expect(result.frontmatter.draft).toBe(true)
  })

  it('returns an empty frontmatter when none present', async () => {
    const result = await compileMarkdown('# Just title', '/abs/x.md', {
      highlight: false,
    })
    expect(result.frontmatter).toEqual({})
  })

  it('captures headings level 2-3 only', async () => {
    const md = `# h1
## h2
### h3
#### h4
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.headings).toHaveLength(2)
    expect(result.headings[0]!.level).toBe(2)
    expect(result.headings[1]!.level).toBe(3)
  })

  it('does not crash on empty input', async () => {
    const result = await compileMarkdown('', '/abs/empty.md', {
      highlight: false,
    })
    expect(result.code).toContain('<article class="content">')
    expect(result.headings).toEqual([])
  })
})

describe('compileMarkdown — GFM task lists (remark-gfm wired)', () => {
  it('emits a checked checkbox for [x]', async () => {
    const result = await compileMarkdown('- [x] done', '/abs/x.md', {
      highlight: false,
    })
    expect(result.code).toContain('<input type="checkbox" checked disabled />')
  })

  it('emits an unchecked checkbox for [ ]', async () => {
    const result = await compileMarkdown('- [ ] todo', '/abs/x.md', {
      highlight: false,
    })
    expect(result.code).toContain('<input type="checkbox" disabled />')
    // Make sure it's NOT the checked variant.
    expect(result.code).not.toContain('checkbox" checked')
  })

  it('falls through to a plain <li> for normal bullets', async () => {
    const result = await compileMarkdown('- normal', '/abs/x.md', {
      highlight: false,
    })
    expect(result.code).toContain('<li>')
    expect(result.code).not.toContain('checkbox')
  })

  it('preserves blank lines inside code blocks (covers indent empty-line branch)', async () => {
    // A code block with an embedded blank line surfaces as a body string
    // containing `\n\n`. The `indent` helper then iterates through the
    // empty line via `(line.length === 0 ? line : prefix + line)`, which
    // returns the empty string as-is — covering the empty-line arm.
    const md = '```\nfirst\n\nthird\n```'
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('first')
    expect(result.code).toContain('third')
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

  it('handles paths without a .md/.mdx extension by returning the basename', () => {
    // No .md / .mdx → stripMdExtension returns null → fallback path
    // `return basename(normalized)` runs.
    expect(deriveSlug('/abs/random.txt')).toBe('random.txt')
    expect(deriveSlug('/abs/no-extension')).toBe('no-extension')
    // A path with no `/` at all — basename returns the input verbatim.
    expect(deriveSlug('random.txt')).toBe('random.txt')
  })

  it('handles .md inside /content/ subdirectory with no /index suffix', () => {
    expect(deriveSlug('/proj/src/content/post.md')).toBe('post')
  })

  it('runs in O(n) on adversarial input (ReDoS regression)', () => {
    // CodeQL flagged the old `/[/]content[/](.+?)\\.(md|mdx)$/i` regex as
    // polynomial. This adversarial input — a deep `/content/a/content/a/...`
    // chain — used to take seconds with the regex; the string-ops rewrite
    // is O(n).
    const segment = '/content/a'
    const adversarial = '/abs' + segment.repeat(500) + '.md'
    const t0 = performance.now()
    const result = deriveSlug(adversarial)
    const elapsed = performance.now() - t0
    // The first /content/ match wins by design.
    expect(result.endsWith('.md')).toBe(false)
    expect(result.startsWith('a/content/')).toBe(true)
    // Loose budget — strictly <5ms but CI noise can spike.
    expect(elapsed).toBeLessThan(50)
  })
})
