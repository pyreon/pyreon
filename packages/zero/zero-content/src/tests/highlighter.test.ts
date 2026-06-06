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
  it('returns the same instance on repeat calls with EQUAL opts', async () => {
    _resetHighlighterForTesting()
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

  // PR-A audit C10 — pre-fix, the first call's opts were sticky for the
  // process lifetime. A theme swap in `content.config.ts` (HMR) was
  // ignored until full restart. Now the cache key is `opts`-shaped so
  // a different `themes` map rebuilds.
  it('rebuilds the highlighter when `themes` changes (C10 regression)', async () => {
    _resetHighlighterForTesting()
    const a = await getHighlighter({ themes: { light: 'github-light', dark: 'github-dark' } })
    const b = await getHighlighter({ themes: { light: 'min-light', dark: 'min-dark' } })
    expect(a).not.toBe(b)
    // The previous instance was disposed and is no longer reachable
    // via the module's cache — a third call with the SAME (new) opts
    // returns the second instance.
    const c = await getHighlighter({ themes: { light: 'min-light', dark: 'min-dark' } })
    expect(c).toBe(b)
  })

  it('rebuilds the highlighter when `langs` changes (C10 regression)', async () => {
    _resetHighlighterForTesting()
    const a = await getHighlighter({ langs: ['typescript'] })
    const b = await getHighlighter({ langs: ['typescript', 'rust'] })
    expect(a).not.toBe(b)
  })

  it('cache key is order-independent across theme map keys', async () => {
    _resetHighlighterForTesting()
    // Both calls describe the SAME (light, dark) theme pair, just
    // with the object keys in different declaration order. The shared
    // instance must NOT rebuild — the JSON-stringify replacer sorts
    // object keys before serialising.
    const a = await getHighlighter({
      themes: { light: 'github-light', dark: 'github-dark' },
    })
    const b = await getHighlighter({
      themes: { dark: 'github-dark', light: 'github-light' } as any,
    })
    expect(a).toBe(b)
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

  it('still emits CodeBlock with plain <pre><code> payload when highlight: false', async () => {
    // PR-H audit M12 — even with Shiki disabled, code blocks ship
    // through <CodeBlock> so authoring features (filename, copy, line
    // numbers) stay consistent. The payload is plain HTML rather than
    // Shiki's themed output.
    const md = '```typescript\nconst x = 1\n```'
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.code).toContain('<CodeBlock')
    expect(result.code).toContain('lang={"typescript"}')
    expect(result.code).toContain('<pre><code>const x = 1')
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
