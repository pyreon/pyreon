/**
 * PR-F audit regression specs.
 *
 *   H7 — local images route through `<Image>` with `import('./X?optimize')`.
 *   H8 — `[foo](./bar.md)` rewrites to the route URL.
 */
import { describe, expect, it } from 'vitest'
import { isRelativePath, makeInternalLinkResolver } from '../plugin'
import { compileMarkdown } from '../pipeline/parse'

describe('PR-F H8 — isRelativePath classifier', () => {
  it.each([
    ['./foo.md', true],
    ['../foo.md', true],
    ['./nested/foo.md', true],
    ['../../up.md', true],
    ['https://example.com', false],
    ['http://example.com', false],
    ['//cdn.example.com', false],
    ['mailto:a@b.c', false],
    ['data:image/png;base64,abc', false],
    ['#anchor', false],
    ['/abs/foo', false],
    ['bare-no-prefix.md', false],
    ['', false],
  ])('isRelativePath(%j) === %j', (href, expected) => {
    expect(isRelativePath(href)).toBe(expected)
  })
})

describe('PR-F H8 — makeInternalLinkResolver', () => {
  it('rewrites `[foo](./other.md)` to a route URL', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/router.md',
    )!
    expect(resolver('./loaders.md')).toBe('/docs/loaders')
  })

  it('rewrites nested-directory `.md` links', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/router.md',
    )!
    expect(resolver('./advanced/loaders.md')).toBe('/docs/advanced/loaders')
  })

  it('preserves a `#anchor` suffix', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/router.md',
    )!
    expect(resolver('./loaders.md#loader-keys')).toBe(
      '/docs/loaders#loader-keys',
    )
  })

  it('collapses `/index` so a docs root resolves to the bare collection path', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/intro.md',
    )!
    expect(resolver('./index.md')).toBe('/docs')
  })

  it('handles `.mdx` extension too', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/x.md',
    )!
    expect(resolver('./y.mdx')).toBe('/docs/y')
  })

  it('returns null for non-relative URLs (so the emitter passes through)', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/x.md',
    )!
    expect(resolver('https://example.com')).toBeNull()
    expect(resolver('/abs/url')).toBeNull()
    expect(resolver('mailto:a@b')).toBeNull()
    expect(resolver('#anchor')).toBeNull()
  })

  it('returns null for relative non-.md targets (so static assets are left alone)', () => {
    const resolver = makeInternalLinkResolver(
      '/abs/p/src/content/docs/x.md',
    )!
    expect(resolver('./schema.json')).toBeNull()
    expect(resolver('./hero.png')).toBeNull()
  })

  it('returns null when the file is OUTSIDE a `/content/` tree (no collection)', () => {
    const resolver = makeInternalLinkResolver('/random/path.md')!
    expect(resolver('./other.md')).toBeNull()
  })
})

describe('PR-F end-to-end — compileMarkdown wires the rewriters', () => {
  it('rewrites internal markdown links inside the compiled body', async () => {
    const result = await compileMarkdown(
      'See [the loaders page](./loaders.md) for more.',
      '/abs/p/src/content/docs/router.md',
      {
        highlight: false,
        resolveInternalLink: (href) =>
          href === './loaders.md' ? '/docs/loaders' : null,
      },
    )
    expect(result.code).toContain('href={"/docs/loaders"}')
    expect(result.code).not.toContain('href={"./loaders.md"}')
  })

  it('routes local images through `<Image>` with the dynamic import', async () => {
    const result = await compileMarkdown(
      '![hero](./hero.png)',
      '/abs/p/src/content/docs/router.md',
      {
        highlight: false,
        resolveLocalImage: (src) =>
          src.startsWith('./') ? `import(${JSON.stringify(src + '?optimize')})` : null,
      },
    )
    expect(result.code).toContain('<Image src={import("./hero.png?optimize")}')
    expect(result.code).toContain('alt={"hero"}')
    // The componentRefs include `Image` so the plugin auto-imports it
    // through `virtual:zero-content/components`.
    expect(result.componentRefs).toContain('Image')
  })

  it('falls back to plain <img> for absolute or data URIs', async () => {
    const result = await compileMarkdown(
      '![one](https://cdn.example.com/a.png)\n\n![two](data:image/png;base64,abcd)',
      '/abs/p/src/content/docs/router.md',
      {
        highlight: false,
        resolveLocalImage: (src) =>
          src.startsWith('./') ? `import(${JSON.stringify(src + '?optimize')})` : null,
      },
    )
    expect(result.code).toContain('<img src={"https://cdn.example.com/a.png"}')
    expect(result.code).toContain('<img src={"data:image/png;base64,abcd"}')
    expect(result.code).not.toContain('<Image src={import(')
    expect(result.componentRefs).not.toContain('Image')
  })
})
