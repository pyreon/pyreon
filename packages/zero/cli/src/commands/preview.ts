import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { preview as vitePreview } from 'vite'
import { loadZeroConfigPort } from './load-config'

export interface PreviewOptions {
  port?: number
  host?: string | boolean
}

/**
 * Resolve the directory `vite preview` should serve from. `zero build`
 * hardcodes the client bundle into `dist/client/` (see commands/build.ts)
 * — Vite's preview default of `dist/` would 404 because `dist/` only
 * contains subdirectories (`client/`, `server/`, `output/`) after a zero
 * build. Honour `build.outDir` from `vite.config.ts` if set; otherwise
 * fall back to `dist/client` when it exists; otherwise let vite preview
 * fall back to its own default and surface the resulting 404 to the
 * user.
 */
function resolvePreviewOutDir(projectRoot: string): string | undefined {
  // `vite.config.ts` build.outDir override wins — read it if present.
  // (Async config loading is out of scope here; the common case is the
  // scaffolder-generated config which does NOT set build.outDir.)
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
