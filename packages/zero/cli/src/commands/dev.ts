import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { formatReadyLine, renderRouteBanner } from './dev-banner'
import { loadZeroConfigPort } from './load-config'

/**
 * Whether to emit ANSI color, following the de-facto standard: `NO_COLOR`
 * disables (https://no-color.org), `FORCE_COLOR` forces on, otherwise gate on
 * an interactive stdout. Piped output (`bun run dev > log`, most CI viewers,
 * and `bun run --filter`'s boxed capture) is a non-TTY, so it gets clean plain
 * text instead of raw escape codes.
 */
function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR) return true
  return Boolean(process.stdout.isTTY)
}

export interface DevOptions {
  port?: number
  host?: string | boolean
  open?: boolean
  /** Print the full route table instead of the collapsed one-line summary. */
  routes?: boolean
}

export async function dev(root: string | undefined, options: DevOptions) {
  try {
    const started = Date.now()
    const projectRoot = resolve(root ?? '.')

    // Precedence: CLI flag > zero({ port }) from vite.config.ts > 3000 default.
    // CAC no longer applies a hardcoded `default: 3000` on the flag — the
    // absence of `--port` falls through to the config-file lookup, which
    // falls through to the framework default. Without this, an app with
    // `zero({ port: 8080 })` was silently ignored by `zero dev`.
    const configPort = await loadZeroConfigPort(projectRoot)
    const port = options.port ?? configPort ?? 3000

    const server = await createServer({
      root: projectRoot,
      server: {
        port,
        host: options.host === true ? '0.0.0.0' : options.host || false,
        ...(options.open != null ? { open: options.open } : {}),
      },
    })

    await server.listen()
    // Server is ready here — measure now, print the timing at the very end.
    const readyMs = Date.now() - started
    const color = supportsColor()

    // Output order is deliberate for readability AND for `bun run --filter`,
    // whose runner elides the MIDDLE of long child output and keeps only the
    // TAIL. So: the route banner is collapsed to a one-line summary by default
    // (short output → nothing gets elided; `--routes` opts into the full
    // table), and the Local URL + ready-time are printed LAST so the two things
    // you actually need survive in the visible tail even when the table is long.
    const banner = await scanRouteBanner(projectRoot, options.routes === true, color)
    if (banner.length > 0) console.log(banner.join('\n'))
    console.log('')
    server.printUrls()
    console.log('')
    console.log(formatReadyLine(readyMs, color))
    console.log('')
  } catch (error) {
    console.error('Failed to start dev server:', (error as Error).message)
    process.exit(1)
  }
}

/**
 * Scan the file-system routes and render the banner lines. IO (fs scan + the
 * heavy `@pyreon/zero/server` import) lives here; the verbose/summary decision
 * + formatting is delegated to the pure `renderRouteBanner`. Returns `[]` on
 * any failure — the route banner is informational and must never fail the dev
 * server.
 */
async function scanRouteBanner(
  projectRoot: string,
  verbose: boolean,
  color: boolean,
): Promise<string[]> {
  try {
    const routesDir = join(projectRoot, 'src/routes')
    if (!existsSync(routesDir)) return []

    const { scanRouteFiles, collectFileRouteModes } = await import('@pyreon/zero/server')
    const { isApiRoute, apiFilePathToPattern } = await import('@pyreon/zero/api-routes')

    // App mode from the project's vite config — a cheap text scan (the
    // banner is informational and must never fail the dev server; parsing
    // the config through Vite here would double the startup cost).
    const appMode = detectAppMode(projectRoot)

    const files = await scanRouteFiles(routesDir)
    // Truthful per-route modes: leaf `renderMode` declaration > nearest
    // ancestor layout declaration > app mode (pre-fix the banner stamped
    // every route with the DEFAULT mode, so hybrid apps read as all-SSR).
    const modeEntries = await collectFileRouteModes(routesDir, appMode)
    const pageRoutes = modeEntries.map((e) => ({ urlPath: e.pattern, renderMode: e.mode }))
    const apiPatterns = files.filter(isApiRoute).map(apiFilePathToPattern)

    return renderRouteBanner(pageRoutes, apiPatterns, { verbose, color, appMode })
  } catch {
    return []
  }
}

/**
 * Best-effort app-mode detection from the project's vite config source —
 * matches `zero({ ... mode: 'ssg' ... })`. Text-scan by design: the banner
 * is informational, must never fail the dev server, and loading the config
 * through Vite just to read one field would double startup cost. Falls back
 * to zero's default ('ssr').
 */
function detectAppMode(projectRoot: string): 'ssr' | 'ssg' | 'spa' | 'isr' {
  for (const name of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']) {
    try {
      const source = readFileSync(join(projectRoot, name), 'utf-8')
      const m = /\bmode\s*:\s*['"](ssr|ssg|spa|isr)['"]/.exec(source)
      if (m) return m[1] as 'ssr' | 'ssg' | 'spa' | 'isr'
      return 'ssr' // config exists, no mode → zero's default
    } catch {
      /* try next name */
    }
  }
  return 'ssr'
}
