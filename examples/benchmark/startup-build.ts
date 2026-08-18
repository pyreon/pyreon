#!/usr/bin/env bun
/**
 * Shared build + serve infrastructure for `bench-startup.ts` and
 * `bench-memory.ts`.
 *
 * Produces ONE isolated production build per framework under
 * `dist-startup/<slug>/`, each containing a hand-written `index.html` plus the
 * emitted JS for exactly one framework, then serves the whole tree from a
 * single cross-origin-isolated preview server at `/<slug>/index.html`.
 *
 * ## Why isolated builds are mandatory here
 *
 * The op benchmark (`bench-fair.ts`) runs all eight frameworks out of ONE
 * bundle and selects between them with `?framework=X`. That is fine when you
 * are timing an operation on an already-mounted app. It is fatal for both
 * metric families added here:
 *
 *   - **startup**: script bootup time is parse + compile + evaluate of the
 *     page's scripts. In a shared bundle every framework's code is parsed, so
 *     all eight would report the same (huge) number.
 *   - **memory**: `performance.measureUserAgentSpecificMemory()` measures the
 *     whole agent, so seven idle frameworks would be charged to the eighth.
 *
 * ## Cross-origin isolation is REQUIRED, not an optimisation
 *
 * `measureUserAgentSpecificMemory()` is gated on `crossOriginIsolated`. The
 * preview server inherits the COOP/COEP headers from `vite.config.ts` (added
 * originally to lift `performance.now()` from a 100µs clamp to 5µs). The
 * memory bench asserts isolation in-page rather than assuming it — a silently
 * non-isolated page would make the API throw, and a harness that caught that
 * and fell back to `performance.memory` would be quietly reporting a
 * different, JS-heap-only metric under the same name.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const DIST_ROOT = join(HERE, 'dist-startup')

export interface StartupTarget {
  /** Canonical framework name — matches `bench-fair.ts` ALL_FRAMEWORKS. */
  name: string
  /** URL/dir slug. */
  slug: string
  /** Entry module under src/startup/. */
  entry: string
}

/**
 * Canonical order — the same as `bench-fair.ts` so tables line up column for
 * column with the op benchmark's output.
 */
export const TARGETS: readonly StartupTarget[] = [
  { name: 'Vanilla JS', slug: 'vanilla', entry: 'entry-vanilla.ts' },
  { name: 'Preact', slug: 'preact', entry: 'entry-preact.ts' },
  { name: 'React 19', slug: 'react', entry: 'entry-react.ts' },
  { name: 'Vue 3', slug: 'vue', entry: 'entry-vue.ts' },
  { name: 'SolidJS', slug: 'solid', entry: 'entry-solid.ts' },
  { name: 'Svelte 5', slug: 'svelte', entry: 'entry-svelte.ts' },
  { name: 'Octane', slug: 'octane', entry: 'entry-octane.ts' },
  { name: 'Pyreon', slug: 'pyreon', entry: 'entry-pyreon.ts' },
]

export interface AssetSizes {
  /** Sum of raw bytes of every emitted .js. krausest `41_size-uncompressed`. */
  raw: number
  /**
   * Sum of brotli(quality 11) bytes of every emitted .js.
   * krausest `42_size-compressed` — brotli, not gzip. See `bench-startup.ts`.
   */
  brotli: number
  /**
   * Sum of gzip(level 9) bytes — NOT a krausest metric. Carried only so the
   * numbers here can be reconciled against `bench-bundle.ts`, which is gzip.
   */
  gzip: number
  files: number
}

/** Measure every emitted `.js` under `dir`, in all three encodings. */
export function measureAssets(dir: string): AssetSizes {
  let raw = 0
  let brotli = 0
  let gzip = 0
  let files = 0
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f.endsWith('.js')) {
        const buf = readFileSync(p)
        raw += buf.length
        // Quality 11 = brotli's max, what a CDN serves for static assets and
        // what krausest's server uses for `42_size-compressed`.
        brotli += brotliCompressSync(buf, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
        }).length
        // Level 9 — the same gzip the repo's bundle-budget gates and
        // `bench-bundle.ts` use, so the two are directly comparable.
        gzip += gzipSync(buf, { level: 9 }).length
        files++
      }
    }
  }
  walk(dir)
  return { raw, brotli, gzip, files }
}

/**
 * Build every target into `dist-startup/<slug>/` and drop the shared
 * `index.html` beside the emitted JS.
 *
 * Each build is a separate `vite build` process with the SAME config, plugin
 * set and minifier — the only variable is which entry module is the rollup
 * input. That is what makes the sizes comparable.
 */
export function buildAll(targets: readonly StartupTarget[] = TARGETS): Map<string, AssetSizes> {
  const shell = readFileSync(join(HERE, 'src/startup/index.html'), 'utf8')
  const sizes = new Map<string, AssetSizes>()
  rmSync(DIST_ROOT, { recursive: true, force: true })
  mkdirSync(DIST_ROOT, { recursive: true })

  for (const t of targets) {
    const outDir = join(DIST_ROOT, t.slug)
    const entryFile = join(HERE, 'src/startup', t.entry)
    console.log(`[startup-build] building ${t.name}…`)
    execSync(`bunx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir`, {
      cwd: HERE,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        BENCH_STARTUP_ENTRY: entryFile,
      },
    })
    writeFileSync(join(outDir, 'index.html'), shell)
    sizes.set(t.name, measureAssets(outDir))
  }
  return sizes
}

export interface PreviewServer {
  baseUrl: string
  stop: () => void
}

/**
 * Serve `dist-startup/` on `port` with the config's COOP/COEP headers.
 *
 * `--strictPort` is a MEASUREMENT-INTEGRITY flag, exactly as in
 * `bench-fair.ts`: without it vite silently walks to the next free port and
 * the harness would happily measure whatever a stale server from an earlier
 * run is still holding. This campaign has already lost a full A/B to that
 * failure mode (both arms served the same stale bundle and produced a stable,
 * plausible, entirely wrong delta of 0.00).
 */
export async function startPreview(port: number): Promise<PreviewServer> {
  const proc: ChildProcess = spawn(
    'bun',
    ['x', 'vite', 'preview', '--outDir', DIST_ROOT, '--port', String(port), '--strictPort'],
    { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const baseUrl = await new Promise<string>((res, rej) => {
    const timeout = setTimeout(() => rej(new Error('preview server start timeout')), 20_000)
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      const m = text.match(/http:\/\/localhost:(\d+)/)
      if (!m) return
      clearTimeout(timeout)
      if (m[1] !== String(port)) {
        rej(
          new Error(
            `preview announced :${m[1]} but :${port} was requested — refusing to measure a ` +
              `server this harness did not start`,
          ),
        )
        return
      }
      res(`http://localhost:${port}`)
    })
    proc.on('exit', (code) =>
      rej(
        new Error(
          `preview exited with code ${code}. With --strictPort this usually means :${port} is ` +
            `already held (a stale preview, or a parallel worktree). Free it — do NOT retry on ` +
            `another port, that is how you end up measuring someone else's build.`,
        ),
      ),
    )
  })
  return { baseUrl, stop: () => proc.kill('SIGTERM') }
}

/** 1-minute load average, stamped before and after every measured pass. */
export function loadAvg1(): number {
  return Number(execSync("uptime | sed 's/.*load averages*: *//' | awk '{print $1}'").toString().trim())
}

/**
 * Verify that what the SERVER hands out is byte-for-byte the build this
 * process just produced — for every target, before any measurement.
 *
 * Nine wrong-arm incidents in this campaign came from measuring a file the
 * harness did not write; one of them was a stale `vite preview` whose file map
 * served the same bundle to both arms of an A/B and produced a stable,
 * plausible, entirely wrong delta of 0.00. `--strictPort` makes the common
 * cause loud, but it cannot catch a preview started against a stale `dist-`
 * directory, or a `base` misconfiguration that serves a different file than
 * the one on disk.
 *
 * Comparing SHA-256 rather than length: two builds of different frameworks
 * would differ in length, but a stale build of the SAME framework may not.
 *
 * Throws naming the mismatch. It must never be caught and downgraded to a
 * warning — a run that cannot prove which bytes it measured has no result.
 */
export async function verifyServedArms(
  baseUrl: string,
  targets: readonly StartupTarget[],
): Promise<void> {
  for (const t of targets) {
    const onDisk = readFileSync(join(DIST_ROOT, t.slug, 'entry.js'))
    const res = await fetch(`${baseUrl}/${t.slug}/entry.js`)
    if (!res.ok) {
      throw new Error(`[arm-check] ${t.name}: server returned ${res.status} for /${t.slug}/entry.js`)
    }
    const served = Buffer.from(await res.arrayBuffer())
    const a = createHash('sha256').update(onDisk).digest('hex').slice(0, 16)
    const b = createHash('sha256').update(served).digest('hex').slice(0, 16)
    if (a !== b) {
      throw new Error(
        `[arm-check] ${t.name}: served bytes != on-disk bytes ` +
          `(disk sha ${a} / ${onDisk.length}B, served sha ${b} / ${served.length}B). ` +
          `The preview server is serving a build this process did not produce — refusing to measure.`,
      )
    }
  }
  console.log(`[arm-check] ${targets.length} served bundle(s) match on-disk bytes (sha256)`)
}
