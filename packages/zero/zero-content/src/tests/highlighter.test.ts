/**
 * Shiki highlighter integration.
 *
 * The highlighter is initialized lazily and shared across the build.
 * These specs verify (a) basic init + dispose, (b) language fallback to
 * `text` for unknown langs, (c) repeat calls share the SAME instance,
 * (d) the markdown pipeline produces `<CodeBlock>` wrappers carrying the
 * Shiki HTML through `dangerouslySetInnerHTML`.
 *
 * Slow tests (Shiki init pulls grammar files from disk) — keep the spec
 * count tight + reuse instances across asserts where possible.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { compileMarkdown } from '../pipeline/parse'
import {
  _resetHighlighterForTesting,
  getHighlighter,
  highlightCode,
} from '../pipeline/highlighter'

afterAll(() => {
  // Release the shared instance so test isolation between this file
  // and other suites stays clean.
  _resetHighlighterForTesting()
})

describe('getHighlighter', () => {
  it('returns the same instance on repeat calls', async () => {
    const a = await getHighlighter()
    const b = await getHighlighter()
    expect(a).toBe(b)
  })

  it('dedupes concurrent init calls onto the same Promise', async () => {
    _resetHighlighterForTesting()
    // Both calls fire before the first resolves → both must observe the
    // same in-flight promise (covers the `if (_initPromise) return`
    // branch).
    const [a, b] = await Promise.all([getHighlighter(), getHighlighter()])
    expect(a).toBe(b)
  })

  it('_resetHighlighterForTesting is a no-op when no highlighter exists', () => {
    _resetHighlighterForTesting()
    // Second consecutive call hits the `if (_highlighter)` false branch.
    expect(() => _resetHighlighterForTesting()).not.toThrow()
  })
})

describe('highlightCode', () => {
  it('emits a Shiki <pre> with shiki class for a known language', async () => {
    const html = await highlightCode('const x = 1', 'typescript')
    expect(html).toContain('<pre')
    expect(html).toContain('shiki')
    // Token-level <span>s carry inline color styles
    expect(html).toContain('<span')
    expect(html).toContain('color:')
  })

  it('falls back to "text" for unknown languages instead of throwing', async () => {
    const html = await highlightCode('lorem ipsum', 'this-language-does-not-exist')
    expect(html).toContain('<pre')
    expect(html).toContain('lorem ipsum')
  })

  it('handles undefined language by treating as text', async () => {
    const html = await highlightCode('x', undefined)
    expect(html).toContain('<pre')
  })

  it('escapes HTML in the input so user code can contain < and >', async () => {
    const html = await highlightCode('<div>hello</div>', 'html')
    // Shiki escapes the angle brackets in its output
    expect(html).not.toContain('<div>hello</div>')
    expect(html).toMatch(/&lt;|<span/)
  })
})

describe('markdown pipeline with highlighter enabled', () => {
  it('wraps highlighted code in <CodeBlock dangerouslySetInnerHTML={{__html: "..."}}>', async () => {
    const md = '```typescript\nconst x = 1\n```'
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: true })
    expect(result.code).toContain('<CodeBlock')
    expect(result.code).toContain('lang={"typescript"}')
    expect(result.code).toContain('dangerouslySetInnerHTML={{ __html: "')
    // Shiki output is inside the string literal
    expect(result.code).toContain('shiki')
  })

  it('still emits plain <pre><code> when highlight: false', async () => {
    const md = '```typescript\nconst x = 1\n```'
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).not.toContain('<CodeBlock')
    expect(result.code).toContain('<pre data-lang={"typescript"}>')
    expect(result.code).toContain('<code>const x = 1')
  })

  it('escapes special characters in the Shiki HTML to survive the JS string literal', async () => {
    // Shiki emits HTML containing backslashes-in-CSS-vars and quotes;
    // jsStringLiteral must escape both so the generated TSX parses.
    const md = '```ts\nconst x = "hi"\n```'
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: true })
    // The emitted string-literal payload should not contain raw
    // unescaped backslashes (every \ in Shiki output becomes \\).
    // We assert by checking the wrapping is well-formed: the __html
    // value is a double-quoted string that closes correctly.
    expect(result.code).toMatch(/dangerouslySetInnerHTML=\{\{ __html: ".*" \}\} \/>/s)
  })
})
