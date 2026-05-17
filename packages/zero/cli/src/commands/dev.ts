import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { loadZeroConfigPort } from './load-config'

export interface DevOptions {
  port?: number
  host?: string | boolean
  open?: boolean
}

export async function dev(root: string | undefined, options: DevOptions) {
  try {
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
    server.printUrls()

    // Print route table after server starts
    await printRouteTable(projectRoot)
  } catch (error) {
    console.error('Failed to start dev server:', (error as Error).message)
    process.exit(1)
  }
}

async function printRouteTable(projectRoot: string) {
  try {
    const routesDir = join(projectRoot, 'src/routes')
    if (!existsSync(routesDir)) return

    const { scanRouteFiles, parseFileRoutes } = await import('@pyreon/zero/server')
    const { isApiRoute, apiFilePathToPattern } = await import('@pyreon/zero/api-routes')

    const files = await scanRouteFiles(routesDir)
    const pageRoutes = parseFileRoutes(files).filter(
      (r) => !r.isLayout && !r.isError && !r.isLoading && !isApiRoute(r.filePath),
    )
    const apiFiles = files.filter(isApiRoute)

    if (pageRoutes.length === 0 && apiFiles.length === 0) return

    console.log('')
    console.log('  \x1b[36m Routes\x1b[0m')
    console.log('')

    for (const route of pageRoutes) {
      const mode = route.renderMode.toUpperCase()
      console.log(`  \x1b[2m${mode.padEnd(4)}\x1b[0m ${route.urlPath}`)
    }

    if (apiFiles.length > 0) {
      console.log('')
      console.log('  \x1b[33m API Routes\x1b[0m')
      console.log('')
      for (const file of apiFiles) {
        console.log(`  \x1b[2mAPI \x1b[0m ${apiFilePathToPattern(file)}`)
      }
    }

    console.log('')
  } catch {
    // Route table is informational — don't fail dev server
  }
}
