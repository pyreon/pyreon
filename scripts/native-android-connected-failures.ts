#!/usr/bin/env bun
/**
 * Name the Android instrumented tests that failed, in the job log.
 *
 *   bun scripts/native-android-connected-failures.ts [repoRoot]
 *
 * `gradle connectedCheck` reports a failure as
 *
 *     > Task :app:connectedDebugAndroidTest FAILED
 *     > There were failing tests. See the report at: file:///…/index.html
 *
 * and nothing else: the test's name and its exception exist only in the HTML
 * report, which lives on the runner and in an artifact. Measured 2026-11-12
 * (runs 43195120647 and 43171644513): two red `native-tasks-android` steps,
 * neither naming a test; the causes (`hostedEditorsRoundTrip` timing out on a
 * typed edit, and a `CalledFromWrongThreadException` inside
 * `requestsCarryRuntimeValuesAndRejectNon2xx`) were readable only after
 * downloading the artifact.
 *
 * This reads every `examples/native-*-android` connected-test class report and
 * prints one `::error::` per failed test with the head of its stack trace. It
 * is diagnostic only: it always exits 0, and the step that ran the tests has
 * already failed the job.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export interface ConnectedFailure {
  className: string
  test: string
  /** The first lines of the stack trace, as the report shows them. */
  trace: string
}

const unescapeHtml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/**
 * Failures in one Gradle per-class report page (`<package>.<Class>.html`).
 *
 * The page lists each failed test as `<h3 class="failures">name</h3>` followed
 * by a `<pre>` holding its stack trace.
 */
export function parseClassReport(html: string, traceLines = 12): ConnectedFailure[] {
  const className = /<h1>Class ([^<]+)<\/h1>/.exec(html)?.[1]?.trim() ?? '(unknown class)'
  const out: ConnectedFailure[] = []
  const heading = /<h3 class="failures">([^<]+)<\/h3>/g
  for (let m = heading.exec(html); m; m = heading.exec(html)) {
    const rest = html.slice(m.index)
    const next = rest.indexOf('<h3 class="failures">', 1)
    const own = next === -1 ? rest : rest.slice(0, next)
    const pre = /<pre>([\s\S]*?)<\/pre>/.exec(own)?.[1] ?? ''
    const trace = unescapeHtml(pre).trim().split('\n').slice(0, traceLines).join('\n')
    out.push({ className, test: unescapeHtml(m[1]!.trim()), trace })
  }
  return out
}

function htmlFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p))
    else if (entry.endsWith('.html') && entry !== 'index.html') out.push(p)
  }
  return out
}

/** Every failure under `examples/native-*-android/app/build/reports/androidTests`. */
export function collectFailures(root: string): Array<ConnectedFailure & { report: string }> {
  const examples = join(root, 'examples')
  if (!existsSync(examples)) return []
  const out: Array<ConnectedFailure & { report: string }> = []
  for (const app of readdirSync(examples).sort()) {
    if (!/^native-.*-android$/.test(app)) continue
    for (const file of htmlFiles(join(examples, app, 'app/build/reports/androidTests')).sort()) {
      for (const f of parseClassReport(readFileSync(file, 'utf8'))) {
        out.push({ ...f, report: relative(root, file) })
      }
    }
  }
  return out
}

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd()
  const failures = collectFailures(root)
  if (failures.length === 0) {
    console.log(
      'android-connected-failures: no failed test in any connected-test report. The red step failed outside a test (build, install, emulator boot, a fixture server): read its own log.',
    )
  }
  for (const f of failures) {
    // `%0A` is a newline inside a workflow-command message.
    const firstLine = f.trace.split('\n')[0] ?? ''
    console.log(`::error title=Android test failed: ${f.className}.${f.test}::${firstLine}`)
    console.log(`--- ${f.className}.${f.test} (${f.report})`)
    console.log(f.trace)
  }
  process.exit(0)
}
