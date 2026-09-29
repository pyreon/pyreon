/**
 * `parseFrontmatter` — the first-party replacement for `gray-matter`.
 *
 * Two halves:
 *
 *  1. A DIFFERENTIAL corpus run against gray-matter itself (kept as a
 *     devDependency for exactly this). The split rules and every YAML shape
 *     real frontmatter uses must produce the same `{ data, content }`. The
 *     corpus covers each split rule gray-matter implements (BOM, `----`,
 *     language line, missing close, CR/LF after the close, comment-only
 *     block) plus the YAML 1.1 features js-yaml's safe schema had that
 *     frontmatter commonly relies on (timestamps, `<<` merge keys).
 *
 *  2. The DELIBERATE divergences, each pinned so a future change to them
 *     is a conscious one: YAML 1.2 number/string semantics where js-yaml 3
 *     applied YAML 1.1 (`010`, `1:30`, `1_000`), `---js` refused (gray-matter
 *     `eval`ed it), non-object frontmatter refused, `~` → `{}`.
 */
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from '../pipeline/frontmatter'

const grayMatter = (source: string) => {
  // gray-matter memoizes by input string in a module-level cache; clear it
  // so one case can never answer for another.
  ;(matter as unknown as { clearCache: () => void }).clearCache()
  const r = matter(source)
  return { data: r.data, content: r.content }
}

const CORPUS: Array<[string, string]> = [
  ['no frontmatter', '# Title\n\nbody'],
  ['empty source', ''],
  ['basic', '---\ntitle: Hello\n---\n# Body'],
  ['nested + lists', '---\ntitle: Hi\nsidebar:\n  group: Guide\n  order: 3\ntags: [a, b]\nlist:\n  - x\n  - y\n---\nbody'],
  ['scalars', '---\nn: 42\nf: 1.5\nneg: -3\nt: true\nfl: false\nnul: null\ntilde: ~\nempty:\nexp: 1e3\nhex: 0x1F\ninf: .inf\n---\nb'],
  ['quoted strings', `---\na: "x: y"\nb: 'it''s'\nc: "\\u00e9\\n"\nd: '0.20.0'\ne: "true"\n---\n`],
  ['block scalars', '---\nlit: |\n  line one\n  line two\nfold: >\n  folded\n  text\nstrip: |-\n  x\n---\nbody'],
  ['timestamps', '---\nday: 2024-01-15\nat: 2024-01-15T10:30:00Z\nspaced: 2001-12-14 21:59:43.10 -5\n---\nb'],
  ['anchors + merge', '---\nbase: &b\n  a: 1\n  b: 2\nx:\n  <<: *b\n  b: 3\nref: *b\n---\nb'],
  ['comments', '---\n# leading comment\ntitle: X # trailing\n---\nb'],
  ['comment-only block', '---\n# just a comment\n---\nbody'],
  ['empty block', '---\n---\nbody'],
  ['whitespace-only block', '---\n   \n---\nbody'],
  ['BOM', '\ufeff---\ntitle: X\n---\nbody'],
  ['BOM without frontmatter', '\ufeffbody'],
  ['four dashes is not frontmatter', '----\ntitle: X\n----\nbody'],
  ['frontmatter not at start', '\n---\ntitle: X\n---\nbody'],
  ['yaml language line', '---yaml\ntitle: X\n---\nbody'],
  ['yml language line', '---yml\ntitle: X\n---\nbody'],
  ['json language line', '---json\n{"title": "X", "n": [1, 2]}\n---\nbody'],
  ['trailing space after open', '--- \ntitle: X\n---\nbody'],
  ['CRLF', '---\r\ntitle: X\r\n---\r\nbody\r\nmore'],
  ['no close delimiter', '---\ntitle: X\nmore: y'],
  ['close at EOF', '---\ntitle: X\n---'],
  ['longer close line', '---\ntitle: X\n-----\nbody'],
  ['blank line after close kept once', '---\ntitle: X\n---\n\nbody'],
  ['--- later in body', '---\ntitle: X\n---\nbody\n---\nmore'],
  ['unicode', '---\ntitle: Příliš žluťoučký 🐎\n---\nbody'],
  ['deep nesting', '---\na:\n  b:\n    c:\n      - d: 1\n        e: [x, {f: g}]\n---\n'],
  ['empty collections', '---\na: []\nb: {}\n---\n'],
  ['keys with dashes and dots', '---\nog-image: x.png\nmeta.title: y\n---\n'],
]

describe('parseFrontmatter — differential against gray-matter', () => {
  it.each(CORPUS)('%s', (_label, source) => {
    expect(parseFrontmatter(source)).toEqual(grayMatter(source))
  })

  it('timestamps stay Date instances, like js-yaml produced', () => {
    const { data } = parseFrontmatter('---\nday: 2024-01-15\n---\n')
    expect(data.day).toBeInstanceOf(Date)
    expect((data.day as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z')
  })
})

describe('parseFrontmatter — malformed input throws', () => {
  it.each([
    ['unbalanced flow', '---\nthis: [is: not: valid: yaml\n---\nbody'],
    ['duplicate key', '---\na: 1\na: 2\n---\n'],
    ['bad indentation', '---\na:\n  b: 1\n c: 2\n---\n'],
    ['malformed json', '---json\n{title: X}\n---\n'],
  ])('%s', (_label, source) => {
    expect(() => parseFrontmatter(source)).toThrow()
    // gray-matter threw on the same input — the throw is parity, not new.
    expect(() => grayMatter(source)).toThrow()
  })
})

describe('parseFrontmatter — control characters', () => {
  // js-yaml refused these in every VALUE position; `yaml` alone would pass
  // them straight through to the page. The refusal is kept (a NUL or ESC in
  // a <title> is never intended), and `@pyreon/lathe` relies on it: its docs
  // emitter strips exactly this set, and its tests assert against this reader.
  const CONTROLS: Array<[string, string]> = [
    ['NUL', '\x00'],
    ['BEL', '\x07'],
    ['BS', '\x08'],
    ['VT', '\x0b'],
    ['FF', '\x0c'],
    ['ESC', '\x1b'],
    ['US', '\x1f'],
  ]
  for (const [name, ch] of CONTROLS) {
    for (const [form, body] of [
      ['plain', `title: a${ch}b`],
      ['double-quoted', `title: "a${ch}b"`],
      ['single-quoted', `title: 'a${ch}b'`],
      ['key', `a${ch}b: 1`],
    ] as const) {
      it(`refuses ${name} in a ${form} scalar, as gray-matter did`, () => {
        const src = `---\n${body}\n---\n`
        expect(() => grayMatter(src)).toThrow()
        expect(() => parseFrontmatter(src)).toThrow(/control character/)
      })
    }
  }

  it('names the file line and column', () => {
    expect(() => parseFrontmatter('---\ntitle: ok\nother: "a\x07b"\n---\n')).toThrow(
      'U+0007 at line 3, column 10',
    )
  })

  it('keeps TAB, LF and CR legal', () => {
    expect(parseFrontmatter('---\ntitle: "a\tb"\r\n---\n').data).toEqual({ title: 'a\tb' })
  })
})

describe('parseFrontmatter — deliberate divergences from gray-matter', () => {
  it('refuses a control character inside a comment (js-yaml skipped comments)', () => {
    const src = '---\ntitle: x # a\x07b\n---\n'
    expect(grayMatter(src).data).toEqual({ title: 'x' })
    expect(() => parseFrontmatter(src)).toThrow(/control character/)
  })

  it('refuses DEL inside quotes (js-yaml passed it through)', () => {
    const src = '---\ntitle: "a\x7fb"\n---\n'
    expect(grayMatter(src).data).toEqual({ title: 'a\x7fb' })
    expect(() => parseFrontmatter(src)).toThrow(/U\+007F/)
  })

  it('reads numbers with YAML 1.2 rules, not js-yaml 3\u2019s YAML 1.1 ones', () => {
    const src = '---\noctal: 010\nsexagesimal: 1:30\nunderscore: 1_000\n---\n'
    expect(parseFrontmatter(src).data).toEqual({
      octal: 10,
      sexagesimal: '1:30',
      underscore: '1_000',
    })
    // What gray-matter (js-yaml 3) produced — recorded so the change is visible.
    expect(grayMatter(src).data).toEqual({ octal: 8, sexagesimal: 90, underscore: 1000 })
  })

  it('refuses JavaScript frontmatter instead of eval-ing it', () => {
    const src = '---js\n{ title: "X" }\n---\nbody'
    expect(() => parseFrontmatter(src)).toThrow(/JavaScript frontmatter/)
  })

  it.each(['coffee', 'toml', 'weird'])('refuses the unsupported language %s', (lang) => {
    expect(() => parseFrontmatter(`---${lang}\na = 1\n---\n`)).toThrow(/Unsupported frontmatter language/)
  })

  it.each([
    ['a bare scalar', '---\njust a string\n---\n', /got a string/],
    ['a list', '---\n- a\n- b\n---\n', /got a list/],
    ['a json array', '---json\n[1, 2]\n---\n', /got a list/],
  ])('refuses %s as frontmatter', (_label, src, message) => {
    expect(() => parseFrontmatter(src)).toThrow(message)
  })

  it('reads a null block (`~`) as an empty object', () => {
    expect(parseFrontmatter('---\n~\n---\nbody')).toEqual({ data: {}, content: 'body' })
  })

  it('returns a FRESH data object per call (gray-matter shared a cached one)', () => {
    const src = '---\ntitle: X\n---\n'
    const a = parseFrontmatter(src)
    a.data.title = 'mutated'
    expect(parseFrontmatter(src).data.title).toBe('X')
  })
})
