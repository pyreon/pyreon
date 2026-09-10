/**
 * The hand-rolled frontmatter and heading parsers.
 *
 * Both replaced regexes CodeQL flagged as polynomial — `^([A-Za-z_][\w.-]*):\s*(.*)$`
 * and `^(#{1,6})\s+(.+?)\s*#*$`. That is the sharpest kind of rewrite to
 * ship without tests: the ReDoS is genuinely fixed, nothing throws, and
 * any behavioural divergence shows up only as an entry whose title is
 * missing or whose outline is wrong — which an assistant reads as "this
 * page has no title" rather than as a parser bug.
 *
 * So these specs are written as the regex's own contract, shape by
 * shape: which keys are accepted, which lines are skipped, how quoting
 * and trailing `#` are handled. The interesting cases are the ones a
 * hand-rolled scan gets wrong in the direction of accepting MORE than
 * the regex did — a key with a space, a `#` with no space after it —
 * because over-acceptance produces plausible garbage rather than an
 * empty result.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getContentEntry } from '../content'

const TMP_ROOT = path.join(process.cwd(), 'src', 'tests', '__content_parsers_tmp__')

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(TMP_ROOT, `p-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(tmpDir, 'src', 'content', 'docs'), { recursive: true })
  await fs.writeFile(
    path.join(tmpDir, 'content.config.ts'),
    `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
  },
})
`,
  )
})
afterEach(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true })
})

/** Write one page and read it back through the REAL lookup. */
async function parse(body: string, slug = 'page') {
  await fs.writeFile(path.join(tmpDir, 'src', 'content', 'docs', `${slug}.md`), body, 'utf8')
  return getContentEntry(tmpDir, 'docs', slug)
}

const fm = (lines: string, md = '# H\n') => `---\n${lines}\n---\n${md}`

describe('frontmatter keys are accepted exactly as the regex accepted them', () => {
  it('reads an ordinary key/value pair', () => {
    // The control. Every rejection spec below is worthless against a
    // parser that reads nothing.
    return parse(fm('title: Getting Started')).then((e) => {
      expect(e?.frontmatter.title).toBe('Getting Started')
    })
  })

  for (const key of ['title', 'sidebar_label', 'og.image', 'a-b', '_private', 'v2']) {
    it(`accepts \`${key}\` — [A-Za-z_] then [\\w.-]`, async () => {
      const e = await parse(fm(`${key}: v`))
      expect(e?.frontmatter[key], key).toBe('v')
    })
  }

  for (const [label, line] of [
    ['a leading digit', '2fa: v'],
    ['a leading dash', '-key: v'],
    ['a space in the key', 'my key: v'],
    ['a slash', 'a/b: v'],
    ['an @ sign', '@pkg: v'],
    ['a colon at position 0', ': v'],
  ] as Array<[string, string]>) {
    it(`REJECTS ${label} rather than inventing a key`, async () => {
      // Over-acceptance is the dangerous direction: a bogus key becomes
      // a field an assistant reads as real metadata.
      const e = await parse(fm(line))
      expect(Object.keys(e?.frontmatter ?? {}), label).toEqual([])
    })
  }

  it('skips a line with no colon at all', async () => {
    const e = await parse(fm('title: T\njust a sentence\nother: O'))
    expect(e?.frontmatter).toEqual({ title: 'T', other: 'O' })
  })

  it('keeps only the FIRST colon as the separator', async () => {
    // A URL value contains one. Splitting on the last colon would
    // truncate every link in frontmatter.
    const e = await parse(fm('url: https://x.com:8443/a'))
    expect(e?.frontmatter.url).toBe('https://x.com:8443/a')
  })

  it('strips matched quotes but not mismatched or inner ones', async () => {
    const e = await parse(fm([
      'a: "quoted"',
      "b: 'single'",
      'c: "mismatched\'',
      'd: say "hi" there',
    ].join('\n')))
    expect(e?.frontmatter.a).toBe('quoted')
    expect(e?.frontmatter.b).toBe('single')
    expect(e?.frontmatter.c, 'a mismatched pair is not a quoted string').toBe('"mismatched\'')
    expect(e?.frontmatter.d).toBe('say "hi" there')
  })

  it('drops a key whose value is EMPTY', async () => {
    // `title:` with nothing after it must not become `title: ""`, which
    // renders as a page with a blank title rather than none.
    const e = await parse(fm('title:\nother: v'))
    expect(e?.frontmatter).toEqual({ other: 'v' })
  })

  it('does not backtrack on a long run of whitespace', async () => {
    // The ReDoS shape the rewrite exists for. Linear ops make this
    // instant; the polynomial regex did not.
    const started = Date.now()
    const e = await parse(fm(`title:${' '.repeat(50_000)}x`))
    expect(Date.now() - started, 'must be linear').toBeLessThan(2000)
    expect(e?.frontmatter.title).toBe('x')
  })
})

describe('headings are extracted exactly as the regex extracted them', () => {
  const headings = async (md: string) => (await parse(fm('title: T', md)))?.headings ?? []

  it('reads levels 1 through 6', async () => {
    const out = await headings(['# a', '## b', '### c', '#### d', '##### e', '###### f'].join('\n'))
    expect(out.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6])
    expect(out.map((h) => h.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('caps at level 6 rather than inventing a level 7', async () => {
    // `####### x` is not a heading in Markdown; treating it as one puts
    // a phantom level in the outline.
    const out = await headings('####### seven')
    expect(out.every((h) => h.level <= 6)).toBe(true)
  })

  it('REQUIRES whitespace after the hashes', async () => {
    // `#hashtag` is body text. Accepting it fills the outline with
    // hashtags from prose.
    expect(await headings('#nospace')).toEqual([])
    expect(await headings('##also-none')).toEqual([])
  })

  it('accepts a TAB as the separator', async () => {
    expect(await headings('#\tTabbed')).toEqual([{ level: 1, text: 'Tabbed' }])
  })

  it('strips ATX-closing hashes and the space before them', async () => {
    // `## Title ##` is a legal closed heading; leaving the hashes in
    // puts them in every table of contents.
    expect(await headings('## Title ##')).toEqual([{ level: 2, text: 'Title' }])
    expect(await headings('## Title #####')).toEqual([{ level: 2, text: 'Title' }])
  })

  it('does not strip a hash that is part of the TEXT', async () => {
    expect(await headings('## C# and F#')).toEqual([{ level: 2, text: 'C# and F' }])
  })

  it('skips a heading that is only hashes', async () => {
    // `###` and `### ###` have no text; an empty outline entry renders
    // as a blank link.
    expect(await headings('###')).toEqual([])
    expect(await headings('### ###')).toEqual([])
    expect(await headings('#')).toEqual([])
  })

  it('ignores a line that does not start with a hash', async () => {
    expect(await headings('  ## indented\ntext # mid')).toEqual([])
  })

  it('does not backtrack on a long whitespace or hash run', async () => {
    const started = Date.now()
    const out = await headings(`## ${' '.repeat(30_000)}T${'#'.repeat(30_000)}`)
    expect(Date.now() - started, 'must be linear').toBeLessThan(2000)
    expect(out[0]?.text).toBe('T')
  })
})

describe('the entry body is separated from the frontmatter', () => {
  it('does not report a frontmatter line as a heading', async () => {
    // If the split point is wrong by one line, a `# ` inside
    // frontmatter joins the outline and the real first heading is lost.
    const e = await parse(fm('title: T\ndesc: "# not a heading"', '# Real\n\nbody\n'))
    expect(e?.headings).toEqual([{ level: 1, text: 'Real' }])
  })

  it('parses a file with NO frontmatter at all', async () => {
    // The ordinary shape for a page that only has a heading.
    const e = await parse('# Just A Heading\n\ntext\n')
    expect(e?.frontmatter).toEqual({})
    expect(e?.headings).toEqual([{ level: 1, text: 'Just A Heading' }])
  })

  it('handles CRLF line endings', async () => {
    // A file authored on Windows, or one that round-tripped through a
    // CMS. A trailing `\r` on the key would make every value end in one.
    const e = await parse('---\r\ntitle: T\r\n---\r\n# H\r\n')
    expect(e?.frontmatter.title).toBe('T')
    expect(e?.headings.map((h) => h.text)).toEqual(['H'])
  })

  it('returns null for a slug that does not exist', async () => {
    await parse(fm('title: T'))
    expect(getContentEntry(tmpDir, 'docs', 'nope')).toBeNull()
  })

  it('returns null for a collection that does not exist', async () => {
    await parse(fm('title: T'))
    expect(getContentEntry(tmpDir, 'nope', 'page')).toBeNull()
  })
})
