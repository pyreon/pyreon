#!/usr/bin/env bun
/**
 * Run one iOS UI-test suite for `native-device.yml`, with COUNTED, TARGETED
 * retries.
 *
 *   bun scripts/native-ios-uitest.ts --results <dir>/<name> -- xcodebuild test <args…>
 *
 * What it replaces: `xcodebuild test -retry-tests-on-failure -test-iterations 3
 * -test-repetition-relaunch-enabled YES`. Measured on run 43120354638
 * (2026-11-12, native-counter-ios): ONE failing test made xcodebuild execute
 * the WHOLE suite three times (28, 56, then 84 `Test Case` results; 9 minutes
 * per pass), so a single flake cost +18 macOS minutes on the smallest big
 * suite and cannot fit the job timeout on the largest one (23–30 minutes per
 * pass). A retry that passed was also invisible: the step was simply green.
 *
 * What it does:
 *   1. `build-for-testing` once. A compile or link failure fails here and is
 *      never retried.
 *   2. `test-without-building` once, over the whole suite.
 *   3. Only the tests that FAILED are re-run (`-only-testing:`), up to
 *      `--max-attempts` runs per test in total. A broad failure (more than
 *      `--max-retried-tests` failed tests) is not a flake and is not retried.
 *      A run that fails without naming any test (the runner never attached)
 *      re-runs the suite, and that is counted too.
 *   4. Every retry is reported: a `::warning::` per test that needed one, an
 *      `::error::` per test that failed every attempt, and a table in the job
 *      summary. The exit code is non-zero unless every test passed.
 *
 * Each attempt writes its own result bundle (`<name>.xcresult`,
 * `<name>-attempt2.xcresult`, …): xcodebuild refuses an existing path, and the
 * first failure's screenshots must survive the retry.
 *
 * The `xcodebuild test …` command stays in the workflow so that
 * `check-ios-signing-policy.ts` keeps seeing it; this script only swaps the
 * action word.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface TestResult {
  /** `Module/Class/method`, the form `-only-testing:` takes. */
  id: string
  status: 'passed' | 'failed' | 'skipped'
  seconds: number
}

const CASE_DONE = /Test Case '-\[(\S+?)\.(\S+) (\S+)\]' (passed|failed|skipped) \(([\d.]+) seconds\)/
const CASE_STARTED = /Test Case '-\[(\S+?)\.(\S+) (\S+)\]' started/

/**
 * Read the per-test results out of xcodebuild's console output.
 *
 * A skipped test (`XCTSkip`) is its own status and never a failure: the first
 * version of this parser knew only passed/failed, read the two deliberate
 * skips in the counter suite as "started, never finished", and failed a green
 * run (PR #4487, run 43217949673).
 *
 * With `inferCrashed`, a test that STARTED and never reported a result (the
 * runner crashed or was killed inside it) counts as failed with zero seconds,
 * so it is named and retried instead of vanishing from the tally. The caller
 * passes it only for a run xcodebuild itself reported as failed.
 */
export function parseTestResults(output: string, inferCrashed = false): TestResult[] {
  const done = new Map<string, TestResult>()
  const started: string[] = []
  for (const line of output.split('\n')) {
    const end = CASE_DONE.exec(line)
    if (end) {
      const id = `${end[1]}/${end[2]}/${end[3]}`
      done.set(id, { id, status: end[4] as TestResult['status'], seconds: Number(end[5]) })
      continue
    }
    const start = CASE_STARTED.exec(line)
    if (start) started.push(`${start[1]}/${start[2]}/${start[3]}`)
  }
  if (inferCrashed) {
    for (const id of started) {
      if (!done.has(id)) done.set(id, { id, status: 'failed', seconds: 0 })
    }
  }
  return [...done.values()]
}

/** Swap the xcodebuild ACTION (`test`) for another one, leaving every option in place. */
export function withAction(command: string[], action: string): string[] {
  const at = command.indexOf('test')
  if (at === -1) {
    throw new Error(
      '[Pyreon] ios-uitest: the command after `--` must contain the `test` action, e.g. `xcodebuild test -project …`.',
    )
  }
  return [...command.slice(0, at), action, ...command.slice(at + 1)]
}

export interface Attempt {
  /** 1-based. */
  n: number
  exitCode: number
  results: TestResult[]
  /** Seconds from starting xcodebuild to the first test starting (device wait, install, runner attach). */
  startupSeconds: number | undefined
}

export interface Outcome {
  ok: boolean
  /** Why the run stopped, for the log. */
  reason: 'passed' | 'build-failed' | 'broad-failure' | 'failed-every-attempt'
  attempts: Attempt[]
  /** Tests that failed at least once and then passed: `id -> attempt that passed`. */
  retried: Map<string, number>
  /** Tests (or `<suite>` for a run that named none) that never passed. */
  failed: string[]
}

export interface RunOptions {
  command: string[]
  results: string
  maxAttempts: number
  maxRetriedTests: number
  /** Runs one command, streams its output, resolves with exit code + captured output. */
  exec: (argv: string[]) => Promise<{ code: number; output: string; startupSeconds?: number }>
  log: (line: string) => void
}

/** A run that failed without naming a test: the runner never attached, or died before the first case. */
const SUITE = '<suite>'

export async function runSuite(o: RunOptions): Promise<Outcome> {
  const attempts: Attempt[] = []
  const retried = new Map<string, number>()

  o.log('ios-uitest: build-for-testing')
  const build = await o.exec(withAction(o.command, 'build-for-testing'))
  if (build.code !== 0) {
    return { ok: false, reason: 'build-failed', attempts, retried, failed: [] }
  }

  const base = withAction(o.command, 'test-without-building')
  let pending: string[] = [] // empty = the whole suite
  for (let n = 1; n <= o.maxAttempts; n++) {
    const bundle = n === 1 ? `${o.results}.xcresult` : `${o.results}-attempt${n}.xcresult`
    const only = pending.filter((id) => id !== SUITE).map((id) => `-only-testing:${id}`)
    o.log(
      n === 1
        ? 'ios-uitest: attempt 1, whole suite'
        : `ios-uitest: attempt ${n} of ${o.maxAttempts}, re-running ${only.length > 0 ? pending.join(', ') : 'the whole suite'}`,
    )
    const run = await o.exec([...base, ...only, '-resultBundlePath', bundle])
    const results = parseTestResults(run.output, run.code !== 0)
    attempts.push({ n, exitCode: run.code, results, startupSeconds: run.startupSeconds })

    // xcodebuild's exit code is the verdict; the parsed names say WHICH tests.
    let failedNow = run.code === 0 ? [] : results.filter((r) => r.status === 'failed').map((r) => r.id)
    // A non-zero exit that names no failed test is not a pass: the runner
    // never attached, or died outside a test. Re-run what this attempt was
    // asked to run (the whole suite on attempt 1).
    if (run.code !== 0 && failedNow.length === 0) failedNow = pending.length > 0 ? pending : [SUITE]
    for (const id of pending) if (!failedNow.includes(id)) retried.set(id, n)
    if (failedNow.length === 0) {
      return { ok: true, reason: 'passed', attempts, retried, failed: [] }
    }
    if (n === 1 && failedNow.length > o.maxRetriedTests) {
      return { ok: false, reason: 'broad-failure', attempts, retried, failed: failedNow }
    }
    pending = failedNow
  }
  return { ok: false, reason: 'failed-every-attempt', attempts, retried, failed: pending }
}

/** The report: annotations for the log, a table for the job summary. */
export function report(name: string, out: Outcome): { annotations: string[]; summary: string } {
  const annotations: string[] = []
  const first = out.attempts[0]?.results ?? []
  const total = first.reduce((s, r) => s + r.seconds, 0)
  const slowest = [...first].sort((a, b) => b.seconds - a.seconds).slice(0, 5)
  const lines = [`### iOS UI tests: ${name}`, '']
  if (out.reason === 'build-failed') {
    annotations.push(`::error::${name}: build-for-testing failed (see the compiler errors above); no test ran.`)
    lines.push('`build-for-testing` failed; no test ran.')
    return { annotations, summary: `${lines.join('\n')}\n` }
  }
  const skipped = first.filter((r) => r.status === 'skipped')
  const startup = out.attempts[0]?.startupSeconds
  lines.push(
    `${first.length} tests (${skipped.length} skipped), ${total.toFixed(0)} s in the first pass, ${out.attempts.length} xcodebuild test run(s).` +
      (startup === undefined ? '' : ` ${startup.toFixed(0)} s from starting xcodebuild to the first test.`),
    '',
  )
  for (const r of skipped) lines.push(`- skipped: \`${r.id}\``)
  if (skipped.length > 0) lines.push('')
  for (const [id, n] of out.retried) {
    annotations.push(
      `::warning::${name}: RETRIED ${id}: failed, then passed on attempt ${n}. A flake, or a race worth a fix.`,
    )
  }
  for (const id of out.failed) {
    annotations.push(
      out.reason === 'broad-failure'
        ? `::error::${name}: FAILED ${id} (${out.failed.length} tests failed in one pass; a broad failure is not retried).`
        : `::error::${name}: FAILED ${id} on every one of ${out.attempts.length} attempt(s).`,
    )
  }
  if (out.retried.size > 0 || out.failed.length > 0) {
    lines.push('| test | outcome |', '| --- | --- |')
    for (const [id, n] of out.retried) lines.push(`| \`${id}\` | retried, passed on attempt ${n} |`)
    for (const id of out.failed) lines.push(`| \`${id}\` | **failed** |`)
    lines.push('')
  }
  if (slowest.length > 0) {
    lines.push('Slowest tests (first pass):', '')
    for (const r of slowest) lines.push(`- ${r.seconds.toFixed(1)} s \`${r.id}\``)
  }
  return { annotations, summary: `${lines.join('\n')}\n` }
}

function streamingExec(argv: string[]): Promise<{ code: number; output: string; startupSeconds?: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] })
    // Keep only the lines the parser reads: a suite prints tens of thousands.
    let kept = ''
    let tail = ''
    const startedAt = Date.now()
    let firstTestAt: number | undefined
    const take = (chunk: Buffer, sink: NodeJS.WriteStream) => {
      sink.write(chunk)
      const text = tail + chunk.toString('utf8')
      const lines = text.split('\n')
      tail = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.includes("Test Case '")) continue
        firstTestAt ??= Date.now()
        kept += `${line}\n`
      }
    }
    child.stdout.on('data', (c: Buffer) => take(c, process.stdout))
    child.stderr.on('data', (c: Buffer) => take(c, process.stderr))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (tail.includes("Test Case '")) kept += `${tail}\n`
      resolve({
        code: code ?? (signal ? 1 : 0),
        output: kept,
        ...(firstTestAt === undefined ? {} : { startupSeconds: (firstTestAt - startedAt) / 1000 }),
      })
    })
  })
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  const split = argv.indexOf('--')
  const flags = split === -1 ? argv : argv.slice(0, split)
  const command = split === -1 ? [] : argv.slice(split + 1)
  const flag = (name: string): string | undefined => {
    const i = flags.indexOf(name)
    return i === -1 ? undefined : flags[i + 1]
  }
  const results = flag('--results')
  if (!results || command.length === 0) {
    console.error(
      '[Pyreon] ios-uitest: usage: bun scripts/native-ios-uitest.ts --results <dir>/<name> [--max-attempts 3] [--max-retried-tests 5] -- xcodebuild test <args…>',
    )
    process.exit(2)
  }
  mkdirSync(dirname(results), { recursive: true })
  const name = results.split('/').pop()!
  const out = await runSuite({
    command,
    results,
    maxAttempts: Number(flag('--max-attempts') ?? 3),
    maxRetriedTests: Number(flag('--max-retried-tests') ?? 5),
    exec: streamingExec,
    log: (l) => console.log(`\n=== ${l} ===`),
  })
  const { annotations, summary } = report(name, out)
  console.log(`\n${summary}`)
  for (const a of annotations) console.log(a)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  process.exit(out.ok ? 0 : 1)
}
