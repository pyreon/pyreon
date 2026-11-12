/**
 * Dev-only error overlay for errors thrown on the server: an SSR render, a
 * route loader, or a request middleware.
 *
 * Server-only (reads the failing source file). Only `vite-plugin.ts`'s dev
 * middlewares import it, so it never reaches a client bundle and production
 * servers never call it. The markup and behaviour live in `overlay/view.ts`,
 * shared with the in-browser hydration overlay.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OverlayKind, OverlayReport } from './overlay/model'
import { classifyStack, displayPath, extractCodeFrame, findFix, firstAppFrame } from './overlay/model'
import { renderOverlayDocument } from './overlay/view'

/** Where the dev server caught the error. */
export interface ServerErrorContext {
  /** App root (Vite's `config.root`). Frames outside it are library frames. */
  root?: string | undefined
  /** Request URL path (with query). */
  url?: string | undefined
  /** What was running. Defaults to `server` (an SSR request, phase unknown). */
  kind?: Exclude<OverlayKind, 'hydration'> | undefined
  /** The route pattern that matched, when known (`/blog/:slug`). */
  route?: string | undefined
}

/** Set by `@pyreon/router`'s preload in development: the `path` of the route whose loader threw. */
const LOADER_ERROR_ROUTE = Symbol.for('pyreon.router.loaderErrorRoute')

/** The route whose loader threw `error`, or `undefined` when a loader did not throw it. */
export function loaderErrorRoute(error: unknown): string | undefined {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return undefined
  const route = (error as Record<symbol, unknown>)[LOADER_ERROR_ROUTE]
  return typeof route === 'string' ? route : undefined
}

function nearestPackageName(file: string): string | undefined {
  const path = file.startsWith('file://') ? file.slice(7) : file
  if (!isAbsolute(path)) return undefined
  let dir = dirname(path)
  for (let i = 0; i < 12; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown }).name
        if (typeof name === 'string' && name) return name
      } catch {
        return undefined
      }
    }
    const up = dirname(dir)
    if (up === dir) return undefined
    dir = up
  }
  return undefined
}

/**
 * Build the overlay's data from a (source-mapped) error. Real data only: the
 * location is the first stack frame inside the app root, the code frame is
 * read from that file, and the fix comes from the diagnose catalog or is left
 * out.
 */
export function buildServerReport(error: Error, context: ServerErrorContext = {}): OverlayReport {
  const root = (context.root ?? process.cwd()).replace(/\/+$/, '')
  const loaderRoute = loaderErrorRoute(error)
  const kind: Exclude<OverlayKind, 'hydration'> =
    context.kind === 'middleware' ? 'middleware' : loaderRoute !== undefined ? 'loader' : (context.kind ?? 'server')
  const urlPath = context.url ?? '/'
  const route = (kind === 'loader' ? loaderRoute : context.route) ?? urlPath.split('?')[0] ?? '/'

  const nameCache = new Map<string, string | undefined>()
  const stack = classifyStack(error.stack, {
    root,
    packageName: (file) => {
      if (!nameCache.has(file)) nameCache.set(file, nearestPackageName(file))
      return nameCache.get(file)
    },
  })
  const message = error.message || 'Unknown error'
  const report: OverlayReport = { kind, route, message, stack }
  if (urlPath !== route) report.url = urlPath

  const at = firstAppFrame(stack)
  if (at && at.line !== undefined) {
    const file = at.file.startsWith('file://') ? at.file.slice(7) : at.file
    report.location = { file, display: displayPath(file, root), line: at.line, column: at.column }
    try {
      const frame = extractCodeFrame(readFileSync(file, 'utf8'), at.line, at.column)
      if (frame) report.frame = frame
    } catch {
      // The file moved or is virtual: no code frame, the location still shows.
    }
  }

  const fix = findFix(message)
  if (fix) report.fix = fix
  return report
}

/**
 * Render the dev error overlay page for a server-side error.
 *
 * `context` is optional so the plain `renderErrorOverlay(error)` form keeps
 * working; without it the phase reads "SSR" and the route is `/`.
 */
export function renderErrorOverlay(error: Error, context: ServerErrorContext = {}): string {
  return renderOverlayDocument(buildServerReport(error, context))
}

// ─── In-browser half (hydration mismatches) ─────────────────────────────────

/** Virtual module `zero()` injects into dev pages; it installs the hydration overlay. */
export const DEV_OVERLAY_VIRTUAL_ID = 'virtual:zero/dev-overlay'
export const DEV_OVERLAY_RESOLVED_ID = `\0${DEV_OVERLAY_VIRTUAL_ID}`
/**
 * The `<script src>` for it. A `src` (not an inline `import`) because Vite
 * does not import-analyse inline module scripts added by
 * `transformIndexHtml`; `/@id/` + the `\0` id spelled `__x00__` is how Vite
 * serves a virtual module by URL.
 */
export const DEV_OVERLAY_SCRIPT_SRC = `/@id/${DEV_OVERLAY_RESOLVED_ID.replace('\0', '__x00__')}`

/**
 * Absolute path of the `@pyreon/zero/dev-overlay` module that sits next to
 * this one: `src/dev-overlay.ts` when zero runs from source, else
 * `lib/dev-overlay.js`. Resolved from zero's own location rather than by
 * package name, so it also works where the app cannot import
 * `@pyreon/zero` by name (zero's own fixtures).
 */
export function devOverlayModulePath(): string {
  const here = fileURLToPath(import.meta.url)
  let dir = dirname(here)
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown }).name === '@pyreon/zero') {
          return here.endsWith('.ts') ? join(dir, 'src', 'dev-overlay.ts') : join(dir, 'lib', 'dev-overlay.js')
        }
      } catch {
        // unreadable package.json: keep walking
      }
    }
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  // Not inside the published layout (a bundled copy of zero): fall back to
  // resolving by name from the app.
  return '@pyreon/zero/dev-overlay'
}

/** Source of the injected virtual module. */
export function devOverlayModuleSource(): string {
  return `import { installDevOverlay } from ${JSON.stringify(devOverlayModulePath())}\ninstallDevOverlay()\n`
}
