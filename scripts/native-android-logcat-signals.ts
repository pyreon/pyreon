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
      const started = /^started: (.+)\((.+)\)$/.exec(l.msg)
      if (started) testOf.set(l.pid, `${started[2]}#${started[1]}`)
      continue
    }
    if (l.msg.includes('[Pyreon] <WebView>: the renderer process')) hit('webview-renderer-gone', l.pid, l)
    else if (/Render process \(\d+\)'s crash wasn't handled by all associated webviews/.test(l.msg)) hit('webview-renderer-unhandled', l.pid, l)
    else if (l.msg.includes('Using WebView from more than one process at once with the same data directory')) hit('webview-data-dir-lock', l.pid, l)

    if (l.tag === 'AndroidRuntime') {
      if (/^FATAL EXCEPTION\b/.test(l.msg)) pendingFatal.add(l.pid)
      else if (pendingFatal.has(l.pid)) {
        const proc = /^Process: ([^,\s]+)/.exec(l.msg)
        if (proc) {
          pendingFatal.delete(l.pid)
          if (APP.test(proc[1]!)) hit('app-fatal-exception', l.pid, l)
        }
      }
    }
    // Event-log payloads name the process: am_anr [user,pid,pkg,flags,reason],
    // am_kill [user,pid,pkg,adj,reason].
    const event = /^\[\d+,(\d+),([^,\]]+),[^,\]]*,(.*)\]$/.exec(l.msg)
    if (event && l.tag === 'am_kill' && RENDERER.test(event[2]!) && !ROUTINE_KILL.test(event[3]!)) {
      hit('webview-renderer-killed', Number(event[1]), l)
    }
    if (event && APP.test(event[2]!)) {
      if (l.tag === 'am_anr') hit('app-anr', Number(event[1]), l)
      else if (l.tag === 'am_kill' && !ROUTINE_KILL.test(event[3]!)) hit('app-killed', Number(event[1]), l)
    }
    const lmk = /Kill '([^']+)' \((\d+)\)/.exec(l.msg)
    if (l.tag === 'lowmemorykiller' && lmk && APP.test(lmk[1]!)) hit('app-killed', Number(lmk[2]), l)
    if (l.tag === 'lowmemorykiller' && lmk && RENDERER.test(lmk[1]!)) hit('webview-renderer-killed', Number(lmk[2]), l)
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
