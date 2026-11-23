/**
 * One run = one directory, `results/<runId>/`:
 *
 *   run.json    the run manifest (`RunManifest`): machine, tool versions,
 *               harness commit, knobs, throttle, timer, load stamps, arm order
 *   <arm>.json  one `ArmResult` per measured arm (see `result.ts`)
 *
 * Nothing here decides whether a result is published. `runConditions` checks
 * the mechanical conditions `results/README.md` lists, so a run that cannot be
 * published says so in its own report.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import { join } from 'node:path'
import {
  type LoadStamp,
  type MachineIdentity,
  machineIdentity,
} from '../../../benchmark/machine-load'
import { APP_ROOT, ARMS, loadArms } from './arms'
import type { ArmResult } from './result'

export const RESULT_SCHEMA = 1
export const RESULTS = join(APP_ROOT, 'results')

/** The 1-minute load average a publishable run stays at or under at every stamp. */
export const PUBLISHABLE_MAX_LOAD = 4

/** The coarsest `performance.now()` quantum the harness accepts (cross-origin isolated Chromium gives 5 µs). */
export const MAX_QUANTUM_MS = 0.02

/** The harness defaults. A publishable run uses these values or higher. */
export const DEFAULT_KNOBS = {
  /** Throttled first loads per arm for time to interactive. */
  loads: 15,
  /** Unthrottled pages per arm for memory. */
  memoryLoads: 3,
  /** Scripted sessions per memory page. */
  sessions: 5,
} as const

export type Knobs = { -readonly [K in keyof typeof DEFAULT_KNOBS]: number }

/**
 * The time-to-interactive throttle. CPU 4× slowdown plus a slow mobile network,
 * applied per page through the DevTools protocol (`Emulation.setCPUThrottlingRate`,
 * `Network.emulateNetworkConditions`): round-trip latency is added per request
 * and throughput is capped, both by Chromium itself ("DevTools throttling", not
 * Lighthouse's simulated throttling).
 */
export const THROTTLE_PROFILES = {
  mobile: { name: 'mobile', cpuRate: 4, latencyMs: 150, downloadKbps: 1600, uploadKbps: 750 },
  none: { name: 'none', cpuRate: 1, latencyMs: 0, downloadKbps: -1, uploadKbps: -1 },
} as const

export type Throttle = (typeof THROTTLE_PROFILES)[keyof typeof THROTTLE_PROFILES]
export const DEFAULT_THROTTLE: Throttle = THROTTLE_PROFILES.mobile

export type PyreonSource = 'npm' | 'workspace'

export interface RunManifest {
  schema: typeof RESULT_SCHEMA
  runId: string
  startedAt: string
  finishedAt: string | null
  /** The commit of this repository the harness and the arms were read from. */
  harness: { commit: string | null; dirty: boolean | null }
  machine: MachineIdentity & { arch: string }
  tools: { bun: string; chromium: string; playwright: string }
  knobs: Knobs
  throttle: Throttle
  timer: { crossOriginIsolated: boolean; quantumMs: number }
  /** The `--wait-quiet` ceiling, or null. */
  waitQuiet: number | null
  /** Where the pyreon arm's `@pyreon/*` came from; null when it was not measured. */
  pyreonSource: PyreonSource | null
  /** Arm ids measured in this run, in their base order (each round rotates it). */
  order: string[]
  /** `os.loadavg()` stamps: before and after every round and every phase. */
  loadStamps: LoadStamp[]
}

export interface Condition {
  name: string
  ok: boolean
  detail: string
}

function git(args: string[]): string | null {
  const r = spawnSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

export function playwrightVersion(): string {
  try {
    const file = createRequire(join(APP_ROOT, 'bench.ts')).resolve('playwright/package.json')
    return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version
  } catch {
    return 'NOT INSTALLED'
  }
}

/** `npm` when `arms/pyreon` has its own install of the published packages, else `workspace`. */
export function pyreonSource(): PyreonSource {
  return existsSync(join(ARMS, 'pyreon', 'node_modules', '@pyreon', 'core')) ? 'npm' : 'workspace'
}

export function newRunId(now = new Date()): string {
  return now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-')
}

export function runDir(runId: string): string {
  return join(RESULTS, runId)
}

export function openRun(
  init: Omit<
    RunManifest,
    'schema' | 'startedAt' | 'finishedAt' | 'harness' | 'machine' | 'loadStamps'
  >,
): RunManifest {
  mkdirSync(runDir(init.runId), { recursive: true })
  const status = git(['status', '--porcelain'])
  const manifest: RunManifest = {
    schema: RESULT_SCHEMA,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    harness: { commit: git(['rev-parse', 'HEAD']), dirty: status === null ? null : status !== '' },
    machine: { ...machineIdentity(), arch: os.arch() },
    loadStamps: [],
    ...init,
  }
  saveManifest(manifest)
  return manifest
}

export function saveManifest(manifest: RunManifest): void {
  writeFileSync(join(runDir(manifest.runId), 'run.json'), JSON.stringify(manifest, null, 1))
}

export function saveArm(manifest: RunManifest, arm: ArmResult): void {
  writeFileSync(join(runDir(manifest.runId), `${arm.id}.json`), JSON.stringify(arm, null, 1))
}

/** The newest run directory that holds a manifest, or null. Run ids sort by time. */
export function latestRunId(): string | null {
  if (!existsSync(RESULTS)) return null
  const ids = readdirSync(RESULTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(RESULTS, d.name, 'run.json')))
    .map((d) => d.name)
    .sort()
  return ids.at(-1) ?? null
}

export function readRun(runId: string): { manifest: RunManifest; arms: ArmResult[] } {
  const file = join(runDir(runId), 'run.json')
  if (!existsSync(file)) {
    throw new Error(`[real-bench/app] ${file} does not exist; run \`bun bench.ts\` first`)
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as RunManifest
  if (manifest.schema !== RESULT_SCHEMA) {
    throw new Error(
      `[real-bench/app] ${file} has schema ${manifest.schema}; this harness reads schema ${RESULT_SCHEMA}`,
    )
  }
  const arms = manifest.order
    .filter((id) => existsSync(join(runDir(runId), `${id}.json`)))
    .map((id) => JSON.parse(readFileSync(join(runDir(runId), `${id}.json`), 'utf8')) as ArmResult)
  return { manifest, arms }
}

/**
 * The mechanical conditions of `results/README.md`, checked against one run.
 * Passing them all does not make a verdict: that needs a second complete run
 * whose intervals agree.
 */
export function runConditions(manifest: RunManifest, arms: ArmResult[]): Condition[] {
  const every = loadArms().map((a) => a.m.id)
  const measured = new Set(arms.map((a) => a.id))
  const missing = every.filter((id) => !measured.has(id))
  const peak = manifest.loadStamps.reduce((m, s) => Math.max(m, s.load1), 0)
  const k = manifest.knobs
  const short = (Object.keys(DEFAULT_KNOBS) as (keyof Knobs)[]).filter(
    (key) => k[key] < DEFAULT_KNOBS[key],
  )
  const retried = arms.flatMap((a) => a.tti.filter((s) => s.attempts > 1).map(() => a.id))

  return [
    {
      name: 'every arm measured in this run',
      ok: missing.length === 0,
      detail: missing.length === 0 ? `${every.length} arms` : `missing: ${missing.join(', ')}`,
    },
    {
      name: `1-minute load average at or under ${PUBLISHABLE_MAX_LOAD} at every stamp`,
      ok: manifest.loadStamps.length > 0 && peak <= PUBLISHABLE_MAX_LOAD,
      detail: `highest stamp ${peak.toFixed(2)}`,
    },
    {
      name: 'harness defaults or more samples',
      ok: short.length === 0,
      detail: short.length === 0 ? 'no knob lowered' : `lowered: ${short.join(', ')}`,
    },
    {
      name: `the default throttle (${DEFAULT_THROTTLE.name})`,
      ok: manifest.throttle.name === DEFAULT_THROTTLE.name,
      detail: `throttle: ${manifest.throttle.name}`,
    },
    {
      name: `cross-origin isolated timer, quantum at or under ${MAX_QUANTUM_MS * 1000} µs`,
      ok: manifest.timer.crossOriginIsolated && manifest.timer.quantumMs <= MAX_QUANTUM_MS,
      detail: `isolated=${manifest.timer.crossOriginIsolated}, quantum ${(manifest.timer.quantumMs * 1000).toFixed(1)} µs`,
    },
    {
      name: 'committed harness and arms',
      ok: manifest.harness.commit !== null && manifest.harness.dirty === false,
      detail: `${manifest.harness.commit ?? 'no git commit'}${manifest.harness.dirty ? ' with uncommitted changes' : ''}`,
    },
    {
      name: 'pyreon arm installed from npm',
      ok: manifest.pyreonSource === 'npm',
      detail: `pyreon source: ${manifest.pyreonSource ?? 'not measured'}`,
    },
    {
      name: "every time-to-interactive probe's first input was handled",
      ok: retried.length === 0,
      detail:
        retried.length === 0
          ? 'no retries'
          : `retried in ${retried.length} load(s): ${[...new Set(retried)].join(', ')}`,
    },
  ]
}
