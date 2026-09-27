import { type ChildProcess, spawn } from 'node:child_process'
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

/**
 * What `zero preview` must run. A static file server is only correct for a
 * static build: for `ssr` / `isr` it served the empty client shell and
 * answered API routes with HTML. When the node/bun adapter emitted its
 * production runner, preview runs THAT (the real server, same as deploy).
 */
export type PreviewTarget =
  | { kind: 'runner'; runtime: 'node' | 'bun'; entry: string }
  | { kind: 'static'; outDir: string | undefined; serverBuildWithoutRunner: boolean }

export function resolvePreviewTarget(projectRoot: string): PreviewTarget {
  const nodeRunner = join(projectRoot, 'dist/index.js')
  const bunRunner = join(projectRoot, 'dist/index.ts')
  const serverBundle = join(projectRoot, 'dist/server/entry-server.js')
  if (existsSync(serverBundle) && existsSync(nodeRunner)) {
    return { kind: 'runner', runtime: 'node', entry: nodeRunner }
  }
  if (existsSync(serverBundle) && existsSync(bunRunner)) {
    return { kind: 'runner', runtime: 'bun', entry: bunRunner }
  }
  return {
    kind: 'static',
    outDir: resolvePreviewOutDir(projectRoot),
    serverBuildWithoutRunner: existsSync(serverBundle),
  }
}

/** Start the adapter-emitted production server with `PORT`. */
export function startRunner(
  target: Extract<PreviewTarget, { kind: 'runner' }>,
  port: number,
  cwd: string,
  stdio: 'inherit' | 'ignore' = 'inherit',
): ChildProcess {
  const command = target.runtime === 'bun' ? 'bun' : process.execPath
  return spawn(command, [target.entry], {
    cwd,
    stdio,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
  })
}

export async function preview(root: string | undefined, options: PreviewOptions) {
  try {
    const projectRoot = resolve(root ?? '.')

    // Precedence: CLI flag > zero({ port }) from vite.config.ts > 3000 default.
    // Same pattern as `dev` — see commands/dev.ts.
    const configPort = await loadZeroConfigPort(projectRoot)
    const port = options.port ?? configPort ?? 3000

    const target = resolvePreviewTarget(projectRoot)
    if (target.kind === 'runner') {
      console.log(`[Pyreon] zero preview: running the built ${target.runtime} server (${target.entry})`)
      const child = startRunner(target, port, projectRoot)
      const forward = (signal: NodeJS.Signals) => child.kill(signal)
      process.once('SIGINT', forward)
      process.once('SIGTERM', forward)
      child.on('exit', (code) => process.exit(code ?? 0))
      return
    }
    if (target.serverBuildWithoutRunner) {
      console.warn(
        '[Pyreon] zero preview: this is a server build for a hosting platform (vercel / netlify / cloudflare), ' +
          'so preview can only serve the static client — SSR pages and API routes will NOT work here. ' +
          "Use the platform's local runner (vercel dev, netlify dev, wrangler pages dev), or build with " +
          "adapter: 'node' to preview the real server.",
      )
    }
    const outDir = target.outDir


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
    console.error('[Pyreon] Failed to start preview server:', error)
    process.exit(1)
  }
}
