// GFM strikethrough (`~~text~~`) reached `emit-jsx`'s unhandled-node default,
// which DROPS the subtree rather than rendering it.
//
// It is not a cosmetic loss. The docs site's troubleshooting pages are
// generated from `.claude/rules/anti-patterns.md`, where a superseded entry is
// written as `~~the old claim~~ Here is why it no longer holds` — so the page
// rendered the explanation with its subject missing, leaving a dangling
// "under the new model there is no X to truncate" whose X was never stated.
//
// The docs build printed the M16 warning on every run. Nothing gates it.
import { describe, expect, it } from 'vitest'
import { compileMarkdown } from '../pipeline/parse'

describe('GFM strikethrough', () => {
  it('renders `~~text~~` instead of dropping it', async () => {
    const result = await compileMarkdown('~~gone~~ kept', '/abs/s.md')
    expect(result.code).toContain('<del>')
    expect(result.code).toContain('gone')
    expect(result.code).toContain('kept')
  })

  it('does not report the content as unhandled', async () => {
    const result = await compileMarkdown('~~gone~~ kept', '/abs/s.md')
    expect(result.warnings.filter((w) => w.includes('"delete"'))).toEqual([])
  })

  it('keeps nested inline marks inside the strikethrough', async () => {
    // The arm recurses through `emitChildren` like `strong` and `emphasis`, so
    // a struck-through span carrying its own markup keeps it. A non-recursing
    // arm would render the text and silently drop the `<code>`.
    const result = await compileMarkdown('~~use `oldApi()` here~~', '/abs/n.md')
    expect(result.code).toContain('<del>')
    expect(result.code).toContain('<code>oldApi()</code>')
  })

  it('renders the shape the troubleshooting pages actually carry', async () => {
    // The real source: a struck-through claim followed by the correction.
    const md = '~~`restoreContextStack` truncation destroys frames.~~ Under the new model there is no stack.'
    const result = await compileMarkdown(md, '/abs/t.md')
    expect(result.code).toContain('restoreContextStack')
    expect(result.code).toContain('Under the new model')
  })
})

describe('single tilde is NOT strikethrough', () => {
  it('leaves `~` meaning "approximately" alone', async () => {
    // A control. On ONE line these two tildes do not pair under GFM's
    // flanking rules, so this shape was never broken — it is here so the
    // option cannot regress the ordinary "approximately" usage either.
    const md = 'layout is ~86% of that op, and the JS cost is ~+28% of it'
    const result = await compileMarkdown(md, '/abs/a.md')
    expect(result.code).not.toContain('<del>')
    expect(result.code).toContain('86%')
    expect(result.code).toContain('+28%')
  })

  it('does not strike ACROSS line breaks', async () => {
    // The real shape from `architecture-and-prior-art.md`: the two figures sit
    // three lines apart, so the whole methodological caveat between them was
    // wrapped in a `delete` node — and, before the `<del>` arm, dropped.
    const md = [
      'a profiling pass found layout is ~86% of that op and',
      'statistically identical between arms, so the instrument cannot',
      'separate them; the only signal is a small JS-only cost (~+28%) here.',
    ].join('\n')
    const result = await compileMarkdown(md, '/abs/b.md')
    expect(result.code).not.toContain('<del>')
    expect(result.code).toContain('statistically identical between arms')
  })

  it('still renders DOUBLE tilde as strikethrough', async () => {
    const result = await compileMarkdown('~~struck~~ kept', '/abs/c.md')
    expect(result.code).toContain('<del>')
    expect(result.code).toContain('struck')
  })
})

describe('inline directives are prose, not markup', () => {
  it('keeps `display:none` whole', async () => {
    // `remark-directive` claims `:none` as a text directive; unhandled, it was
    // DROPPED, so the sentence rendered as `display` with the value missing.
    const result = await compileMarkdown('set `display` to display:none here', '/abs/d.md')
    expect(result.code).toContain('display:none')
  })

  it('keeps a `1:1` ratio whole', async () => {
    // The one that makes this reachable in almost any prose.
    const result = await compileMarkdown('values that map 1:1 to every target', '/abs/r.md')
    expect(result.code).toContain('1:1')
    expect(result.code).toContain('to every target')
  })

  it('reports nothing as unhandled for either', async () => {
    for (const md of ['display:none', 'map 1:1 across']) {
      const result = await compileMarkdown(md, '/abs/w.md')
      expect(result.warnings.filter((w) => w.includes('content was dropped'))).toEqual([])
    }
  })
})
