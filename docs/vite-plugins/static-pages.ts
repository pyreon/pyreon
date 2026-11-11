/**
 * static-pages — trims what a static marketing page carries for a client app
 * it never starts.
 *
 * Marketing pages render inside `SiteShell`, whose `<main>` carries
 * `data-site-static`; in the browser they hydrate only their islands
 * (`src/site/render-mode.ts`). Zero's SSG still writes the head every page
 * gets as part of a hydrating app:
 *
 *   - `<link rel="modulepreload">` for the route's static import closure: the
 *     route component, the kit, rocketstyle, the router. A static page never
 *     imports them, and a modulepreload still downloads them. Only the
 *     preloads of the client entry's own static graph stay.
 *   - `window.__PYREON_LOADER_DATA__`: the loader output (a product page's
 *     whole content JSON) for a hydration that never happens.
 *
 * Both are removed from static pages only; docs pages are untouched. Zero
 * has no per-route islands-only mode that would skip them at the source
 * (pyreon/pyreon#4371); when it does, this plugin goes.
 *
 * Runs at `closeBundle` on the final pages (after zero's SSG), like
 * `inline-critical-css.ts`, and is idempotent.
 */
import { readdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

export const STATIC_PAGE_MARKER = 'data-site-static'
const UNRENDERED_MARKER = '<!--pyreon-app-->'

const MODULEPRELOAD = /<link\b[^>]*\brel="modulepreload"[^>]*>\s*/gi
const LOADER_DATA = /<script\b[^>]*>\s*window\.__PYREON_LOADER_DATA__\s*=[\s\S]*?<\/script>\s*/gi
const ENTRY_SCRIPT = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*>/i
const STATIC_IMPORT = /(?:import|export)\s*(?:[^'"();]*?from\s*)?["']([^"']+\.js)["']/g

/** The client entry's static import closure, as root-relative hrefs. */
async function entryClosure(outDir: string, base: string, entryHref: string): Promise<Set<string>> {
  const seen = new Set<string>()
  const queue = [entryHref]
  while (queue.length > 0) {
    const href = queue.shift() as string
    if (seen.has(href)) continue
    seen.add(href)
    const rel = href.startsWith(base) ? href.slice(base.length) : href.replace(/^\//, '')
    let code: string
    try {
      code = await readFile(join(outDir, rel), 'utf8')
    } catch {
      continue
    }
    const dir = href.slice(0, href.lastIndexOf('/') + 1)
    for (const m of code.matchAll(STATIC_IMPORT)) {
      const spec = m[1] as string
      queue.push(spec.startsWith('/') ? spec : new URL(spec, `http://x${dir}`).pathname)
    }
  }
  return seen
}

/** Strips app-hydration leftovers from one static page's HTML. Pure; exported for the unit test. */
export function trimStaticPage(html: string, keepPreloads: ReadonlySet<string>): string {
  if (!html.includes(STATIC_PAGE_MARKER) || html.includes(UNRENDERED_MARKER)) return html
  return html
    .replace(MODULEPRELOAD, (tag) => {
      const href = /\bhref="([^"]+)"/i.exec(tag)?.[1]
      return href !== undefined && keepPreloads.has(href) ? tag : ''
    })
    .replace(LOADER_DATA, '')
}

function walkHtml(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkHtml(full, out)
    else if (name.endsWith('.html')) out.push(full)
  }
}

export default function staticPages(): Plugin {
  let outDir = 'dist'
  let base = '/'
  return {
    name: 'pyreon-docs-static-pages',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      // Fires inside zero's SSG sub-build too: the pages live in its parent.
      const resolved = config.build.outDir
      outDir = resolved.endsWith('.zero-ssg-server') ? dirname(resolved) : resolved
      base = config.base || '/'
    },
    async closeBundle() {
      const files: string[] = []
      walkHtml(outDir, files)
      let keep: Set<string> | null = null
      let trimmed = 0
      for (const file of files) {
        const html = await readFile(file, 'utf8')
        if (!html.includes(STATIC_PAGE_MARKER) || html.includes(UNRENDERED_MARKER)) continue
        if (keep === null) {
          const entry = ENTRY_SCRIPT.exec(html)?.[1]
          keep = entry ? await entryClosure(outDir, base, entry) : new Set()
        }
        const next = trimStaticPage(html, keep)
        if (next !== html) {
          await writeFile(file, next)
          trimmed++
        }
      }
      if (trimmed > 0) this.info(`static pages: trimmed ${trimmed} page heads`)
    },
  }
}
