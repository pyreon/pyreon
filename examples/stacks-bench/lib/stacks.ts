/**
 * Stack registry + server lifecycle for the stacks benchmark.
 *
 * Each arm lives in `apps/<id>/` with a `stack.json` describing how to build
 * and start it. The harness starts every server itself (`node …`, never through
 * `npm start`, so a package-manager wrapper process is not part of cold start)
 * with `PORT`, `HOST=127.0.0.1` and `NODE_ENV=production`.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const APPS = join(ROOT, 'apps')

/** Fixed port per arm, so arms can be checked concurrently while being written. */
const PORTS: Record<string, number> = {
  zero: 4401,
  'react-router': 4402,
  next: 4403,
  sveltekit: 4404,
  solidstart: 4405,
  nuxt: 4406,
  astro: 4407,
  'tanstack-start': 4408,
  qwik: 4409,
}
export function portFor(id: string): number {
  return PORTS[id] ?? 4450 + ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 40)
}

export interface StackManifest {
  id: string
  label: string
  /** Doc pages the arm follows. */
  docs: string[]
  /** npm packages whose installed versions are printed with every result. */
  packages: string[]
  /** argv run in the app dir to build (after `npm ci`). */
  build: string[]
  /** argv run in the app dir to start the production server. argv[0] is usually `node`. */
  start: string[]
  /** Extra env for the server (PORT/HOST/NODE_ENV are set by the harness). `{PORT}` is substituted. */
  env?: Record<string, string>
  /** Path (relative to the app dir) of the verbatim copy of `shared/data.ts`. */
  dataFile: string
  /**
   * full      — the whole page hydrates (the counter is part of the hydrated root);
   * island    — only the counter island hydrates (Astro);
   * resumable — nothing hydrates; handlers load on interaction (Qwik).
   */
  hydration: 'full' | 'island' | 'resumable'
  /** Whether `/items` is streamed or buffered, as built. */
  streaming: string
  /** Per-arm audit notes printed in the report and README. */
  notes: string[]
  /** Optional: arm is installed and built but excluded (with the reason). */
  skip?: string
  /** Optional: install command override (default `npm ci`). */
  install?: string[]
}

export function loadStacks(filter?: string[]): { dir: string; m: StackManifest }[] {
  const ids = readdirSync(APPS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(APPS, d.name, 'stack.json')))
    .map((d) => d.name)
    .sort((a, b) => (a === 'zero' ? -1 : b === 'zero' ? 1 : a.localeCompare(b)))
  return ids
    .filter((id) => !filter || filter.length === 0 || filter.includes(id))
    .map((id) => {
      const dir = join(APPS, id)
      const m = JSON.parse(readFileSync(join(dir, 'stack.json'), 'utf8')) as StackManifest
      if (m.id !== id) throw new Error(`[stacks-bench] apps/${id}/stack.json has id "${m.id}"`)
      return { dir, m }
    })
}

/** Installed version of each listed package, resolved from the arm's own node_modules. */
export function installedVersions(dir: string, m: StackManifest): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of m.packages) {
    // Walk up like Node does — the zero arm resolves through the workspace.
    let d = dir
    let v = 'NOT INSTALLED'
    for (;;) {
      const pj = join(d, 'node_modules', p, 'package.json')
      if (existsSync(pj)) {
        v = (JSON.parse(readFileSync(pj, 'utf8')) as { version: string }).version
        break
      }
      const up = dirname(d)
      if (up === d) break
      d = up
    }
    out[p] = v
  }
  return out
}

/** The harness refuses to measure an arm whose data module drifted from `shared/data.ts`. */
export function assertDataIdentical(dir: string, m: StackManifest): void {
  const want = readFileSync(join(ROOT, 'shared', 'data.ts'), 'utf8')
  const got = readFileSync(join(dir, m.dataFile), 'utf8')
  if (want !== got) {
    throw new Error(
      `[stacks-bench] ${m.id}: ${m.dataFile} differs from shared/data.ts — run \`bun setup.ts --copy-data\``,
    )
  }
}

export interface RunningServer {
  proc: ChildProcess
  port: number
  base: string
  /** spawn → first 200 on /items, ms. */
  coldStartMs: number
  log: () => string
  stop: () => Promise<void>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function startServer(
  dir: string,
  m: StackManifest,
  port: number,
  timeoutMs = 60_000,
): Promise<RunningServer> {
  const [cmd, ...args] = m.start
  if (!cmd) throw new Error(`[stacks-bench] ${m.id}: empty start command`)
  const base0 = `http://127.0.0.1:${port}`
  try {
    await fetch(`${base0}/items`)
    throw new Error(`[stacks-bench] port ${port} is already serving — a stale server would fake a cold start`)
  } catch (e) {
    if (String(e).includes('already serving')) throw e
  }
  let logBuf = ''
  const t0 = performance.now()
  const proc = spawn(cmd, args, {
    cwd: dir,
    env: {
      ...process.env,
      ...Object.fromEntries(Object.entries(m.env ?? {}).map(([k, v]) => [k, v.replaceAll('{PORT}', String(port))])),
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      // Next.js / Astro / Nuxt telemetry off: no network calls during a run.
      NEXT_TELEMETRY_DISABLED: '1',
      ASTRO_TELEMETRY_DISABLED: '1',
      NUXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so stop() reaches any child it forks
  })
  // Keep only the tail: some servers log every request (react-router-serve's morgan).
  const append = (b: Buffer) => {
    logBuf += b.toString()
    if (logBuf.length > 65_536) logBuf = logBuf.slice(-32_768)
  }
  proc.stdout?.on('data', append)
  proc.stderr?.on('data', append)
  let exited: number | null = null
  proc.on('exit', (code) => (exited = code ?? -1))
  const base = `http://127.0.0.1:${port}`
  let coldStartMs = -1
  while (performance.now() - t0 < timeoutMs) {
    if (exited !== null) {
      throw new Error(`[stacks-bench] ${m.id}: server exited (${exited}) before serving:\n${logBuf}`)
    }
    try {
      const res = await fetch(`${base}/items`, { headers: { 'accept-encoding': 'identity' } })
      await res.arrayBuffer()
      if (res.status === 200) {
        coldStartMs = performance.now() - t0
        break
      }
    } catch {
      // not listening yet
    }
    await sleep(5)
  }
  if (coldStartMs < 0) {
    kill(proc)
    throw new Error(`[stacks-bench] ${m.id}: no 200 on /items within ${timeoutMs} ms:\n${logBuf}`)
  }
  return {
    proc,
    port,
    base,
    coldStartMs,
    log: () => logBuf,
    stop: async () => {
      kill(proc)
      for (let i = 0; i < 100 && exited === null; i++) await sleep(20)
      if (exited === null) {
        try {
          process.kill(-(proc.pid as number), 'SIGKILL')
        } catch {}
        await sleep(100)
      }
      // Wait until the port is free so the next start measures a real cold start.
      for (let i = 0; i < 100; i++) {
        try {
          await fetch(`${base}/items`)
          await sleep(20)
        } catch {
          break
        }
      }
    },
  }
}

function kill(proc: ChildProcess): void {
  try {
    process.kill(-(proc.pid as number), 'SIGTERM')
  } catch {
    try {
      proc.kill('SIGTERM')
    } catch {}
  }
}

/** The 100 seeded item names, regenerated from the shared module (the gate's ground truth). */
export async function expectedNames(): Promise<string[]> {
  // A fresh import would share globalThis with nothing — the harness process
  // never mutates its own store.
  const mod = (await import('../shared/data.ts')) as typeof import('../shared/data.ts')
  return (await mod.listItems()).slice(0, 100).map((i) => i.name)
}
