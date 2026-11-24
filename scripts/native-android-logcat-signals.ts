#!/usr/bin/env bun
/**
 * Count the process-death signals in the Android emulator steps' logcat, on
 * green runs as well as red ones, and name the test each one happened in.
 *
 *   bun scripts/native-android-logcat-signals.ts [logcatDir] [findingsDir]
 *
 * `findingsDir` defaults to `./android-logcat-findings` (the workspace on CI);
 * it is created 0700 and each excerpt 0600.
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
 * - anything but an `infra` signal attributed to a test in INTENDED (they kill
 *   the renderer on purpose);
 * - another package's crash, ANR or kill (GMS, the launcher);
 * - the system's force-stops at the end of every orchestrated test
 *   (`am_kill` reasons `finished inst`, `clear data`, `stop <pkg>`).
 *
 * A kill of an app process because ANOTHER package's process died while the app
 * held one of its content providers (`am_kill … depends on provider <p> in
 * dying proc <q>`) is its own signal of kind `infra`: on the google_apis
 * emulator Google Play services restarts all its processes once per boot, and
 * an app holding its font provider then dies mid-test (nightly run
 * 45437790724). Such a kill explains the death, so that test is not also
 * reported as `test-process-died`.
 *
 * Prints one `::warning::` per app, signal and test (the title says `infra`
 * for an infrastructure signal), adds a table to the job summary with the Play
 * services restarts of each capture, writes `found=true` to `$GITHUB_OUTPUT`,
 * and writes the lines of each implicated process (capped) to
 * `findingsDir/<app>.txt` for upload. Diagnostic only: it always exits 0.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** Test classes that end the renderer on purpose. */
export const INTENDED = ['com.pyreon.PyreonWebViewRendererGoneTest']

/** The app packages under test. */
const APP = /^com\.pyreon(?:[.:]|$)/

/** WebView renderers run as the WebView provider's sandboxed processes, not as the app. */
const RENDERER = /^com\.(?:google\.)?android\.webview:sandboxed_process/

/** `am_kill` reasons that are the orchestrator's own clean-up, not a death. */
function isRoutineKill(reason: string): boolean {
  return (
    reason.startsWith('stop ') ||
    reason.includes('finished inst') ||
    reason.includes('clear data') ||
    reason.includes('isolated not needed')
  )
}

/**
 * The workflow's per-app logcat capture limit (`head -c` in native-device.yml,
 * held equal by the test). A capture of exactly this size was cut off.
 */
export const CAPTURE_LIMIT_BYTES = 64 * 1024 * 1024

/** Per-app cap of the findings excerpt. */
export const EXCERPT_LIMIT_BYTES = 2 * 1024 * 1024

export interface SignalHit {
  app: string
  signal: string
  /** `infra`: the emulator or another package, not the app under test. */
  kind: 'app' | 'infra'
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
  'test-process-died': 'a test process died mid-test (started, never finished): the shape of "Test instrumentation process crashed", whatever the cause',
  'app-fatal-exception': 'an uncaught exception ended an app process',
  'app-native-crash': 'a native signal (SIGSEGV, SIGABRT, …) ended an app process',
  'app-anr': 'an app process stopped responding (with hide_error_dialogs the system kills it)',
  'app-killed': 'the system killed an app process (low memory or similar)',
  'app-killed-provider-died':
    "INFRA: the system killed an app process because another package's process died while the app held one of its content providers (Google Play services restarting, on the emulator). Not an app failure",
  'webview-renderer-killed': 'the system killed a WebView renderer process (low memory or similar); which app it served is not in the line',
  'capture-truncated': 'the logcat capture hit its size limit and was cut off: evidence after that point is missing',
}

/** Signal order in the output. */
const ORDER = Object.keys(MEANING)

/** Signals caused by the emulator or another package, not by the app under test. */
export const INFRA_SIGNALS: ReadonlySet<string> = new Set(['app-killed-provider-died', 'capture-truncated'])

/**
 * `am_kill` reason for a client of a provider whose host process died:
 * `depends on provider <component> in dying proc <process> (adj …)`.
 */
const PROVIDER_DEATH = /^depends on provider (\S+) in dying proc (\S+)/

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

/** `F libc: Fatal signal 11 (SIGSEGV), … pid 5007 (com.pyreon.PyreonTasks)`: the app pid, else null. */
function nativeCrash(l: Line): number | null {
  if (l.tag !== 'libc') return null
  const m = /^Fatal signal \d+.* pid (\d+) \(([^)]+)\)/.exec(l.msg)
  return m && APP.test(m[2]!) ? Number(m[1]) : null
}

/** An ANR or kill the system logs about another process, named in the line. */
function processSignal(l: Line): { signal: string; pid: number } | null {
  // Event-log payloads: am_anr [user,pid,pkg,flags,reason], am_kill [user,pid,pkg,adj,reason].
  const event = /^\[\d+,(\d+),([^,\]]+),[^,\]]*,(.*)\]$/.exec(l.msg)
  if (event && (l.tag === 'am_anr' || l.tag === 'am_kill')) {
    const [, pid, name, reason] = event
    if (l.tag === 'am_anr') return APP.test(name!) ? { signal: 'app-anr', pid: Number(pid) } : null
    if (isRoutineKill(reason!)) return null
    if (APP.test(name!)) {
      // The app's own provider process dying is the app's failure; another package's is not.
      const provider = PROVIDER_DEATH.exec(reason!)
      const infra = provider !== null && !APP.test(provider[2]!)
      return { signal: infra ? 'app-killed-provider-died' : 'app-killed', pid: Number(pid) }
    }
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
  const finished = new Set<number>()
  /** Pids whose death an infrastructure signal already explains. */
  const explained = new Set<number>()

  const hit = (signal: string, pid: number, line: Line) => {
    const test = testOf.get(pid) ?? '(no test)'
    // Infrastructure signals are kept: the renderer tests cause renderer losses, not those.
    if (!INFRA_SIGNALS.has(signal) && INTENDED.some((c) => test.startsWith(`${c}#`))) return
    const key = `${signal}\u0000${test}`
    const h = hits.get(key)
    if (h) {
      h.count++
      if (!h.pids.includes(pid)) h.pids.push(pid)
    } else {
      hits.set(key, {
        app,
        signal,
        kind: INFRA_SIGNALS.has(signal) ? 'infra' : 'app',
        meaning: MEANING[signal]!,
        test,
        count: 1,
        first: line.raw.trim(),
        pids: [pid],
      })
    }
  }

  for (const l of lines) {
    if (l.tag === 'TestRunner') {
      const t = /^started: (.+)\((.+)\)$/.exec(l.msg)
      if (t) testOf.set(l.pid, `${t[2]}#${t[1]}`)
      if (l.msg.startsWith('finished: ')) finished.add(l.pid)
      continue
    }
    const webview = webviewSignal(l.msg)
    if (webview) hit(webview, l.pid, l)
    if (fatalSignal(l, pendingFatal)) hit('app-fatal-exception', l.pid, l)
    const killed = processSignal(l)
    if (killed) {
      hit(killed.signal, killed.pid, l)
      if (INFRA_SIGNALS.has(killed.signal)) explained.add(killed.pid)
    }
    const native = nativeCrash(l)
    if (native !== null) hit('app-native-crash', native, l)
    const died = l.tag === 'am_proc_died' ? /^\[\d+,(\d+),/.exec(l.msg) : null
    const diedPid = died ? Number(died[1]) : -1
    if (died && testOf.has(diedPid) && !finished.has(diedPid) && !explained.has(diedPid)) hit('test-process-died', diedPid, l)
  }

  return [...hits.values()].sort((a, b) => ORDER.indexOf(a.signal) - ORDER.indexOf(b.signal) || a.test.localeCompare(b.test))
}

export interface PlayServicesActivity {
  app: string
  /** One entry per restart: its time and the test whose process was running then. */
  restarts: Array<{ at: string; test: string }>
  /**
   * Fonts Play services served in Chromium's query format
   * (`name=<family>&weight=<n>`): WebView's or Chrome's downloadable-font
   * lookup, the dependency native-android-emulator-prep.sh switches off in
   * WebView. Compose's emoji font uses a different query and is not counted.
   */
  chromiumFontQueries: number
}

/** `ChimeraModuleLdr: Module config changed, forcing restart …`, logged by each Play services process. */
const GMS_RESTART = /^Module config changed, forcing restart/

/** When Google Play services restarted itself during [text], and how often Chromium asked it for a font. */
export function playServicesActivity(app: string, text: string): PlayServicesActivity {
  const restarts: PlayServicesActivity['restarts'] = []
  const running = new Map<number, string>()
  let lastSecond = ''
  let chromiumFontQueries = 0
  for (const raw of text.split('\n')) {
    const l = parse(raw)
    if (!l) continue
    if (l.tag === 'TestRunner') {
      const t = /^started: (.+)\((.+)\)$/.exec(l.msg)
      if (t) running.set(l.pid, `${t[2]}#${t[1]}`)
      if (l.msg.startsWith('finished: ')) running.delete(l.pid)
      continue
    }
    if (l.tag === 'am_proc_died') {
      const d = /^\[\d+,(\d+),/.exec(l.msg)
      if (d) running.delete(Number(d[1]))
      continue
    }
    if (l.tag === 'FontLog' && l.msg.startsWith('Received query name=')) chromiumFontQueries++
    if (l.tag !== 'ChimeraModuleLdr' || !GMS_RESTART.test(l.msg)) continue
    // Every Play services process logs the restart within the same moment: one event per second.
    const second = raw.slice(0, 14)
    if (second === lastSecond) continue
    lastSecond = second
    restarts.push({ at: raw.slice(6, 18), test: [...running.values()].at(-1) ?? '(no test)' })
  }

  return { app, restarts, chromiumFontQueries }
}

/**
 * The system's own lines about processes, kept in every excerpt: event-log
 * tags starting `am_` (`am_kill`, `am_proc_died`, …) and the exact tags
 * `ActivityManager` and `lowmemorykiller`.
 */
export function isSystemProcessTag(tag: string): boolean {
  return tag.startsWith('am_') || tag === 'ActivityManager' || tag === 'lowmemorykiller'
}

/** The lines of the implicated processes, capped at [EXCERPT_LIMIT_BYTES]. */
export function excerpt(text: string, hits: SignalHit[]): string {
  const pids = new Set(hits.flatMap((h) => h.pids))
  let out = ''
  for (const raw of text.split('\n')) {
    const l = parse(raw)
    if (!l || !(pids.has(l.pid) || isSystemProcessTag(l.tag))) continue
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
      if (statSync(join(dir, n)).size === CAPTURE_LIMIT_BYTES) {
        hits.push({ app, signal: 'capture-truncated', kind: 'infra', meaning: MEANING['capture-truncated']!, test: '(capture)', count: 1, first: `${n} is ${CAPTURE_LIMIT_BYTES} bytes`, pids: [] })
      }
      if (findingsDir && hits.length > 0) {
        // Private to the runner user: the excerpt is app logcat.
        mkdirSync(findingsDir, { recursive: true, mode: 0o700 })
        writeFileSync(join(findingsDir, `${app}.txt`), excerpt(text, hits), { mode: 0o600 })
      }

      return hits
    })
}

const escapeAnnotation = (s: string): string =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

export function summary(hits: SignalHit[], activity: PlayServicesActivity[] = []): string {
  const out = ['### Android logcat signals', '']
  if (hits.length === 0) out.push('None (tests that end the renderer on purpose are excluded).')
  else {
    out.push('| App | Kind | Signal | Test | Count | Meaning |', '| --- | --- | --- | --- | --- | --- |')
    for (const h of hits) out.push(`| ${h.app} | ${h.kind} | ${h.signal} | ${h.test} | ${h.count} | ${h.meaning} |`)
  }
  if (activity.length > 0) {
    out.push(
      '',
      '#### Google Play services in each capture',
      '',
      'It restarts itself once per emulator boot; an app holding one of its providers then dies (`app-killed-provider-died`). Chromium font queries should be 0 while WebView runs without its downloadable-font lookup (scripts/native-android-emulator-prep.sh); Chrome itself is not covered.',
      '',
      '| App | Restarts (time: test running then) | Chromium font queries |',
      '| --- | --- | --- |',
    )
    for (const a of activity) {
      const restarts = a.restarts.map((r) => `${r.at}: ${r.test}`).join('<br>') || 'none'
      out.push(`| ${a.app} | ${restarts} | ${a.chromiumFontQueries} |`)
    }
  }
  out.push('')
  return out.join('\n')
}

/** [playServicesActivity] for every `<app>.txt` in [dir]. */
export function scanPlayServices(dir: string): PlayServicesActivity[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.txt'))
    .sort()
    .map((n) => playServicesActivity(basename(n, '.txt'), readFileSync(join(dir, n), 'utf8')))
}

if (import.meta.main) {
  const dir = process.argv[2] ?? '/tmp/android-logcat'
  // In the workspace (the workflow passes $GITHUB_WORKSPACE/android-logcat-findings), not the shared temp dir.
  const findings = process.argv[3] ?? join(process.cwd(), 'android-logcat-findings')
  const hits = scanDir(dir, findings)
  for (const h of hits) {
    console.log(
      `::warning title=Android logcat${h.kind === 'infra' ? ' (infra)' : ''}: ${h.signal}::${escapeAnnotation(`${h.app}, ${h.test}: ${h.count}× ${h.meaning}. First: ${h.first.slice(0, 300)}`)}`,
    )
  }
  if (hits.length === 0) console.log(`no process-death signals in ${dir}`)
  const step = process.env.GITHUB_STEP_SUMMARY
  if (step) appendFileSync(step, summary(hits, scanPlayServices(dir)))
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `found=${hits.length > 0}\n`)
}
