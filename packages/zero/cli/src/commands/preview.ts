import { resolve } from 'node:path'
import { preview as vitePreview } from 'vite'
import { loadZeroConfigPort } from './load-config'

export interface PreviewOptions {
  port?: number
  host?: string | boolean
}

export async function preview(root: string | undefined, options: PreviewOptions) {
  try {
    const projectRoot = resolve(root ?? '.')

    // Precedence: CLI flag > zero({ port }) from vite.config.ts > 3000 default.
    // Same pattern as `dev` — see commands/dev.ts.
    const configPort = await loadZeroConfigPort(projectRoot)
    const port = options.port ?? configPort ?? 3000

    const server = await vitePreview({
      root: projectRoot,
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
