/**
 * Shared machine-load stamping for the benchmark DRIVERS (Node side).
 *
 * Wall-clock numbers are only as trustworthy as the machine they were taken
 * on, and a load spike does not announce itself in a median. Every driver
 * therefore records `os.loadavg()` + CPU identity BEFORE and AFTER measuring
 * and writes it into any JSON it emits, so a reader can discard a run that was
 * taken on a busy box instead of discovering it later from an outlier.
 *
 * Waiting for a quiet machine is OPT-IN (`--wait-quiet [maxLoad]`): a default
 * wait would make every driver hang indefinitely on a shared/CI machine. The
 * crossover sweep, which discards per-cell on load, waits by default and keeps
 * doing so.
 *
 * This lives in its own module (not in each driver) so the stamp shape and the
 * wait policy cannot drift between drivers — they previously existed only in
 * `bench-crossover.ts`.
 */
import * as os from 'node:os'

/** Default ceiling for `--wait-quiet` with no explicit value. */
export const DEFAULT_QUIET_LOAD = 8

/** Default cap on how long `--wait-quiet` blocks before proceeding loudly. */
export const DEFAULT_QUIET_MAX_WAIT_MS = 300_000

export interface MachineIdentity {
  cpuModel: string
  logicalCores: number
  totalMemGb: number
  platform: string
  release: string
}

export interface LoadStamp {
  label: string
  at: string
  /** 1 / 5 / 15-minute load averages. */
  load1: number
  load5: number
  load15: number
}

export interface MachineReport {
  machine: MachineIdentity
  loadCeiling: number | null
  stamps: LoadStamp[]
}

export function machineIdentity(): MachineIdentity {
  const cpus = os.cpus()
  return {
    cpuModel: cpus[0]?.model ?? 'unknown',
    logicalCores: cpus.length,
    totalMemGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    platform: os.platform(),
    release: os.release(),
  }
}

export function loadAvg1(): number {
  return os.loadavg()[0] ?? 0
}

/**
 * Parse `--wait-quiet [maxLoad]` from argv. Returns the load ceiling to wait
 * for, or `null` when the flag is absent. The value is optional: a following
 * token that is not a positive number is left for the driver's own parser.
 */
export function parseWaitQuiet(argv: readonly string[]): number | null {
  const i = argv.indexOf('--wait-quiet')
  if (i < 0) return null
  const next = Number(argv[i + 1])
  return Number.isFinite(next) && next > 0 ? next : DEFAULT_QUIET_LOAD
}

/**
 * Where diagnostics go. Defaults to stdout; a driver whose stdout is a
 * machine-readable channel (bench-ssr's trailing JSON line) passes stderr.
 */
export type LogStream = Pick<NodeJS.WriteStream, 'write'>

/**
 * Block until the 1-minute load average is ≤ `ceiling`, or give up loudly
 * after `maxWaitMs`. The driver's own `bun run build` is itself a load spike
 * and the 1-minute average decays slowly, so without this the first cells of a
 * run are measured on a machine still recovering from the harness.
 */
export async function waitForQuietMachine(
  prefix: string,
  ceiling: number,
  maxWaitMs = DEFAULT_QUIET_MAX_WAIT_MS,
  out: LogStream = process.stdout,
): Promise<void> {
  const log = (line: string) => out.write(`${line}\n`)
  const started = Date.now()
  let l = loadAvg1()
  if (l <= ceiling) {
    log(`[${prefix}] machine already quiet (load1=${l.toFixed(2)} ≤ ${ceiling})`)
    return
  }
  log(`[${prefix}] waiting for machine to settle (load1=${l.toFixed(2)} > ${ceiling})…`)
  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5_000))
    l = loadAvg1()
    out.write(`\r[${prefix}]   load1=${l.toFixed(2)}          `)
    if (l <= ceiling) {
      log(`\n[${prefix}] settled after ${Math.round((Date.now() - started) / 1000)}s`)
      return
    }
  }
  log(
    `\n[${prefix}] ⚠ still load1=${l.toFixed(2)} after ${Math.round(maxWaitMs / 1000)}s — ` +
      `PROCEEDING, but every verdict from this run is suspect`,
  )
}

/**
 * Collects load stamps for one driver run. `stamp()` logs a line and records
 * it; `report()` is what goes into the JSON output.
 */
export class LoadRecorder {
  readonly stamps: LoadStamp[] = []
  constructor(
    private readonly prefix: string,
    /** Load above which a stamp is flagged as contaminated. `null` = never flag. */
    private readonly ceiling: number | null = null,
    private readonly out: LogStream = process.stdout,
  ) {}

  private log(line: string): void {
    this.out.write(`${line}\n`)
  }

  stamp(label: string): LoadStamp {
    const [l1 = 0, l5 = 0, l15 = 0] = os.loadavg()
    const s: LoadStamp = { label, at: new Date().toISOString(), load1: l1, load5: l5, load15: l15 }
    this.stamps.push(s)
    const flag =
      this.ceiling !== null && l1 > this.ceiling ? '  ⚠ ABOVE CEILING — run is contaminated' : ''
    this.log(
      `[${this.prefix}] ${label}: load1=${l1.toFixed(2)} load5=${l5.toFixed(2)} ` +
        `load15=${l15.toFixed(2)}${flag}`,
    )
    return s
  }

  report(): MachineReport {
    return { machine: machineIdentity(), loadCeiling: this.ceiling, stamps: this.stamps }
  }

  /** One-line identity, printed once at start so a log is self-describing. */
  printIdentity(): void {
    const m = machineIdentity()
    this.log(
      `[${this.prefix}] machine: ${m.cpuModel} (${m.logicalCores} logical cores, ` +
        `${m.totalMemGb} GB, ${m.platform} ${m.release})`,
    )
  }
}
