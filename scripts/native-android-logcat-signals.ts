#!/usr/bin/env bun
/**
 * Count the process-death signals in the Android emulator steps' logcat, on
 * green runs as well as red ones.
 *
 *   bun scripts/native-android-logcat-signals.ts [logcatDir]
 *
 * Every Android emulator step in `native-device.yml` records its full logcat
 * to `/tmp/android-logcat/<app>.txt`. A failed run uploads it with the
 * reports, but a RECOVERED event leaves a green run and no artifact: since
 * `PyreonWebView` reloads after its renderer process is gone, the suspected
 * cause of the 2026-11-23 "Test instrumentation process crashed" (two runs,
 * no logcat) would become invisible. This prints one `::warning::` per app
 * and signal with its count and first line, adds a table to the job summary,
 * and writes `found=true` to `$GITHUB_OUTPUT` so the workflow uploads the
 * logcat. Diagnostic only: it always exits 0.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface LogcatSignal {
  /** Short name used in the annotation and summary. */
  name: string
  /** What the signal means for a reader of the annotation. */
  meaning: string
  test: (line: string) => boolean
}

export const SIGNALS: LogcatSignal[] = [
  {
    name: 'webview-renderer-gone',
    meaning: 'a WebView renderer process died and PyreonWebView recovered (reload or empty view)',
    test: (l) => l.includes('[Pyreon] <WebView>: the renderer process'),
  },
  {
    name: 'webview-renderer-unhandled',
    meaning: 'a WebView renderer process died and a WebView did not handle it: the app process was killed',
    test: (l) => /Render process \(\d+\)'s crash wasn't handled by all associated webviews/.test(l),
  },
  {
    name: 'webview-data-dir-lock',
    meaning: 'two processes of the app used WebView with the same data directory',
    test: (l) => l.includes('Using WebView from more than one process at once with the same data directory'),
  },
  {
    name: 'app-fatal-exception',
    meaning: 'an uncaught exception ended a process (the next logcat line names it)',
    test: (l) => /FATAL EXCEPTION/.test(l),
  },
  {
    name: 'app-anr',
    meaning: 'an ANR in a com.pyreon process (with hide_error_dialogs the system kills it)',
    test: (l) => /\bam_anr\b.*com\.pyreon|ANR in com\.pyreon/.test(l),
  },
  {
    name: 'app-killed',
    meaning: 'the system killed a com.pyreon process (low memory or otherwise)',
    test: (l) => /\bam_kill\b.*com\.pyreon|lowmemorykiller.*com\.pyreon/.test(l),
  },
]

export interface SignalHit {
  app: string
  signal: string
  meaning: string
  count: number
  first: string
}

/** The hits in one app's logcat text, in SIGNALS order. */
export function scanLogcat(app: string, text: string): SignalHit[] {
  const hits = new Map<string, SignalHit>()
  for (const line of text.split('\n')) {
    for (const s of SIGNALS) {
      if (!s.test(line)) continue
      const hit = hits.get(s.name)
      if (hit) hit.count++
      else hits.set(s.name, { app, signal: s.name, meaning: s.meaning, count: 1, first: line.trim() })
    }
  }
  return SIGNALS.flatMap((s) => {
    const h = hits.get(s.name)
    return h ? [h] : []
  })
}

/** Every `<app>.txt` in [dir] (the media pulls are directories and are skipped). */
export function scanDir(dir: string): SignalHit[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.txt'))
    .sort()
    .flatMap((n) => scanLogcat(basename(n, '.txt'), readFileSync(join(dir, n), 'utf8')))
}

const escapeAnnotation = (s: string): string =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

export function summary(hits: SignalHit[]): string {
  if (hits.length === 0) return '### Android logcat signals\n\nNone.\n'
  const rows = hits.map((h) => `| ${h.app} | ${h.signal} | ${h.count} | ${h.meaning} |`)
  return ['### Android logcat signals', '', '| App | Signal | Count | Meaning |', '| --- | --- | --- | --- |', ...rows, ''].join('\n')
}

if (import.meta.main) {
  const dir = process.argv[2] ?? '/tmp/android-logcat'
  const hits = scanDir(dir)
  for (const h of hits) {
    console.log(
      `::warning title=Android logcat: ${h.signal}::${escapeAnnotation(`${h.app}: ${h.count}× ${h.meaning}. First: ${h.first.slice(0, 300)}`)}`,
    )
  }
  if (hits.length === 0) console.log(`no process-death signals in ${dir}`)
  const step = process.env.GITHUB_STEP_SUMMARY
  if (step) appendFileSync(step, summary(hits))
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `found=${hits.length > 0}\n`)
}
