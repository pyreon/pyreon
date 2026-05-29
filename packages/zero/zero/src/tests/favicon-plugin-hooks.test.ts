/**
 * Regression lock for the `faviconPlugin` `transformIndexHtml`
 * cache-bust integration that #655 shipped but only proved via a
 * manual `vite build` — there was no committed automated test
 * (`favicon-version.test.ts` only locks the pure `faviconVersionQuery`
 * function, NOT its integration into the injected `<head>` tags, which
 * is the actual regression surface: a refactor of `transformIndexHtml`
 * dropping the stamp loop would silently reintroduce un-bustable
 * favicons).
 *
 * Locks:
 *  1. `transformIndexHtml` stamps `?v=<hash>` onto EVERY injected
 *     favicon/manifest `<link>` href (browsers cache favicons forever;
 *     a changed icon on a stable URL is never re-fetched). The
 *     theme-swap `<script>` and `theme-color` `<meta>` must NOT be
 *     stamped (swap toggles `media`, not `href`).
 *  2. `generateBundle` is a no-op in dev (serve) — iteration not
 *     blocked.
 *
 * Sharp-free + fast (no `vite build`, no `sharp` install) — a cheap CI
 * gate, deliberately NOT a `verify-modes` cell (that would force the
 * heavy `sharp` native dep onto every CI run for coverage that's
 * largely redundant with this + #655's real-build proof).
 *
 * NOT unit-asserted here: the production loud-fail "no sharp ⇒ hard
 * error". `sharp` IS resolvable in @pyreon/zero's test context, so
 * `await import('sharp')` succeeds and the loud-fail branch is
 * unreachable from a unit test. Forcing it would require mocking the
 * dynamic `import('sharp')` — testing the mock, not reality, which the
 * repo's test-environment-parity rule explicitly forbids. The loud-fail
 * remains covered by #655's dependency-free real-`vite build` proof
 * (built with `sharp` uninstalled → build aborted, no `dist`).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { faviconPlugin } from '../favicon'

let dir: string
const VQ = /\?v=[0-9a-f]{8}$/

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pyreon-favhooks-'))
  await writeFile(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await writeFile(join(dir, 'dark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" fill="#000"/>')
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

type Tag = { tag: string; attrs: Record<string, string>; children?: string }

function tagsFor(cfg: Record<string, unknown>): Tag[] {
  const p = faviconPlugin({ source: 'icon.svg', ...cfg } as never) as any
  // configResolved sets the closure `root` getVersionQuery() reads.
  p.configResolved({ root: dir, command: 'serve' })
  return (p.transformIndexHtml as () => Tag[])()
}

describe('faviconPlugin transformIndexHtml — ?v= cache-bust stamping', () => {
  it('stamps ?v=<8hex> on every injected <link> href (single-variant)', () => {
    const tags = tagsFor({})
    const links = tags.filter((t) => t.tag === 'link')
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(l.attrs.href).toMatch(VQ)
    // theme-color <meta> has no href and must not be stamped.
    const meta = tags.find((t) => t.tag === 'meta')
    expect(meta?.attrs.href).toBeUndefined()
    expect(JSON.stringify(meta)).not.toMatch(/\?v=/)
  })

  it('stamps every light/dark + svg + manifest link, leaves the swap <script> unstamped (dark variant)', () => {
    const tags = tagsFor({ darkSource: 'dark.svg' })
    const links = tags.filter((t) => t.tag === 'link')
    // svg + 6 light/dark png/apple + manifest
    expect(links.length).toBeGreaterThanOrEqual(8)
    for (const l of links) expect(l.attrs.href).toMatch(VQ)
    const script = tags.find((t) => t.tag === 'script')
    expect(script).toBeDefined() // theme-swap script present…
    expect(script!.children ?? '').not.toMatch(/\?v=/) // …and not stamped
  })

  it('all stamped links share ONE stable query (same source ⇒ one hash)', () => {
    const links = tagsFor({}).filter((t) => t.tag === 'link')
    const qs = new Set(links.map((l) => l.attrs.href.match(/\?v=[0-9a-f]{8}$/)?.[0]))
    expect(qs.size).toBe(1)
  })

  it('unreadable source ⇒ no ?v= (graceful, never breaks the build)', () => {
    const p = faviconPlugin({ source: 'does-not-exist.svg' } as never) as any
    p.configResolved({ root: dir, command: 'serve' })
    const links = (p.transformIndexHtml as () => Tag[])().filter((t: Tag) => t.tag === 'link')
    for (const l of links) expect(l.attrs.href).not.toMatch(/\?v=/)
  })
})

describe('faviconPlugin generateBundle — dev is not blocked', () => {
  it('dev (serve) ⇒ generateBundle is a no-op before any sharp/emit work', async () => {
    const p = faviconPlugin({ source: 'icon.svg' } as never) as any
    p.configResolved({ root: dir, command: 'serve' })
    // `if (!isBuild) return` — returns before the sharp check and any
    // `this.emitFile`, so a bare ctx is sufficient and it must resolve.
    await expect(
      (p.generateBundle as () => Promise<void>).call({} as never),
    ).resolves.toBeUndefined()
  })
})

describe('faviconPlugin transformIndexHtml — SVG favicon is theme-aware (regression)', () => {
  const svgLinks = (cfg: Record<string, unknown>) =>
    tagsFor(cfg).filter((t) => t.tag === 'link' && t.attrs.type === 'image/svg+xml')

  it('single-variant (no darkSource) → ONE static /favicon.svg, no data-favicon-theme', () => {
    const svgs = svgLinks({})
    expect(svgs).toHaveLength(1)
    expect(svgs[0]!.attrs.href).toMatch(/^\/favicon\.svg(\?v=[0-9a-f]{8})?$/)
    expect(svgs[0]!.attrs['data-favicon-theme']).toBeUndefined()
  })

  it('dark variant → TWO theme-aware SVG links (light active, dark media="not all"), NO static /favicon.svg', () => {
    const svgs = svgLinks({ darkSource: 'dark.svg' })
    // THE BUG: pre-fix this was a single `/favicon.svg` with no
    // `data-favicon-theme`. Browsers prefer SVG over the theme-toggled
    // PNGs, so the favicon never followed the theme. Post-fix: two
    // links carrying the same `data-favicon-theme` contract the PNG
    // dual-variant + theme-swap script use.
    expect(svgs).toHaveLength(2)

    const light = svgs.find((l) => l.attrs['data-favicon-theme'] === 'light')
    const dark = svgs.find((l) => l.attrs['data-favicon-theme'] === 'dark')
    expect(light).toBeDefined()
    expect(dark).toBeDefined()
    expect(light!.attrs.href).toMatch(/^\/favicon-light\.svg/)
    expect(dark!.attrs.href).toMatch(/^\/favicon-dark\.svg/)
    expect(light!.attrs.media).toBeUndefined() // light active by default
    expect(dark!.attrs.media).toBe('not all') // dark hidden until swapped
    // The static, non-theme-aware /favicon.svg must NOT be injected
    // (it would out-prioritise the variants and re-introduce the bug).
    expect(svgs.some((l) => /^\/favicon\.svg/.test(l.attrs.href))).toBe(false)

    // Still carries the same data-favicon-theme contract the swap
    // script toggles — proves it participates in reactive switching.
    const tags = tagsFor({ darkSource: 'dark.svg' })
    const script = tags.find((t) => t.tag === 'script')
    expect(script?.children ?? '').toContain('data-favicon-theme')
  })
})
