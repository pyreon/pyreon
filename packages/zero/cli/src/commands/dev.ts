import { existsSync } from 'node:fs'
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

    const { scanRouteFiles, parseFileRoutes } = await import('@pyreon/zero/server')
    const { isApiRoute, apiFilePathToPattern } = await import('@pyreon/zero/api-routes')

    const files = await scanRouteFiles(routesDir)
    const pageRoutes = parseFileRoutes(files).filter(
      (r) => !r.isLayout && !r.isError && !r.isLoading && !isApiRoute(r.filePath),
    )
    const apiPatterns = files.filter(isApiRoute).map(apiFilePathToPattern)

    return renderRouteBanner(pageRoutes, apiPatterns, { verbose, color })
  } catch {
    return []
  }
}
