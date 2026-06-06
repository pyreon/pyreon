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
import {
  emitJsx,
  escapeJsxText,
  jsStringLiteral,
  slugify,
} from '../pipeline/emit-jsx'

async function compile(md: string): Promise<string> {
  const tree = unified().use(remarkParse).parse(md) as Root
  return (await emitJsx(tree)).body
}

async function compileHeadings(md: string) {
  const tree = unified().use(remarkParse).parse(md) as Root
  return (await emitJsx(tree)).headings
}

describe('emitJsx — heading nodes', () => {
  it('emits <h1>/<h2>/<h3>/<h4>/<h5>/<h6>', async () => {
    expect(await compile('# A')).toContain('<h1')
    expect(await compile('## B')).toContain('<h2')
    expect(await compile('### C')).toContain('<h3')
    expect(await compile('#### D')).toContain('<h4')
    expect(await compile('##### E')).toContain('<h5')
    expect(await compile('###### F')).toContain('<h6')
  })

  it('attaches an id attribute derived from heading text', async () => {
    expect(await compile('## Hello World')).toContain('id={"hello-world"}')
  })

  it('captures level 2-6 headings (drops only h1) for TOC', async () => {
    // PR-J audit H3 — pre-fix the emitter hard-capped at h3, silently
    // dropping h4/h5/h6 from the TOC. Levels 2..6 are now captured;
    // h1 (the page title) is intentionally skipped.
    const headings = await compileHeadings(`
# top
## section
### subsection
#### deeper
##### fifth
###### sixth
`)
    expect(headings).toHaveLength(5)
    expect(headings[0]!.level).toBe(2)
    expect(headings[4]!.level).toBe(6)
  })

  it('strips inline formatting from captured heading text', async () => {
    // text is captured BEFORE inline emphasis tags, so the TOC entry
    // shows plain text instead of `<em>` markers.
    const headings = await compileHeadings('## *Reactivity* signals')
    expect(headings[0]!.text).toBe('Reactivity signals')
  })
})

describe('emitJsx — text + inline formatting', () => {
  it('renders plain paragraphs', async () => {
    expect(await compile('Hello')).toBe('<p>Hello</p>')
  })

  it('emits <strong> for bold', async () => {
    expect(await compile('**bold**')).toBe('<p><strong>bold</strong></p>')
  })

  it('emits <em> for italic', async () => {
    expect(await compile('*italic*')).toBe('<p><em>italic</em></p>')
  })

  it('emits inline <code>', async () => {
    expect(await compile('use `signal()`')).toContain('<code>signal()</code>')
  })

  it('emits <br /> for line breaks', async () => {
    // mdast emits a `break` node for `\\` + newline OR two trailing spaces.
    expect(await compile('a  \nb')).toContain('<br />')
  })
})

describe('emitJsx — block elements', () => {
  it('emits <hr /> for thematic breaks', async () => {
    expect(await compile('---')).toBe('<hr />')
  })

  it('emits <blockquote> for blockquotes', async () => {
    expect(await compile('> quote')).toContain('<blockquote>')
    expect(await compile('> quote')).toContain('<p>quote</p>')
  })

  it('emits <ul><li> for bullet lists', async () => {
    const out = await compile('- a\n- b')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>')
  })

  it('emits <ol> for ordered lists', async () => {
    expect(await compile('1. a\n2. b')).toContain('<ol>')
  })

  it('emits start attribute for ordered lists not starting at 1', async () => {
    expect(await compile('3. a\n4. b')).toContain('start={3}')
  })

  it('emits nested lists', async () => {
    const out = await compile('- a\n  - nested\n- b')
    // outer <ul> contains an inner <ul>
    expect(out.match(/<ul>/g)?.length).toBe(2)
  })
})

describe('emitJsx — code blocks', () => {
  it('emits <pre><code> for fenced code', async () => {
    // PR-H audit M12 — code blocks now ship through <CodeBlock> on both
    // the highlighted and the plain paths so authoring features
    // (filename header, line numbers, highlight, copy) stay consistent.
    const out = await compile('```\nconst x = 1\n```')
    expect(out).toContain('<CodeBlock')
    expect(out).toContain('<pre><code>const x = 1')
  })

  it('preserves language tag on the lang prop', async () => {
    // PR-H audit M12 — `lang` lands on the <CodeBlock> component,
    // which renders a `data-lang` attribute on its outer wrapper.
    expect(await compile('```ts\nconst x = 1\n```')).toContain('lang={"ts"}')
  })

  it('defaults language to "text" when none given', async () => {
    expect(await compile('```\nx\n```')).toContain('lang={"text"}')
  })

  it('escapes HTML-sensitive characters inside code blocks', async () => {
    // PR-H audit M12 — plain (no-highlighter) path now emits the code
    // as a Shiki-style pre-rendered HTML string inside the
    // `dangerouslySetInnerHTML` slot. `<` / `>` / `&` are HTML-
    // escaped so the rendered <pre><code> survives without re-parsing
    // as actual tags. Inner `{ }` braces are fine because the entire
    // HTML lives behind dangerouslySetInnerHTML, not in JSX text.
    const out = await compile('```\n<div>{x}</div>\n```')
    expect(out).toContain('&lt;div&gt;')
  })
})

describe('emitJsx — links', () => {
  it('emits <a href> for links', async () => {
    expect(await compile('[label](/x)')).toContain('<a href={"/x"}>label</a>')
  })

  it('preserves the title attribute when present', async () => {
    expect(await compile('[a](/x "the title")')).toContain('title={"the title"}')
  })

  it('escapes label content', async () => {
    expect(await compile('[a<b](/x)')).toContain('a&lt;b')
  })
})

describe('emitJsx — images', () => {
  it('emits <img src alt />', async () => {
    expect(await compile('![Alt](/hero.png)')).toContain('<img src={"/hero.png"} alt={"Alt"} />')
  })

  it('emits empty alt when alt is omitted', async () => {
    expect(await compile('![](/x.png)')).toContain('alt={""}')
  })

  it('preserves title attribute', async () => {
    expect(await compile('![alt](/x.png "tt")')).toContain('title={"tt"}')
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

describe('jsStringLiteral', () => {
  it('wraps simple input in double quotes', () => {
    expect(jsStringLiteral('hello')).toBe('"hello"')
  })

  it('escapes backslashes', () => {
    expect(jsStringLiteral('a\\b')).toBe('"a\\\\b"')
  })

  it('escapes embedded double quotes', () => {
    expect(jsStringLiteral('say "hi"')).toBe('"say \\"hi\\""')
  })

  it('escapes newlines and carriage returns', () => {
    expect(jsStringLiteral('a\nb\rc')).toBe('"a\\nb\\rc"')
  })

  it('escapes U+2028 / U+2029 line separators (they break ES strings)', () => {
    const ls = ' '
    const ps = ' '
    expect(jsStringLiteral(`a${ls}b${ps}c`)).toBe('"a\\u2028b\\u2029c"')
  })

  it('produces output that round-trips through JSON.parse', () => {
    const inputs = ['hello', 'with "quotes"', 'with\\backslash', 'multi\nline']
    for (const input of inputs) {
      const literal = jsStringLiteral(input)
      // JSON.parse expects valid JSON string syntax — our literal must
      // be a valid JSON-encoded string.
      expect(JSON.parse(literal)).toBe(input)
    }
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
