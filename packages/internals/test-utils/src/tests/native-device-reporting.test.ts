// The two reporters native-device.yml leans on:
//
//   scripts/native-ios-uitest.ts — counted, targeted XCUITest retries. Before it,
//   `-retry-tests-on-failure -test-iterations 3` re-ran the WHOLE suite for one
//   failed test (run 43120354638: 28 → 56 → 84 test results, +18 macOS minutes)
//   and a retry that passed left no trace.
//
//   scripts/native-android-connected-failures.ts — names the failed instrumented
//   tests, which `gradle connectedCheck` never prints (runs 43195120647,
//   43171644513).
//
//   scripts/native-gradle.sh — retries a failed dependency DOWNLOAD and only
//   that, with a warning per attempt (run 43158195101 went red on "Could not
//   resolve org.jetbrains.kotlin:kotlin-gradle-plugin").

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectFailures, parseClassReport } from '../../../../../scripts/native-android-connected-failures'
import { parseTestResults, report, runSuite, withAction } from '../../../../../scripts/native-ios-uitest'

const done = (cls: string, name: string, status: 'passed' | 'failed', s = '1.000') =>
  `Test Case '-[AppUITests.${cls} ${name}]' ${status} (${s} seconds).`

/** A fake xcodebuild: `plan[i]` is the output + exit code of the i-th invocation. */
function fakeExec(plan: Array<{ code: number; output: string }>) {
  const calls: string[][] = []
  const exec = async (argv: string[]) => {
    calls.push(argv)
    const step = plan[calls.length - 1]
    if (!step) throw new Error(`unexpected xcodebuild call #${calls.length}: ${argv.join(' ')}`)
    return step
  }
  return { calls, exec }
}

const COMMAND = ['xcodebuild', 'test', '-project', 'App.xcodeproj', '-scheme', 'App']
const run = (plan: Array<{ code: number; output: string }>, extra: { maxRetriedTests?: number } = {}) => {
  const fake = fakeExec(plan)
  const outcome = runSuite({
    command: COMMAND,
    results: '/r/app',
    maxAttempts: 3,
    maxRetriedTests: extra.maxRetriedTests ?? 5,
    exec: fake.exec,
    log: () => {},
  })
  return { fake, outcome }
}

describe('parseTestResults', () => {
  it('reads module, class, method, status and duration', () => {
    const r = parseTestResults(
      [done('Suite', 'test_a', 'passed', '12.345'), 'noise', done('Other', 'test_b', 'failed', '0.5')].join('\n'),
    )
    expect(r).toEqual([
      { id: 'AppUITests/Suite/test_a', status: 'passed', seconds: 12.345 },
      { id: 'AppUITests/Other/test_b', status: 'failed', seconds: 0.5 },
    ])
  })

  it('counts a test that started and never finished as failed', () => {
    const r = parseTestResults(
      [done('Suite', 'test_a', 'passed'), "Test Case '-[AppUITests.Suite test_crash]' started."].join('\n'),
    )
    expect(r.find((t) => t.id.endsWith('test_crash'))).toEqual({
      id: 'AppUITests/Suite/test_crash',
      status: 'failed',
      seconds: 0,
    })
  })
})

describe('withAction', () => {
  it('swaps only the action word', () => {
    expect(withAction(COMMAND, 'build-for-testing')).toEqual([
      'xcodebuild',
      'build-for-testing',
      '-project',
      'App.xcodeproj',
      '-scheme',
      'App',
    ])
  })
  it('rejects a command without the test action', () => {
    expect(() => withAction(['xcodebuild', 'build'], 'x')).toThrow(/must contain the `test` action/)
  })
})

describe('runSuite', () => {
  it('builds once and tests once when everything passes', async () => {
    const { fake, outcome } = run([
      { code: 0, output: '' },
      { code: 0, output: [done('S', 'test_a', 'passed'), done('S', 'test_b', 'passed')].join('\n') },
    ])
    const out = await outcome
    expect(out.ok).toBe(true)
    expect(out.retried.size).toBe(0)
    expect(fake.calls.map((c) => c[1])).toEqual(['build-for-testing', 'test-without-building'])
    expect(fake.calls[1]).toContain('/r/app.xcresult')
    expect(fake.calls[1]!.some((a) => a.startsWith('-only-testing:'))).toBe(false)
  })

  it('re-runs ONLY the failed test, in its own result bundle, and reports the retry', async () => {
    const { fake, outcome } = run([
      { code: 0, output: '' },
      {
        code: 65,
        output: [done('S', 'test_a', 'passed'), done('S', 'test_flaky', 'failed'), done('S', 'test_c', 'passed')].join(
          '\n',
        ),
      },
      { code: 0, output: done('S', 'test_flaky', 'passed') },
    ])
    const out = await outcome
    expect(out.ok).toBe(true)
    expect([...out.retried]).toEqual([['AppUITests/S/test_flaky', 2]])
    expect(fake.calls).toHaveLength(3)
    const retry = fake.calls[2]!
    expect(retry.filter((a) => a.startsWith('-only-testing:'))).toEqual(['-only-testing:AppUITests/S/test_flaky'])
    expect(retry).toContain('/r/app-attempt2.xcresult')

    const { annotations, summary } = report('app', out)
    expect(annotations).toEqual([
      '::warning::app: RETRIED AppUITests/S/test_flaky: failed, then passed on attempt 2. A flake, or a race worth a fix.',
    ])
    expect(summary).toContain('| `AppUITests/S/test_flaky` | retried, passed on attempt 2 |')
    expect(summary).toContain('3 tests')
  })

  it('fails, naming the test, when it fails every attempt', async () => {
    const failing = { code: 65, output: done('S', 'test_broken', 'failed') }
    const { fake, outcome } = run([{ code: 0, output: '' }, failing, failing, failing])
    const out = await outcome
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('failed-every-attempt')
    expect(out.failed).toEqual(['AppUITests/S/test_broken'])
    expect(fake.calls).toHaveLength(4)
    expect(report('app', out).annotations).toEqual([
      '::error::app: FAILED AppUITests/S/test_broken on every one of 3 attempt(s).',
    ])
  })

  it('does not retry a broad failure', async () => {
    const { fake, outcome } = run(
      [
        { code: 0, output: '' },
        { code: 65, output: ['a', 'b', 'c'].map((n) => done('S', `test_${n}`, 'failed')).join('\n') },
      ],
      { maxRetriedTests: 2 },
    )
    const out = await outcome
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('broad-failure')
    expect(out.failed).toHaveLength(3)
    expect(fake.calls).toHaveLength(2)
  })

  it('never retries a build failure', async () => {
    const { fake, outcome } = run([{ code: 65, output: '' }])
    const out = await outcome
    expect(out).toMatchObject({ ok: false, reason: 'build-failed' })
    expect(fake.calls).toHaveLength(1)
    expect(report('app', out).annotations[0]).toMatch(/build-for-testing failed/)
  })

  it('re-runs the suite, counted, when a run fails without naming a test', async () => {
    const { fake, outcome } = run([
      { code: 0, output: '' },
      { code: 65, output: '' }, // the runner never attached
      { code: 0, output: done('S', 'test_a', 'passed') },
    ])
    const out = await outcome
    expect(out.ok).toBe(true)
    expect([...out.retried]).toEqual([['<suite>', 2]])
    expect(fake.calls[2]!.some((a) => a.startsWith('-only-testing:'))).toBe(false)
  })

  it('keeps the same targets when a targeted retry dies without naming a test', async () => {
    const { fake, outcome } = run([
      { code: 0, output: '' },
      { code: 65, output: done('S', 'test_flaky', 'failed') },
      { code: 65, output: '' },
      { code: 0, output: done('S', 'test_flaky', 'passed') },
    ])
    const out = await outcome
    expect(out.ok).toBe(true)
    expect([...out.retried]).toEqual([['AppUITests/S/test_flaky', 3]])
    expect(fake.calls[3]!.filter((a) => a.startsWith('-only-testing:'))).toEqual([
      '-only-testing:AppUITests/S/test_flaky',
    ])
  })

  it('is not a pass when xcodebuild exits non-zero with every named test green', async () => {
    const red = { code: 65, output: done('S', 'test_a', 'passed') }
    const { outcome } = run([{ code: 0, output: '' }, red, red, red])
    const out = await outcome
    expect(out.ok).toBe(false)
    expect(out.failed).toEqual(['<suite>'])
  })
})

// The markup Gradle 9.8.2 wrote for run 43195120647 (native-tasks-android).
const CLASS_REPORT = `<h1>Class com.pyreon.TasksAppInstrumentedTest</h1>
<div id="tab0" class="tab">
<h2>Failed tests</h2>
<div class="test">
<a name="hostedEditorsRoundTrip"></a>
<h3 class="failures">hostedEditorsRoundTrip</h3>
<span class="code">
<pre>androidx.compose.ui.test.ComposeTimeoutException: Condition still not satisfied after 15000 ms
	at androidx.compose.ui.test.AndroidComposeUiTestEnvironment$AndroidComposeUiTestImpl.waitUntil(ComposeUiTest.android.kt:901)
	at com.pyreon.TasksAppInstrumentedTest.hostedEditorsRoundTrip(TasksAppInstrumentedTest.kt:538)
</pre>
</span>
</div>
<div class="test">
<h3 class="failures">second</h3>
<span class="code">
<pre>java.lang.AssertionError: expected &lt;1&gt; &amp; got &quot;2&quot;
</pre>
</span>
</div>
</div>
<td class="failures">failed (1m17.72s)</td>`

describe('android-connected-failures', () => {
  it('names each failed test with the head of its own trace', () => {
    const f = parseClassReport(CLASS_REPORT)
    expect(f.map((x) => `${x.className}.${x.test}`)).toEqual([
      'com.pyreon.TasksAppInstrumentedTest.hostedEditorsRoundTrip',
      'com.pyreon.TasksAppInstrumentedTest.second',
    ])
    expect(f[0]!.trace).toContain('Condition still not satisfied after 15000 ms')
    expect(f[0]!.trace).toContain('TasksAppInstrumentedTest.kt:538')
    expect(f[0]!.trace).not.toContain('AssertionError')
    expect(f[1]!.trace).toBe('java.lang.AssertionError: expected <1> & got "2"')
  })

  it('finds nothing in a green class report', () => {
    expect(parseClassReport('<h1>Class com.pyreon.Ok</h1><td class="success">passed (2.000s)</td>')).toEqual([])
  })

  it('walks every native-*-android report tree and skips index pages', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-connected-'))
    const dir = join(root, 'examples/native-tasks-android/app/build/reports/androidTests/connected/debug')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'com.pyreon.TasksAppInstrumentedTest.html'), CLASS_REPORT)
    writeFileSync(join(dir, 'index.html'), CLASS_REPORT)
    mkdirSync(join(root, 'examples/native-tasks-ios'), { recursive: true })
    const all = collectFailures(root)
    expect(all).toHaveLength(2)
    expect(all[0]!.report).toBe(
      'examples/native-tasks-android/app/build/reports/androidTests/connected/debug/com.pyreon.TasksAppInstrumentedTest.html',
    )
  })
})

describe('native-gradle.sh', () => {
  const SCRIPT = resolve(import.meta.dirname, '../../../../../scripts/native-gradle.sh')

  /** Put a fake `gradle` first on PATH: attempt N prints `outputs[N-1]` and exits `codes[N-1]`. */
  function runWithFakeGradle(outputs: string[], codes: number[]) {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-gradle-'))
    const counter = join(dir, 'count')
    writeFileSync(counter, '0')
    outputs.forEach((o, i) => writeFileSync(join(dir, `out-${i + 1}`), o))
    writeFileSync(
      join(dir, 'gradle'),
      `#!/usr/bin/env bash\nn=$(( $(cat "${counter}") + 1 ))\necho "$n" > "${counter}"\ncat "${dir}/out-$n"\ncodes=(${codes.join(' ')})\nexit "\${codes[$((n-1))]}"\n`,
    )
    chmodSync(join(dir, 'gradle'), 0o755)
    const r = spawnSync('bash', [SCRIPT, 'assembleDebug', '--stacktrace'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PYREON_GRADLE_RETRY_SLEEP: '0' },
    })
    return { status: r.status, stdout: r.stdout, calls: Number(readFileSync(counter, 'utf8')) }
  }

  const RESOLVE_FAILURE = [
    "A problem occurred configuring root project 'PyreonTodoMVC'.",
    "> Could not resolve all artifacts for configuration 'classpath'.",
    '   > Could not resolve org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21.',
  ].join('\n')

  it('runs gradle once when it succeeds', () => {
    const r = runWithFakeGradle(['BUILD SUCCESSFUL in 2s'], [0])
    expect(r).toMatchObject({ status: 0, calls: 1 })
    expect(r.stdout).not.toContain('::warning::')
  })

  it('retries a dependency download failure and reports the attempt', () => {
    const r = runWithFakeGradle([RESOLVE_FAILURE, 'BUILD SUCCESSFUL in 2s'], [1, 0])
    expect(r).toMatchObject({ status: 0, calls: 2 })
    expect(r.stdout).toContain(
      "::warning::gradle assembleDebug --stacktrace: dependency download failed on attempt 1 of 3 (Could not resolve all artifacts for configuration 'classpath'.); retrying in 0s",
    )
  })

  it('never retries a compile error', () => {
    const r = runWithFakeGradle(["e: Foo.kt:3:1 Unresolved reference 'bar'.\n> Task :app:compileDebugKotlin FAILED"], [1])
    expect(r).toMatchObject({ status: 1, calls: 1 })
    expect(r.stdout).not.toContain('::warning::')
  })

  it('gives up after three attempts with gradle\'s exit code', () => {
    const r = runWithFakeGradle([RESOLVE_FAILURE, RESOLVE_FAILURE, RESOLVE_FAILURE], [1, 1, 7])
    expect(r).toMatchObject({ status: 7, calls: 3 })
    expect(r.stdout).toContain('::error::gradle assembleDebug --stacktrace: still failing after 3 attempt(s)')
  })
})
