/**
 * Vite plugin contract: `transform` returns Pyreon JSX for `.md` /
 * `.mdx` inputs, passes through everything else.
 */
import { countStringOps } from '@pyreon/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { _setResolvedRootForPaths } from '../internal-server'
import content, { isMarkdownId, reportPath } from '../plugin'

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
    // PR-H audit M12 — plain code blocks now ship through <CodeBlock>
    // too. Authoring features (filename, copy button, line numbers)
    // stay consistent regardless of whether Shiki is enabled.
    expect(result!.code).toContain('<CodeBlock')
    expect(result!.code).toContain('<pre><code>x')
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
    // parseFrontmatter throws on malformed YAML frontmatter. We capture the
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
  // The hazard CodeQL reported was a BACKTRACKING REGEX (`[?#].*$`, quadratic
  // on a long `?`/`#` run that ends in a line break, because `.` stops at
  // `\n` and the match is retried from every position). The fix replaced it
  // with a fixed sequence of indexOf / slice / lastIndexOf / toLowerCase, each
  // one linear pass. So linearity is proved by COUNTING (countStringOps), not
  // by a stopwatch: no regular expression executes, and the number of
  // string-method calls is the same at 1k and 1M characters.
  //
  // This replaced a wall-clock growth ratio that went red on the default
  // branch under Coverage (Full)'s 4-way load (n=2.56M in 1.6 ms, n=20.48M in
  // 47 ms: allocating 20 MB strings, not this function), and whose `'#' +
  // 'foo'` input never reached the old regex's quadratic case: it passed
  // against the vulnerable implementation.
  const countOps = (input: string) => {
    const t = countStringOps(() => isMarkdownId(input))
    return { result: t.result, regexExecs: t.regexSources.length, stringCalls: t.stringCalls }
  }

  // Shapes that are quadratic for `[?#].*$` and for a `\.(md|mdx)$` probe.
  const adversarial = (n: number): Array<[string, boolean]> => [
    [`${'#'.repeat(n)}\nfoo`, false],
    [`${'?'.repeat(n)}\n`, false],
    [`/abs/x.md${'?#'.repeat(n / 2)}\n`, true],
    [`/abs/${'.m'.repeat(n / 2)}`, false],
    [`${'#'.repeat(n)}foo`, false],
  ]

  it('runs no regular expression on adversarial input', () => {
    for (const [input, expected] of adversarial(10_000)) {
      const ops = countOps(input)
      expect(ops.result, JSON.stringify(input.slice(0, 24))).toBe(expected)
      expect(ops.regexExecs, 'a regex is back in isMarkdownId — ReDoS-prone').toBe(0)
    }
  })

  it('makes the same number of string-method calls at 1k and 1M characters', () => {
    const small = adversarial(1_000)
    const large = adversarial(1_000_000)
    for (let i = 0; i < small.length; i++) {
      const a = countOps(small[i]![0])
      // Checked BEFORE the 1M run: a backtracking regex would hang there
      // (synchronous, so no test timeout can interrupt it) instead of failing.
      expect(a.regexExecs, 'a regex is back in isMarkdownId — ReDoS-prone').toBe(0)
      const b = countOps(large[i]![0])
      expect(b.result).toBe(large[i]![1])
      expect(b.stringCalls, `call count grew with input length (shape ${i})`).toBe(a.stringCalls)
    }
  })

  it('handles adversarial query/hash input followed by .md correctly', () => {
    // Confirm extension detection still works when query strings are
    // present.
    expect(isMarkdownId('/abs/x.md?'.padEnd(1000, '?'))).toBe(true)
  })
})

describe('reportPath without a resolved root (the /src/-suffix fallback)', () => {
  it.each([
    ['/abs/project/src/content/docs/zero.md', 'src/content/docs/zero.md'],
    ['/very/long/abs/path/src/x.md', 'src/x.md'],
    // No /src/ in the path — full id is returned.
    ['/abs/random.md', '/abs/random.md'],
    ['', ''],
  ])('reportPath(%j) === %j', (input, expected) => {
    _setResolvedRootForPaths(null)
    expect(reportPath(input)).toBe(expected)
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
