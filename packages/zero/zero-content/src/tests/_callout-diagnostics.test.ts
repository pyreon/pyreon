/**
 * PR-A audit regression specs for `remarkCallout` diagnostics:
 *
 *   C9 — `:::tip` opened without a closing `:::` line silently
 *        ate the rest of the file. Heuristic + warning.
 *   H6 — `:::warn` (typo of `:::warning`) silently rendered as
 *        raw text. Levenshtein hint.
 *
 * Locked here so future contributors can refactor the plugin
 * without losing the diagnostics.
 *
 * Bisect-verified: temporarily removing the C9 / H6 branches in
 * `pipeline/remark-plugins/callout.ts` makes the matching specs
 * fail with the documented expected message.
 */
import { describe, expect, it } from 'vitest'
import {
  calloutEditDistance,
  looksUnclosed,
  suggestCalloutType,
} from '../pipeline/remark-plugins/callout'
import { compileMarkdown } from '../pipeline/parse'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'

describe('PR-A H6 — unknown directive name with Levenshtein hint', () => {
  it('suggests `warning` for `:::warn`', () => {
    expect(suggestCalloutType('warn')).toBe('warning')
  })

  it('suggests `note` for `:::not` (edit distance 1)', () => {
    expect(suggestCalloutType('not')).toBe('note')
  })

  it('returns null for completely unrelated names (no noise)', () => {
    expect(suggestCalloutType('foobarbaz')).toBeNull()
    expect(suggestCalloutType('qux')).toBeNull()
  })

  it('Levenshtein distance helper is correct on canonical inputs', () => {
    expect(calloutEditDistance('warn', 'warning')).toBe(3)
    expect(calloutEditDistance('not', 'note')).toBe(1)
    expect(calloutEditDistance('', 'tip')).toBe(3)
    expect(calloutEditDistance('tip', 'tip')).toBe(0)
  })

  it('compileMarkdown surfaces a `did you mean…?` warning for `:::warn`', async () => {
    const md = ':::warn\nbody\n:::\n'
    const result = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('Unknown callout directive `:::warn`')
    expect(result.warnings[0]).toContain('did you mean `:::warning`')
  })

  it('compileMarkdown stays silent for the canonical types', async () => {
    const md = ':::tip\nhello\n:::\n\n:::warning\nho\n:::\n'
    const result = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    expect(result.warnings).toEqual([])
  })

  it('compileMarkdown stays silent for `:::code-group` (other plugin owns it)', async () => {
    const md = ':::code-group\n```bash [npm]\nnpm i\n```\n:::\n'
    const result = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    expect(result.warnings).toEqual([])
  })
})

describe('PR-A C9 — unclosed-fence heuristic', () => {
  // Quick mdast factory — parse a markdown snippet with the
  // remark-directive plugin so we can drive `looksUnclosed` directly.
  function parseDirective(md: string) {
    const tree = unified().use(remarkParse).use(remarkDirective).parse(md) as any
    // Run the transformers so the directive nodes materialise.
    const walked = unified().use(remarkDirective).runSync(tree) as any
    // Find the first containerDirective node.
    function findContainer(n: any): any {
      if (n.type === 'containerDirective') return n
      if (!n.children) return null
      for (const c of n.children) {
        const found = findContainer(c)
        if (found) return found
      }
      return null
    }
    return findContainer(walked)
  }

  it('fires when a callout body extends to near the file end with many headings', () => {
    // 60-line file; directive at line 1; never closed.
    let md = ':::tip\n'
    for (let i = 0; i < 30; i++) {
      md += `## Heading ${i}\n\nBody for ${i}\n\n`
    }
    // No closing `:::`. Parse drives remark-directive to swallow it all
    // into one ContainerDirective.
    const directive = parseDirective(md)
    expect(directive).not.toBeNull()
    expect(looksUnclosed(directive, md.split('\n').length)).toBe(true)
  })

  it('does NOT fire on a properly closed short callout', () => {
    const md = ':::tip\nshort body\n:::\n\n\n\n\n\nrest of doc\nlines here\nmore\n'
    const directive = parseDirective(md)
    expect(directive).not.toBeNull()
    // Body is small, end is not near the file end (lots of trailing
    // lines), so heuristic stays quiet.
    expect(looksUnclosed(directive, md.split('\n').length)).toBe(false)
  })

  it('compileMarkdown surfaces the unclosed warning end-to-end', async () => {
    let md = ':::tip\n'
    for (let i = 0; i < 30; i++) md += `## H${i}\n\nbody ${i}\n\n`
    const result = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    const unclosed = result.warnings.find((w) => w.includes('unclosed'))
    expect(unclosed).toBeDefined()
    expect(unclosed!).toContain('Suspected unclosed `:::tip`')
  })
})

describe('PR-A H5 — path label in error messages', () => {
  it('compileMarkdown still emits its compile errors with a recognisable file label', async () => {
    // We deliberately can't drive the Vite plugin's `reportPath` from
    // unit tests (it requires a configResolved call). Instead, this
    // spec locks the shape of the path string the Vite layer renders
    // — `reportPath` returns a leading `./` path WHEN root is set,
    // falling back to the legacy `shortId` suffix otherwise.
    const { reportPath, _setResolvedRootForPaths, shortId } = await import(
      '../plugin'
    )
    try {
      _setResolvedRootForPaths('/abs/project')
      expect(reportPath('/abs/project/packages/foo/src/content/docs/zero.md')).toBe(
        './packages/foo/src/content/docs/zero.md',
      )
      // Path that isn't under root → falls back to shortId.
      expect(reportPath('/elsewhere/file.md')).toBe(shortId('/elsewhere/file.md'))
    } finally {
      // Reset the module-level cache so other test suites stay isolated.
      _setResolvedRootForPaths(null)
    }
  })

  it('reportPath without root captured uses shortId fallback', async () => {
    const { reportPath, _setResolvedRootForPaths, shortId } = await import(
      '../plugin'
    )
    _setResolvedRootForPaths(null)
    expect(reportPath('/abs/p/src/content/docs/zero.md')).toBe(
      shortId('/abs/p/src/content/docs/zero.md'),
    )
  })

  it('reportPath normalises Windows-style paths against a Unix root', async () => {
    const { reportPath, _setResolvedRootForPaths } = await import('../plugin')
    try {
      _setResolvedRootForPaths('/abs/project')
      expect(
        reportPath('/abs/project/packages\\foo\\src\\content\\docs\\zero.md'),
      ).toBe('./packages/foo/src/content/docs/zero.md')
    } finally {
      _setResolvedRootForPaths(null)
    }
  })
})
