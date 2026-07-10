// @vitest-environment happy-dom
/**
 * Regression: `insertGlobal` with `@layer`-wrapped content must still land in
 * the DOM when @layer is unsupported (happy-dom / older engines). Before the
 * fix, the scoped `insert()` path gated the @layer wrap on `supportsLayer` but
 * `insertGlobal` inserted the pre-wrapped rule verbatim — so happy-dom's
 * insertRule threw, styler warned a DOMException on every test, and the global
 * rule (e.g. a reset) was silently absent. Assertions on global styles would
 * then quietly lie. See sheet.ts:unwrapLayers.
 *
 * Release-audit completeness pass (the stress matrix below): the 0.41.x fixes
 * covered top-level sibling + nested @layer blocks only. A fresh-DOM stress
 * audit proved FIVE remaining silent failures, locked here failing-first:
 *  1. `@layer` inside @media/@supports/@container was NOT descended into —
 *     the group rule inserted with an EMPTY body, rules lost, zero warn.
 *  2. The `@layer a, b;` ordering STATEMENT was swallowed by the
 *     brace-counting splitter on EVERY path (incl. supportsLayer=true modern
 *     browsers) — user cascade order silently wrong. Same class ate
 *     `@import …;` statements.
 *  3. Brace counting was string/comment/url-unaware — `url("a}b.png")` /
 *     `content:"}"` split mid-string and mangled/lost rules.
 *  4. Anonymous `@layer { … }` blocks (valid CSS) were not unwrapped, and
 *     unbalanced input dropped everything with zero signal.
 *  5. (doc) the flatten fallback changes cascade semantics — see the honest
 *     caveat in sheet.ts:insertGlobal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessInternal } from '@pyreon/test-utils'
import { splitTopLevelRules, StyleSheet, unwrapLayers } from '../sheet'

function domRules(): string[] {
  const el = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement | null
  return Array.from(el?.sheet?.cssRules ?? []).map((r) => (r as CSSRule).cssText)
}

describe('insertGlobal @layer in an @layer-unsupported DOM (happy-dom)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('unwraps a single outer @layer block so the inner rules land, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer rocketstyle{*{box-sizing:border-box}}')

    // The reset actually made it into the DOM (unwrapped, source order)…
    expect(domRules().some((r) => r.includes('box-sizing'))).toBe(true)
    // …and no DOMException was warned.
    expect(warn).not.toHaveBeenCalled()
  })

  it('unwraps MULTIPLE sibling @layer blocks (all inner rules land)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer elements{html{font-size:16px}}@layer rocketstyle{*{box-sizing:border-box}}')

    const rules = domRules()
    expect(rules.some((r) => r.includes('font-size'))).toBe(true)
    expect(rules.some((r) => r.includes('box-sizing'))).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('unwraps a NESTED @layer block', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer outer{@layer inner{body{margin:0}}}')

    expect(domRules().some((r) => r.includes('margin'))).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('unwraps a @layer block holding MULTIPLE inner rules', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer rocketstyle{*{box-sizing:border-box}body{margin:0}}')

    const rules = domRules()
    expect(rules.some((r) => r.includes('box-sizing'))).toBe(true)
    expect(rules.some((r) => r.includes('margin'))).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('still inserts plain global rules unchanged', () => {
    const s = new StyleSheet({ layer: 'rocketstyle' })
    s.insertGlobal('body{margin:0}')
    expect(domRules().some((r) => r.includes('margin'))).toBe(true)
  })
})

// ─── splitTopLevelRules — pure-function stress matrix ───────────────────────

describe('splitTopLevelRules — at-STATEMENT emission (defect 2)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('emits a `@layer a, b;` ordering statement as its own slice', () => {
    expect(splitTopLevelRules('@layer a, b;.x{color:blue}')).toEqual([
      '@layer a, b;',
      '.x{color:blue}',
    ])
  })

  it('emits a statement-only input (previously vanished entirely)', () => {
    expect(splitTopLevelRules('@layer reset, base, components;')).toEqual([
      '@layer reset, base, components;',
    ])
  })

  it('emits @import statements as their own slices', () => {
    expect(splitTopLevelRules('@import url("x.css");body{margin:0}')).toEqual([
      '@import url("x.css");',
      'body{margin:0}',
    ])
  })

  it('emits @namespace and @charset statements', () => {
    expect(
      splitTopLevelRules('@charset "utf-8";@namespace svg url(http://www.w3.org/2000/svg);'),
    ).toEqual(['@charset "utf-8";', '@namespace svg url(http://www.w3.org/2000/svg);'])
  })

  it('a statement BETWEEN block rules does not corrupt either neighbor', () => {
    expect(splitTopLevelRules('.a{color:red}@layer x, y;.b{color:blue}')).toEqual([
      '.a{color:red}',
      '@layer x, y;',
      '.b{color:blue}',
    ])
  })

  it('drops a stray top-level `;` without prefixing the next rule', () => {
    expect(splitTopLevelRules(';body{margin:0}')).toEqual(['body{margin:0}'])
  })
})

describe('splitTopLevelRules — string/comment/url awareness (defect 3)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not split on `}` inside a double-quoted string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('.a{background:url("a}b.png");content:"}"}')).toEqual([
      '.a{background:url("a}b.png");content:"}"}',
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not split on `}` inside a single-quoted string', () => {
    expect(splitTopLevelRules(".a{content:'}'}")).toEqual([".a{content:'}'}"])
  })

  it('honors backslash escapes inside strings', () => {
    expect(splitTopLevelRules('.a{content:"\\"}\\""}')).toEqual(['.a{content:"\\"}\\""}'])
  })

  it('does not count braces inside /* comments */', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('.a{/* } { */color:red}.b{color:blue}')).toEqual([
      '.a{/* } { */color:red}',
      '.b{color:blue}',
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not count braces inside an UNQUOTED url(…) token', () => {
    expect(splitTopLevelRules('.a{background:url(a}b.png)}')).toEqual([
      '.a{background:url(a}b.png)}',
    ])
  })

  it('a `url` suffix of a longer function name is NOT treated as a url token', () => {
    // `burl(` is a plain function — only real url tokens may hold raw braces.
    expect(splitTopLevelRules('.a{mask:burl(x)}.b{color:red}')).toEqual([
      '.a{mask:burl(x)}',
      '.b{color:red}',
    ])
  })

  it('quoted url bodies route through the string handler (uppercase URL too)', () => {
    expect(splitTopLevelRules('.a{background:URL( "a}b.png" )}')).toEqual([
      '.a{background:URL( "a}b.png" )}',
    ])
  })

  it('@layer block whose rule holds a brace-in-string stays intact', () => {
    // Pre-fix: split mid-string → `@layer x{.a{content:"}` → unwrap emitted
    // garbage / nothing — the declaration was lost with zero warn.
    expect(splitTopLevelRules('@layer x{.a{content:"}"}}')).toEqual(['@layer x{.a{content:"}"}}'])
  })

  it('unterminated comment does not crash and does not false-warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('.a{color:red}/* trailing')).toEqual(['.a{color:red}'])
    expect(warn).not.toHaveBeenCalled()
  })

  it('unterminated string runs to end-of-input and warns about the dropped tail', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('.a{content:"')).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toMatch(/dropped unparseable trailing CSS/)
  })
})

describe('splitTopLevelRules — unbalanced input warns instead of vanishing (defect 4)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fully-unbalanced input produces zero rules + a dev warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('@layer a{.x{')).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toMatch(/missing a closing brace/)
  })

  it('a balanced prefix still lands; only the unbalanced tail warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('body{margin:0}@layer a{.x{')).toEqual(['body{margin:0}'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('trailing whitespace/comments do NOT false-warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('body{margin:0}  /* done */ ')).toEqual(['body{margin:0}'])
    expect(warn).not.toHaveBeenCalled()
  })

  it('a stray top-level `}` is skipped instead of poisoning depth for the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(splitTopLevelRules('}body{margin:0}')).toEqual(['body{margin:0}'])
    expect(warn).not.toHaveBeenCalled()
  })
})

// ─── unwrapLayers — pure-function stress matrix ─────────────────────────────

describe('unwrapLayers — @layer inside group rules (defect 1)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('unwraps @layer inside @media, preserving the @media wrapper', () => {
    expect(
      unwrapLayers('@media (min-width:600px){@layer x{.a{color:red}}}', splitTopLevelRules),
    ).toEqual(['@media (min-width:600px){.a{color:red}}'])
  })

  it('unwraps @layer inside @supports', () => {
    expect(
      unwrapLayers('@supports (display:grid){@layer x{.a{display:grid}}}', splitTopLevelRules),
    ).toEqual(['@supports (display:grid){.a{display:grid}}'])
  })

  it('unwraps @layer inside @container', () => {
    expect(
      unwrapLayers('@container (min-width:400px){@layer x{.a{color:red}}}', splitTopLevelRules),
    ).toEqual(['@container (min-width:400px){.a{color:red}}'])
  })

  it('handles @layer > @media > @layer nesting', () => {
    expect(
      unwrapLayers('@layer o{@media (min-width:1px){@layer i{.a{color:red}}}}', splitTopLevelRules),
    ).toEqual(['@media (min-width:1px){.a{color:red}}'])
  })

  it('a group rule WITHOUT @layer inside passes through verbatim', () => {
    const rule = '@media (min-width:600px){.a{color:red}}'
    expect(unwrapLayers(rule, splitTopLevelRules)).toEqual([rule])
  })

  it('mixed group body: layered AND unlayered siblings both survive', () => {
    expect(
      unwrapLayers(
        '@media (min-width:1px){.plain{color:blue}@layer x{.a{color:red}}}',
        splitTopLevelRules,
      ),
    ).toEqual(['@media (min-width:1px){.plain{color:blue}.a{color:red}}'])
  })
})

describe('unwrapLayers — anonymous blocks + statements (defects 2 + 4)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('unwraps an anonymous `@layer{…}` block', () => {
    expect(unwrapLayers('@layer{body{margin:0}}', splitTopLevelRules)).toEqual(['body{margin:0}'])
  })

  it('unwraps an anonymous `@layer { … }` block with whitespace', () => {
    expect(unwrapLayers('@layer {body{margin:0}}', splitTopLevelRules)).toEqual(['body{margin:0}'])
  })

  it('drops a `@layer a, b;` ordering statement WITH a dev warn naming the loss', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(unwrapLayers('@layer a, b;.x{color:blue}', splitTopLevelRules)).toEqual([
      '.x{color:blue}',
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toMatch(/layer-ordering statement/)
    expect(String(warn.mock.calls[0])).toMatch(/source order/)
  })

  it('drops a single-name `@layer base;` statement with the warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(unwrapLayers('@layer base;', splitTopLevelRules)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a statement INSIDE a named block is dropped with the warn too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(unwrapLayers('@layer o{@layer a, b;body{margin:0}}', splitTopLevelRules)).toEqual([
      'body{margin:0}',
    ])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('keeps strings-with-braces intact through the unwrap (defect 3 ride-along)', () => {
    expect(unwrapLayers('@layer x{.a{content:"}"}}', splitTopLevelRules)).toEqual([
      '.a{content:"}"}',
    ])
  })

  it('@import statements pass through the flatten untouched', () => {
    expect(unwrapLayers('@import url("x.css");body{margin:0}', splitTopLevelRules)).toEqual([
      '@import url("x.css");',
      'body{margin:0}',
    ])
  })
})

// ─── StyleSheet integration (happy-dom = @layer-unsupported flatten path) ───

describe('insertGlobal — group-rule + statement shapes land in an @layer-unsupported DOM', () => {
  afterEach(() => vi.restoreAllMocks())

  it('DEFECT 1: @layer inside @media lands (previously an EMPTY media block, zero warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@media (min-width:600px){@layer x{.a{color:red}}}')

    const rules = domRules()
    const media = rules.find((r) => r.includes('min-width'))
    expect(media).toBeDefined()
    expect(media).toContain('color: red')
    expect(media).not.toContain('@layer')
    expect(warn).not.toHaveBeenCalled()
  })

  it('DEFECT 2 (flatten): `@layer a, b;` statement is dropped with the cascade warn, sibling rule lands', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer a, b;.x{color:blue}')

    expect(domRules().some((r) => r.includes('color: blue'))).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toMatch(/layer-ordering statement/)
  })

  it('DEFECT 3: a rule with `}` inside strings survives insertGlobal intact', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('.strbrace{background:url("a}b.png");color:red}')

    // The rule landed as exactly ONE clean rule with no DOMException warn.
    // (happy-dom's own declaration parser can't represent the url body —
    // `cssText` shows an empty block — so the computed-declaration proof
    // lives in the real-Chromium browser spec; what THIS locks is the
    // splitter no longer producing garbage slices: pre-fix the mid-string
    // split emitted `.strbrace{background:url("a}` + a dangling tail and
    // insertRule warned.)
    const strbraceRules = domRules().filter((r) => r.includes('.strbrace'))
    expect(strbraceRules).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('DEFECT 4: anonymous @layer block is unwrapped and lands', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer{.anonlayer{margin:0}}')

    expect(domRules().some((r) => r.includes('.anonlayer'))).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('DEFECT 4: unbalanced input warns instead of vanishing silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new StyleSheet({ layer: 'rocketstyle' })

    s.insertGlobal('@layer broken{.x{')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toMatch(/missing a closing brace/)
  })
})

// ─── Modern path (supportsLayer=true) — statement no longer swallowed ───────

describe('insertGlobal — supportsLayer=true keeps @layer statements (defect 2, modern path)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes the `@layer a, b;` statement to insertRule as its own rule', () => {
    const s = new StyleSheet({ layer: 'rocketstyle' })
    // happy-dom has no @layer, so force the modern-browser branch and spy
    // on the raw insertRule to observe exactly what the sheet attempts.
    const internal = accessInternal<{ supportsLayer: boolean; sheet: CSSStyleSheet }>(s)
    internal.supportsLayer = true
    const attempted: string[] = []
    vi.spyOn(internal.sheet, 'insertRule').mockImplementation((rule: string) => {
      attempted.push(rule)
      return 0
    })

    s.insertGlobal('@layer a, b;.x{color:blue}')

    // Pre-fix the statement was silently swallowed by the brace-counting
    // splitter — only `.x{color:blue}` was ever attempted, so the user's
    // declared cascade order was wrong in EVERY browser.
    expect(attempted).toContain('@layer a, b;')
    expect(attempted).toContain('.x{color:blue}')
  })
})
