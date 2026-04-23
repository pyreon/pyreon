#!/usr/bin/env bun
/**
 * Record a perf-harness journey.
 *
 *   bun run scripts/perf/record.ts --app perf-dashboard --journey boot
 *
 * Workflow:
 *   1. Start the example's Vite dev (or preview) server.
 *   2. Launch a headless Chromium via Playwright.
 *   3. Navigate to the app, wait for counters to install.
 *   4. Reset counters → run the journey → snapshot counters.
 *   5. Repeat N times, take median of each counter.
 *   6. Write `perf-results/<sha>-<app>-<journey>.json`.
 *
 * Exit codes mean something distinct so CI can classify failures:
 *   1  — argv / config problem
 *   2  — server didn't start or didn't respond
 *   3  — browser navigation or journey threw
 *   4  — harness not installed (counters empty — means the app forgot `install()`)
 */
import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')

// ── argv parsing ─────────────────────────────────────────────────────────────

interface Args {
  app: string
  journey: string
  runs: number
  mode: 'dev' | 'preview'
  outDir: string
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { runs: 5, mode: 'dev' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if (a === '--app' && v) {
      args.app = v
      i++
    } else if (a === '--journey' && v) {
      args.journey = v
      i++
    } else if (a === '--runs' && v) {
      args.runs = Number(v)
      i++
    } else if (a === '--mode' && (v === 'dev' || v === 'preview')) {
      args.mode = v
      i++
    } else if (a === '--out' && v) {
      args.outDir = v
      i++
    }
  }
  if (!args.app || !args.journey) {
    console.error('usage: bun run scripts/perf/record.ts --app <name> --journey <name> [--runs 5] [--mode dev|preview] [--out perf-results]')
    process.exit(1)
  }
  args.outDir = args.outDir ?? resolve(REPO_ROOT, 'perf-results')
  return args as Args
}

// ── Example server ───────────────────────────────────────────────────────────

interface ServerHandle {
  url: string
  stop: () => Promise<void>
}

async function startServer(app: string, mode: 'dev' | 'preview'): Promise<ServerHandle> {
  const cwd = resolve(REPO_ROOT, 'examples', app)
  if (!existsSync(resolve(cwd, 'package.json'))) {
    console.error(`[record] example not found: examples/${app}`)
    process.exit(1)
  }

  if (mode === 'preview') {
    // Preview mode: build once, then serve the built artifacts.
    console.log(`[record] building examples/${app}`)
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
        rejectPromise(new Error(`[record] server start timeout (30s) for ${app}/${mode}`))
      }
    }, 30_000)

    const onData = (chunk: Buffer) => {
      const line = chunk.toString()
      process.stderr.write(`[${app}:${mode}] ${line}`)
      // Match Vite's ready line: "Local:   http://localhost:XXXX/"
      const match = /Local:\s+(https?:\/\/[^\s]+)\//i.exec(line)
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
        rejectPromise(new Error(`[record] server exited before ready: ${app}/${mode} (code=${code})`))
      }
    })
  })
}

// ── Snapshot I/O over Playwright ─────────────────────────────────────────────

async function resetCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __pyreon_perf__?: { reset: () => void } }
    w.__pyreon_perf__?.reset()
  })
}

async function snapshotCounters(page: Page): Promise<Record<string, number>> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __pyreon_perf__?: { snapshot: () => Record<string, number> }
    }
    return w.__pyreon_perf__?.snapshot() ?? {}
  })
}

// ── Journey catalog ──────────────────────────────────────────────────────────

// Import an example's journey module. Paths are relative to repo root.
async function loadJourneys(
  app: string,
): Promise<Record<string, (page: Page) => Promise<void>>> {
  const mod = (await import(resolve(REPO_ROOT, 'examples', app, 'src', 'journeys.ts'))) as {
    journeys: Record<string, (page: Page) => Promise<void>>
  }
  if (!mod.journeys || typeof mod.journeys !== 'object') {
    console.error(`[record] examples/${app}/src/journeys.ts must export a \`journeys\` object`)
    process.exit(1)
  }
  return mod.journeys
}

// ── Main ─────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return sorted[mid] ?? 0
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim()
  } catch {
    return 'unknown'
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const journeys = await loadJourneys(args.app)
  const journeyFn = journeys[args.journey]
  if (!journeyFn) {
    console.error(
      `[record] unknown journey: ${args.journey}. Available: ${Object.keys(journeys).join(', ')}`,
    )
    process.exit(1)
  }

  let server: ServerHandle | null = null
  try {
    server = await startServer(args.app, args.mode)
  } catch (err) {
    console.error(`[record] could not start server: ${String(err)}`)
    process.exit(2)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const allRuns: Record<string, number>[] = []
  const wallMs: number[] = []
  const heapBytes: number[] = []

  try {
    await page.goto(server.url, { waitUntil: 'networkidle', timeout: 15_000 })
    // Verify the harness installed.
    const installed = await page.evaluate(() =>
      typeof (window as unknown as { __pyreon_perf__?: unknown }).__pyreon_perf__ !== 'undefined',
    )
    if (!installed) {
      console.error(
        `[record] harness not installed on ${args.app}. Ensure its entry calls perfHarness.install() in dev.`,
      )
      process.exit(4)
    }

    for (let run = 0; run < args.runs; run++) {
      await resetCounters(page)
      const start = Date.now()
      await journeyFn(page)
      const wall = Date.now() - start
      const after = await snapshotCounters(page)
      const heap = await page.evaluate(() => {
        const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
        return mem?.usedJSHeapSize ?? 0
      })
      allRuns.push(after)
      wallMs.push(wall)
      heapBytes.push(heap)
      process.stderr.write(`[record] run ${run + 1}/${args.runs} — ${wall}ms\n`)
    }
  } catch (err) {
    console.error(`[record] journey failed: ${String(err)}`)
    await browser.close()
    await server.stop()
    process.exit(3)
  }

  await browser.close()
  await server.stop()

  // ── Aggregate: median of each counter across runs ──────────────────────────
  const names = new Set<string>()
  for (const snap of allRuns) for (const k of Object.keys(snap)) names.add(k)

  const counters: Record<string, number> = {}
  for (const name of names) {
    const values = allRuns.map((r) => r[name] ?? 0)
    counters[name] = median(values)
  }

  const output = {
    sha: gitSha(),
    app: args.app,
    journey: args.journey,
    mode: args.mode,
    runs: args.runs,
    timestamp: new Date().toISOString(),
    medianWallMs: median(wallMs),
    medianHeapBytes: median(heapBytes),
    counters,
  }

  mkdirSync(args.outDir, { recursive: true })
  const fileName = `${output.sha}-${args.app}-${args.journey}.json`
  const filePath = resolve(args.outDir, fileName)
  writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`)

  console.log(JSON.stringify(output, null, 2))
  console.error(`[record] wrote ${filePath}`)
}

main().catch((err) => {
  console.error(`[record] unexpected error: ${String(err)}`)
  process.exit(3)
})
