import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Every internal link in the built site resolves: an `href` to a path must
 * name a prerendered page or a file in `docs/dist`, and an `href` with a
 * fragment must name an element `id` (or `<a name>`) on the target page.
 * Reads the static output only (no browser), so it covers every page,
 * marketing and docs, including links inside islands' server HTML.
 *
 * Out of scope: what the Deploy Docs workflow builds beside the site (the
 * Atlas workbench at `/atlas/`, the showcase's live demos at
 * `/showcase/<example>/`), and links that leave the site. Only `<a>`,
 * `<area>` and `<link>` tags count: an href in a code sample is text.
 */
const dist = resolve(__dirname, '../docs/dist')
const ORIGIN = 'https://pyreon.dev'
const DEPLOYED_ELSEWHERE = [/^\/atlas(\/|$)/, /^\/showcase\/[a-z0-9-]+\//]

function htmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      // The Atlas demo is a separate app with its own (relative) links.
      if (full === join(dist, 'demos')) continue
      out.push(...htmlFiles(full))
    } else if (name.endsWith('.html')) out.push(full)
  }
  return out
}

/** The URL path a built file answers. */
function routeOf(file: string): string {
  const rel = file.slice(dist.length).replace(/\\/g, '/')
  if (rel === '/index.html') return '/'
  if (rel.endsWith('/index.html')) return rel.slice(0, -'/index.html'.length)
  return rel
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/** Strip <script>, <style> and comments so their text is not read as markup. */
const markup = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '')

test.describe('internal links', () => {
  test('every href names a page or file that exists, and every #fragment an element on it', () => {
    expect(existsSync(dist), 'build docs/ first').toBe(true)
    const files = htmlFiles(dist)
    const pages = new Map<string, Set<string>>()
    const sources = new Map<string, string>()
    for (const f of files) {
      const html = markup(readFileSync(f, 'utf8'))
      sources.set(routeOf(f), html)
      const ids = new Set<string>()
      for (const m of html.matchAll(/\s(?:id|name)="([^"]+)"/g)) ids.add(decode(m[1] ?? ''))
      pages.set(routeOf(f), ids)
    }
    const resolvePage = (path: string): string | null => {
      const p = path.length > 1 ? path.replace(/\/$/, '') : path
      if (pages.has(p)) return p
      if (pages.has(`${p}.html`)) return `${p}.html`
      return null
    }

    const broken: string[] = []
    for (const [route, html] of sources) {
      for (const m of html.matchAll(/<(?:a|area|link)\b[^>]*?\shref="([^"]*)"/g)) {
        let href = decode(m[1] ?? '')
        if (href.startsWith(ORIGIN)) href = href.slice(ORIGIN.length) || '/'
        if (href === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue
        const [rawPath = '', fragment] = href.split('#') as [string, string | undefined]
        const path = (rawPath.split('?')[0] ?? '') || route
        if (!path.startsWith('/')) continue // relative links: none expected outside the Atlas demo
        if (DEPLOYED_ELSEWHERE.some((re) => re.test(path))) continue
        const page = resolvePage(path)
        if (page === null) {
          if (!existsSync(join(dist, decodeURIComponent(path)))) broken.push(`${route} → ${href} (no page or file)`)
          continue
        }
        if (fragment && !pages.get(page)?.has(decodeURIComponent(fragment))) broken.push(`${route} → ${href} (no #${fragment} on ${page})`)
      }
    }
    expect(broken, `${broken.length} broken internal link(s)`).toEqual([])
  })
})
