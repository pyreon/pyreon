/**
 * vite-plugin-inline-critical-css — inlines the app's render-blocking
 * stylesheet into every prerendered page's `<head>`.
 *
 * Why: the home page's critical request chain is
 *
 *   document → assets/index-*.css (render-blocking) → first paint
 *
 * The page content is fully SSG-prerendered, so nothing between the HTML
 * arriving and first paint needs the JS bundle — the ONLY thing pinning
 * First Contentful Paint / Largest Contentful Paint is the round-trip
 * for that `<link rel=stylesheet>` (Lighthouse flagged it as the lone
 * render-blocking resource, ~320 ms on its mobile throttle). Inlining the
 * CSS into the document removes that request from the critical path
 * entirely — the page paints as soon as the HTML is parsed.
 *
 * The CSS is shared across pages, so after the first hard load every
 * in-app navigation is client-routed (no HTML re-fetch) — there is no
 * repeat-download cost for the SPA, only a first-paint win. Vite still
 * emits the `.css` asset on disk; it is simply no longer referenced.
 *
 * Runs at `closeBundle` with `enforce: 'post'` and is placed AFTER
 * `zero()` in the plugin array, so it operates on the FINAL
 * `dist/**​/*.html` files that zero's SSG pass has already written.
 * Build-only (`apply: 'build'`) — `vite dev` serves CSS over an open
 * connection where this trade-off doesn't apply.
 */
import { readdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

// A stylesheet larger than this is left as a `<link>` — inlining a very
// large sheet would bloat every page's HTML past the round-trip it saves.
// The docs' single app stylesheet is ~12 KB gzipped, well under this.
const MAX_INLINE_BYTES = 200 * 1024

export default function inlineCriticalCss(): Plugin {
  let outDir = 'dist'
  let base = '/'

  return {
    name: 'pyreon-docs-inline-critical-css',
    apply: 'build',
    enforce: 'post',

    configResolved(config) {
      // zero's SSG runs an inner SSR sub-build into `dist/.zero-ssg-server`
      // and prerenders the pages into the parent `dist/`. This plugin's
      // closeBundle fires inside that sub-build, so `config.build.outDir`
      // points at the sub-build dir — the real, page-bearing output is its
      // parent. (A normal build resolves to `outDir` unchanged.)
      const resolved = config.build.outDir
      outDir = resolved.replace(/[/\\]\.zero-ssg-server[/\\]?$/, '')
      if (outDir === resolved && resolved.endsWith('.zero-ssg-server')) {
        outDir = dirname(resolved)
      }
      base = config.base || '/'
    },

    async closeBundle() {
      const htmlFiles: string[] = []
      walkHtml(outDir, htmlFiles)
      // Fires once per zero sub-build; the run AFTER the SSG prerender is
      // the one that sees the final pages. Idempotent — a page whose
      // stylesheet is already inlined has no `<link rel=stylesheet>` left
      // to fold, so earlier/duplicate runs are harmless no-ops.
      if (htmlFiles.length === 0) return

      // Cache CSS reads — every page references the same shared sheet.
      const cssCache = new Map<string, string | null>()
      let pagesTouched = 0
      let linksInlined = 0

      for (const file of htmlFiles) {
        let html: string
        try {
          html = await readFile(file, 'utf8')
        } catch {
          continue
        }

        const links = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)
        if (!links) continue

        let changed = false
        for (const link of links) {
          const hrefMatch = link.match(/\bhref="([^"]+)"/i)
          const href = hrefMatch?.[1]
          if (!href) continue
          // Leave cross-origin stylesheets alone (none expected, but safe).
          if (/^(https?:)?\/\//i.test(href)) continue

          const cssPath = resolveAsset(href, outDir, base)
          let css = cssCache.get(cssPath)
          if (css === undefined) {
            css = await safeRead(cssPath)
            if (css !== null && Buffer.byteLength(css) > MAX_INLINE_BYTES) {
              css = null // too big — keep the <link>
            }
            cssCache.set(cssPath, css)
          }
          if (!css) continue

          // split/join replaces every occurrence and never interprets
          // `$`-patterns in the CSS as regex replacement tokens.
          html = html.split(link).join(`<style>${css}</style>`)
          changed = true
          linksInlined++
        }

        if (changed) {
          await writeFile(file, html)
          pagesTouched++
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[pyreon-docs] inlined critical CSS into ${pagesTouched} page(s) (${linksInlined} link(s) folded into <style>)`,
      )
    },
  }
}

/** Resolve a built `href` (e.g. `/assets/x.css`) to its on-disk path. */
function resolveAsset(href: string, outDir: string, base: string): string {
  let rel = href
  if (base !== '/' && rel.startsWith(base)) rel = rel.slice(base.length)
  rel = rel.replace(/^\/+/, '')
  return join(outDir, rel)
}

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

function walkHtml(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      walkHtml(full, out)
    } else if (name.endsWith('.html')) {
      out.push(full)
    }
  }
}
