// scripts/native-android-logcat-signals.ts counts process-death signals in the
// Android emulator steps' logcat on green runs too, so a renderer loss that
// PyreonWebView recovered from (the suspected cause of the 2026-11-23
// instrumentation crashes) is still counted.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanDir, scanLogcat, summary } from '../../../../../scripts/native-android-logcat-signals'

const LOGCAT = [
  '11-23 21:16:40.101  4321  4321 I ActivityManager: Start proc 4321:com.pyreon/u0a190 for added application com.pyreon',
  "11-23 21:16:45.200  4321  4321 W PyreonWebView: [Pyreon] <WebView>: the renderer process was killed by the system (priority at exit 2); recreating the WebView and loading the page again.",
  "11-23 21:16:45.201  4321  4321 W PyreonWebView: [Pyreon] <WebView>: the renderer process crashed; recreating the WebView and loading the page again in 1000 ms (losses in a row back off).",
  "11-23 21:16:46.000  4400  4400 E chromium: [ERROR:aw_browser_terminator.cc(165)] Render process (4410)'s crash wasn't handled by all associated webviews, triggering application crash.",
  '11-23 21:16:47.000  4500  4500 E AndroidRuntime: FATAL EXCEPTION: main',
  '11-23 21:16:47.001  4500  4500 E AndroidRuntime: Process: com.pyreon, PID: 4500',
  '11-23 21:16:47.002  4500  4500 E AndroidRuntime: java.lang.RuntimeException: Using WebView from more than one process at once with the same data directory is not supported. https://crbug.com/558377',
  '11-23 21:16:48.000   600   650 I am_anr  : [0,4600,com.pyreon,952745540,Input dispatching timed out]',
  '11-23 21:16:49.000   600   650 I am_kill : [0,4700,com.pyreon,900,lmk]',
  '11-23 21:16:50.000   600   650 I am_kill : [0,4800,com.android.chrome,900,lmk]',
].join('\n')

describe('native-android-logcat-signals', () => {
  it('counts each signal once per app, with its first line', () => {
    const hits = scanLogcat('tasks', LOGCAT)
    expect(hits.map((h) => [h.signal, h.count])).toEqual([
      ['webview-renderer-gone', 2],
      ['webview-renderer-unhandled', 1],
      ['webview-data-dir-lock', 1],
      ['app-fatal-exception', 1],
      ['app-anr', 1],
      ['app-killed', 1],
    ])
    expect(hits[0]!.first).toContain('was killed by the system')
  })

  it('finds nothing in a quiet logcat', () => {
    expect(scanLogcat('finance', 'I ActivityManager: Start proc 1:com.pyreon/u0a1\n')).toEqual([])
    expect(summary([])).toContain('None.')
  })

  it('reads every <app>.txt and skips the media pull directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logcat-signals-'))
    writeFileSync(join(dir, 'tasks.txt'), LOGCAT)
    writeFileSync(join(dir, 'counter.txt'), 'nothing here\n')
    mkdirSync(join(dir, 'tasks-media'))
    const hits = scanDir(dir)
    expect(new Set(hits.map((h) => h.app))).toEqual(new Set(['tasks']))
    expect(summary(hits)).toContain('| tasks | webview-renderer-gone | 2 |')
    expect(scanDir(join(dir, 'missing'))).toEqual([])
  })
})
