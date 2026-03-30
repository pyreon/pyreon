/**
 * Static Site Generation — pre-render routes to HTML files at build time.
 *
 * @example
 * // ssg.ts (run with: bun run ssg.ts)
 * import { createHandler } from "@pyreon/server"
 * import { prerender } from "@pyreon/server"
 * import { App } from "./src/App"
 * import { routes } from "./src/routes"
 *
 * const handler = createHandler({ App, routes })
 *
 * await prerender({
 *   handler,
 *   paths: ["/", "/about", "/blog", "/blog/hello-world"],
 *   outDir: "dist",
 * })
 *
 * @example
 * // Dynamic paths from a CMS or filesystem
 * await prerender({
 *   handler,
 *   paths: async () => {
 *     const posts = await fetchAllPosts()
 *     return ["/", "/about", ...posts.map(p => `/blog/${p.slug}`)]
 *   },
 *   outDir: "dist",
 * })
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export interface PrerenderOptions {
  /** SSR handler created by createHandler() */
  handler: (req: Request) => Promise<Response>
  /** Routes to pre-render — array of URL paths or async function that returns them */
  paths: string[] | (() => string[] | Promise<string[]>)
  /** Output directory for the generated HTML files */
  outDir: string
  /** Origin for constructing full URLs (default: "http://localhost") */
  origin?: string
  /**
   * Called after each page is rendered — use for logging or progress tracking.
   * Return false to skip writing this page.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional
  onPage?: (path: string, html: string) => void | boolean | Promise<void | boolean>
}

export interface PrerenderResult {
  /** Number of pages generated */
  pages: number
  /** Paths that failed to render */
  errors: { path: string; error: unknown }[]
  /** Total elapsed time in milliseconds */
  elapsed: number
}

/**
 * Pre-render a list of routes to static HTML files.
 *
 * For each path:
 *   1. Constructs a Request for the path
 *   2. Calls the SSR handler to render to HTML
 *   3. Writes the HTML to `outDir/<path>/index.html`
 *
 * The root path "/" becomes `outDir/index.html`.
 * Paths like "/about" become `outDir/about/index.html`.
 */
export async function prerender(options: PrerenderOptions): Promise<PrerenderResult> {
  const { handler, outDir, origin = 'http://localhost', onPage } = options

  const start = Date.now()

  // Resolve paths (may be async)
  const paths = typeof options.paths === 'function' ? await options.paths() : options.paths

  let pages = 0
  const errors: PrerenderResult['errors'] = []

  async function renderPage(path: string): Promise<void> {
    const url = new URL(path, origin)
    const req = new Request(url.href)
    const res = await Promise.race([
      handler(req),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Prerender timeout for "${path}" (30s)`)), 30_000),
      ),
    ])

    if (!res.ok) {
      errors.push({ path, error: new Error(`HTTP ${res.status}`) })
      return
    }

    const html = await res.text()

    if (onPage) {
      const result = await onPage(path, html)
      if (result === false) return
    }

    const filePath = resolveOutputPath(outDir, path)

    const resolvedOut = resolve(outDir)
    if (!resolve(filePath).startsWith(resolvedOut)) {
      errors.push({ path, error: new Error(`Path traversal detected: "${path}"`) })
      return
    }

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, html, 'utf-8')
    pages++
  }

  // Process paths concurrently (batch of 10 to avoid overwhelming)
  const BATCH_SIZE = 10
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (path) => {
        try {
          await renderPage(path)
        } catch (error) {
          errors.push({ path, error })
        }
      }),
    )
  }

  return {
    pages,
    errors,
    elapsed: Date.now() - start,
  }
}

function resolveOutputPath(outDir: string, path: string): string {
  if (path === '/') return join(outDir, 'index.html')
  if (path.endsWith('.html')) return join(outDir, path)
  return join(outDir, path, 'index.html')
}
