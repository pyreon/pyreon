/**
 * Heading slugs, images, MDX elements, and the unknown-directive
 * fallback.
 *
 * **Slug dedup** decides where every deep link on the site lands. Two
 * sections called "Options" on one page produce one slug; without the
 * suffix both `id`s are identical, and the browser scrolls to the FIRST
 * one for both links — so half the table of contents is silently wrong
 * and nothing anywhere reports it. The captured `slug` and the emitted
 * `id` must take the SAME deduped value, or the TOC points at anchors
 * that do not exist.
 *
 * **Images** route local paths through zero's `<Image>` (optimisation,
 * lazy loading, a blur placeholder) and leave remote ones as `<img>`.
 * Getting it backwards either breaks a remote image outright or drops
 * the optimisation for every local one — the page renders either way.
 *
 * **The unknown-directive fallback** is a deliberate safety property: an
 * unrecognised `:name` renders AS WRITTEN rather than vanishing, so a
 * typo is visible on the page instead of silently deleting content.
 */
import { describe, expect, it } from 'vitest'
import { dedupeSlug, emitJsx, escapeJsxText, slugify } from '../pipeline/emit-jsx'
import type { Root } from 'mdast'

const text = (value: string) => ({ type: 'text', value })
const heading = (depth: number, value: string) =>
  ({ type: 'heading', depth, children: [text(value)] })

const run = (children: unknown[], opts = {}) =>
  emitJsx({ type: 'root', children } as Root, opts as never)

describe('heading slugs are deduplicated, and the id matches the TOC', () => {
  it('slugs a heading and captures it', async () => {
    // The control.
    const out = await run([heading(2, 'Getting Started')])
    expect(out.headings[0]!.slug).toBe('getting-started')
    expect(out.body).toContain('getting-started')
  })

  it('SUFFIXES a repeated slug and keeps id and TOC in agreement', async () => {
    // Two sections called "Options" is ordinary in API docs. Without the
    // suffix both ids are identical and every link to the second scrolls
    // to the first — half the TOC silently wrong.
    const out = await run([heading(2, 'Options'), heading(2, 'Options'), heading(2, 'Options')])
    const slugs = out.headings.map((h) => h.slug)
    expect(slugs).toEqual(['options', 'options-2', 'options-3'])
    for (const s of slugs) {
      expect(out.body, `id must exist for ${s}`).toContain(`"${s}"`)
    }
  })

  it('dedupes across a SHARED set, so one page never collides with itself', async () => {
    // The set is threaded through the whole walk; a fresh one per node
    // would make every heading think it is the first.
    const used = new Set<string>()
    const a = await run([heading(2, 'Same')], { _usedSlugs: used })
    const b = await run([heading(2, 'Same')], { _usedSlugs: used })
    expect(a.headings[0]!.slug).toBe('same')
    expect(b.headings[0]!.slug).toBe('same-2')
  })

  it('works with no set supplied', async () => {
    // The `?? new Set()` default — a direct caller need not thread one.
    const out = await run([heading(2, 'A'), heading(2, 'A')])
    expect(out.headings.map((h) => h.slug)).toEqual(['a', 'a-2'])
  })

  it('captures levels 2..6 by default and excludes h1', async () => {
    // h1 is the page title, not a TOC entry. The h4+ levels were once
    // dropped silently, leaving authors no recourse.
    const out = await run([1, 2, 3, 4, 5, 6].map((d) => heading(d, `H${d}`)))
    expect(out.headings.map((h) => h.text)).toEqual(['H2', 'H3', 'H4', 'H5', 'H6'])
  })

  it('honours a configured minimum level', async () => {
    const out = await run([heading(2, 'A'), heading(3, 'B')], { headingsMinLevel: 3 })
    expect(out.headings.map((h) => h.text)).toEqual(['B'])
  })

  it('dedupeSlug and slugify behave on the shapes markdown produces', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
    expect(slugify('  spaced  out  ')).toBe('spaced-out')
    expect(slugify('')).toBe('')
    const used = new Set(['a'])
    expect(dedupeSlug('a', used)).toBe('a-2')
    expect(dedupeSlug('b', used)).toBe('b')
  })
})

describe('images route local paths through <Image> and leave remote alone', () => {
  const image = (url: string, over: Record<string, unknown> = {}) =>
    ({ type: 'image', url, alt: 'A', ...over })

  it('uses <Image> when the resolver returns an expression', async () => {
    const out = await run([image('./hero.png')], {
      resolveLocalImage: (s: string) => `import(${JSON.stringify(s)})`,
    })
    expect(out.body).toContain('<Image')
    expect(out.body).toContain('./hero.png')
  })

  it('falls back to <img> when the resolver DECLINES', async () => {
    // Absolute URLs and data URIs return null — routing them through the
    // optimiser breaks them outright.
    const out = await run([image('https://cdn.com/a.png')], {
      resolveLocalImage: () => null,
    })
    expect(out.body).toContain('<img')
    expect(out.body).not.toContain('<Image')
  })

  it('falls back to <img> when there is NO resolver', async () => {
    expect((await run([image('./a.png')])).body).toContain('<img')
  })

  it('emits an EMPTY alt rather than undefined', async () => {
    // `alt={undefined}` is a missing alt to a screen reader; `alt=""`
    // is a declared-decorative image. They are not the same.
    const out = await run([{ type: 'image', url: '/a.png' }])
    expect(out.body, 'a JSON-literal expression, so the empty string is explicit')
      .toContain('alt={""}')
    expect(out.body).not.toContain('undefined')
  })

  it('carries a title only when present', async () => {
    expect((await run([image('/a.png', { title: 'T' })])).body).toContain('title=')
    expect((await run([image('/a.png')])).body).not.toContain('title=')
  })
})

describe('an unrecognised directive renders AS WRITTEN', () => {
  it('reconstructs the text form rather than dropping it', async () => {
    // Vanishing is the worse failure: a typo silently deletes content
    // and the author sees a gap they cannot explain.
    const out = await run([{
      type: 'paragraph',
      children: [{ type: 'textDirective', name: 'unknown', children: [] }],
    }])
    expect(out.body).toContain(':unknown')
  })

  it('uses the DOUBLE marker for the leaf form', async () => {
    // `::leaf` and `:text` are different syntax; reconstructing the
    // wrong one changes what the author reads back.
    const out = await run([{ type: 'leafDirective', name: 'leaf', children: [] }])
    expect(out.body).toContain('::leaf')
  })

  it('reconstructs a bracketed label too', async () => {
    const out = await run([{
      type: 'leafDirective', name: 'x', children: [text('the label')],
    }])
    expect(out.body).toContain('::x')
    expect(out.body).toContain('the label')
  })

  it('escapes the reconstructed text', async () => {
    // It is still going into JSX; an unescaped brace fails the build.
    const out = await run([{ type: 'leafDirective', name: 'a{b}', children: [] }])
    expect(out.body).not.toContain('{b}')
  })
})

describe('MDX elements', () => {
  it('self-closes an element with no children', async () => {
    const out = await run([{
      type: 'mdxJsxFlowElement', name: 'Tabs', attributes: [], children: [],
    }])
    expect(out.body).toContain('<Tabs />')
  })

  it('emits a FRAGMENT for an anonymous element', async () => {
    // `<>…</>` in MDX has a null name. Emitting `<undefined />` fails
    // the build with a message naming nothing.
    const out = await run([{
      type: 'mdxJsxFlowElement', name: null, attributes: [], children: [],
    }])
    expect(out.body).toContain('<>')
    expect(out.body).not.toContain('undefined')
  })

  it('reports the component name to the ref collector', async () => {
    // This is what feeds the unknown-component diagnostic; a missed
    // reference means a typo goes unreported.
    const seen: string[] = []
    await run(
      [{ type: 'mdxJsxFlowElement', name: 'Tabs', attributes: [], children: [] }],
      { mdxComponentRef: (n: string) => seen.push(n) },
    )
    expect(seen).toEqual(['Tabs'])
  })
})

describe('code blocks carry a line count for the gutter', () => {
  it('counts lines, and reports 0 for an empty block', async () => {
    // A gutter numbered from an off-by-one is visibly wrong on every
    // sample; an empty block must not report 1.
    const three = await run([{ type: 'code', value: 'a\nb\nc', lang: 'ts' }])
    expect(three.body).toContain('3')
    const empty = await run([{ type: 'code', value: '', lang: 'ts' }])
    expect(empty.body).not.toContain('lineCount={1}')
  })
})

describe('escapeJsxText neutralises what JSX would interpret', () => {
  it('escapes braces and angle brackets', () => {
    // An unescaped `{` opens a JSX expression and the whole page fails
    // to compile — the one failure here that is not silent.
    const out = escapeJsxText('a {b} <c> d')
    expect(out).not.toContain('{b}')
    expect(out).not.toContain('<c>')
  })

  it('leaves ordinary prose untouched', () => {
    expect(escapeJsxText('plain words')).toBe('plain words')
  })
})
