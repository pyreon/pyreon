/**
 * Shared Vite dev/preview server launcher for perf scripts.
 *
 * Started life duplicated across `record.ts` and `verify-overlay.ts`;
 * extracted here so the ANSI-stripping logic and ready-line detection
 * live in exactly one place. (An earlier revision of the ANSI-strip
 * comment was wrong, and having two copies compounded the confusion
 * during review.)
 */
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export type ServerMode = 'dev' | 'preview'

export interface ServerHandle {
  url: string
  stop: () => Promise<void>
}

export interface StartServerOptions {
  /** Repo root — all paths resolve from here. */
  repoRoot: string
  /** Example name under `examples/` (e.g. `perf-dashboard`). */
  app: string
  mode: ServerMode
  /** Time to wait for the ready line before rejecting. Default 30s. */
  timeoutMs?: number
}

// Pre-compute the ANSI-escape regex once. Vite's colour library
// (picocolors) flips to "force colour even over pipes" when the `CI`
// env var is set, so in GitHub Actions the ready line arrives as
// `\x1B[1mLocal\x1B[22m:` instead of plain `Local:`. Stripping before
// the regex match lets both environments parse correctly.
const ESC = String.fromCharCode(0x1b)
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, 'g')
const READY_RE = /Local:\s+(https?:\/\/[^\s]+)\//i

export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const { repoRoot, app, mode } = options
  const timeoutMs = options.timeoutMs ?? 30_000
  const cwd = resolve(repoRoot, 'examples', app)
  if (!existsSync(resolve(cwd, 'package.json'))) {
    throw new Error(`[perf:server] example not found: examples/${app}`)
  }

  if (mode === 'preview') {
    // Preview mode: build once, then serve the built artefacts.
    process.stderr.write(`[perf:server] building examples/${app}\n`)
    execSync('bun run build', { cwd, stdio: 'inherit' })
  }

  const proc = spawn('bun', ['run', mode], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  return new Promise<ServerHandle>((resolvePromise, rejectPromise) => {
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        proc.kill('SIGTERM')
        rejectPromise(
          new Error(`[perf:server] server start timeout (${timeoutMs}ms) for ${app}/${mode}`),
        )
      }
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      const line = chunk.toString()
      process.stderr.write(`[${app}:${mode}] ${line}`)
      const stripped = line.replace(ANSI_RE, '')
      const match = READY_RE.exec(stripped)
      if (match && !resolved) {
        resolved = true
        clearTimeout(timer)
        resolvePromise({
          url: match[1] as string,
          stop: () =>
            new Promise<void>((resolveStop) => {
              proc.once('exit', () => resolveStop())
              proc.kill('SIGTERM')
            }),
        })
      }
    }

    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.once('error', (err) => {
      if (!resolved) {
        clearTimeout(timer)
        rejectPromise(err)
      }
    })
    proc.once('exit', (code) => {
      if (!resolved) {
        clearTimeout(timer)
        rejectPromise(
          new Error(`[perf:server] server exited before ready: ${app}/${mode} (code=${code})`),
        )
      }
    })
  })
}
