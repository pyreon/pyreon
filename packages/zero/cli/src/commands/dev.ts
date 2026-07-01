import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import {
  countRoutes,
  formatReadyLine,
  formatRouteSummary,
  formatRouteTable,
} from './dev-banner'
import { loadZeroConfigPort } from './load-config'

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

    // Output order is deliberate for readability AND for `bun run --filter`,
    // whose runner elides the MIDDLE of long child output and keeps only the
    // TAIL. So: the route banner is collapsed to a one-line summary by default
    // (short output → nothing gets elided; `--routes` opts into the full
    // table), and the Local URL + ready-time are printed LAST so the two things
    // you actually need survive in the visible tail even when the table is long.
    await printRouteBanner(projectRoot, options.routes === true)
    console.log('')
    server.printUrls()
    console.log('')
    console.log(formatReadyLine(readyMs))
    console.log('')
  } catch (error) {
    console.error('Failed to start dev server:', (error as Error).message)
    process.exit(1)
  }
}

async function printRouteBanner(projectRoot: string, verbose: boolean) {
  try {
    const routesDir = join(projectRoot, 'src/routes')
    if (!existsSync(routesDir)) return

    const { scanRouteFiles, parseFileRoutes } = await import('@pyreon/zero/server')
    const { isApiRoute, apiFilePathToPattern } = await import('@pyreon/zero/api-routes')

    const files = await scanRouteFiles(routesDir)
    const pageRoutes = parseFileRoutes(files).filter(
      (r) => !r.isLayout && !r.isError && !r.isLoading && !isApiRoute(r.filePath),
    )
    const apiPatterns = files.filter(isApiRoute).map(apiFilePathToPattern)

    if (pageRoutes.length === 0 && apiPatterns.length === 0) return

    if (verbose) {
      console.log(formatRouteTable(pageRoutes, apiPatterns).join('\n'))
    } else {
      console.log('')
      console.log(formatRouteSummary(countRoutes(pageRoutes, apiPatterns.length)))
    }
  } catch {
    // Route banner is informational — never fail the dev server.
  }
}
