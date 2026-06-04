/**
 * mdast → Pyreon JSX emitter — per-node behavior + edge cases.
 *
 * The emitter walks an mdast tree and produces a JSX string. This file
 * locks the per-node output shape so PR 2+ can extend without
 * regressing the foundation. Helpers (slugify, escapeJsxText) tested
 * directly for table-driven coverage.
 */
import { describe, expect, it } from 'vitest'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { Root } from 'mdast'
import { emitJsx, escapeJsxText, slugify } from '../pipeline/emit-jsx'

function compile(md: string): string {
  const tree = unified().use(remarkParse).parse(md) as Root
  return emitJsx(tree).body
}

function compileHeadings(md: string) {
  const tree = unified().use(remarkParse).parse(md) as Root
  return emitJsx(tree).headings
}

describe('emitJsx — heading nodes', () => {
  it('emits <h1>/<h2>/<h3>/<h4>/<h5>/<h6>', () => {
    expect(compile('# A')).toContain('<h1')
    expect(compile('## B')).toContain('<h2')
    expect(compile('### C')).toContain('<h3')
    expect(compile('#### D')).toContain('<h4')
    expect(compile('##### E')).toContain('<h5')
    expect(compile('###### F')).toContain('<h6')
  })

  it('attaches an id attribute derived from heading text', () => {
    expect(compile('## Hello World')).toContain('id={"hello-world"}')
  })

  it('captures level 2-3 headings (not h1 / h4+) for TOC', () => {
    const headings = compileHeadings(`
# top
## section
### subsection
#### deeper
`)
    expect(headings).toHaveLength(2)
    expect(headings[0]).toEqual({ level: 2, text: 'section', slug: 'section' })
    expect(headings[1]).toEqual({ level: 3, text: 'subsection', slug: 'subsection' })
  })

  it('strips inline formatting from captured heading text', () => {
    // text is captured BEFORE inline emphasis tags, so the TOC entry
    // shows plain text instead of `<em>` markers.
    const headings = compileHeadings('## *Reactivity* signals')
    expect(headings[0]!.text).toBe('Reactivity signals')
  })
})

describe('emitJsx — text + inline formatting', () => {
  it('renders plain paragraphs', () => {
    expect(compile('Hello')).toBe('<p>Hello</p>')
  })

  it('emits <strong> for bold', () => {
    expect(compile('**bold**')).toBe('<p><strong>bold</strong></p>')
  })

  it('emits <em> for italic', () => {
    expect(compile('*italic*')).toBe('<p><em>italic</em></p>')
  })

  it('emits inline <code>', () => {
    expect(compile('use `signal()`')).toContain('<code>signal()</code>')
  })

  it('emits <br /> for line breaks', () => {
    // mdast emits a `break` node for `\\` + newline OR two trailing spaces.
    expect(compile('a  \nb')).toContain('<br />')
  })
})

describe('emitJsx — block elements', () => {
  it('emits <hr /> for thematic breaks', () => {
    expect(compile('---')).toBe('<hr />')
  })

  it('emits <blockquote> for blockquotes', () => {
    expect(compile('> quote')).toContain('<blockquote>')
    expect(compile('> quote')).toContain('<p>quote</p>')
  })

  it('emits <ul><li> for bullet lists', () => {
    const out = compile('- a\n- b')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>')
  })

  it('emits <ol> for ordered lists', () => {
    expect(compile('1. a\n2. b')).toContain('<ol>')
  })

  it('emits start attribute for ordered lists not starting at 1', () => {
    expect(compile('3. a\n4. b')).toContain('start={3}')
  })

  it('emits nested lists', () => {
    const out = compile('- a\n  - nested\n- b')
    // outer <ul> contains an inner <ul>
    expect(out.match(/<ul>/g)?.length).toBe(2)
  })
})

describe('emitJsx — code blocks', () => {
  it('emits <pre><code> for fenced code', () => {
    const out = compile('```\nconst x = 1\n```')
    expect(out).toContain('<pre')
    expect(out).toContain('<code>const x = 1')
  })

  it('preserves language tag on data-lang', () => {
    expect(compile('```ts\nconst x = 1\n```')).toContain('data-lang={"ts"}')
  })

  it('defaults language to "text" when none given', () => {
    expect(compile('```\nx\n```')).toContain('data-lang={"text"}')
  })

  it('escapes JSX-sensitive characters inside code blocks', () => {
    // `<` and `{` in code must be escaped to JSX entities so Pyreon's
    // compiler treats them as literal text, not JSX/expressions.
    const out = compile('```\n<div>{x}</div>\n```')
    expect(out).toContain('&lt;div&gt;')
    expect(out).toContain('&#123;x&#125;')
  })
})

describe('emitJsx — links', () => {
  it('emits <a href> for links', () => {
    expect(compile('[label](/x)')).toContain('<a href={"/x"}>label</a>')
  })

  it('preserves the title attribute when present', () => {
    expect(compile('[a](/x "the title")')).toContain('title={"the title"}')
  })

  it('escapes label content', () => {
    expect(compile('[a<b](/x)')).toContain('a&lt;b')
  })
})

describe('emitJsx — images', () => {
  it('emits <img src alt />', () => {
    expect(compile('![Alt](/hero.png)')).toContain('<img src={"/hero.png"} alt={"Alt"} />')
  })

  it('emits empty alt when alt is omitted', () => {
    expect(compile('![](/x.png)')).toContain('alt={""}')
  })

  it('preserves title attribute', () => {
    expect(compile('![alt](/x.png "tt")')).toContain('title={"tt"}')
  })
})

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['UPPERCASE', 'uppercase'],
    ['  trim me  ', 'trim-me'],
    ['multi  spaces', 'multi-spaces'],
    ['punct: stripped!', 'punct-stripped'],
    ['hyphens-already', 'hyphens-already'],
    ['multi--hyphens', 'multi-hyphens'],
    ['a (b) c', 'a-b-c'],
    ['', ''],
  ])('slugify(%j) === %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})

describe('escapeJsxText', () => {
  it.each([
    ['plain text', 'plain text'],
    ['<tag>', '&lt;tag&gt;'],
    ['{expr}', '&#123;expr&#125;'],
    ['mix < and {', 'mix &lt; and &#123;'],
    ['&amp; already encoded', '&amp;amp; already encoded'],
    ['', ''],
  ])('escapeJsxText(%j) === %j', (input, expected) => {
    expect(escapeJsxText(input)).toBe(expected)
  })
})
