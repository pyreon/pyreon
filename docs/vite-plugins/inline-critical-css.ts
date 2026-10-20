/**
 * vite-plugin-inline-critical-css — extracts and inlines each prerendered
 * page's CRITICAL (above-the-fold) CSS, and defers the rest.
 *
 * Why: the app stylesheet (~59 KB raw) is the lone render-blocking
 * resource on the home page's critical request chain. Inlining the whole
 * sheet removes the request but trades it for a big main-thread parse —
 * costly on mobile's 4× CPU throttle, which pins FCP/LCP. Instead we use
 * `beasties` to inline ONLY the rules the page actually uses above the
 * fold (a few KB, cheap to parse) and load the full stylesheet
 * asynchronously (`preload: 'swap'`). So:
 *
 *   - nothing render-blocking sits between the HTML and first paint
 *   - the inlined critical CSS is small → fast to download AND parse
 *   - the FULL stylesheet still loads (async, `pruneSource: false`), so
 *     below-the-fold / missed rules are always corrected — worst case is
 *     a brief restyle of off-screen content, never a broken page
 *   - `<noscript>` keeps the stylesheet for no-JS clients
 *
 * Fonts are left untouched (`fonts: false`) — @pyreon/zero's fontPlugin
 * owns the inline `@font-face` + self-host woff2 — and existing inline
 * `<style>` blocks are preserved (`reduceInlineStyles: false`).
 *
 * Runs at `closeBundle` (`enforce: 'post'`, AFTER `zero()` in the plugin
 * array) so it operates on the FINAL `dist/**​/*.html` pages zero's SSG
 * pass has written. Build-only. It fires inside zero's SSG sub-build, so
 * it (a) re-roots `outDir` out of `dist/.zero-ssg-server` and (b) is
 * idempotent — beasties rewrites the `<link rel=stylesheet>` to an async
 * preload, so an already-processed page has no `rel=stylesheet` left to
 * match, and the unrendered entry template (still carrying the
 * `<!--pyreon-app-->` placeholder) is skipped so the prerender clones a
 * link-bearing template and each rendered page gets its OWN critical CSS.
 */
import { readdirSync, statSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

// Marker the SSG entry template carries until the route content is
// rendered into it. A file that still has it is the bare template, not a
// finished page — skip it (it would yield empty critical CSS).
const UNRENDERED_MARKER = '<!--pyreon-app-->'

export default function inlineCriticalCss(): Plugin {
  let outDir = 'dist'
  let base = '/'
  let root = process.cwd()

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
      outDir = resolved.endsWith('.zero-ssg-server') ? dirname(resolved) : resolved
      base = config.base || '/'
      root = config.root
    },

    async closeBundle() {
      const htmlFiles: string[] = []
      walkHtml(outDir, htmlFiles)
      if (htmlFiles.length === 0) return

      // Pages that still carry a render-blocking app stylesheet AND are
      // finished (no template placeholder). Idempotent: a processed page's
      // link is already an async preload, so it won't re-match.
      const targets: string[] = []
      for (const file of htmlFiles) {
        let html: string
        try {
          html = await readFile(file, 'utf8')
        } catch {
          continue
        }
        if (html.includes(UNRENDERED_MARKER)) continue
        if (!/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="[^"]*\.css"[^>]*>/i.test(html)) continue
        targets.push(file)
      }
      if (targets.length === 0) return

      // Pages are independent (a fresh beasties instance per page), so they
      // run across worker threads: beasties' per-page selector matching was
      // ~17s of a ~37s docs build when done one page at a time. Workers PULL
      // the next page from a shared queue rather than taking a fixed slice:
      // page cost varies a lot, and fixed slices left the step waiting on the
      // slowest one while the other workers sat idle.
      const workers = Math.max(1, Math.min(availableParallelism() - 1, 8, targets.length))
      const workerFile = join(root, 'vite-plugins', 'inline-critical-css.worker.mjs')
      let next = 0
      const results = await Promise.all(
        Array.from(
          { length: workers },
          () =>
            new Promise<{ done: number; skipped: Array<{ file: string; message: string }> }>(
              (resolve, reject) => {
                const worker = new Worker(workerFile, { workerData: { outDir, base } })
                worker.on(
                  'message',
                  (
                    msg:
                      | { type: 'next' }
                      | {
                          type: 'result'
                          done: number
                          skipped: Array<{ file: string; message: string }>
                        },
                  ) => {
                    if (msg.type === 'next') {
                      worker.postMessage(next < targets.length ? targets[next++] : null)
                    } else {
                      resolve(msg)
                    }
                  },
                )
                worker.once('error', reject)
                worker.once('exit', (code) => {
                  if (code !== 0) reject(new Error(`critical-CSS worker exited with code ${code}`))
                })
              },
            ),
        ),
      )
      let done = 0
      for (const r of results) {
        done += r.done
        // Never fail the build over one page — it keeps its (correct,
        // render-blocking) <link>, just unoptimized.
        for (const { file, message } of r.skipped) {
          console.warn(`[pyreon-docs] critical-CSS skipped for ${file}: ${message}`)
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[pyreon-docs] inlined critical CSS + deferred full sheet on ${done}/${targets.length} page(s)`,
      )
    },
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
