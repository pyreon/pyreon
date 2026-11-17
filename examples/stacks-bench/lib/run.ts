/**
 * One run = one directory, `results/<runId>/`:
 *
 *   run.json    the run manifest (`RunManifest`): machine, tool versions, harness
 *               commit, knobs, the order the arms were measured in
 *   <arm>.json  one `ArmResult` per measured arm (see `lib/result.ts`)
 *
 * Nothing here decides whether a result is published. `runConditions` only
 * checks the mechanical conditions `results/README.md` lists, so a run that
 * cannot be published says so in its own report.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { join } from 'node:path'
import { type MachineIdentity, machineIdentity } from '../../benchmark/machine-load'
import type { ArmResult } from './result'
import { APPS, loadStacks, ROOT } from './stacks'

export const RESULT_SCHEMA = 1
export const RESULTS = join(ROOT, 'results')

/** Node versions every arm's own `engines` accept (SolidStart 2 and Nuxt 4 set the floor). */
export const MIN_NODE = [24, 15] as const

/** The 1-minute load average a publishable run stays at or under, before and after every arm. */
export const PUBLISHABLE_MAX_LOAD = 4

/** The harness defaults. A publishable run uses these values or higher. */
export const DEFAULT_KNOBS = {
  starts: 5,
  browserStarts: 2,
  loads: 8,
  durationS: 10,
  warmupS: 3,
  connections: 50,
  ttfbRequests: 200,
} as const

export type Knobs = { -readonly [K in keyof typeof DEFAULT_KNOBS]: number }

export type ZeroSource = 'npm' | 'workspace'

export interface RunManifest {
  schema: typeof RESULT_SCHEMA
  runId: string
  startedAt: string
  /** Set when the last arm of the invocation finished. */
  finishedAt: string | null
  /** The commit of this repository the harness and the arms were read from. */
  harness: { commit: string | null; dirty: boolean | null }
  machine: MachineIdentity & { arch: string }
  tools: { bun: string; node: string; chromium: string; autocannon: string; playwright: string }
  knobs: Knobs
  /** The `--wait-quiet` ceiling the run waited for before every arm, or null. */
  waitQuiet: number | null
  /** Where the zero arm's `@pyreon/*` packages came from; null when zero was not measured. */
  zeroSource: ZeroSource | null
  /** Arm ids in the order they were measured. */
  order: string[]
}

export interface Condition {
  name: string
  ok: boolean
  detail: string
}

function git(args: string[]): string | null {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })

  return r.status === 0 ? r.stdout.trim() : null
}

function packageVersion(name: string): string {
  const file = join(ROOT, 'node_modules', name, 'package.json')
  if (!existsSync(file)) return 'NOT INSTALLED'

  return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version
}

/** `npm` when `apps/zero` has its own install of the published packages, else `workspace`. */
export function zeroSource(): ZeroSource {
  return existsSync(join(APPS, 'zero', 'node_modules', '@pyreon', 'zero')) ? 'npm' : 'workspace'
}

export function nodeVersion(): string {
  const r = spawnSync('node', ['-v'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('[stacks-bench] `node` is not on PATH; every arm is served by Node')

  return r.stdout.trim()
}

/** Throws when the Node on PATH is older than an arm's own `engines` allows. */
export function assertNode(version: string): void {
  const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number)
  const tooOld = major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])
  if (tooOld) {
    throw new Error(
      `[stacks-bench] Node ${version} is older than ${MIN_NODE.join('.')}, the lowest version every arm's ` +
        'engines field accepts. Put a newer Node first on PATH.',
    )
  }
}

export function newRunId(now = new Date()): string {
  return now.toISOString().replace(/\.\d+Z$/, 'Z').replaceAll(':', '-')
}

export function runDir(runId: string): string {
  return join(RESULTS, runId)
}

/** Opens `results/<runId>/`; an existing run (same `STACKS_RUN_ID`) keeps its manifest and gains arms. */
export function openRun(
  runId: string,
  init: Pick<RunManifest, 'knobs' | 'waitQuiet'> & { chromium: string; node: string },
): RunManifest {
  const dir = runDir(runId)
  const file = join(dir, 'run.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as RunManifest
  mkdirSync(dir, { recursive: true })
  const status = git(['status', '--porcelain'])
  const manifest: RunManifest = {
    schema: RESULT_SCHEMA,
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    harness: { commit: git(['rev-parse', 'HEAD']), dirty: status === null ? null : status !== '' },
    machine: { ...machineIdentity(), arch: os.arch() },
    tools: {
      bun: process.versions.bun ?? 'unknown',
      node: init.node,
      chromium: init.chromium,
      autocannon: packageVersion('autocannon'),
      playwright: packageVersion('playwright'),
    },
    knobs: init.knobs,
    waitQuiet: init.waitQuiet,
    zeroSource: null,
    order: [],
  }
  writeFileSync(file, JSON.stringify(manifest, null, 1))

  return manifest
}

export function saveArm(manifest: RunManifest, arm: ArmResult): void {
  const dir = runDir(manifest.runId)
  writeFileSync(join(dir, `${arm.id}.json`), JSON.stringify(arm, null, 1))
  manifest.order = [...manifest.order.filter((id) => id !== arm.id), arm.id]
  if (arm.id === 'zero') manifest.zeroSource = zeroSource()
  manifest.finishedAt = new Date().toISOString()
  writeFileSync(join(dir, 'run.json'), JSON.stringify(manifest, null, 1))
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
  const dir = runDir(runId)
  const file = join(dir, 'run.json')
  if (!existsSync(file)) throw new Error(`[stacks-bench] ${file} does not exist; run \`bun bench-stacks.ts\` first`)
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as RunManifest
  if (manifest.schema !== RESULT_SCHEMA) {
    throw new Error(`[stacks-bench] ${file} has schema ${manifest.schema}; this harness reads schema ${RESULT_SCHEMA}`)
  }
  const arms = manifest.order.map((id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as ArmResult)

  return { manifest, arms }
}

/**
 * The mechanical conditions of `results/README.md`, checked against one run.
 * Passing them all does not make a verdict: that needs a second complete run
 * whose intervals agree.
 */
export function runConditions(manifest: RunManifest, arms: ArmResult[]): Condition[] {
  const every = loadStacks().filter((s) => !s.m.skip).map((s) => s.m.id)
  const missing = every.filter((id) => !manifest.order.includes(id))
  const loads = arms.flatMap((a) => [a.load.before[0] ?? 0, a.load.after[0] ?? 0])
  const peak = loads.length > 0 ? Math.max(...loads) : 0
  const errors = arms.reduce((n, a) => n + a.server.reduce((m, s) => m + s.errors + s.non2xx, 0), 0)
  const k = manifest.knobs
  const short = (Object.keys(DEFAULT_KNOBS) as (keyof Knobs)[]).filter((key) => k[key] < DEFAULT_KNOBS[key])

  return [
    {
      name: 'every arm measured in this run',
      ok: missing.length === 0,
      detail: missing.length === 0 ? `${every.length} arms` : `missing: ${missing.join(', ')}`,
    },
    {
      name: `1-minute load average at or under ${PUBLISHABLE_MAX_LOAD} around every arm`,
      ok: loads.length > 0 && peak <= PUBLISHABLE_MAX_LOAD,
      detail: `highest stamp ${peak.toFixed(2)}`,
    },
    {
      name: 'harness defaults or more samples',
      ok: short.length === 0,
      detail: short.length === 0 ? 'no knob lowered' : `lowered: ${short.join(', ')}`,
    },
    {
      name: 'committed harness and arms',
      ok: manifest.harness.commit !== null && manifest.harness.dirty === false,
      detail: `${manifest.harness.commit ?? 'no git commit'}${manifest.harness.dirty ? ' with uncommitted changes' : ''}`,
    },
    {
      name: 'zero arm installed from npm',
      ok: manifest.zeroSource === 'npm',
      detail: `zero source: ${manifest.zeroSource ?? 'not measured'}`,
    },
    {
      name: 'no errors or non-2xx responses under load',
      ok: errors === 0,
      detail: `${errors} in total`,
    },
  ]
}
