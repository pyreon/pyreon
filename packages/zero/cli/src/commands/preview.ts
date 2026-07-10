import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { preview as vitePreview } from 'vite'
import { loadZeroConfigPort } from './load-config'

export interface PreviewOptions {
  port?: number
  host?: string | boolean
}

/**
 * Resolve the directory `vite preview` should serve from.
 *
 * `zero build` delegates the whole pipeline to the zero plugin, so the
 * client bundle lands at the project's `build.outDir` (`dist/` by
 * default) — vite preview's own default therefore serves it correctly.
 * Two cases still prefer `dist/client/` when that directory exists:
 *
 *   - node/bun adapter SSR builds stage a clean copy of the client
 *     assets at `dist/client/` (next to the emitted `dist/index.js`
 *     runner); serving the copy avoids also exposing the server
 *     bundle / adapter scaffolding sitting at the `dist/` top level.
 *   - stale `dist/` trees from pre-0.44 `zero build` runs (which
 *     hardcoded the client bundle into `dist/client/`).
 *
 * When `dist/client/` doesn't exist, return undefined and let vite
 * preview use the project's own `build.outDir`.
 */
function resolvePreviewOutDir(projectRoot: string): string | undefined {
  const clientDist = join(projectRoot, 'dist/client')
  if (existsSync(clientDist)) return 'dist/client'
  return undefined
}

export async function preview(root: string | undefined, options: PreviewOptions) {
  try {
    const projectRoot = resolve(root ?? '.')

    // Precedence: CLI flag > zero({ port }) from vite.config.ts > 3000 default.
    // Same pattern as `dev` — see commands/dev.ts.
    const configPort = await loadZeroConfigPort(projectRoot)
    const port = options.port ?? configPort ?? 3000

    const outDir = resolvePreviewOutDir(projectRoot)

    const server = await vitePreview({
      root: projectRoot,
      ...(outDir ? { build: { outDir } } : {}),
      preview: {
        port,
        host: options.host === true ? '0.0.0.0' : options.host || false,
      },
    })

    server.printUrls()
  } catch (error) {
    console.error('Failed to start preview server:', (error as Error).message)
    process.exit(1)
  }
}
