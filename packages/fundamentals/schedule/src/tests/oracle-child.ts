/**
 * The differential ORACLES (rrule and the brute-force expander) run in a child
 * process, so V8's coverage instrumenter never sees them.
 *
 * Neither oracle is this package's code: rrule is a devDependency and `brute.ts`
 * imports only types. Under `Coverage (Full)` both still ran with block counters
 * on (V8 instruments every function and the report filters afterwards), and on
 * a loaded 4-vCPU runner the rrule spec took 103.8 s of its 120 s budget. OUR
 * expansion still runs in the test process for every seed, so the coverage the
 * specs give is unchanged. The child is started first and works while the test
 * process expands the same seeds, so the two halves overlap.
 *
 * Results come back through a temp FILE, not stdout: captured child output is
 * not reliable under parallel load (.agents/rules/anti-patterns.md, "Test script
 * policy as a pure function, not through a subprocess").
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RRule } from 'rrule'
import { occurrencesBetween } from '../core'
import { brute } from './brute'
import { makeCase, toDate, wallOf, type Case } from './diff-gen'
import { makeWideCase } from './wide-gen'

export type OracleKind = 'rrule' | 'brute'

/** Why a random case is not compared with rrule (each reason is a documented divergence), or undefined when it is. */
export function skipReason(c: Case, found: number): string | undefined {
  const weekStart = (c.rule.weekStart ?? 1) % 7

  if (c.mixedDays) return 'D2 mixed plain and n-th BYDAY'
  if (found === 0) return 'empty window (rrule would scan to year 9999: D8)'
  if (c.rule.every === 'week' && c.rule.on?.position !== undefined && toDate(c.rule.start).getUTCDay() !== weekStart) return 'D4 position in the first, partial week'
  if (c.rule.every === 'year' && c.rule.on?.weeks !== undefined) return 'D5 week-year days outside the calendar year'
  if (c.rule.every === 'minute' && c.rule.on?.hours !== undefined) return 'D6 minutely grid after an hour filter'

  return undefined
}

/** rrule's occurrences for a generated case (sorted, de-duplicated wall times), or null when the case is skipped. */
function rruleOccurrences(seed: number): string[] | null {
  const c = makeCase(seed)
  const found = (occurrencesBetween(c.rule, c.rule.start, c.windowEnd as never) as string[]).length
  if (skipReason(c, found) !== undefined) return null
  const timed = c.rule.start.length > 10
  const rr = new RRule({ ...c.options, ...(c.count === undefined ? {} : { count: c.count }), until: toDate(c.windowEnd) } as never)
  const theirs = rr.between(toDate(c.rule.start), toDate(c.windowEnd), true).map((d) => wallOf(d, timed))

  return [...new Set(theirs)].sort()
}

/** The brute-force oracle's occurrences for a generated wide case. */
function bruteOccurrences(seed: number): string[] {
  const c = makeWideCase(seed)

  return brute(c.rule, c.windowEnd)
}

/**
 * Run one oracle over seeds `1..count` in a child `bun` process. Entry `i` belongs
 * to seed `i + 1`; for rrule it is null where {@link skipReason} skips the case.
 */
export function oracleInChild(kind: 'rrule', count: number): Promise<(string[] | null)[]>
export function oracleInChild(kind: 'brute', count: number): Promise<string[][]>
export function oracleInChild(kind: OracleKind, count: number): Promise<(string[] | null)[]> {
  const dir = mkdtempSync(join(tmpdir(), 'schedule-oracle-'))
  const output = join(dir, 'out.json')

  return new Promise<(string[] | null)[]>((resolve, reject) => {
    // Killed below the specs' 120 s budget, so a hung oracle fails as one and
    // the temp dir is still removed (the callback runs on the kill too).
    const options = { encoding: 'utf8' as const, timeout: 110_000, killSignal: 'SIGKILL' as const }
    execFile('bun', [__filename, kind, String(count), output], options, (error, _stdout, stderr) => {
      try {
        if (error) reject(new Error(`[schedule tests] the ${kind} oracle child failed: ${error.message} ${stderr}`))
        else resolve(JSON.parse(readFileSync(output, 'utf8')) as (string[] | null)[])
      } catch (e) {
        reject(e)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
}

if (import.meta.main) {
  const [kind, count, output] = process.argv.slice(2) as [OracleKind, string, string]
  const run = kind === 'rrule' ? rruleOccurrences : bruteOccurrences
  writeFileSync(output, JSON.stringify(Array.from({ length: Number(count) }, (_, i) => run(i + 1))))
}
