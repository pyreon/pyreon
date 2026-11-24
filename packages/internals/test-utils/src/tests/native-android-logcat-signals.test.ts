// scripts/native-android-logcat-signals.ts counts process-death signals in the
// Android emulator steps' logcat on green runs too, so a renderer loss that
// PyreonWebView recovered from (a suspected cause of the 2026-11-23
// instrumentation crashes) is still counted. A signal is only evidence when it
// is attributed to a test that did not cause it on purpose, so the fixtures are
// multi-pid logcat in the `-v threadtime` shape the workflow records, one
// orchestrated test per pid.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXCERPT_LIMIT_BYTES, excerpt, scanDir, scanLogcat, summary } from '../../../../../scripts/native-android-logcat-signals'

const at = (s: number) => `11-23 21:16:${String(s).padStart(2, '0')}.100`

const line = (s: number, pid: number, level: string, tag: string, msg: string) =>
  `${at(s)}  ${pid}  ${pid} ${level} ${tag}: ${msg}`

const started = (s: number, pid: number, method: string, cls: string) =>
  line(s, pid, 'I', 'TestRunner', `started: ${method}(${cls})`)

const RENDERER_GONE =
  '[Pyreon] <WebView>: the renderer process was killed by the system (priority at exit 2); recreating the WebView and loading the page again.'

/** The renderer test kills the renderer on purpose; each loss logs the line. */
const INTENDED_KILLS = [
  started(1, 5001, 'aKilledRendererGetsANewWebViewInsteadOfKillingTheApp', 'com.pyreon.PyreonWebViewRendererGoneTest'),
  line(2, 5001, 'W', 'PyreonWebView', RENDERER_GONE),
  started(3, 5002, 'aRendererThatKeepsCrashingIsReloadedTwiceThenTheViewStaysEmpty', 'com.pyreon.PyreonWebViewRendererGoneTest'),
  line(4, 5002, 'W', 'PyreonWebView', '[Pyreon] <WebView>: the renderer process crashed; recreating the WebView and loading the page again.'),
  line(5, 5002, 'W', 'PyreonWebView', '[Pyreon] <WebView>: the renderer process crashed; it crashed 3 times in a row while this view was open, so this view stays empty until its html / src changes.'),
].join('\n')

/** Another package's crash: GMS. */
const GMS_CRASH = [
  line(6, 777, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'),
  line(6, 777, 'E', 'AndroidRuntime', 'Process: com.google.android.gms.persistent, PID: 777'),
  line(6, 777, 'E', 'AndroidRuntime', 'java.lang.IllegalStateException: boom'),
].join('\n')

/** The orchestrator's force-stops at the end of every test. */
const ORCHESTRATOR_KILLS = [
  started(7, 5003, 'serverRedirectPinsTheLandedOrigin', 'com.pyreon.PyreonWebViewOriginScopeTest'),
  line(8, 600, 'I', 'am_kill', '[0,5003,com.pyreon,0,stop com.pyreon due to finished inst]'),
  line(8, 600, 'I', 'am_kill', '[0,5003,com.pyreon,0,finished inst]'),
  line(8, 600, 'I', 'am_kill', '[0,5003,com.pyreon,0,clear data]'),
].join('\n')

/** A real renderer loss in a test that does not cause one. */
const REAL_LOSS = [
  started(9, 5004, 'bundledSrcCannotLeaveTheAssetDirectory', 'com.pyreon.PyreonWebViewOriginScopeTest'),
  line(10, 5004, 'W', 'PyreonWebView', RENDERER_GONE),
  line(10, 5004, 'W', 'PyreonWebView', RENDERER_GONE),
  line(10, 600, 'I', 'am_kill', '[0,5005,com.google.android.webview:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0,900,lmk]'),
].join('\n')

/** An app crash: WebView start-up throwing in a fresh process. */
const APP_CRASH = [
  started(11, 5006, 'inlineHtml_crossOriginFrameGetsNothing', 'com.pyreon.PyreonWebViewOriginScopeTest'),
  line(12, 5006, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'),
  line(12, 5006, 'E', 'AndroidRuntime', 'Process: com.pyreon, PID: 5006'),
  line(12, 5006, 'E', 'AndroidRuntime', 'java.lang.RuntimeException: Using WebView from more than one process at once with the same data directory is not supported. https://crbug.com/558377'),
  line(13, 600, 'I', 'am_anr', '[0,5006,com.pyreon,952745540,Input dispatching timed out]'),
].join('\n')

const signals = (text: string) => scanLogcat('tasks', text).map((h) => `${h.signal} ${h.test} ×${h.count}`)

describe('native-android-logcat-signals', () => {
  it('ignores the renderer losses a test causes on purpose', () => {
    expect(signals(INTENDED_KILLS)).toEqual([])
  })

  it("ignores another package's crash", () => {
    expect(signals(GMS_CRASH)).toEqual([])
  })

  it("ignores the orchestrator's force-stops at the end of each test", () => {
    expect(signals(ORCHESTRATOR_KILLS)).toEqual([])
  })

  it('attributes a real renderer loss to its test', () => {
    expect(signals(REAL_LOSS)).toEqual([
      'webview-renderer-gone com.pyreon.PyreonWebViewOriginScopeTest#bundledSrcCannotLeaveTheAssetDirectory ×2',
      'webview-renderer-killed (no test) ×1',
    ])
  })

  it('attributes an app crash, the WebView lock and an ANR to their test', () => {
    const t = 'com.pyreon.PyreonWebViewOriginScopeTest#inlineHtml_crossOriginFrameGetsNothing'
    expect(signals(APP_CRASH)).toEqual([`webview-data-dir-lock ${t} ×1`, `app-fatal-exception ${t} ×1`, `app-anr ${t} ×1`])
  })

  it('finds only the real signals in a whole step', () => {
    const all = [INTENDED_KILLS, GMS_CRASH, ORCHESTRATOR_KILLS, REAL_LOSS, APP_CRASH].join('\n')
    expect(signals(all)).toHaveLength(5)
    expect(summary([])).toContain('None')
  })

  it('writes a capped excerpt of the implicated processes, and skips media pulls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logcat-signals-'))
    const findings = join(dir, 'findings')
    writeFileSync(join(dir, 'tasks.txt'), [INTENDED_KILLS, REAL_LOSS].join('\n'))
    writeFileSync(join(dir, 'counter.txt'), INTENDED_KILLS)
    mkdirSync(join(dir, 'tasks-media'))
    const hits = scanDir(dir, findings)
    expect(new Set(hits.map((h) => h.app))).toEqual(new Set(['tasks']))
    const ex = readFileSync(join(findings, 'tasks.txt'), 'utf8')
    expect(ex).toContain('bundledSrcCannotLeaveTheAssetDirectory')
    expect(ex).not.toContain('PyreonWebViewRendererGoneTest')
    expect(summary(hits)).toContain('| tasks | webview-renderer-gone | com.pyreon.PyreonWebViewOriginScopeTest#bundledSrcCannotLeaveTheAssetDirectory | 2 |')
    expect(scanDir(join(dir, 'missing'))).toEqual([])

    const huge = Array.from({ length: 40_000 }, (_, i) => line(10, 5004, 'I', 'chromium', `noise ${i} ${'x'.repeat(80)}`)).join('\n')
    const capped = excerpt(`${REAL_LOSS}\n${huge}`, scanLogcat('tasks', REAL_LOSS))
    expect(capped.length).toBeLessThanOrEqual(EXCERPT_LIMIT_BYTES + 100)
    expect(capped).toContain('[truncated at')
  })
})
