#!/usr/bin/env bun
/**
 * Count the process-death signals in the Android emulator steps' logcat, on
 * green runs as well as red ones, and name the test each one happened in.
 *
 *   bun scripts/native-android-logcat-signals.ts [logcatDir] [findingsDir]
 *
 * Every Android emulator step in `native-device.yml` records its full logcat
 * to `/tmp/android-logcat/<app>.txt`. A failed run uploads it with the
 * reports, but a RECOVERED event leaves a green run and no artifact: since
 * `PyreonWebView` reloads after its renderer process is gone, the suspected
 * cause of the 2026-11-23 "Test instrumentation process crashed" (two runs,
 * no logcat) would become invisible.
 *
 * A signal only means something when it is attributed to a test that did not
 * cause it on purpose, so every hit is attributed. Under the Test Orchestrator
 * each test runs in its own process, which logs `TestRunner: started:
 * <method>(<class>)` from its pid; a line from that pid (or an event naming it)
 * belongs to that test. Dropped:
 * - anything attributed to a test in INTENDED (they kill the renderer on purpose);
 * - another package's crash, ANR or kill (GMS, the launcher);
 * - the system's force-stops at the end of every orchestrated test
 *   (`am_kill` reasons `finished inst`, `clear data`, `stop <pkg>`).
 *
 * Prints one `::warning::` per app, signal and test, adds a table to the job
 * summary, writes `found=true` to `$GITHUB_OUTPUT`, and writes the lines of
 * each implicated process (capped) to `findingsDir/<app>.txt` for upload.
 * Diagnostic only: it always exits 0.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** Test classes that end the renderer on purpose. */
export const INTENDED = ['com.pyreon.PyreonWebViewRendererGoneTest']

/** The app packages under test. */
const APP = /^com\.pyreon(?:[.:]|$)/

/** WebView renderers run as the WebView provider's sandboxed processes, not as the app. */
const RENDERER = /^com\.(?:google\.)?android\.webview:sandboxed_process/

/** `am_kill` reasons that are the orchestrator's own clean-up, not a death. */
const ROUTINE_KILL = /finished inst|clear data|^stop /

/** Per-app cap of the findings excerpt. */
export const EXCERPT_LIMIT_BYTES = 2 * 1024 * 1024

export interface SignalHit {
  app: string
  signal: string
  meaning: string
  /** `Class#method`, or `(no test)` when the pid never started one. */
  test: string
  count: number
  first: string
  pids: number[]
}

const MEANING: Record<string, string> = {
  'webview-renderer-gone': 'a WebView renderer process died and PyreonWebView recovered (reload or empty view)',
  'webview-renderer-unhandled': 'a WebView renderer process died and a WebView did not handle it: WebView killed the app process',
  'webview-data-dir-lock': 'two processes of the app used WebView with the same data directory',
  'app-fatal-exception': 'an uncaught exception ended an app process',
  'app-anr': 'an app process stopped responding (with hide_error_dialogs the system kills it)',
  'app-killed': 'the system killed an app process (low memory or similar)',
  'webview-renderer-killed': 'the system killed a WebView renderer process (low memory or similar); which app it served is not in the line',
}

/** Signal order in the output. */
const ORDER = Object.keys(MEANING)

interface Line {
  pid: number
  tag: string
  msg: string
  raw: string
}

// `-v threadtime`: `MM-DD HH:MM:SS.mmm  PID  TID L TAG: message`
const THREADTIME = /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+(\d+)\s+\d+\s+[VDIWEFA]\s+(.*?)\s*: (.*)$/

function parse(raw: string): Line | null {
  const m = THREADTIME.exec(raw)
  return m ? { pid: Number(m[1]), tag: m[2]!, msg: m[3]!, raw } : null
}

/** A WebView signal logged by the process it happened in. */
function webviewSignal(msg: string): string | null {
  if (msg.includes('[Pyreon] <WebView>: the renderer process')) return 'webview-renderer-gone'
  if (/Render process \(\d+\)'s crash wasn't handled by all associated webviews/.test(msg)) return 'webview-renderer-unhandled'
  if (msg.includes('Using WebView from more than one process at once with the same data directory')) return 'webview-data-dir-lock'
  return null
}

/**
 * Whether this line completes an app `FATAL EXCEPTION`: AndroidRuntime logs
 * `FATAL EXCEPTION`, then `Process: <name>, PID: <pid>` from the same pid.
 */
function fatalSignal(l: Line, pending: Set<number>): boolean {
  if (l.tag !== 'AndroidRuntime') return false
  if (/^FATAL EXCEPTION\b/.test(l.msg)) {
    pending.add(l.pid)
    return false
  }
  const proc = pending.has(l.pid) ? /^Process: ([^,\s]+)/.exec(l.msg) : null
  if (!proc) return false
  pending.delete(l.pid)
  return APP.test(proc[1]!)
}

/** An ANR or kill the system logs about another process, named in the line. */
function processSignal(l: Line): { signal: string; pid: number } | null {
  // Event-log payloads: am_anr [user,pid,pkg,flags,reason], am_kill [user,pid,pkg,adj,reason].
  const event = /^\[\d+,(\d+),([^,\]]+),[^,\]]*,(.*)\]$/.exec(l.msg)
  if (event && (l.tag === 'am_anr' || l.tag === 'am_kill')) {
    const [, pid, name, reason] = event
    if (l.tag === 'am_anr') return APP.test(name!) ? { signal: 'app-anr', pid: Number(pid) } : null
    if (ROUTINE_KILL.test(reason!)) return null
    if (APP.test(name!)) return { signal: 'app-killed', pid: Number(pid) }
    return RENDERER.test(name!) ? { signal: 'webview-renderer-killed', pid: Number(pid) } : null
  }
  const lmk = l.tag === 'lowmemorykiller' ? /Kill '([^']+)' \((\d+)\)/.exec(l.msg) : null
  if (!lmk) return null
  if (APP.test(lmk[1]!)) return { signal: 'app-killed', pid: Number(lmk[2]) }
  return RENDERER.test(lmk[1]!) ? { signal: 'webview-renderer-killed', pid: Number(lmk[2]) } : null
}

/** The hits in one app's logcat text. */
export function scanLogcat(app: string, text: string): SignalHit[] {
  const testOf = new Map<number, string>()
  const lines = text.split('\n').map(parse).filter((l): l is Line => l !== null)
  const hits = new Map<string, SignalHit>()
  const pendingFatal = new Set<number>()

  const hit = (signal: string, pid: number, line: Line) => {
    const test = testOf.get(pid) ?? '(no test)'
    if (INTENDED.some((c) => test.startsWith(`${c}#`))) return
    const key = `${signal}\u0000${test}`
    const h = hits.get(key)
    if (h) {
      h.count++
      if (!h.pids.includes(pid)) h.pids.push(pid)
    } else {
      hits.set(key, { app, signal, meaning: MEANING[signal]!, test, count: 1, first: line.raw.trim(), pids: [pid] })
    }
  }

  for (const l of lines) {
    if (l.tag === 'TestRunner') {
      const t = /^started: (.+)\((.+)\)$/.exec(l.msg)
      if (t) testOf.set(l.pid, `${t[2]}#${t[1]}`)
      continue
    }
    const webview = webviewSignal(l.msg)
    if (webview) hit(webview, l.pid, l)
    if (fatalSignal(l, pendingFatal)) hit('app-fatal-exception', l.pid, l)
    const killed = processSignal(l)
    if (killed) hit(killed.signal, killed.pid, l)
  }

  return [...hits.values()].sort((a, b) => ORDER.indexOf(a.signal) - ORDER.indexOf(b.signal) || a.test.localeCompare(b.test))
}

/** The lines of the implicated processes, capped at [EXCERPT_LIMIT_BYTES]. */
export function excerpt(text: string, hits: SignalHit[]): string {
  const pids = new Set(hits.flatMap((h) => h.pids))
  let out = ''
  for (const raw of text.split('\n')) {
    const l = parse(raw)
    if (!l || !(pids.has(l.pid) || /^am_|lowmemorykiller|ActivityManager/.test(l.tag))) continue
    if (out.length + raw.length + 1 > EXCERPT_LIMIT_BYTES) return `${out}[truncated at ${EXCERPT_LIMIT_BYTES} bytes]\n`
    out += `${raw}\n`
  }

  return out
}

/** Every `<app>.txt` in [dir] (the media pulls are directories and are skipped). */
export function scanDir(dir: string, findingsDir?: string): SignalHit[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.txt'))
    .sort()
    .flatMap((n) => {
      const app = basename(n, '.txt')
      const text = readFileSync(join(dir, n), 'utf8')
      const hits = scanLogcat(app, text)
      if (findingsDir && hits.length > 0) {
        mkdirSync(findingsDir, { recursive: true })
        writeFileSync(join(findingsDir, `${app}.txt`), excerpt(text, hits))
      }

      return hits
    })
}

const escapeAnnotation = (s: string): string =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

export function summary(hits: SignalHit[]): string {
  if (hits.length === 0) return '### Android logcat signals\n\nNone (tests that end the renderer on purpose are excluded).\n'
  const rows = hits.map((h) => `| ${h.app} | ${h.signal} | ${h.test} | ${h.count} | ${h.meaning} |`)
  return ['### Android logcat signals', '', '| App | Signal | Test | Count | Meaning |', '| --- | --- | --- | --- | --- |', ...rows, ''].join('\n')
}

if (import.meta.main) {
  const dir = process.argv[2] ?? '/tmp/android-logcat'
  const findings = process.argv[3] ?? '/tmp/android-logcat-findings'
  const hits = scanDir(dir, findings)
  for (const h of hits) {
    console.log(
      `::warning title=Android logcat: ${h.signal}::${escapeAnnotation(`${h.app}, ${h.test}: ${h.count}× ${h.meaning}. First: ${h.first.slice(0, 300)}`)}`,
    )
  }
  if (hits.length === 0) console.log(`no process-death signals in ${dir}`)
  const step = process.env.GITHUB_STEP_SUMMARY
  if (step) appendFileSync(step, summary(hits))
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `found=${hits.length > 0}\n`)
}
