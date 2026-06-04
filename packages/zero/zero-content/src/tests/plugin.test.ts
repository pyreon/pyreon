/**
 * Vite plugin contract: `transform` returns Pyreon JSX for `.md` /
 * `.mdx` inputs, passes through everything else.
 */
import { describe, expect, it, vi } from 'vitest'
import content, { isMarkdownId, shortId } from '../plugin'

describe('content() Vite plugin', () => {
  it('has the expected name + `pre` ordering', () => {
    const plugin = content({ compileJsx: false })
    expect(plugin.name).toBe('pyreon-zero-content')
    expect(plugin.enforce).toBe('pre')
  })

  it('transforms .md files into TSX modules', async () => {
    const plugin = content({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string; map: null } | null>
    const result = await transform.call({} as never, '# Title', '/abs/x.md')
    expect(result).not.toBeNull()
    expect(result!.code).toContain('export default function ContentPage()')
    expect(result!.code).toContain('<h1')
  })

  it('passes through non-markdown files (returns null)', async () => {
    const plugin = content({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>
    expect(await transform.call({} as never, '// js', '/abs/x.ts')).toBeNull()
    expect(await transform.call({} as never, '<div/>', '/abs/x.tsx')).toBeNull()
    expect(await transform.call({} as never, '{}', '/abs/x.json')).toBeNull()
  })

  it('transforms .mdx files (foundation; PR 3 makes them MDX-aware)', async () => {
    const plugin = content({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const result = await transform.call({} as never, '# Title', '/abs/x.mdx')
    expect(result).not.toBeNull()
  })

  it('forwards highlight + highlighter options through to compileMarkdown', async () => {
    // When BOTH options are set, the defensive `!== undefined` branches
    // both fire — exercises the `opts.highlight = ...` / `opts.highlighter
    // = ...` assignment arms.
    const plugin = content({
      highlight: true,
      highlighter: { themes: { light: 'github-light', dark: 'github-dark' } },
      compileJsx: false,
    })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const result = await transform.call(
      {} as never,
      '```ts\nconst x = 1\n```',
      '/abs/x.md',
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain('<CodeBlock')
  })

  it('forwards only `highlight` when `highlighter` is omitted', async () => {
    // Covers the asymmetric `highlight !== undefined` branch without
    // setting `highlighter`.
    const plugin = content({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const result = await transform.call(
      {} as never,
      '```ts\nx\n```',
      '/abs/x.md',
    )
    expect(result!.code).not.toContain('<CodeBlock')
  })

  it('forwards only `highlighter` when `highlight` is omitted', async () => {
    // Covers the asymmetric `highlighter !== undefined` branch — the
    // plugin defaults to highlighting (compileMarkdown.highlight !==
    // false), so the supplied highlighter still flows through.
    const plugin = content({
      highlighter: { themes: { light: 'github-light', dark: 'github-dark' } },
      compileJsx: false,
    })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<{ code: string } | null>
    const result = await transform.call(
      {} as never,
      '```ts\nx\n```',
      '/abs/x.md',
    )
    expect(result!.code).toContain('<CodeBlock')
  })

  it('surfaces compile errors via this.error() with a shortened id', async () => {
    // gray-matter throws on malformed YAML frontmatter. We capture the
    // call to `this.error()` via a stub and assert the message shape.
    const plugin = content({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      this: { error: (msg: string) => void },
      code: string,
      id: string,
    ) => Promise<unknown>
    const errSpy = vi.fn()
    const malformed = '---\nthis: [is: not: valid: yaml\n---\nbody'
    await transform.call(
      { error: errSpy },
      malformed,
      '/abs/project/src/content/docs/broken.md',
    )
    expect(errSpy).toHaveBeenCalledOnce()
    const msg = errSpy.mock.calls[0]![0]
    expect(msg).toContain('[@pyreon/zero-content] failed to compile')
    // shortId trims `/abs/project/` to `src/content/docs/broken.md`.
    expect(msg).toContain('src/content/docs/broken.md')
  })
})

describe('isMarkdownId — ReDoS regression', () => {
  it('handles adversarial query/hash input in O(n)', () => {
    // 10k `#` characters followed by no extension. Old regex pattern
    // `[?#].*$` was reported by CodeQL as polynomial; the string-ops
    // rewrite is O(n).
    const adversarial = '#'.repeat(10000) + 'foo'
    const t0 = performance.now()
    const result = isMarkdownId(adversarial)
    const elapsed = performance.now() - t0
    expect(result).toBe(false)
    // Loose budget — strictly we expect <5ms but CI noise can spike.
    expect(elapsed).toBeLessThan(50)
  })

  it('handles adversarial query/hash input followed by .md correctly', () => {
    // Confirm extension detection still works when query strings are
    // present.
    expect(isMarkdownId('/abs/x.md?'.padEnd(1000, '?'))).toBe(true)
  })
})

describe('shortId', () => {
  it.each([
    ['/abs/project/src/content/docs/zero.md', 'src/content/docs/zero.md'],
    ['/very/long/abs/path/src/x.md', 'src/x.md'],
    // No /src/ in the path — full id is returned.
    ['/abs/random.md', '/abs/random.md'],
    ['', ''],
  ])('shortId(%j) === %j', (input, expected) => {
    expect(shortId(input)).toBe(expected)
  })
})

describe('isMarkdownId', () => {
  it.each([
    ['/abs/x.md', true],
    ['/abs/x.mdx', true],
    ['/abs/x.MD', true],
    ['/abs/x.tsx', false],
    ['/abs/x.json', false],
    ['/abs/x.md?raw', true],   // query-suffixed imports still count
    ['/abs/x.md#anchor', true], // hash-suffixed imports still count
    ['/abs/x.markdown', false], // not a recognized extension
    ['/abs/x', false],
  ])('isMarkdownId(%j) === %j', (input, expected) => {
    expect(isMarkdownId(input)).toBe(expected)
  })
})
