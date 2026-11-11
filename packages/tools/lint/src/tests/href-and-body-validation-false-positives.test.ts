import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * Two false positives a freshly scaffolded create-zero project reported:
 *
 * - `no-href-navigation` flagged `<a href="/api/rss">` in the blog layout. An
 *   API route or a file is not a page; `<Link>` would hand it to the client
 *   router, which renders the not-found route. A plain `<a>` is right there,
 *   as it is with `download` or `target`.
 * - `no-unvalidated-request-body` only recognised validators named exactly
 *   `parse` / `validate` / …, so a hand-written `parseNewPost(body)` looked like
 *   no validation at all.
 */
const ROUTER = `import { useRouter } from '@pyreon/router'\nvoid useRouter\n`
const href = (jsx: string) =>
  lintFile('/p/src/routes/_layout.tsx', `${ROUTER}export const L = () => ${jsx}\n`, allRules, {
    rules: { 'pyreon/no-href-navigation': 'warn' },
  }).diagnostics.length

describe('no-href-navigation — resources that are not pages', () => {
  it('API routes, files, downloads and new browsing contexts are not flagged', () => {
    expect(href(`<a href="/api/rss">RSS</a>`)).toBe(0)
    expect(href(`<a href="/api/signout?next=/">Sign out</a>`)).toBe(0)
    expect(href(`<a href="/blog/rss.xml">RSS</a>`)).toBe(0)
    expect(href(`<a href="/files/report.pdf">PDF</a>`)).toBe(0)
    expect(href(`<a href="//cdn.example.com/x">x</a>`)).toBe(0)
    expect(href(`<a href={props.url} target="_blank" rel="noreferrer">x</a>`)).toBe(0)
    expect(href(`<a href="/export" download>CSV</a>`)).toBe(0)
  })

  it('page links are still flagged', () => {
    expect(href(`<a href="/about">About</a>`)).toBe(1)
    expect(href(`<a href="/posts/page.html">x</a>`)).toBe(1)
    expect(href(`<a href="/apidocs">x</a>`)).toBe(1)
    expect(href(`<a href={dynamic}>x</a>`)).toBe(1)
  })
})

const body = (src: string) =>
  lintFile('/p/src/routes/api/posts.ts', src, allRules, {
    rules: { 'pyreon/no-unvalidated-request-body': 'warn' },
  }).diagnostics.length

describe('no-unvalidated-request-body — named validators', () => {
  const handler = (validate: string) => `declare function ${validate}(x: unknown): { title: string } | null
export async function POST(ctx: { request: Request }) {
  const raw = await ctx.request.json()
  const post = ${validate}(raw)
  return Response.json(post)
}`

  it('a validator named for what it validates counts', () => {
    for (const name of ['parseNewPost', 'validateSignup', 'assertUser', 'safeParseBody', 'decodeEvent']) {
      expect(body(handler(name)), name).toBe(0)
    }
  })

  it('a name that merely starts with the same letters does not', () => {
    for (const name of ['checkout', 'parser', 'decoderFor', 'assertive']) {
      expect(body(handler(name)), name).toBe(1)
    }
  })

  it('an unvalidated cast is still reported', () => {
    const src = `export async function POST(ctx: { request: Request }) {
  const b = (await ctx.request.json()) as { title: string }
  return Response.json(b.title)
}`
    expect(body(src)).toBe(1)
  })
})

const mapIn = (expr: string) =>
  lintFile('/p/src/a.tsx', `declare const items: any[]\ndeclare const T: any\nexport const C = () => ${expr}\n`, allRules, {
    rules: { 'pyreon/no-map-in-jsx': 'warn' },
  }).diagnostics.length

describe('no-map-in-jsx — only maps that render', () => {
  it('a map that builds data inside JSX is not a <For> candidate', () => {
    // The create-zero dashboard invoice: rows for a document table.
    expect(mapIn(`<T rows={[["a", "b"], ...items.map((it) => [it.a, String(it.b)])]} />`)).toBe(0)
    expect(mapIn(`<i class={items.map((x) => x.cls).join(" ")} />`)).toBe(0)
  })

  it('a map that renders elements is still reported, in every callback shape', () => {
    expect(mapIn(`<ul>{items.map((x) => <li>{x}</li>)}</ul>`)).toBe(1)
    expect(mapIn(`<ul>{items.map((x) => { const y = x * 2; return <li>{y}</li> })}</ul>`)).toBe(1)
    expect(mapIn(`<ul>{items.map((x) => (x ? <li>{x}</li> : null))}</ul>`)).toBe(1)
    expect(mapIn(`<ul>{items.map(renderRow)}</ul>`)).toBe(1)
  })
})
