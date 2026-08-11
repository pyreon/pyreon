import { describe, expect, it } from 'vitest'
import { Code, Document, Text, render } from '../index'
import { escapeXml } from '../sanitize'

/**
 * Regression lock: code blocks must SINGLE-escape their string children.
 *
 * Bug shape (bisect-verified): the html + email renderers wrapped
 * `renderChildren(...)` — whose renderChild ALREADY escapes string
 * children — in a second outer `escapeHtml(...)`/`esc(...)`, so
 * `<Code>a < b && c</Code>` emitted `a &amp;lt; b &amp;&amp; c`
 * (entities rendered literally in the browser / email client).
 */
describe('code blocks single-escape (html + email)', () => {
  const doc = Document({ children: Code({ children: 'a < b && c > d "quoted"' }) })

  it('html: code content is escaped exactly once', async () => {
    const html = (await render(doc, 'html')) as string
    expect(html).toContain('<code>a &lt; b &amp;&amp; c &gt; d &quot;quoted&quot;</code>')
    // The double-escaped shape must be absent.
    expect(html).not.toContain('&amp;lt;')
    expect(html).not.toContain('&amp;amp;')
  })

  it('email: code content is escaped exactly once', async () => {
    const email = (await render(doc, 'email')) as string
    expect(email).toContain('<code>a &lt; b &amp;&amp; c &gt; d &quot;quoted&quot;</code>')
    expect(email).not.toContain('&amp;lt;')
    expect(email).not.toContain('&amp;amp;')
  })

  it('html: a nested node inside Code renders its own (internally escaped) markup', async () => {
    // Non-string children flow through renderNode, which escapes every
    // text leaf itself — the dropped outer escape must not leave any
    // path unescaped, and the nested markup must not be entity-mangled.
    const nested = Document({
      children: Code({ children: Text({ children: 'x < y' }) }),
    })
    const html = (await render(nested, 'html')) as string
    expect(html).toContain('x &lt; y')
    expect(html).not.toContain('&amp;lt;')
  })
})

/**
 * Differential contract: the single-pass escapeXml must be byte-identical
 * to the original 4-pass chained-replace implementation for every input.
 * Entity set is document's own: & < > " — NO &#39; (single quotes pass
 * through untouched).
 */
function escapeXmlReference(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

describe('escapeXml single-pass differential', () => {
  const corpus = [
    '',
    'plain clean string with no entities at all',
    '&',
    '<',
    '>',
    '"',
    "'",
    '&&&',
    '<<<>>>',
    'a < b && c > d',
    '"double" and \'single\' quotes',
    '&amp; pre-escaped stays double',
    '<script>alert("xss")</script>',
    'trailing entity &',
    '& leading entity',
    'mixed < text & "attr" > done',
    'unicode ünïcödé ✓ 中文 🎉 with < entity',
    'unicode-only ünïcödé ✓ 中文 🎉',
    'a'.repeat(1000),
    ('x < y & '.repeat(200)),
    '\n\t< with\nwhitespace >\t',
  ]

  it('matches the 4-pass reference byte-for-byte on the whole corpus', () => {
    for (const input of corpus) {
      expect(escapeXml(input)).toBe(escapeXmlReference(input))
    }
  })

  it('returns the SAME string instance for clean input (fast path)', () => {
    const clean = 'no entities here'
    expect(escapeXml(clean)).toBe(clean)
  })

  it("does NOT escape single quotes (document's entity set has no &#39;)", () => {
    expect(escapeXml("it's")).toBe("it's")
  })
})
